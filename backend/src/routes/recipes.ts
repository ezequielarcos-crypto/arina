import { Router } from "express";
import { prisma } from "../prisma";

const router = Router();

type ItemInput = { rawMaterialId: number; quantity: number };

// Cada receta incluye su costo calculado desde los precios de materia prima (Módulo 3)
function withCost(recipe: {
  yieldQty: number;
  items: { quantity: number; rawMaterial: { lastCost: number } }[];
} & Record<string, unknown>) {
  const totalCost = recipe.items.reduce(
    (sum, it) => sum + it.quantity * it.rawMaterial.lastCost,
    0
  );
  return {
    ...recipe,
    totalCost,
    costPerUnit: recipe.yieldQty > 0 ? totalCost / recipe.yieldQty : 0,
  };
}

const fullInclude = {
  items: { include: { rawMaterial: true } },
  product: true,
} as const;

router.get("/", async (_req, res) => {
  const recipes = await prisma.recipe.findMany({
    include: fullInclude,
    orderBy: { name: "asc" },
  });
  res.json(recipes.map(withCost));
});

router.post("/", async (req, res) => {
  const { name, yieldQty, yieldUnit, notes, productId, items } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: "El nombre es obligatorio" });
  const recipe = await prisma.recipe.create({
    data: {
      name: name.trim(),
      yieldQty: Number(yieldQty) || 1,
      yieldUnit: yieldUnit?.trim() || "unidades",
      notes: notes || null,
      productId: productId ?? null,
      items: {
        create: ((items ?? []) as ItemInput[]).map((it) => ({
          rawMaterialId: it.rawMaterialId,
          quantity: Number(it.quantity),
        })),
      },
    },
    include: fullInclude,
  });
  res.status(201).json(withCost(recipe));
});

router.put("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const { name, yieldQty, yieldUnit, notes, productId, items } = req.body;
  const recipe = await prisma.$transaction(async (tx) => {
    if (items !== undefined) {
      await tx.recipeItem.deleteMany({ where: { recipeId: id } });
      await tx.recipeItem.createMany({
        data: (items as ItemInput[]).map((it) => ({
          recipeId: id,
          rawMaterialId: it.rawMaterialId,
          quantity: Number(it.quantity),
        })),
      });
    }
    return tx.recipe.update({
      where: { id },
      data: {
        ...(name !== undefined && { name: String(name).trim() }),
        ...(yieldQty !== undefined && { yieldQty: Number(yieldQty) }),
        ...(yieldUnit !== undefined && { yieldUnit: String(yieldUnit) }),
        ...(notes !== undefined && { notes }),
        ...(productId !== undefined && { productId }),
      },
      include: fullInclude,
    });
  });
  res.json(withCost(recipe));
});

router.delete("/:id", async (req, res) => {
  await prisma.recipe.delete({ where: { id: Number(req.params.id) } });
  res.status(204).end();
});

export default router;
