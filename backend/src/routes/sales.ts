import { Router } from "express";
import { prisma } from "../prisma";
import { consumeComponents, move, revertMovements } from "../services/stock";

const router = Router();

type SaleItemInput = { itemId: number; quantity: number; optionIds?: number[] };

router.get("/", async (req, res) => {
  const { from, to } = req.query;
  res.json(
    await prisma.sale.findMany({
      where: {
        date: {
          ...(from && { gte: new Date(String(from)) }),
          ...(to && { lte: new Date(String(to)) }),
        },
      },
      include: {
        client: true,
        priceList: true,
        items: { include: { item: true, modifiers: true } },
      },
      orderBy: { date: "desc" },
    })
  );
});

// Crear venta. Por cada item vendido:
//   - si controla stock → movimiento SALE (producto pre-elaborado)
//   - si no controla stock pero tiene receta → consume sus componentes (CONSUMPTION)
router.post("/", async (req, res) => {
  const { clientId, items, date, priceListId } = req.body as {
    clientId?: number | null;
    items: SaleItemInput[];
    date?: string;
    priceListId?: number | null;
  };
  if (!items?.length) return res.status(400).json({ error: "La venta no tiene productos" });

  const sale = await prisma.$transaction(async (tx) => {
    const dbItems = await tx.item.findMany({
      where: { id: { in: items.map((it) => it.itemId) } },
      include: {
        modifierGroups: { include: { group: { include: { options: true } } } },
      },
    });
    const byId = new Map(dbItems.map((i) => [i.id, i]));

    // Precios de la lista seleccionada (si hay)
    const listPrices = new Map<number, number>();
    if (priceListId) {
      const list = await tx.priceList.findUniqueOrThrow({
        where: { id: Number(priceListId) },
        include: { items: true },
      });
      if (!list.active) throw new Error(`La lista «${list.name}» está inactiva`);
      for (const li of list.items) listPrices.set(li.itemId, li.price);
    }

    let total = 0;
    const saleItems = items.map((it) => {
      const item = byId.get(it.itemId);
      if (!item) throw new Error(`Item ${it.itemId} inexistente`);
      if (!item.sellable || !item.active)
        throw new Error(`«${item.name}» no está a la venta`);
      const qty = Number(it.quantity);
      if (!(qty > 0)) throw new Error(`Cantidad inválida para ${item.name}`);
      if (item.trackStock && !item.allowSaleWithoutStock && item.stock < qty)
        throw new Error(`Stock insuficiente de «${item.name}» (hay ${item.stock})`);

      // Modificadores elegidos: validar pertenencia y mín/máx por grupo
      const optionIds = (it.optionIds ?? []).map(Number).filter(Boolean);
      const chosen: { optionId: number; groupName: string; optionName: string; priceDelta: number }[] = [];
      for (const assoc of item.modifierGroups) {
        const group = assoc.group;
        if (!group.active) continue;
        const inGroup = group.options.filter((o) => o.active && optionIds.includes(o.id));
        if (inGroup.length < group.minQty)
          throw new Error(`«${item.name}»: elegí al menos ${group.minQty} de «${group.publicName ?? group.name}»`);
        if (inGroup.length > group.maxQty)
          throw new Error(`«${item.name}»: máximo ${group.maxQty} de «${group.publicName ?? group.name}»`);
        for (const o of inGroup)
          chosen.push({
            optionId: o.id,
            groupName: group.publicName ?? group.name,
            optionName: o.name,
            priceDelta: o.priceDelta,
          });
      }
      const validIds = new Set(chosen.map((c) => c.optionId));
      const unknown = optionIds.find((oid) => !validIds.has(oid));
      if (unknown) throw new Error(`Opción ${unknown} no corresponde a «${item.name}»`);

      const basePrice = listPrices.get(item.id) ?? item.salePrice;
      const unitPrice = basePrice + chosen.reduce((s, c) => s + c.priceDelta, 0);
      total += unitPrice * qty;
      return {
        itemId: item.id,
        quantity: qty,
        unitPrice,
        modifiers: {
          create: chosen.map(({ optionId, groupName, optionName, priceDelta }) => ({
            optionId,
            groupName,
            optionName,
            priceDelta,
          })),
        },
      };
    });

    const sale = await tx.sale.create({
      data: {
        clientId: clientId ?? null,
        priceListId: priceListId ?? null,
        total,
        ...(date && { date: new Date(date) }),
        items: { create: saleItems },
      },
      include: {
        client: true,
        priceList: true,
        items: { include: { item: true, modifiers: true } },
      },
    });

    for (const it of sale.items) {
      const item = byId.get(it.itemId)!;
      if (item.trackStock) {
        await move(tx, {
          itemId: it.itemId,
          type: "SALE",
          qty: -it.quantity,
          reason: `Venta #${sale.id}`,
          refType: "SALE",
          refId: sale.id,
        });
      } else {
        await consumeComponents(tx, it.itemId, it.quantity, {
          type: "CONSUMPTION",
          refType: "SALE",
          refId: sale.id,
          reason: `Consumo por venta #${sale.id} (${item.name})`,
        });
      }
    }
    return sale;
  });
  res.status(201).json(sale);
});

// Anular venta: revierte EXACTAMENTE los movimientos que generó y borra la venta.
// Los movimientos (originales + reversos) quedan como historial.
router.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  await prisma.$transaction(async (tx) => {
    await tx.sale.findUniqueOrThrow({ where: { id } });
    await revertMovements(tx, "SALE", id, "SALE_CANCEL", `Anulación de venta #${id}`);
    await tx.sale.delete({ where: { id } });
  });
  res.status(204).end();
});

export default router;
