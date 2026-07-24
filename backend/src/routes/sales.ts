import { Router } from "express";
import { prisma } from "../prisma";

const router = Router();

type SaleItemInput = { productId: number; quantity: number };

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
      include: { client: true, items: { include: { product: true } } },
      orderBy: { date: "desc" },
    })
  );
});

// Crear venta: descuenta stock de productos (Módulo 1) en la misma transacción
router.post("/", async (req, res) => {
  const { clientId, items, date } = req.body as {
    clientId?: number | null;
    items: SaleItemInput[];
    date?: string;
  };
  if (!items?.length) return res.status(400).json({ error: "La venta no tiene productos" });

  const sale = await prisma.$transaction(async (tx) => {
    const products = await tx.product.findMany({
      where: { id: { in: items.map((it) => it.productId) } },
    });
    const byId = new Map(products.map((p) => [p.id, p]));

    let total = 0;
    const saleItems = items.map((it) => {
      const product = byId.get(it.productId);
      if (!product) throw new Error(`Producto ${it.productId} inexistente`);
      const qty = Number(it.quantity);
      if (!(qty > 0)) throw new Error(`Cantidad inválida para ${product.name}`);
      total += product.price * qty;
      return { productId: product.id, quantity: qty, unitPrice: product.price };
    });

    for (const it of saleItems) {
      await tx.product.update({
        where: { id: it.productId },
        data: { stock: { decrement: it.quantity } },
      });
    }

    return tx.sale.create({
      data: {
        clientId: clientId ?? null,
        total,
        ...(date && { date: new Date(date) }),
        items: { create: saleItems },
      },
      include: { client: true, items: { include: { product: true } } },
    });
  });
  res.status(201).json(sale);
});

// Anular venta: repone stock y borra la venta
router.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  await prisma.$transaction(async (tx) => {
    const sale = await tx.sale.findUniqueOrThrow({ where: { id }, include: { items: true } });
    for (const it of sale.items) {
      await tx.product.update({
        where: { id: it.productId },
        data: { stock: { increment: it.quantity } },
      });
    }
    await tx.sale.delete({ where: { id } });
  });
  res.status(204).end();
});

export default router;
