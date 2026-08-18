import { Router } from "express";
import { prisma } from "../prisma";

const router = Router();

router.get("/", async (_req, res) => {
  res.json(
    await prisma.supplier.findMany({
      include: { _count: { select: { items: true, purchases: true } } },
      orderBy: { name: "asc" },
    })
  );
});

router.post("/", async (req, res) => {
  const { name, phone, email, notes } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: "El nombre es obligatorio" });
  const supplier = await prisma.supplier.create({
    data: {
      name: name.trim(),
      phone: phone || null,
      email: email || null,
      notes: notes || null,
    },
  });
  res.status(201).json(supplier);
});

router.put("/:id", async (req, res) => {
  const { name, phone, email, notes, active } = req.body;
  const supplier = await prisma.supplier.update({
    where: { id: Number(req.params.id) },
    data: {
      ...(name !== undefined && { name: String(name).trim() }),
      ...(phone !== undefined && { phone: phone || null }),
      ...(email !== undefined && { email: email || null }),
      ...(notes !== undefined && { notes: notes || null }),
      ...(active !== undefined && { active: Boolean(active) }),
    },
  });
  res.json(supplier);
});

router.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const count = await prisma.item.count({ where: { supplierId: id } });
  if (count > 0)
    return res.status(409).json({ error: "Hay items asociados a este proveedor. Desactivalo." });
  await prisma.supplier.delete({ where: { id } });
  res.status(204).end();
});

export default router;
