import { Router } from "express";
import { prisma } from "../prisma";

const router = Router();

// Devuelve el árbol: categorías raíz con sus subcategorías.
router.get("/", async (_req, res) => {
  const categories = await prisma.category.findMany({
    where: { parentId: null },
    include: {
      children: {
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        include: { _count: { select: { items: true } } },
      },
      _count: { select: { items: true } },
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  res.json(categories);
});

// Lista plana (para selects): "Categoría" y "Categoría › Subcategoría"
router.get("/flat", async (_req, res) => {
  const all = await prisma.category.findMany({
    include: { parent: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  res.json(
    all
      .map((c) => ({
        ...c,
        fullName: c.parent ? `${c.parent.name} › ${c.name}` : c.name,
      }))
      .sort((a, b) => a.fullName.localeCompare(b.fullName))
  );
});

router.post("/", async (req, res) => {
  const { name, parentId, sortOrder } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: "El nombre es obligatorio" });
  if (parentId) {
    const parent = await prisma.category.findUniqueOrThrow({ where: { id: Number(parentId) } });
    if (parent.parentId)
      return res.status(400).json({ error: "Máximo dos niveles: categoría y subcategoría" });
  }
  const category = await prisma.category.create({
    data: {
      name: name.trim(),
      parentId: parentId ? Number(parentId) : null,
      sortOrder: Number(sortOrder) || 0,
    },
  });
  res.status(201).json(category);
});

router.put("/:id", async (req, res) => {
  const { name, parentId, sortOrder, active } = req.body;
  const category = await prisma.category.update({
    where: { id: Number(req.params.id) },
    data: {
      ...(name !== undefined && { name: String(name).trim() }),
      ...(parentId !== undefined && { parentId: parentId ? Number(parentId) : null }),
      ...(sortOrder !== undefined && { sortOrder: Number(sortOrder) }),
      ...(active !== undefined && { active: Boolean(active) }),
    },
  });
  res.json(category);
});

router.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const [itemCount, childCount] = await Promise.all([
    prisma.item.count({ where: { categoryId: id } }),
    prisma.category.count({ where: { parentId: id } }),
  ]);
  if (itemCount > 0 || childCount > 0) {
    return res.status(409).json({
      error: "La categoría tiene items o subcategorías. Reasignalos o desactivala.",
    });
  }
  await prisma.category.delete({ where: { id } });
  res.status(204).end();
});

export default router;
