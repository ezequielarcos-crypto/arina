import { Router } from "express";
import { prisma } from "../prisma";

const router = Router();

router.get("/", async (_req, res) => {
  res.json(
    await prisma.rawMaterial.findMany({
      include: { purchases: { orderBy: { date: "desc" }, take: 5 } },
      orderBy: { name: "asc" },
    })
  );
});

router.post("/", async (req, res) => {
  const { name, unit, stock, lastCost } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: "El nombre es obligatorio" });
  const material = await prisma.rawMaterial.create({
    data: {
      name: name.trim(),
      unit: unit?.trim() || "unidad",
      stock: Number(stock) || 0,
      lastCost: Number(lastCost) || 0,
    },
  });
  res.status(201).json(material);
});

router.put("/:id", async (req, res) => {
  const { name, unit, stock, lastCost } = req.body;
  const material = await prisma.rawMaterial.update({
    where: { id: Number(req.params.id) },
    data: {
      ...(name !== undefined && { name: String(name).trim() }),
      ...(unit !== undefined && { unit: String(unit).trim() }),
      ...(stock !== undefined && { stock: Number(stock) }),
      ...(lastCost !== undefined && { lastCost: Number(lastCost) }),
    },
  });
  res.json(material);
});

router.delete("/:id", async (req, res) => {
  await prisma.rawMaterial.delete({ where: { id: Number(req.params.id) } });
  res.status(204).end();
});

// Registrar compra: suma stock, actualiza último costo y queda como gasto en Caja
router.post("/:id/purchases", async (req, res) => {
  const id = Number(req.params.id);
  const { quantity, totalCost, date } = req.body;
  const qty = Number(quantity);
  const cost = Number(totalCost);
  if (!(qty > 0)) return res.status(400).json({ error: "Cantidad inválida" });
  if (!(cost >= 0)) return res.status(400).json({ error: "Costo inválido" });

  const [purchase] = await prisma.$transaction([
    prisma.purchase.create({
      data: { rawMaterialId: id, quantity: qty, totalCost: cost, ...(date && { date: new Date(date) }) },
    }),
    prisma.rawMaterial.update({
      where: { id },
      data: { stock: { increment: qty }, lastCost: cost / qty },
    }),
  ]);
  res.status(201).json(purchase);
});

export default router;
