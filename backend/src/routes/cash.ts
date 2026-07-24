import { Router } from "express";
import { prisma } from "../prisma";

const router = Router();

// Caja: ingresos (ventas) y gastos (compras de materia prima) en un rango de fechas.
// GET /api/cash?from=2026-07-01&to=2026-07-31
router.get("/", async (req, res) => {
  const { from, to } = req.query;
  const dateFilter = {
    ...(from && { gte: new Date(String(from)) }),
    ...(to && { lte: new Date(String(to)) }),
  };

  const [sales, purchases] = await Promise.all([
    prisma.sale.findMany({
      where: { date: dateFilter },
      include: { client: true, items: { include: { product: true } } },
      orderBy: { date: "desc" },
    }),
    prisma.purchase.findMany({
      where: { date: dateFilter },
      include: { rawMaterial: true },
      orderBy: { date: "desc" },
    }),
  ]);

  const income = sales.reduce((sum, s) => sum + s.total, 0);
  const expenses = purchases.reduce((sum, p) => sum + p.totalCost, 0);

  res.json({
    income,
    expenses,
    balance: income - expenses,
    salesCount: sales.length,
    sales,
    purchases,
  });
});

export default router;
