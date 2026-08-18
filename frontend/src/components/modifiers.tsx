import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Power, Trash2 } from "lucide-react";
import { api, money } from "../api";
import type { Item, ModifierGroup, PriceList } from "../types";
import { Button, Empty, Field, Modal, inputClass } from "./ui";

// ── Gestión de grupos modificadores ────────────────────────────
type OptionDraft = { name: string; priceDelta: string };
const emptyGroup = { name: "", publicName: "", minQty: "0", maxQty: "1" };

export function ModifierGroupsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["modifier-groups"] });
    qc.invalidateQueries({ queryKey: ["item"] });
  };
  const { data: groups = [] } = useQuery({
    queryKey: ["modifier-groups"],
    queryFn: () => api.get<ModifierGroup[]>("/modifier-groups"),
    enabled: open,
  });

  const [editing, setEditing] = useState<ModifierGroup | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(emptyGroup);
  const [options, setOptions] = useState<OptionDraft[]>([]);

  const startCreate = () => {
    setEditing(null);
    setForm(emptyGroup);
    setOptions([{ name: "", priceDelta: "" }]);
    setCreating(true);
  };
  const startEdit = (g: ModifierGroup) => {
    setEditing(g);
    setForm({
      name: g.name,
      publicName: g.publicName ?? "",
      minQty: String(g.minQty),
      maxQty: String(g.maxQty),
    });
    setOptions(g.options.map((o) => ({ name: o.name, priceDelta: o.priceDelta ? String(o.priceDelta) : "" })));
    setCreating(true);
  };

  const save = useMutation({
    mutationFn: () => {
      const body = {
        name: form.name,
        publicName: form.publicName || null,
        minQty: Number(form.minQty) || 0,
        maxQty: Number(form.maxQty) || 1,
        options: options
          .filter((o) => o.name.trim())
          .map((o, i) => ({ name: o.name, priceDelta: Number(o.priceDelta) || 0, sortOrder: i })),
      };
      return editing
        ? api.put(`/modifier-groups/${editing.id}`, body)
        : api.post("/modifier-groups", body);
    },
    onSuccess: () => {
      invalidate();
      setCreating(false);
    },
  });
  const toggle = useMutation({
    mutationFn: (g: ModifierGroup) =>
      api.put(`/modifier-groups/${g.id}`, {
        name: g.name,
        publicName: g.publicName,
        minQty: g.minQty,
        maxQty: g.maxQty,
        active: !g.active,
      }),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: (id: number) => api.del(`/modifier-groups/${id}`),
    onSuccess: invalidate,
  });

  return (
    <Modal open={open} onClose={onClose} title="Grupos modificadores">
      {!creating && (
        <>
          <div className="space-y-1">
            {groups.length === 0 && (
              <Empty text="Sin grupos. Ejemplos: «Tamaño» (individual/familiar), «Adicionales» (+queso, +jamón)." />
            )}
            {groups.map((g) => (
              <div
                key={g.id}
                className={`flex items-center justify-between rounded px-2 py-1.5 hover:bg-stone-50 ${
                  !g.active ? "opacity-50" : ""
                }`}
              >
                <div className="text-sm">
                  <span className="font-medium">{g.name}</span>
                  {g.publicName && g.publicName !== g.name && (
                    <span className="ml-1 text-stone-400">({g.publicName})</span>
                  )}
                  <span className="ml-2 text-xs text-stone-400">
                    {g.options.map((o) => o.name).join(", ") || "sin opciones"} · elegir{" "}
                    {g.minQty}–{g.maxQty} · {g._count?.items ?? 0} items
                  </span>
                </div>
                <span className="flex gap-1">
                  <Button variant="ghost" onClick={() => startEdit(g)}>
                    <Pencil size={13} />
                  </Button>
                  <Button variant="ghost" onClick={() => toggle.mutate(g)}>
                    <Power size={13} className={g.active ? "text-emerald-600" : "text-stone-400"} />
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      if (confirm(`¿Eliminar «${g.name}»?`)) remove.mutate(g.id);
                    }}
                  >
                    <Trash2 size={13} />
                  </Button>
                </span>
              </div>
            ))}
          </div>
          {remove.error && <p className="mt-2 text-sm text-red-600">{remove.error.message}</p>}
          <div className="mt-4 border-t border-stone-200 pt-3">
            <Button onClick={startCreate}>
              <span className="flex items-center gap-1.5">
                <Plus size={15} /> Nuevo grupo
              </span>
            </Button>
          </div>
        </>
      )}

      {creating && (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <div className="grid grid-cols-2 gap-3">
            <Field label="Nombre interno">
              <input
                className={inputClass}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
                autoFocus
              />
            </Field>
            <Field label="Nombre público (opcional)">
              <input
                className={inputClass}
                value={form.publicName}
                onChange={(e) => setForm({ ...form, publicName: e.target.value })}
              />
            </Field>
            <Field label="Opciones mínimas">
              <input
                className={inputClass}
                type="number"
                min="0"
                value={form.minQty}
                onChange={(e) => setForm({ ...form, minQty: e.target.value })}
              />
            </Field>
            <Field label="Opciones máximas">
              <input
                className={inputClass}
                type="number"
                min="1"
                value={form.maxQty}
                onChange={(e) => setForm({ ...form, maxQty: e.target.value })}
              />
            </Field>
          </div>

          <div>
            <span className="mb-1 block text-sm font-medium text-stone-600">
              Opciones (precio adicional opcional)
            </span>
            <div className="space-y-2">
              {options.map((o, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    className={inputClass}
                    placeholder="Nombre de la opción…"
                    value={o.name}
                    onChange={(e) => {
                      const next = [...options];
                      next[i] = { ...o, name: e.target.value };
                      setOptions(next);
                    }}
                  />
                  <input
                    className={`${inputClass} w-28`}
                    type="number"
                    step="0.01"
                    placeholder="+$"
                    value={o.priceDelta}
                    onChange={(e) => {
                      const next = [...options];
                      next[i] = { ...o, priceDelta: e.target.value };
                      setOptions(next);
                    }}
                  />
                  <Button variant="ghost" onClick={() => setOptions(options.filter((_, j) => j !== i))}>
                    <Trash2 size={15} />
                  </Button>
                </div>
              ))}
            </div>
            <div className="mt-2">
              <Button
                variant="secondary"
                onClick={() => setOptions([...options, { name: "", priceDelta: "" }])}
              >
                + Agregar opción
              </Button>
            </div>
          </div>

          {save.error && <p className="text-sm text-red-600">{save.error.message}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setCreating(false)}>
              Volver
            </Button>
            <Button type="submit" disabled={save.isPending}>
              Guardar grupo
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}

// ── Listas de precios ──────────────────────────────────────────
export function PriceListsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ["price-lists"] });
  const { data: lists = [] } = useQuery({
    queryKey: ["price-lists"],
    queryFn: () => api.get<PriceList[]>("/price-lists"),
    enabled: open,
  });
  const { data: items = [] } = useQuery({
    queryKey: ["items"],
    queryFn: () => api.get<Item[]>("/items"),
    enabled: open,
  });

  const [name, setName] = useState("");
  const [editing, setEditing] = useState<PriceList | null>(null);
  const [prices, setPrices] = useState<Record<number, string>>({});

  const sellable = items.filter((i) => i.sellable && i.active);

  useEffect(() => {
    if (!editing) return;
    const next: Record<number, string> = {};
    for (const li of editing.items) next[li.itemId] = String(li.price);
    setPrices(next);
  }, [editing]);

  const create = useMutation({
    mutationFn: () => api.post("/price-lists", { name }),
    onSuccess: () => {
      invalidate();
      setName("");
    },
  });
  const remove = useMutation({
    mutationFn: (id: number) => api.del(`/price-lists/${id}`),
    onSuccess: invalidate,
  });
  const savePrices = useMutation({
    mutationFn: () =>
      api.put(`/price-lists/${editing!.id}/items`, {
        items: Object.entries(prices)
          .filter(([, v]) => v !== "" && Number(v) >= 0)
          .map(([itemId, v]) => ({ itemId: Number(itemId), price: Number(v) })),
      }),
    onSuccess: () => {
      invalidate();
      setEditing(null);
    },
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? `Precios de «${editing.name}»` : "Listas de precios"}
    >
      {!editing && (
        <>
          <div className="space-y-1">
            {lists.length === 0 && (
              <Empty text="Sin listas. Ejemplos: «Mayorista», «Delivery», «Local»." />
            )}
            {lists.map((l) => (
              <div
                key={l.id}
                className="flex items-center justify-between rounded px-2 py-1.5 hover:bg-stone-50"
              >
                <span className="text-sm font-medium">
                  {l.name}
                  <span className="ml-2 text-xs font-normal text-stone-400">
                    {l.items.length} precios definidos
                  </span>
                </span>
                <span className="flex gap-1">
                  <Button variant="ghost" onClick={() => setEditing(l)}>
                    <Pencil size={13} />
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      if (confirm(`¿Eliminar la lista «${l.name}»?`)) remove.mutate(l.id);
                    }}
                  >
                    <Trash2 size={13} />
                  </Button>
                </span>
              </div>
            ))}
          </div>
          <form
            className="mt-4 flex gap-2 border-t border-stone-200 pt-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (name.trim()) create.mutate();
            }}
          >
            <input
              className={inputClass}
              placeholder="Nueva lista…"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <Button type="submit" disabled={!name.trim() || create.isPending}>
              Agregar
            </Button>
          </form>
        </>
      )}

      {editing && (
        <div className="space-y-3">
          <p className="text-sm text-stone-500">
            Dejá el precio vacío para usar el precio normal del producto.
          </p>
          <div className="max-h-80 space-y-1 overflow-y-auto">
            {sellable.map((i) => (
              <div key={i.id} className="flex items-center justify-between gap-3 py-0.5">
                <span className="text-sm">
                  {i.name}
                  <span className="ml-2 text-xs text-stone-400">
                    normal: {money.format(i.salePrice)}
                  </span>
                </span>
                <input
                  className={`${inputClass} w-28`}
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="—"
                  value={prices[i.id] ?? ""}
                  onChange={(e) => setPrices({ ...prices, [i.id]: e.target.value })}
                />
              </div>
            ))}
          </div>
          {savePrices.error && <p className="text-sm text-red-600">{savePrices.error.message}</p>}
          <div className="flex justify-end gap-2 border-t border-stone-200 pt-3">
            <Button variant="secondary" onClick={() => setEditing(null)}>
              Volver
            </Button>
            <Button onClick={() => savePrices.mutate()} disabled={savePrices.isPending}>
              Guardar precios
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
