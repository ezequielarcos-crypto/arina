import { Router } from "express";
import { prisma } from "../prisma";
import { findCycle, grossQty, loadCostGraph, unitCost, withComputedCosts } from "../services/costing";
import { move } from "../services/stock";
import { auditEvent, auditItemChanges } from "../services/audit";

const router = Router();

const ITEM_TYPES = ["PRODUCT", "INGREDIENT", "PREPARATION"] as const;
type ItemType = (typeof ITEM_TYPES)[number];

function parseItemBody(body: Record<string, unknown>, partial = false) {
  const data: Record<string, unknown> = {};
  const set = (key: string, value: unknown) => {
    if (value !== undefined) data[key] = value;
  };

  if (!partial || body.name !== undefined) {
    const name = String(body.name ?? "").trim();
    if (!name) throw new Error("El nombre es obligatorio");
    data.name = name;
  }
  if (body.type !== undefined) {
    if (!ITEM_TYPES.includes(body.type as ItemType)) throw new Error("Tipo inválido");
    data.type = body.type;
  }
  set("sku", body.sku === "" ? null : body.sku);
  set("unit", body.unit ? String(body.unit).trim() : body.unit === "" ? "unidad" : undefined);
  set("description", body.description === "" ? null : body.description);
  set("categoryId", body.categoryId === "" ? null : body.categoryId);
  set("supplierId", body.supplierId === "" ? null : body.supplierId);
  for (const flag of [
    "active",
    "favorite",
    "sellable",
    "available",
    "trackStock",
    "allowSaleWithoutStock",
  ]) {
    if (body[flag] !== undefined) data[flag] = Boolean(body[flag]);
  }
  for (const num of ["salePrice", "cost", "wastePct", "stock", "minStock"]) {
    if (body[num] !== undefined) {
      const v = Number(body[num]);
      if (!isFinite(v) || v < 0) throw new Error(`Valor inválido en ${num}`);
      data[num] = v;
    }
  }
  if (body.maxStock !== undefined)
    data.maxStock = body.maxStock === null || body.maxStock === "" ? null : Number(body.maxStock);
  if (body.taxRate !== undefined)
    data.taxRate = body.taxRate === null || body.taxRate === "" ? null : Number(body.taxRate);
  return data;
}

const listInclude = { category: { include: { parent: true } }, supplier: true } as const;

// GET /api/items?type=&search=&categoryId=&active=&sellable=
router.get("/", async (req, res) => {
  const { type, search, categoryId, active, sellable } = req.query;
  const items = await prisma.item.findMany({
    where: {
      ...(type && { type: String(type) }),
      ...(search && { name: { contains: String(search) } }),
      ...(categoryId && { categoryId: Number(categoryId) }),
      ...(active !== undefined && active !== "" && { active: active === "true" }),
      ...(sellable !== undefined && sellable !== "" && { sellable: sellable === "true" }),
    },
    include: listInclude,
    orderBy: [{ favorite: "desc" }, { name: "asc" }],
  });
  const graph = await loadCostGraph();
  res.json(withComputedCosts(items, graph));
});

// Aumento porcentual masivo de precios de venta (todos los vendibles o por categoría)
router.post("/bulk-increase", async (req, res) => {
  const { percent, categoryId } = req.body;
  const p = Number(percent);
  if (!isFinite(p)) return res.status(400).json({ error: "Porcentaje inválido" });
  const factor = 1 + p / 100;
  const result = await prisma.item.updateMany({
    where: { sellable: true, ...(categoryId && { categoryId: Number(categoryId) }) },
    data: { salePrice: { multiply: factor } },
  });
  res.json({ updated: result.count, percent: p });
});

