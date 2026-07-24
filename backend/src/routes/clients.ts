import { Router } from "express";
import { prisma } from "../prisma";

const router = Router();

router.get("/", async (_req, res) => {
  res.json(
    await prisma.client.findMany({
      include: { _count: { select: { sales: true } } },
      orderBy: { name: "asc" },
    })
  );
});

// Historial de compras del cliente
router.get("/:id/sales", async (req, res) => {
  res.json(
    await prisma.sale.findMany({
      where: { clientId: Number(req.params.id) },
      include: { items: { include: { product: true } } },
      orderBy: { date: "desc" },
    })
  );
});

router.post("/", async (req, res) => {
  const { name, phone, email, preferences } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: "El nombre es obligatorio" });
  const client = await prisma.client.create({
    data: {
      name: name.trim(),
      phone: phone || null,
      email: email || null,
      preferences: preferences || null,
    },
  });
  res.status(201).json(client);
});

router.put("/:id", async (req, res) => {
  const { name, phone, email, preferences } = req.body;
  const client = await prisma.client.update({
    where: { id: Number(req.params.id) },
    data: {
      ...(name !== undefined && { name: String(name).trim() }),
      ...(phone !== undefined && { phone }),
      ...(email !== undefined && { email }),
      ...(preferences !== undefined && { preferences }),
    },
  });
  res.json(client);
});

router.delete("/:id", async (req, res) => {
  await prisma.client.delete({ where: { id: Number(req.params.id) } });
  res.status(204).end();
});

export default router;
