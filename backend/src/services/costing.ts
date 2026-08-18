import { prisma } from "../prisma";

// Grafo de composición: itemId → líneas de su receta.
// Se carga entero en memoria (escala de un negocio gastronómico: cientos de items).
export type RecipeLine = { componentId: number; qty: number; wastePct: number | null };
export type CostGraph = {
  baseCost: Map<number, number>; // costo propio (manual/última compra)
  wastePct: Map<number, number>; // merma por defecto del item
  recipes: Map<number, { yieldQty: number; lines: RecipeLine[] }>;
};

export async function loadCostGraph(): Promise<CostGraph> {
  const [items, recipes] = await Promise.all([
    prisma.item.findMany({ select: { id: true, cost: true, wastePct: true } }),
    prisma.recipe.findMany({
      select: {
        itemId: true,
        yieldQty: true,
        items: { select: { componentId: true, qty: true, wastePct: true } },
      },
    }),
  ]);
  return {
    baseCost: new Map(items.map((i) => [i.id, i.cost])),
    wastePct: new Map(items.map((i) => [i.id, i.wastePct])),
    recipes: new Map(
      recipes.map((r) => [r.itemId, { yieldQty: r.yieldQty, lines: r.items }])
    ),
  };
}

// Cantidad bruta a partir de la neta y la merma (%). Merma 20% → bruta = neta / 0.8
export function grossQty(netQty: number, wastePct: number): number {
  const factor = 1 - Math.min(Math.max(wastePct, 0), 99.99) / 100;
  return netQty / factor;
}

// Costo unitario efectivo de un item.
// Con receta: Σ (bruta × costo unitario del componente) / rendimiento.
// Sin receta: costo base. Ante un ciclo (no debería existir) corta y usa costo base.
export function unitCost(
  itemId: number,
  graph: CostGraph,
  memo = new Map<number, number>(),
  visiting = new Set<number>()
): number {
  const cached = memo.get(itemId);
  if (cached !== undefined) return cached;
  if (visiting.has(itemId)) return graph.baseCost.get(itemId) ?? 0;

  const recipe = graph.recipes.get(itemId);
  if (!recipe || recipe.lines.length === 0) {
    const base = graph.baseCost.get(itemId) ?? 0;
    memo.set(itemId, base);
    return base;
  }

  visiting.add(itemId);
  let total = 0;
  for (const line of recipe.lines) {
    const waste = line.wastePct ?? graph.wastePct.get(line.componentId) ?? 0;
    total += grossQty(line.qty, waste) * unitCost(line.componentId, graph, memo, visiting);
  }
  visiting.delete(itemId);

  const cost = recipe.yieldQty > 0 ? total / recipe.yieldQty : 0;
  memo.set(itemId, cost);
  return cost;
}

// ¿Asignar estas líneas como receta de `itemId` crearía un ciclo?
// Devuelve el nombre del camino conflictivo, o null si es válido.
export async function findCycle(
  itemId: number,
  componentIds: number[]
): Promise<number[] | null> {
  const recipes = await prisma.recipe.findMany({
    select: { itemId: true, items: { select: { componentId: true } } },
  });
  const edges = new Map<number, number[]>(
    recipes.map((r) => [r.itemId, r.items.map((i) => i.componentId)])
  );
  edges.set(itemId, componentIds); // receta propuesta

  // DFS desde itemId: si volvemos a itemId, hay ciclo.
  const path: number[] = [];
  const seen = new Set<number>();
  const dfs = (node: number): number[] | null => {
    path.push(node);
    for (const next of edges.get(node) ?? []) {
      if (next === itemId) return [...path, itemId];
      if (!seen.has(next)) {
        seen.add(next);
        const found = dfs(next);
        if (found) return found;
      }
    }
    path.pop();
    return null;
  };
  return dfs(itemId);
}

// Decora una lista de items con costo efectivo, márgenes y markup.
export function withComputedCosts<T extends { id: number; salePrice: number }>(
  items: T[],
  graph: CostGraph
) {
  const memo = new Map<number, number>();
  return items.map((item) => {
    const cost = unitCost(item.id, graph, memo);
    const marginAbs = item.salePrice - cost;
    return {
      ...item,
      computedCost: cost,
      hasRecipe: graph.recipes.has(item.id),
      marginAbs,
      marginPct: item.salePrice > 0 ? (marginAbs / item.salePrice) * 100 : null,
      markupPct: cost > 0 ? (marginAbs / cost) * 100 : null,
    };
  });
}