// GET /api/items/:id — ficha completa con receta y costos calculados
router.get("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const item = await prisma.item.findUniqueOrThrow({
    where: { id },
    include: {
      ...listInclude,
      recipe: { include: { items: { include: { component: true } } } },
      usedIn: { include: { recipe: { include: { item: true } } } },
      purchases: { orderBy: { date: "desc" }, take: 10 },
      modifierGroups: {
        include: { group: { include: { options: { orderBy: { sortOrder: "asc" } } } } },
        orderBy: { sortOrder: "asc" },
      },
    },
  });
  const graph = await loadCostGraph();
  const memo = new Map<number, number>();
  const [decorated] = withComputedCosts([item], graph);

  // Detalle de receta con costos por línea
  let recipeDetail = null;
  if (item.recipe) {
    const lines = item.recipe.items.map((line) => {
      const waste = line.wastePct ?? line.component.wastePct;
      const gross = grossQty(line.qty, waste);
      const compCost = unitCost(line.componentId, graph, memo);
      return {
        ...line,
        effectiveWastePct: waste,
        grossQty: gross,
        componentUnitCost: compCost,
        lineCost: gross * compCost,
        componentHasRecipe: graph.recipes.has(line.componentId),
      };
    });
    const totalCost = lines.reduce((sum, l) => sum + l.lineCost, 0);
    recipeDetail = {
      ...item.recipe,
      items: lines,
      totalCost,
      costPerUnit: item.recipe.yieldQty > 0 ? totalCost / item.recipe.yieldQty : 0,
    };
  }

  res.json({
    ...decorated,
    recipe: recipeDetail,
    usedIn: item.usedIn.map((u) => u.recipe.item),
  });
});

router.post("/", async (req, res) => {
  const data = parseItemBody(req.body);
  const initialStock = Number(data.stock) || 0;
  delete data.stock; // el stock inicial entra como movimiento, no como campo suelto
  const item = await prisma.$transaction(async (tx) => {
    const created = await tx.item.create({ data: data as never, include: listInclude });
    if (created.trackStock && initialStock > 0) {
      await move(tx, {
        itemId: created.id,
        type: "INITIAL",
        qty: initialStock,
        reason: "Stock inicial",
      });
    }
    return tx.item.findUniqueOrThrow({ where: { id: created.id }, include: listInclude });
  });
  res.status(201).json(item);
});

router.put("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const data = parseItemBody(req.body, true);
  const newStock = data.stock !== undefined ? Number(data.stock) : undefined;
  delete data.stock; // cambios de stock → movimiento de ajuste, nunca edición directa
  const item = await prisma.$transaction(async (tx) => {
    const before = await tx.item.findUniqueOrThrow({ where: { id } });
    await auditItemChanges(tx, id, before as never, data);
    await tx.item.update({ where: { id }, data });
    if (data.cost !== undefined && data.cost !== before.cost) {
      await tx.costHistory.create({
        data: { itemId: id, cost: Number(data.cost), source: "Edición manual" },
      });
    }
    if (newStock !== undefined && newStock !== before.stock) {
      await move(tx, {
        itemId: id,
        type: "ADJUST",
        qty: newStock - before.stock,
        reason: "Ajuste manual desde edición del item",
      });
    }
    return tx.item.findUniqueOrThrow({ where: { id }, include: listInclude });
  });
  res.json(item);
});

// Historial de costos y auditoría del item
router.get("/:id/cost-history", async (req, res) => {
  res.json(
    await prisma.costHistory.findMany({
      where: { itemId: Number(req.params.id) },
      orderBy: { date: "desc" },
      take: Number(req.query.take) || 50,
    })
  );
});

router.get("/:id/audit", async (req, res) => {
  res.json(
    await prisma.auditLog.findMany({
      where: { entity: "Item", entityId: Number(req.params.id) },
      orderBy: { date: "desc" },
      take: Number(req.query.take) || 50,
    })
  );
});

