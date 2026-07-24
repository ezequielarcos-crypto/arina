import { Router } from "express";
import { prisma } from "../prisma";

const router = Router();

router.get("/", async (_req, res) => {
  res.json(
    await prisma.product.findMany({
      include: { category: true },
      orderBy: { name: "asc" },
    })
  );
});

router.post("/", async (req, res) => {
  const { name, price, stock, categoryId } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: "El nombre es obligatorio" });
  if (typeof price !== "number" || price < 0)
    return res.status(400).json({ error: "Precio inválido" });
  const product = await prisma.product.create({
    data: {
      name: name.trim(),
      price,
      stock: Number(stock) || 0,
      categoryId: categoryId ?? null,
    },
    include: { category: true },
  });
  res.status(201).json(product);
});

router.put("/:id", async (req, res) => {
  const { name, price, stock, categoryId } = req.body;
  const product = await prisma.product.update({
    where: { id: Number(req.params.id) },
    data: {
      ...(name !== undefined && { name: String(name).trim() }),
      ...(price !== undefined && { price: Number(price) }),
      ...(stock !== undefined && { stock: Number(stock) }),
      ...(categoryId !== undefined && { categoryId }),
    },
    include: { category: true },
  });
  res.json(product);
});

router.delete("/:id", async (req, res) => {
  await prisma.product.delete({ where: { id: Number(req.params.id) } });
  res.status(204).end();
});

// Aumento porcentual masivo de precios (todos o por categoría)
router.post("/bulk-increase", async (req, res) => {
  const { percent, categoryId } = req.body;
  const p = Number(percent);
  if (!isFinite(p)) return res.status(400).json({ error: "Porcentaje inválido" });
  const factor = 1 + p / 100;
  const result = await prisma.product.updateMany({
    where: categoryId ? { categoryId: Number(categoryId) } : {},
    data: { price: { multiply: factor } },
  });
  res.json({ updated: result.count, percent: p });
});

export default router;
