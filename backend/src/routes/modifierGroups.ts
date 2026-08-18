import { Router } from "express";
import { prisma } from "../prisma";

const router = Router();

const fullInclude = {
  options: { orderBy: [{ sortOrder: "asc" as const }, { name: "asc" as const }] },
  _count: { select: { items: true } },
};

router.get("/", async (_req, res) => {
  res.json(
    await prisma.modifierGroup.findMany({
      include: fullInclude,
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    })
  );
});

type OptionInput = { name: string; priceDelta?: number; sortOrder?: number; active?: boolean };

function parseGroupBody(body: Record<string, unknown>) {
  const name = String(body.name ?? "").trim();
  if (!name) throw new Error("El nombre es obligatorio");
  const minQty = Math.max(0, Number(body.minQty) || 0);
  const maxQty = Math.max(1, Number(body.maxQty) || 1);
  if (minQty > maxQty) throw new Error("El mínimo no puede superar al máximo");
  return {
    name,
    publicName: body.publicName ? String(body.publicName).trim() : null,
    minQty,
    maxQty,
    sortOrder: Number(body.sortOrder) || 0,
    ...(body.active !== undefined && { active: Boolean(body.active) }),
  };
}

const parseOptions = (options: unknown): OptionInput[] =>
  ((options ?? []) as OptionInput[])
    .filter((o) => o.name?.trim())
    .map((o, i) => ({
      name: o.name.trim(),
      priceDelta: Number(o.priceDelta) || 0,
      sortOrder: o.sortOrder ?? i,
      active: o.active ?? true,
    }));

router.post("/", async (req, res) => {
  const data = parseGroupBody(req.body);
  const group = await prisma.modifierGroup.create({
    data: { ...data, options: { create: parseOptions(req.body.options) } },
    include: fullInclude,
  });
  res.status(201).json(group);
});

// Actualiza el grupo y reemplaza sus opciones si vienen en el body.
// Las opciones ya usadas en ventas quedan referenciadas por snapshot
// (SaleItemModifier guarda nombre y precio), así que reemplazarlas es seguro.
router.put("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const data = parseGroupBody(req.body);
  const group = await prisma.$transaction(async (tx) => {
    if (req.body.options !== undefined) {
      await tx.modifierOption.deleteMany({ where: { groupId: id } });
      await tx.modifierOption.createMany({
        data: parseOptions(req.body.options).map((o) => ({ ...o, groupId: id })),
      });
    }
    return tx.modifierGroup.update({ where: { id }, data, include: fullInclude });
  });
  res.json(group);
});

router.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const used = await prisma.itemModifierGroup.count({ where: { groupId: id } });
  if (used > 0)
    return res.status(409).json({
      error: "El grupo está asociado a items. Quitá las asociaciones o desactivalo.",
    });
  await prisma.modifierGroup.delete({ where: { id } });
  res.status(204).end();
});

export default router;