// Ajuste explícito de stock: ajuste manual, merma o devolución.
router.post("/:id/adjust", async (req, res) => {
  const id = Number(req.params.id);
  const { type, qty, reason } = req.body as { type: string; qty: number; reason?: string };
  if (!["ADJUST", "WASTE", "RETURN"].includes(type))
    return res.status(400).json({ error: "Tipo de ajuste inválido" });
  const amount = Number(qty);
  if (!isFinite(amount) || amount === 0)
    return res.status(400).json({ error: "Cantidad inválida" });
  // La merma siempre resta; la devolución siempre suma; el ajuste lleva signo.
  const delta = type === "WASTE" ? -Math.abs(amount) : type === "RETURN" ? Math.abs(amount) : amount;
  await prisma.$transaction(async (tx) => {
    await tx.item.findUniqueOrThrow({ where: { id } });
    await move(tx, { itemId: id, type: type as "ADJUST", qty: delta, reason: reason || null });
  });
  res.status(201).json({ ok: true });
});

// Historial de movimientos del item
router.get("/:id/movements", async (req, res) => {
  res.json(
    await prisma.stockMovement.findMany({
      where: { itemId: Number(req.params.id) },
      orderBy: { date: "desc" },
      take: Number(req.query.take) || 50,
    })
  );
});

// Duplicar item: copia configuración y receta, no el stock.
router.post("/:id/duplicate", async (req, res) => {
  const id = Number(req.params.id);
  const source = await prisma.item.findUniqueOrThrow({
    where: { id },
    include: { recipe: { include: { items: true } } },
  });
  const { name } = req.body;
  const item = await prisma.item.create({
    data: {
      name: name?.trim() || `${source.name} (copia)`,
      sku: null, // el SKU es único; el duplicado arranca sin SKU
      type: source.type,
      unit: source.unit,
      description: source.description,
      categoryId: source.categoryId,
      sellable: source.sellable,
      available: source.available,
      salePrice: source.salePrice,
      taxRate: source.taxRate,
      cost: source.cost,
      wastePct: source.wastePct,
      trackStock: source.trackStock,
      minStock: source.minStock,
      maxStock: source.maxStock,
      allowSaleWithoutStock: source.allowSaleWithoutStock,
      ...(source.recipe && {
        recipe: {
          create: {
            yieldQty: source.recipe.yieldQty,
            yieldUnit: source.recipe.yieldUnit,
            notes: source.recipe.notes,
            items: {
              create: source.recipe.items.map((l) => ({
                componentId: l.componentId,
                qty: l.qty,
                wastePct: l.wastePct,
              })),
            },
          },
        },
      }),
    },
    include: listInclude,
  });
  res.status(201).json(item);
});

router.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const [salesCount, usedInCount] = await Promise.all([
    prisma.saleItem.count({ where: { itemId: id } }),
    prisma.recipeItem.count({ where: { componentId: id } }),
  ]);
  if (salesCount > 0 || usedInCount > 0) {
    return res.status(409).json({
      error:
        "No se puede eliminar: tiene ventas o recetas asociadas. Desactivalo en su lugar.",
    });
  }
  await prisma.item.delete({ where: { id } });
  res.status(204).end();
});

// ── Receta del item ────────────────────────────────────────────
type RecipeLineInput = { componentId: number; qty: number; wastePct?: number | null };

