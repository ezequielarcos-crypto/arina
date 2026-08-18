import type { Prisma } from "@prisma/client";
import { grossQty } from "./costing";

type Tx = Prisma.TransactionClient;

export const MOVEMENT_TYPES = [
  "PURCHASE",
  "SALE",
  "SALE_CANCEL",
  "CONSUMPTION",
  "PRODUCTION_IN",
  "PRODUCTION_OUT",
  "ADJUST",
  "WASTE",
  "RETURN",
  "INITIAL",
] as const;
export type MovementType = (typeof MOVEMENT_TYPES)[number];

export type MovementInput = {
  itemId: number;
  type: MovementType;
  qty: number; // delta con signo
  reason?: string | null;
  userName?: string | null;
  refType?: "SALE" | "PURCHASE" | "PRODUCTION" | null;
  refId?: number | null;
};

// Única puerta de entrada para tocar stock: crea el movimiento y
// actualiza el caché Item.stock en la misma transacción.
export async function move(tx: Tx, input: MovementInput) {
  if (!input.qty) return;
  await tx.stockMovement.create({
    data: {
      itemId: input.itemId,
      type: input.type,
      qty: input.qty,
      reason: input.reason ?? null,
      userName: input.userName ?? null,
      refType: input.refType ?? null,
      refId: input.refId ?? null,
    },
  });
  await tx.item.update({
    where: { id: input.itemId },
    data: { stock: { increment: input.qty } },
  });
}

// Consumo recursivo de componentes al vender o producir `qty` unidades de `itemId`.
// Regla por componente:
//   - controla stock → se descuenta (movimiento CONSUMPTION / PRODUCTION_OUT)
//   - no controla stock pero tiene receta → se baja un nivel y se consumen los suyos
//   - no controla stock y no tiene receta → no genera movimiento
export async function consumeComponents(
  tx: Tx,
  itemId: number,
  qty: number,
  opts: { type: "CONSUMPTION" | "PRODUCTION_OUT"; refType: "SALE" | "PRODUCTION"; refId: number; reason: string }
) {
  const recipe = await tx.recipe.findUnique({
    where: { itemId },
    include: { items: { include: { component: true } } },
  });
  if (!recipe || recipe.yieldQty <= 0) return;

  for (const line of recipe.items) {
    const waste = line.wastePct ?? line.component.wastePct;
    const needed = (grossQty(line.qty, waste) / recipe.yieldQty) * qty;
    if (line.component.trackStock) {
      await move(tx, {
        itemId: line.componentId,
        type: opts.type,
        qty: -needed,
        reason: opts.reason,
        refType: opts.refType,
        refId: opts.refId,
      });
    } else {
      await consumeComponents(tx, line.componentId, needed, opts);
    }
  }
}

// Revierte exactamente los movimientos asociados a un documento
// (venta anulada, producción anulada): un movimiento inverso por cada original.
export async function revertMovements(
  tx: Tx,
  refType: "SALE" | "PRODUCTION",
  refId: number,
  inverseType: MovementType,
  reason: string
) {
  const originals = await tx.stockMovement.findMany({
    where: { refType, refId, type: { not: inverseType } },
  });
  for (const m of originals) {
    await move(tx, {
      itemId: m.itemId,
      type: inverseType,
      qty: -m.qty,
      reason,
      refType,
      refId,
    });
  }
}
