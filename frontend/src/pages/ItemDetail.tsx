import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowLeftRight, ChefHat, Pencil, ShoppingBag, Star, Trash2 } from "lucide-react";
import { api, fmtDate, money } from "../api";
import type { Item, ItemDetail as ItemDetailType, StockMovement, Supplier } from "../types";
import { Badge, Button, Empty, Field, Modal, inputClass } from "../components/ui";
import {
  ItemFormModal,
  ItemSearch,
  MOVEMENT_LABELS,
  TYPE_LABELS,
  TYPE_TONES,
  pct,
  stockState,
} from "../components/items";

// Línea editable de la receta (estado local antes de guardar)
type LineDraft = { componentId: number; name: string; unit: string; qty: string; wastePct: string };

export default function ItemDetail({
  id,
  onBack,
  onOpenItem,
}: {
  id: number;
  onBack: () => void;
  onOpenItem: (id: number) => void;
}) {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["items"] });
    qc.invalidateQueries({ queryKey: ["item", id] });
    qc.invalidateQueries({ queryKey: ["item-movements", id] });
  };

  const { data: item } = useQuery({
    queryKey: ["item", id],
    queryFn: () => api.get<ItemDetailType>(`/items/${id}`),
  });
  const { data: allItems = [] } = useQuery({
    queryKey: ["items"],
    queryFn: () => api.get<Item[]>("/items"),
  });

  const { data: movements = [] } = useQuery({
    queryKey: ["item-movements", id],
    queryFn: () => api.get<StockMovement[]>(`/items/${id}/movements`),
  });

  const [editOpen, setEditOpen] = useState(false);
  const [purchaseOpen, setPurchaseOpen] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);

  // ── Editor de receta ──
  const [editingRecipe, setEditingRecipe] = useState(false);
  const [lines, setLines] = useState<LineDraft[]>([]);
  const [yieldQty, setYieldQty] = useState("1");
  const [yieldUnit, setYieldUnit] = useState("unidades");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!item || editingRecipe) return;
    setLines(
      (item.recipe?.items ?? []).map((l) => ({
        componentId: l.componentId,
        name: l.component.name,
        unit: l.component.unit,
        qty: String(l.qty),
        wastePct: l.wastePct != null ? String(l.wastePct) : "",
      }))
    );
    setYieldQty(String(item.recipe?.yieldQty ?? 1));
    setYieldUnit(item.recipe?.yieldUnit ?? "unidades");
    setNotes(item.recipe?.notes ?? "");
  }, [item, editingRecipe]);

  const saveRecipe = useMutation({
    mutationFn: () =>
      api.put(`/items/${id}/recipe`, {
        yieldQty: Number(yieldQty) || 1,
        yieldUnit,
        notes,
        items: lines
          .filter((l) => Number(l.qty) > 0)
          .map((l) => ({
            componentId: l.componentId,
            qty: Number(l.qty),
            wastePct: l.wastePct === "" ? null : Number(l.wastePct),
          })),
      }),
    onSuccess: () => {
      invalidate();
      setEditingRecipe(false);
    },
  });

  const deleteRecipe = useMutation({
    mutationFn: () => api.del(`/items/${id}/recipe`),
    onSuccess: () => {
      invalidate();
      setEditingRecipe(false);
    },
  });

  const favorite = useMutation({
    mutationFn: () => api.put(`/items/${id}`, { favorite: !item?.favorite }),
    onSuccess: invalidate,
  });
  const toggleActive = useMutation({
    mutationFn: () => api.put(`/items/${id}`, { active: !item?.active }),
    onSuccess: invalidate,
  });

  if (!item) return null;
  const st = stockState(item);

  const stat = (label: string, value: string, accent = "") => (
    <div className="rounded-xl border border-stone-200 bg-white p-3">
      <p className="text-xs text-stone-500">{label}</p>
      <p className={`text-lg font-semibold ${accent}`}>{value}</p>
    </div>
  );

  return (
    <div>
      {/* Encabezado */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft size={18} />
        </Button>
        <h1 className="text-2xl font-bold tracking-tight">{item.name}</h1>
        <button onClick={() => favorite.mutate()} title="Favorito">
          <Star
            size={18}
            className={item.favorite ? "fill-amber-400 text-amber-400" : "text-stone-300"}
          />
        </button>
        <Badge tone={TYPE_TONES[item.type]}>{TYPE_LABELS[item.type]}</Badge>
        {!item.active && <Badge tone="stone">Inactivo</Badge>}
        {item.active && st === "out" && <Badge tone="red">Sin stock</Badge>}
        {item.active && st === "low" && <Badge tone="amber">Stock bajo</Badge>}
        <div className="ml-auto flex gap-2">
          <Button variant="secondary" onClick={() => toggleActive.mutate()}>
            {item.active ? "Desactivar" : "Activar"}
          </Button>
          <Button onClick={() => setEditOpen(true)}>
            <span className="flex items-center gap-1.5">
              <Pencil size={15} /> Editar
            </span>
          </Button>
        </div>
      </div>

      {/* Costos y márgenes */}
      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {stat(
          item.hasRecipe ? "Costo (desde receta)" : "Costo",
          `${money.format(item.computedCost)} / ${item.unit}`
        )}
        {item.sellable && stat("Precio de venta", money.format(item.salePrice))}
        {item.sellable && stat("Ganancia", money.format(item.marginAbs))}
        {item.sellable &&
          stat("Margen", pct(item.marginPct), (item.marginPct ?? 0) < 0 ? "text-red-600" : "")}
        {item.sellable && stat("Markup", pct(item.markupPct))}
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Información general */}
        <div className="space-y-5">
          <section className="rounded-xl border border-stone-200 bg-white p-4">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-stone-400">
              Información general
            </h2>
            <dl className="space-y-2 text-sm">
              {[
                ["SKU / código", item.sku ?? "—"],
                [
                  "Categoría",
                  item.category
                    ? item.category.parent
                      ? `${item.category.parent.name} › ${item.category.name}`
                      : item.category.name
                    : "—",
                ],
                ["Unidad", item.unit],
                ["Descripción", item.description ?? "—"],
                [
                  "Venta individual",
                  item.sellable ? (item.available ? "Sí" : "Sí, pero no disponible") : "No (solo componente)",
                ],
                ["Impuesto", item.taxRate != null ? `${item.taxRate} %` : "—"],
                ["Merma por defecto", item.wastePct ? `${item.wastePct} %` : "—"],
                ["Proveedor", item.supplier?.name ?? "—"],
                ["Última compra", item.lastPurchaseAt ? fmtDate(item.lastPurchaseAt) : "—"],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between gap-3">
                  <dt className="text-stone-500">{label}</dt>
                  <dd className="text-right font-medium">{value}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="rounded-xl border border-stone-200 bg-white p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-400">
                Stock
              </h2>
              <div className="flex gap-1.5">
                <Button variant="secondary" onClick={() => setAdjustOpen(true)}>
                  <span className="flex items-center gap-1.5">
                    <ArrowLeftRight size={14} /> Ajustar
                  </span>
                </Button>
                <Button variant="secondary" onClick={() => setPurchaseOpen(true)}>
                  <span className="flex items-center gap-1.5">
                    <ShoppingBag size={14} /> Compra
                  </span>
                </Button>
              </div>
            </div>
            {item.trackStock ? (
              <dl className="space-y-2 text-sm">
                {[
                  ["Stock actual", `${item.stock} ${item.unit}`],
                  ["Stock mínimo", `${item.minStock} ${item.unit}`],
                  ["Stock máximo", item.maxStock != null ? `${item.maxStock} ${item.unit}` : "—"],
                  ["Vender sin stock", item.allowSaleWithoutStock ? "Permitido" : "Bloqueado"],
                ].map(([label, value]) => (
                  <div key={label} className="flex justify-between gap-3">
                    <dt className="text-stone-500">{label}</dt>
                    <dd className="text-right font-medium">{value}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="text-sm text-stone-400">Sin control de stock.</p>
            )}
            {item.purchases.length > 0 && (
              <div className="mt-3 border-t border-stone-100 pt-2">
                <p className="mb-1 text-xs text-stone-400">Últimas compras</p>
                {item.purchases.slice(0, 5).map((p) => (
                  <div key={p.id} className="flex justify-between text-xs text-stone-500">
                    <span>{fmtDate(p.date)}</span>
                    <span>
                      {p.quantity} {item.unit} — {money.format(p.totalCost)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>

          {item.usedIn.length > 0 && (
            <section className="rounded-xl border border-stone-200 bg-white p-4">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-stone-400">
                Se usa en
              </h2>
              <div className="flex flex-wrap gap-2">
                {item.usedIn.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => onOpenItem(u.id)}
                    className="rounded-full border border-stone-200 px-3 py-1 text-sm hover:bg-stone-50"
                  >
                    {u.name}
                  </button>
                ))}
              </div>
            </section>
          )}
        </div>

        {/* Receta */}
        <section className="rounded-xl border border-stone-200 bg-white p-4 lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-stone-400">
              <ChefHat size={16} /> Receta / ficha técnica
            </h2>
            {!editingRecipe && (
              <Button variant="secondary" onClick={() => setEditingRecipe(true)}>
                {item.recipe ? "Editar receta" : "Crear receta"}
              </Button>
            )}
          </div>

          {!editingRecipe && !item.recipe && (
            <Empty text="Sin receta. El costo se carga manualmente (o desde compras). Creá una receta para calcularlo desde sus componentes." />
          )}

          {!editingRecipe && item.recipe && (
            <>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-stone-200 text-left text-xs uppercase tracking-wide text-stone-500">
                    <th className="py-2 font-medium">Componente</th>
                    <th className="py-2 text-right font-medium">Neto</th>
                    <th className="py-2 text-right font-medium">Merma</th>
                    <th className="py-2 text-right font-medium">Bruto</th>
                    <th className="py-2 text-right font-medium">Costo unit.</th>
                    <th className="py-2 text-right font-medium">Costo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {item.recipe.items.map((l) => (
                    <tr key={l.id}>
                      <td className="py-2">
                        <button
                          className="font-medium hover:underline"
                          onClick={() => onOpenItem(l.componentId)}
                        >
                          {l.component.name}
                        </button>
                        {l.componentHasRecipe && (
                          <span className="ml-1.5 text-xs text-violet-500" title="Tiene receta propia">
                            ƒ
                          </span>
                        )}
                      </td>
                      <td className="py-2 text-right">
                        {l.qty} {l.component.unit}
                      </td>
                      <td className="py-2 text-right text-stone-500">
                        {l.effectiveWastePct ? `${l.effectiveWastePct} %` : "—"}
                      </td>
                      <td className="py-2 text-right text-stone-500">
                        {l.grossQty.toLocaleString("es-AR", { maximumFractionDigits: 3 })}{" "}
                        {l.component.unit}
                      </td>
                      <td className="py-2 text-right text-stone-500">
                        {money.format(l.componentUnitCost)}
                      </td>
                      <td className="py-2 text-right font-medium">{money.format(l.lineCost)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="mt-3 grid gap-3 border-t border-stone-200 pt-3 sm:grid-cols-3">
                <div>
                  <p className="text-xs text-stone-500">Rendimiento</p>
                  <p className="font-semibold">
                    {item.recipe.yieldQty} {item.recipe.yieldUnit}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-stone-500">Costo total</p>
                  <p className="font-semibold">{money.format(item.recipe.totalCost)}</p>
                </div>
                <div>
                  <p className="text-xs text-stone-500">
                    Costo por {item.recipe.yieldUnit.replace(/s$/, "")}
                  </p>
                  <p className="font-semibold">{money.format(item.recipe.costPerUnit)}</p>
                </div>
              </div>
              {item.recipe.notes && (
                <p className="mt-2 text-sm text-stone-500">{item.recipe.notes}</p>
              )}
            </>
          )}

          {editingRecipe && (
            <div className="space-y-3">
              {lines.map((l, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="flex-1 text-sm font-medium">{l.name}</span>
                  <input
                    className={`${inputClass} w-24`}
                    type="number"
                    step="any"
                    min="0"
                    placeholder="Neto"
                    title={`Cantidad neta (${l.unit})`}
                    value={l.qty}
                    onChange={(e) => {
                      const next = [...lines];
                      next[i] = { ...l, qty: e.target.value };
                      setLines(next);
                    }}
                  />
                  <span className="w-10 text-xs text-stone-400">{l.unit}</span>
                  <input
                    className={`${inputClass} w-20`}
                    type="number"
                    step="0.1"
                    min="0"
                    max="99"
                    placeholder="Merma"
                    title="Merma % (vacío = merma del componente)"
                    value={l.wastePct}
                    onChange={(e) => {
                      const next = [...lines];
                      next[i] = { ...l, wastePct: e.target.value };
                      setLines(next);
                    }}
                  />
                  <span className="w-4 text-xs text-stone-400">%</span>
                  <Button variant="ghost" onClick={() => setLines(lines.filter((_, j) => j !== i))}>
                    <Trash2 size={15} />
                  </Button>
                </div>
              ))}

              <ItemSearch
                items={allItems}
                exclude={[id, ...lines.map((l) => l.componentId)]}
                onSelect={(sel) =>
                  setLines([
                    ...lines,
                    { componentId: sel.id, name: sel.name, unit: sel.unit, qty: "", wastePct: "" },
                  ])
                }
              />

              <div className="grid grid-cols-2 gap-3 border-t border-stone-200 pt-3">
                <Field label="Rendimiento (cantidad)">
                  <input
                    className={inputClass}
                    type="number"
                    step="any"
                    min="0"
                    value={yieldQty}
                    onChange={(e) => setYieldQty(e.target.value)}
                  />
                </Field>
                <Field label="Unidad de rendimiento">
                  <input
                    className={inputClass}
                    value={yieldUnit}
                    onChange={(e) => setYieldUnit(e.target.value)}
                    placeholder="unidades, kg, planchas…"
                  />
                </Field>
              </div>
              <Field label="Notas (opcional)">
                <input
                  className={inputClass}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </Field>

              {saveRecipe.error && (
                <p className="text-sm text-red-600">{saveRecipe.error.message}</p>
              )}
              <div className="flex justify-between pt-1">
                {item.recipe ? (
                  <Button
                    variant="danger"
                    onClick={() => {
                      if (confirm("¿Eliminar la receta? El costo pasará a ser manual."))
                        deleteRecipe.mutate();
                    }}
                  >
                    Eliminar receta
                  </Button>
                ) : (
                  <span />
                )}
                <div className="flex gap-2">
                  <Button variant="secondary" onClick={() => setEditingRecipe(false)}>
                    Cancelar
                  </Button>
                  <Button onClick={() => saveRecipe.mutate()} disabled={saveRecipe.isPending}>
                    Guardar receta
                  </Button>
                </div>
              </div>
            </div>
          )}
        </section>
      </div>

      {/* Movimientos de stock */}
      {movements.length > 0 && (
        <section className="mt-5 rounded-xl border border-stone-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-stone-400">
            Movimientos de stock
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-stone-200 text-left text-xs uppercase tracking-wide text-stone-500">
                  <th className="py-2 font-medium">Fecha</th>
                  <th className="py-2 font-medium">Tipo</th>
                  <th className="py-2 text-right font-medium">Cantidad</th>
                  <th className="py-2 font-medium">Motivo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {movements.map((m) => (
                  <tr key={m.id}>
                    <td className="py-2 whitespace-nowrap text-stone-500">{fmtDate(m.date)}</td>
                    <td className="py-2">
                      <Badge
                        tone={
                          m.qty > 0 ? "green" : m.type === "WASTE" ? "red" : "stone"
                        }
                      >
                        {MOVEMENT_LABELS[m.type] ?? m.type}
                      </Badge>
                    </td>
                    <td
                      className={`py-2 text-right font-medium ${
                        m.qty > 0 ? "text-emerald-600" : "text-red-600"
                      }`}
                    >
                      {m.qty > 0 ? "+" : ""}
                      {m.qty.toLocaleString("es-AR", { maximumFractionDigits: 3 })} {item.unit}
                    </td>
                    <td className="py-2 text-stone-500">{m.reason ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <ItemFormModal open={editOpen} onClose={() => setEditOpen(false)} editing={item} />
      <PurchaseModal
        open={purchaseOpen}
        onClose={() => setPurchaseOpen(false)}
        item={item}
        onSaved={invalidate}
      />
      <AdjustModal
        open={adjustOpen}
        onClose={() => setAdjustOpen(false)}
        item={item}
        onSaved={invalidate}
      />
    </div>
  );
}

// ── Ajuste de stock: ajuste manual, merma o devolución ─────────
function AdjustModal({
  open,
  onClose,
  item,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  item: ItemDetailType;
  onSaved: () => void;
}) {
  const [type, setType] = useState<"ADJUST" | "WASTE" | "RETURN">("ADJUST");
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState("");

  const save = useMutation({
    mutationFn: () =>
      api.post(`/items/${item.id}/adjust`, { type, qty: Number(qty), reason }),
    onSuccess: () => {
      onSaved();
      onClose();
      setQty("");
      setReason("");
    },
  });

  return (
    <Modal open={open} onClose={onClose} title={`Ajustar stock de ${item.name}`}>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <Field label="Tipo de movimiento">
          <select
            className={inputClass}
            value={type}
            onChange={(e) => setType(e.target.value as typeof type)}
          >
            <option value="ADJUST">Ajuste (± con signo)</option>
            <option value="WASTE">Merma (siempre resta)</option>
            <option value="RETURN">Devolución (siempre suma)</option>
          </select>
        </Field>
        <Field label={`Cantidad (${item.unit})`}>
          <input
            className={inputClass}
            type="number"
            step="any"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            required
            autoFocus
          />
        </Field>
        <Field label="Motivo">
          <input
            className={inputClass}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Recuento físico, rotura, vencimiento…"
          />
        </Field>
        <p className="text-sm text-stone-500">
          Stock actual: <b>{item.stock} {item.unit}</b>
        </p>
        {save.error && <p className="text-sm text-red-600">{save.error.message}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={save.isPending}>
            Registrar
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// ── Registrar compra (suma stock y actualiza costo) ────────────
function PurchaseModal({
  open,
  onClose,
  item,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  item: ItemDetailType;
  onSaved: () => void;
}) {
  const qc = useQueryClient();
  const [quantity, setQuantity] = useState("");
  const [totalCost, setTotalCost] = useState("");
  const [supplierId, setSupplierId] = useState("");

  const { data: suppliers = [] } = useQuery({
    queryKey: ["suppliers"],
    queryFn: () => api.get<Supplier[]>("/suppliers"),
    enabled: open,
  });

  useEffect(() => {
    if (open) setSupplierId(item.supplierId ? String(item.supplierId) : "");
  }, [open, item.supplierId]);

  const save = useMutation({
    mutationFn: () =>
      api.post(`/items/${item.id}/purchases`, {
        quantity: Number(quantity),
        totalCost: Number(totalCost),
        supplierId: supplierId ? Number(supplierId) : null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cash"] });
      onSaved();
      onClose();
      setQuantity("");
      setTotalCost("");
    },
  });

  const unitCost = Number(quantity) > 0 ? Number(totalCost) / Number(quantity) : 0;

  return (
    <Modal open={open} onClose={onClose} title={`Compra de ${item.name}`}>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <p className="text-sm text-stone-500">
          Suma stock, actualiza el costo del item y queda registrada como gasto en Caja.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Field label={`Cantidad (${item.unit})`}>
            <input
              className={inputClass}
              type="number"
              step="any"
              min="0"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              required
              autoFocus
            />
          </Field>
          <Field label="Costo total pagado ($)">
            <input
              className={inputClass}
              type="number"
              step="0.01"
              min="0"
              value={totalCost}
              onChange={(e) => setTotalCost(e.target.value)}
              required
            />
          </Field>
        </div>
        <Field label="Proveedor (opcional)">
          <select
            className={inputClass}
            value={supplierId}
            onChange={(e) => setSupplierId(e.target.value)}
          >
            <option value="">Sin proveedor</option>
            {suppliers
              .filter((s) => s.active)
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
          </select>
        </Field>
        {unitCost > 0 && (
          <p className="text-sm text-stone-500">
            Nuevo costo unitario: <b>{money.format(unitCost)}</b> / {item.unit}
          </p>
        )}
        {save.error && <p className="text-sm text-red-600">{save.error.message}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={save.isPending}>
            Registrar
          </Button>
        </div>
      </form>
    </Modal>
  );
}
