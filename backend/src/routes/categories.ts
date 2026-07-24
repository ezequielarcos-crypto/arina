import { Router } from "express";
import { prisma } from "../prisma";

const router = Router();

router.get("/", async (_req, res) => {
  res.json(await prisma.category.findMany({ orderBy: { name: "asc" } }));
});

router.post("/", async (req, res) => {
  const { name } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: "El nombre es obligatorio" });
  res.status(201).json(await prisma.category.create({ data: { name: name.trim() } }));
});

router.delete("/:id", async (req, res) => {
  await prisma.category.delete({ where: { id: Number(req.params.id) } });
  res.status(204).end();
});

export default router;
