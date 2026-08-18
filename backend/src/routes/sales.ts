import { Router } from "express";
import { prisma } from "../prisma";

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

// Crear venta: valida vendibilidad y stock, descuenta stock en la misma transacción.
// (El consumo de ingredientes según receta llega en Fase 2 junto con StockMovement.)
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

    for (const it of saleItems) {
      const item = byId.get(it.itemId)!;
      if (item.trackStock) {
        await tx.item.update({
          where: { id: it.itemId },
          data: { stock: { decrement: it.quantity } },
        });
      }
    }

    return tx.sale.create({
      data: {
        clientId: clientId ?? null,
        total,
        ...(date && { date: new Date(date) }),
        items: { create: saleItems },
      },
      include: { client: true, items: { include: { item: true } } },
    });
  });
  res.status(201).json(sale);
});

// Anular venta: repone stock (de items con control) y borra la venta.
router.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  await prisma.$transaction(async (tx) => {
    const sale = await tx.sale.findUniqueOrThrow({
      where: { id },
      include: { items: { include: { item: true } } },
    });
    for (const it of sale.items) {
      if (it.item.trackStock) {
        await tx.item.update({
          where: { id: it.itemId },
          data: { stock: { increment: it.quantity } },
        });
      }
    }
    await tx.sale.delete({ where: { id } });
  });
  res.status(204).end();
});

export default router;
