import type { Prisma } from "@prisma/client";

type Tx = Prisma.TransactionClient;

// Campos del Item cuyos cambios quedan registrados en la auditoría.
// El stock no está: sus cambios ya quedan como movimientos.
const TRACKED_FIELDS = [
  "name",
  "sku",
  "unit",
  "salePrice",
  "cost",
  "wastePct",
  "taxRate",
  "categoryId",
  "supplierId",
  "active",
  "sellable",
  "available",
  "trackStock",
  "minStock",
  "maxStock",
] as const;

const fmt = (v: unknown) => (v === null || v === undefined || v === "" ? "—" : String(v));

export async function auditItemChanges(
  tx: Tx,
  itemId: number,
  before: Record<string, unknown>,
  changes: Record<string, unknown>,
  userName?: string | null
) {
  for (const field of TRACKED_FIELDS) {
    if (changes[field] === undefined) continue;
    if (changes[field] === before[field]) continue;
    await tx.auditLog.create({
      data: {
        entity: "Item",
        entityId: itemId,
        field,
        oldValue: fmt(before[field]),
        newValue: fmt(changes[field]),
        userName: userName ?? null,
      },
    });
  }
}

export async function auditEvent(
  tx: Tx,
  itemId: number,
  field: string,
  oldValue: string,
  newValue: string,
  userName?: string | null
) {
  await tx.auditLog.create({
    data: {
      entity: "Item",
      entityId: itemId,
      field,
      oldValue,
      newValue,
      userName: userName ?? null,
    },
  });
}
