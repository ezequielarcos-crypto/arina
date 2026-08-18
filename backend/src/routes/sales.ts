import { Router } from "express";
import { prisma } from "../prisma";
import { consumeComponents, move, revertMovements } from "../services/stock";

const router = Router();

type SaleItemInput = { itemId: number; quantity: number };

router.get("/", async (req, res) => {
  const { from, to } = req.query;
  res.json(
    await prisma.sale.findMany({
      where: {
        date: {
          ...(from && { gte: new Date(String(from)) }),
          ...(to && { lte: new Date(String(to)) }),
        },
      },
      include: { client: true, items: { include: { item: true } } },
      orderBy: { date: "desc" },
    })
  );
});

// Crear venta. Por cada item vendido:
//   - si controla stock → movimiento SALE (producto pre-elaborado)
//   - si no controla stock pero tiene receta → consume sus componentes (CONSUMPTION)
router.post("/", async (req, res) => {
  const { clientId, items, date } = req.body as {
    clientId?: number | null;
    items: SaleItemInput[];
    date?: string;
  };
  if (!items?.length) return res.status(400).json({ error: "La venta no tiene productos" });

  const sale = await prisma.$transaction(async (tx) => {
    const dbItems = await tx.item.findMany({
      where: { id: { in: items.map((it) => it.itemId) } },
    });
    const byId = new Map(dbItems.map((i) => [i.id, i]));

    let total = 0;
    const saleItems = items.map((it) => {
      const item = byId.get(it.itemId);
      if (!item) throw new Error(`Item ${it.itemId} inexistente`);
      if (!item.sellable || !item.active)
        throw new Error(`«${item.name}» no está a la venta`);
      const qty = Number(it.quantity);
      if (!(qty > 0)) throw new Error(`Cantidad inválida para ${item.name}`);
      if (item.trackStock && !item.allowSaleWithoutStock && item.stock < qty)
        throw new Error(`Stock insuficiente de «${item.name}» (hay ${item.stock})`);
      total += item.salePrice * qty;
      return { itemId: item.id, quantity: qty, unitPrice: item.salePrice };
    });

    const sale = await tx.sale.create({
      data: {
        clientId: clientId ?? null,
        total,
        ...(date && { date: new Date(date) }),
        items: { create: saleItems },
      },
      include: { client: true, items: { include: { item: true } } },
    });

    for (const it of saleItems) {
      const item = byId.get(it.itemId)!;
      if (item.trackStock) {
        await move(tx, {
          itemId: it.itemId,
          type: "SALE",
          qty: -it.quantity,
          reason: `Venta #${sale.id}`,
          refType: "SALE",
          refId: sale.id,
        });
      } else {
        await consumeComponents(tx, it.itemId, it.quantity, {
          type: "CONSUMPTION",
          refType: "SALE",
          refId: sale.id,
          reason: `Consumo por venta #${sale.id} (${item.name})`,
        });
      }
    }
    return sale;
  });
  res.status(201).json(sale);
});

// Anular venta: revierte EXACTAMENTE los movimientos que generó y borra la venta.
// Los movimientos (originales + reversos) quedan como historial.
router.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  await prisma.$transaction(async (tx) => {
    await tx.sale.findUniqueOrThrow({ where: { id } });
    await revertMovements(tx, "SALE", id, "SALE_CANCEL", `Anulación de venta #${id}`);
    await tx.sale.delete({ where: { id } });
  });
  res.status(204).end();
});

export default router;
