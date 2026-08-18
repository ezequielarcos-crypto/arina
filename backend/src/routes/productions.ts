import { Router } from "express";
import { prisma } from "../prisma";
import { consumeComponents, move, revertMovements } from "../services/stock";

const router = Router();

router.get("/", async (req, res) => {
  const { itemId } = req.query;
  res.json(
    await prisma.production.findMany({
      where: { ...(itemId && { itemId: Number(itemId) }) },
      include: { item: true },
      orderBy: { date: "desc" },
      take: Number(req.query.take) || 100,
    })
  );
});

// Producir: consume los componentes de la receta (PRODUCTION_OUT)
// y genera stock del item producido (PRODUCTION_IN).
router.post("/", async (req, res) => {
  const { itemId, qty, notes, userName } = req.body;
  const quantity = Number(qty);
  if (!(quantity > 0)) return res.status(400).json({ error: "Cantidad inválida" });

  const production = await prisma.$transaction(async (tx) => {
    const item = await tx.item.findUniqueOrThrow({
      where: { id: Number(itemId) },
      include: { recipe: true },
    });
    if (!item.recipe)
      throw new Error(`«${item.name}» no tiene receta: no se puede producir`);
    if (!item.trackStock)
      throw new Error(
        `«${item.name}» no controla stock. Activá el control de stock para registrar producción.`
      );

    const production = await tx.production.create({
      data: {
        itemId: item.id,
        qty: quantity,
        notes: notes || null,
        userName: userName || null,
      },
    });

    await consumeComponents(tx, item.id, quantity, {
      type: "PRODUCTION_OUT",
      refType: "PRODUCTION",
      refId: production.id,
      reason: `Producción #${production.id} (${item.name})`,
    });
    await move(tx, {
      itemId: item.id,
      type: "PRODUCTION_IN",
      qty: quantity,
      reason: `Producción #${production.id}`,
      refType: "PRODUCTION",
      refId: production.id,
      userName: userName || null,
    });
    return production;
  });
  res.status(201).json(production);
});

// Anular producción: revierte exactamente sus movimientos y borra el registro.
router.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  await prisma.$transaction(async (tx) => {
    await tx.production.findUniqueOrThrow({ where: { id } });
    await revertMovements(tx, "PRODUCTION", id, "PRODUCTION_CANCEL", `Anulación de producción #${id}`);
    await tx.production.delete({ where: { id } });
  });
  res.status(204).end();
});

export default router;
