import { Router } from "express";
import { prisma } from "../prisma";

const router = Router();

router.get("/", async (_req, res) => {
  res.json(
    await prisma.priceList.findMany({
      include: { items: { include: { item: { select: { id: true, name: true, salePrice: true, unit: true } } } } },
      orderBy: { name: "asc" },
    })
  );
});

router.post("/", async (req, res) => {
  const { name } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: "El nombre es obligatorio" });
  res.status(201).json(await prisma.priceList.create({ data: { name: name.trim() } }));
});

router.put("/:id", async (req, res) => {
  const { name, active } = req.body;
  res.json(
    await prisma.priceList.update({
      where: { id: Number(req.params.id) },
      data: {
        ...(name !== undefined && { name: String(name).trim() }),
        ...(active !== undefined && { active: Boolean(active) }),
      },
    })
  );
});

// Reemplaza los precios de la lista: [{itemId, price}]
router.put("/:id/items", async (req, res) => {
  const id = Number(req.params.id);
  const items = ((req.body.items ?? []) as { itemId: number; price: number }[]).filter(
    (i) => i.itemId && Number(i.price) >= 0
  );
  const list = await prisma.$transaction(async (tx) => {
    await tx.priceList.findUniqueOrThrow({ where: { id } });
    await tx.priceListItem.deleteMany({ where: { priceListId: id } });
    await tx.priceListItem.createMany({
      data: items.map((i) => ({ priceListId: id, itemId: i.itemId, price: Number(i.price) })),
    });
    return tx.priceList.findUniqueOrThrow({
      where: { id },
      include: { items: { include: { item: { select: { id: true, name: true, salePrice: true, unit: true } } } } },
    });
  });
  res.json(list);
});

router.delete("/:id", async (req, res) => {
  await prisma.priceList.delete({ where: { id: Number(req.params.id) } });
  res.status(204).end();
});

export default router;