router.put("/:id/recipe", async (req, res) => {
  const id = Number(req.params.id);
  const { yieldQty, yieldUnit, notes, items } = req.body as {
    yieldQty?: number;
    yieldUnit?: string;
    notes?: string | null;
    items: RecipeLineInput[];
  };

  const lines = (items ?? []).filter((l) => l.componentId && Number(l.qty) > 0);
  if (lines.some((l) => l.componentId === id))
    return res.status(400).json({ error: "Un item no puede ser componente de sí mismo" });

  const cycle = await findCycle(id, lines.map((l) => l.componentId));
  if (cycle) {
    const names = await prisma.item.findMany({
      where: { id: { in: cycle } },
      select: { id: true, name: true },
    });
    const byId = new Map(names.map((n) => [n.id, n.name]));
    return res.status(400).json({
      error: `Receta inválida: crearía un ciclo (${cycle.map((c) => byId.get(c) ?? c).join(" → ")})`,
    });
  }

  const recipe = await prisma.$transaction(async (tx) => {
    const previous = await tx.recipe.findUnique({
      where: { itemId: id },
      include: { _count: { select: { items: true } } },
    });
    await auditEvent(
      tx,
      id,
      "recipe",
      previous ? `${previous._count.items} componentes, rinde ${previous.yieldQty}` : "sin receta",
      `${lines.length} componentes, rinde ${Number(yieldQty) || 1}`
    );
    await tx.recipe.upsert({
      where: { itemId: id },
      create: {
        itemId: id,
        yieldQty: Number(yieldQty) || 1,
        yieldUnit: yieldUnit?.trim() || "unidades",
        notes: notes || null,
      },
      update: {
        ...(yieldQty !== undefined && { yieldQty: Number(yieldQty) || 1 }),
        ...(yieldUnit !== undefined && { yieldUnit: yieldUnit.trim() || "unidades" }),
        ...(notes !== undefined && { notes: notes || null }),
      },
    });
    const saved = await tx.recipe.findUniqueOrThrow({ where: { itemId: id } });
    await tx.recipeItem.deleteMany({ where: { recipeId: saved.id } });
    await tx.recipeItem.createMany({
      data: lines.map((l) => ({
        recipeId: saved.id,
        componentId: l.componentId,
        qty: Number(l.qty),
        wastePct: l.wastePct == null ? null : Number(l.wastePct),
      })),
    });
    return saved;
  });
  res.json(recipe);
});

router.delete("/:id/recipe", async (req, res) => {
  await prisma.recipe.deleteMany({ where: { itemId: Number(req.params.id) } });
  res.status(204).end();
});

// ── Grupos modificadores asociados al item ─────────────────────
router.put("/:id/modifier-groups", async (req, res) => {
  const id = Number(req.params.id);
  const groupIds = ((req.body.groupIds ?? []) as number[]).map(Number).filter(Boolean);
  await prisma.$transaction(async (tx) => {
    await tx.item.findUniqueOrThrow({ where: { id } });
    await tx.itemModifierGroup.deleteMany({ where: { itemId: id } });
    await tx.itemModifierGroup.createMany({
      data: groupIds.map((groupId, i) => ({ itemId: id, groupId, sortOrder: i })),
    });
  });
  const groups = await prisma.itemModifierGroup.findMany({
    where: { itemId: id },
    include: { group: { include: { options: { orderBy: { sortOrder: "asc" } } } } },
    orderBy: { sortOrder: "asc" },
  });
  res.json(groups);
});

// ── Compras: movimiento PURCHASE, actualizan costo base, gasto en Caja
router.post("/:id/purchases", async (req, res) => {
  const id = Number(req.params.id);
  const { quantity, totalCost, date, supplierId } = req.body;
  const qty = Number(quantity);
  const cost = Number(totalCost);
  if (!(qty > 0)) return res.status(400).json({ error: "Cantidad inválida" });
  if (!(cost >= 0)) return res.status(400).json({ error: "Costo inválido" });

  const purchase = await prisma.$transaction(async (tx) => {
    const purchase = await tx.purchase.create({
      data: {
        itemId: id,
        quantity: qty,
        totalCost: cost,
        supplierId: supplierId ? Number(supplierId) : null,
        ...(date && { date: new Date(date) }),
      },
    });
    await tx.item.update({
      where: { id },
      data: { cost: cost / qty, lastPurchaseAt: purchase.date },
    });
    await tx.costHistory.create({
      data: { itemId: id, cost: cost / qty, source: `Compra #${purchase.id}` },
    });
    await move(tx, {
      itemId: id,
      type: "PURCHASE",
      qty,
      reason: `Compra #${purchase.id}`,
      refType: "PURCHASE",
      refId: purchase.id,
    });
    return purchase;
  });
  res.status(201).json(purchase);
});

export default router;
