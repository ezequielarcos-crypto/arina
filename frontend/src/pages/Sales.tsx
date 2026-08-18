import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { api, fmtDate, money } from "../api";
import type { CashReport, Client, Item } from "../types";
import { Button, Empty, Field, Modal, PageHeader, Table, inputClass } from "../components/ui";

type Line = { itemId: string; quantity: string };
type Period = "day" | "week" | "month" | "custom";

function periodRange(period: Period, customFrom: string, customTo: string) {
  const now = new Date();
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  if (period === "day") return { from: startOfDay(now), to: null };
  if (period === "week") {
    const from = startOfDay(now);
    from.setDate(from.getDate() - ((from.getDay() + 6) % 7)); // lunes
    return { from, to: null };
  }
  if (period === "month") return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: null };
  return {
    from: customFrom ? new Date(`${customFrom}T00:00:00`) : null,
    to: customTo ? new Date(`${customTo}T23:59:59`) : null,
  };
}

export default function Sales() {
  const qc = useQueryClient();

  const { data: items = [] } = useQuery({
    queryKey: ["items"],
    queryFn: () => api.get<Item[]>("/items"),
  });
  const { data: clients = [] } = useQuery({
    queryKey: ["clients"],
    queryFn: () => api.get<Client[]>("/clients"),
  });

  // Solo lo que se puede vender ahora mismo
  const sellable = useMemo(
    () => items.filter((i) => i.sellable && i.active && i.available),
    [items]
  );

  // ── Nueva venta ──
  const [saleOpen, setSaleOpen] = useState(false);
  const [clientId, setClientId] = useState("");
  const [lines, setLines] = useState<Line[]>([{ itemId: "", quantity: "1" }]);

  const total = useMemo(
    () =>
      lines.reduce((sum, l) => {
        const item = sellable.find((i) => i.id === Number(l.itemId));
        return sum + (item ? item.salePrice * (Number(l.quantity) || 0) : 0);
      }, 0),
    [lines, sellable]
  );

  const createSale = useMutation({
    mutationFn: () =>
      api.post("/sales", {
        clientId: clientId ? Number(clientId) : null,
        items: lines
          .filter((l) => l.itemId && Number(l.quantity) > 0)
          .map((l) => ({ itemId: Number(l.itemId), quantity: Number(l.quantity) })),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cash"] });
      qc.invalidateQueries({ queryKey: ["items"] });
      qc.invalidateQueries({ queryKey: ["clients"] });
      setSaleOpen(false);
      setClientId("");
      setLines([{ itemId: "", quantity: "1" }]);
    },
  });

  const cancelSale = useMutation({
    mutationFn: (id: number) => api.del(`/sales/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cash"] });
      qc.invalidateQueries({ queryKey: ["items"] });
    },
  });

  // ── Caja ──
  const [period, setPeriod] = useState<Period>("day");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const range = periodRange(period, customFrom, customTo);
  const params = new URLSearchParams();
  if (range.from) params.set("from", range.from.toISOString());
  if (range.to) params.set("to", range.to.toISOString());

  const { data: cash } = useQuery({
    queryKey: ["cash", params.toString()],
    queryFn: () => api.get<CashReport>(`/cash?${params}`),
  });

  const periodLabels: Record<Period, string> = {
    day: "Hoy",
    week: "Esta semana",
    month: "Este mes",
    custom: "Por fecha",
  };

  return (
    <div>
      <PageHeader title="Ventas y Caja">
        <Button onClick={() => setSaleOpen(true)}>
          <span className="flex items-center gap-1.5">
            <Plus size={15} /> Nueva venta
          </span>
        </Button>
      </PageHeader>

      {/* Selector de período */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {(Object.keys(periodLabels) as Period[]).map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
              period === p
                ? "bg-stone-800 text-white"
                : "bg-white border border-stone-300 text-stone-600 hover:bg-stone-100"
            }`}
          >
            {periodLabels[p]}
          </button>
        ))}
        {period === "custom" && (
          <div className="flex items-center gap-2 text-sm">
            <input
              type="date"
              className={inputClass}
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
            />
            <span className="text-stone-400">a</span>
            <input
              type="date"
              className={inputClass}
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
            />
          </div>
        )}
      </div>

      {/* Resumen de caja */}
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-stone-200 bg-white p-4">
          <p className="text-sm text-stone-500">Ingresos ({cash?.salesCount ?? 0} ventas)</p>
          <p className="text-2xl font-bold text-emerald-600">
            {money.format(cash?.income ?? 0)}
          </p>
        </div>
        <div className="rounded-xl border border-stone-200 bg-white p-4">
          <p className="text-sm text-stone-500">Gastos (compras de insumos)</p>
          <p className="text-2xl font-bold text-red-500">{money.format(cash?.expenses ?? 0)}</p>
        </div>
        <div className="rounded-xl border border-stone-200 bg-white p-4">
          <p className="text-sm text-stone-500">Balance</p>
          <p
            className={`text-2xl font-bold ${
              (cash?.balance ?? 0) >= 0 ? "text-stone-800" : "text-red-600"
            }`}
          >
            {money.format(cash?.balance ?? 0)}
          </p>
        </div>
      </div>

      {/* Ventas del período */}
      <h2 className="mb-2 text-lg font-semibold">Ventas</h2>
      {!cash || cash.sales.length === 0 ? (
        <Empty text="No hay ventas en este período." />
      ) : (
        <Table headers={["Fecha", "Cliente", "Detalle", "Total", ""]}>
          {cash.sales.map((s) => (
            <tr key={s.id} className="hover:bg-stone-50">
              <td className="px-4 py-2.5 whitespace-nowrap text-stone-500">{fmtDate(s.date)}</td>
              <td className="px-4 py-2.5">{s.client?.name ?? "—"}</td>
              <td className="px-4 py-2.5 text-stone-600">
                {s.items.map((it) => `${it.quantity}× ${it.item.name}`).join(", ")}
              </td>
              <td className="px-4 py-2.5 font-medium">{money.format(s.total)}</td>
              <td className="px-4 py-2.5 text-right">
                <Button
                  variant="ghost"
                  onClick={() => {
                    if (confirm("¿Anular esta venta? Se repone el stock.")) cancelSale.mutate(s.id);
                  }}
                >
                  <Trash2 size={15} />
                </Button>
              </td>
            </tr>
          ))}
        </Table>
      )}

      {/* Gastos del período */}
      <h2 className="mb-2 mt-6 text-lg font-semibold">Gastos</h2>
      {!cash || cash.purchases.length === 0 ? (
        <Empty text="No hay compras de insumos en este período." />
      ) : (
        <Table headers={["Fecha", "Insumo", "Cantidad", "Total"]}>
          {cash.purchases.map((p) => (
            <tr key={p.id} className="hover:bg-stone-50">
              <td className="px-4 py-2.5 whitespace-nowrap text-stone-500">{fmtDate(p.date)}</td>
              <td className="px-4 py-2.5">{p.item?.name}</td>
              <td className="px-4 py-2.5">
                {p.quantity} {p.item?.unit}
              </td>
              <td className="px-4 py-2.5 font-medium">{money.format(p.totalCost)}</td>
            </tr>
          ))}
        </Table>
      )}

      {/* Modal nueva venta */}
      <Modal open={saleOpen} onClose={() => setSaleOpen(false)} title="Nueva venta">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            createSale.mutate();
          }}
        >
          <Field label="Cliente (opcional)">
            <select
              className={inputClass}
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
            >
              <option value="">Venta sin cliente</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>

          <div>
            <span className="mb-1 block text-sm font-medium text-stone-600">Productos</span>
            <div className="space-y-2">
              {lines.map((l, i) => {
                const item = sellable.find((s) => s.id === Number(l.itemId));
                return (
                  <div key={i} className="flex items-center gap-2">
                    <select
                      className={inputClass}
                      value={l.itemId}
                      onChange={(e) => {
                        const next = [...lines];
                        next[i] = { ...l, itemId: e.target.value };
                        setLines(next);
                      }}
                    >
                      <option value="">Producto…</option>
                      {sellable.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} — {money.format(s.salePrice)}
                          {s.trackStock ? ` (stock: ${s.stock})` : ""}
                        </option>
                      ))}
                    </select>
                    <input
                      className={`${inputClass} w-20`}
                      type="number"
                      step="1"
                      min="1"
                      value={l.quantity}
                      onChange={(e) => {
                        const next = [...lines];
                        next[i] = { ...l, quantity: e.target.value };
                        setLines(next);
                      }}
                    />
                    <span className="w-24 text-right text-sm text-stone-500">
                      {item ? money.format(item.salePrice * (Number(l.quantity) || 0)) : ""}
                    </span>
                    <Button
                      variant="ghost"
                      onClick={() => setLines(lines.filter((_, j) => j !== i))}
                    >
                      <Trash2 size={15} />
                    </Button>
                  </div>
                );
              })}
            </div>
            <div className="mt-2">
              <Button
                variant="secondary"
                onClick={() => setLines([...lines, { itemId: "", quantity: "1" }])}
              >
                + Agregar producto
              </Button>
            </div>
          </div>

          <div className="flex justify-between border-t border-stone-200 pt-3 text-lg font-semibold">
            <span>Total</span>
            <span>{money.format(total)}</span>
          </div>
          {createSale.error && <p className="text-sm text-red-600">{createSale.error.message}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setSaleOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={createSale.isPending || total <= 0}>
              Registrar venta
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
