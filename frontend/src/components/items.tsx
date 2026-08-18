import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { FlatCategory, Item, ItemType } from "../types";
import { Button, Field, Modal, inputClass } from "./ui";

export const TYPE_LABELS: Record<ItemType, string> = {
  PRODUCT: "Producto",
  INGREDIENT: "Ingrediente",
  PREPARATION: "Elaboración",
};

export const TYPE_TONES: Record<ItemType, "blue" | "amber" | "violet"> = {
  PRODUCT: "blue",
  INGREDIENT: "amber",
  PREPARATION: "violet",
};

// Estado de stock para colorear filas y mostrar alertas
export function stockState(item: Item): "none" | "out" | "low" | "ok" {
  if (!item.trackStock) return "none";
  if (item.stock <= 0) return "out";
  if (item.stock <= item.minStock) return "low";
  return "ok";
}

export const pct = (v: number | null) =>
  v === null ? "—" : `${v.toLocaleString("es-AR", { maximumFractionDigits: 1 })} %`;

// ── Formulario de alta/edición de item ─────────────────────────
const emptyForm = {
  name: "",
  type: "PRODUCT" as ItemType,
  sku: "",
  unit: "unidad",
  description: "",
  categoryId: "",
  sellable: true,
  available: true,
  salePrice: "",
  taxRate: "",
  cost: "",
  wastePct: "",
  trackStock: false,
  stock: "",
  minStock: "",
  allowSaleWithoutStock: true,
};

type FormState = typeof emptyForm;

function formFromItem(item: Item): FormState {
  return {
    name: item.name,
    type: item.type,
    sku: item.sku ?? "",
    unit: item.unit,
    description: item.description ?? "",
    categoryId: item.categoryId ? String(item.categoryId) : "",
    sellable: item.sellable,
    available: item.available,
    salePrice: item.salePrice ? String(item.salePrice) : "",
    taxRate: item.taxRate != null ? String(item.taxRate) : "",
    cost: item.cost ? String(item.cost) : "",
    wastePct: item.wastePct ? String(item.wastePct) : "",
    trackStock: item.trackStock,
    stock: String(item.stock),
    minStock: item.minStock ? String(item.minStock) : "",
    allowSaleWithoutStock: item.allowSaleWithoutStock,
  };
}

export function ItemFormModal({
  open,
  onClose,
  editing,
  defaultType = "PRODUCT",
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  editing: Item | null;
  defaultType?: ItemType;
  onSaved?: (item: Item) => void;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState<FormState>(emptyForm);

  useEffect(() => {
    if (!open) return;
    if (editing) setForm(formFromItem(editing));
    else
      setForm({
        ...emptyForm,
        type: defaultType,
        sellable: defaultType === "PRODUCT",
        trackStock: defaultType === "INGREDIENT",
        unit: defaultType === "PRODUCT" ? "unidad" : "kg",
      });
  }, [open, editing, defaultType]);

  const { data: categories = [] } = useQuery({
    queryKey: ["categories-flat"],
    queryFn: () => api.get<FlatCategory[]>("/categories/flat"),
  });

  const save = useMutation({
    mutationFn: () => {
      const body = {
        name: form.name,
        type: form.type,
        sku: form.sku.trim() || "",
        unit: form.unit.trim() || "unidad",
        description: form.description.trim() || "",
        categoryId: form.categoryId ? Number(form.categoryId) : "",
        sellable: form.sellable,
        available: form.available,
        salePrice: Number(form.salePrice) || 0,
        taxRate: form.taxRate === "" ? null : Number(form.taxRate),
        cost: Number(form.cost) || 0,
        wastePct: Number(form.wastePct) || 0,
        trackStock: form.trackStock,
        stock: Number(form.stock) || 0,
        minStock: Number(form.minStock) || 0,
        allowSaleWithoutStock: form.allowSaleWithoutStock,
      };
      return editing
        ? api.put<Item>(`/items/${editing.id}`, body)
        : api.post<Item>("/items", body);
    },
    onSuccess: (item) => {
      qc.invalidateQueries({ queryKey: ["items"] });
      qc.invalidateQueries({ queryKey: ["item"] });
      onClose();
      onSaved?.(item);
    },
  });

  const set = (patch: Partial<FormState>) => setForm((f) => ({ ...f, ...patch }));
  const checkbox = (key: keyof FormState, label: string) => (
    <label className="flex items-center gap-2 text-sm text-stone-700">
      <input
        type="checkbox"
        checked={Boolean(form[key])}
        onChange={(e) => set({ [key]: e.target.checked } as Partial<FormState>)}
      />
      {label}
    </label>
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? `Editar «${editing.name}»` : "Nuevo item"}
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <Field label="Nombre">
              <input
                className={inputClass}
                value={form.name}
                onChange={(e) => set({ name: e.target.value })}
                required
                autoFocus
              />
            </Field>
          </div>
          <Field label="Tipo">
            <select
              className={inputClass}
              value={form.type}
              onChange={(e) => set({ type: e.target.value as ItemType })}
            >
              {(Object.keys(TYPE_LABELS) as ItemType[]).map((t) => (
                <option key={t} value={t}>
                  {TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Categoría">
            <select
              className={inputClass}
              value={form.categoryId}
              onChange={(e) => set({ categoryId: e.target.value })}
            >
              <option value="">Sin categoría</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.fullName}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Unidad (kg, l, unidad…)">
            <input
              className={inputClass}
              value={form.unit}
              onChange={(e) => set({ unit: e.target.value })}
            />
          </Field>
          <Field label="SKU / código (opcional)">
            <input
              className={inputClass}
              value={form.sku}
              onChange={(e) => set({ sku: e.target.value })}
            />
          </Field>
          <div className="col-span-2">
            <Field label="Descripción (opcional)">
              <input
                className={inputClass}
                value={form.description}
                onChange={(e) => set({ description: e.target.value })}
              />
            </Field>
          </div>
        </div>

        <div className="rounded-lg border border-stone-200 p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-400">
            Venta
          </p>
          <div className="mb-2 flex flex-wrap gap-4">
            {checkbox("sellable", "Se vende individualmente")}
            {checkbox("available", "Disponible")}
          </div>
          {form.sellable && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Precio de venta ($)">
                <input
                  className={inputClass}
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.salePrice}
                  onChange={(e) => set({ salePrice: e.target.value })}
                />
              </Field>
              <Field label="Impuesto % (opcional)">
                <input
                  className={inputClass}
                  type="number"
                  step="0.1"
                  min="0"
                  value={form.taxRate}
                  onChange={(e) => set({ taxRate: e.target.value })}
                />
              </Field>
            </div>
          )}
        </div>

        <div className="rounded-lg border border-stone-200 p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-400">
            Costo
          </p>
          {editing?.hasRecipe ? (
            <p className="text-sm text-stone-500">
              Este item tiene receta: su costo se calcula automáticamente desde los
              componentes.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <Field label={`Costo por ${form.unit || "unidad"} ($)`}>
                <input
                  className={inputClass}
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.cost}
                  onChange={(e) => set({ cost: e.target.value })}
                />
              </Field>
              <Field label="Merma % (al usarlo en recetas)">
                <input
                  className={inputClass}
                  type="number"
                  step="0.1"
                  min="0"
                  max="99"
                  value={form.wastePct}
                  onChange={(e) => set({ wastePct: e.target.value })}
                />
              </Field>
            </div>
          )}
        </div>

        <div className="rounded-lg border border-stone-200 p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-400">
            Stock
          </p>
          <div className="mb-2 flex flex-wrap gap-4">
            {checkbox("trackStock", "Controlar stock")}
            {form.trackStock && checkbox("allowSaleWithoutStock", "Permitir vender sin stock")}
          </div>
          {form.trackStock && (
            <div className="grid grid-cols-2 gap-3">
              <Field label={`Stock actual (${form.unit || "unidad"})`}>
                <input
                  className={inputClass}
                  type="number"
                  step="any"
                  value={form.stock}
                  onChange={(e) => set({ stock: e.target.value })}
                />
              </Field>
              <Field label="Stock mínimo (alerta)">
                <input
                  className={inputClass}
                  type="number"
                  step="any"
                  min="0"
                  value={form.minStock}
                  onChange={(e) => set({ minStock: e.target.value })}
                />
              </Field>
            </div>
          )}
        </div>

        {save.error && <p className="text-sm text-red-600">{save.error.message}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={save.isPending}>
            Guardar
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// ── Buscador de items (combobox) para el editor de recetas ─────
export function ItemSearch({
  items,
  exclude,
  onSelect,
  placeholder = "Buscar ingrediente o elaboración…",
}: {
  items: Item[];
  exclude: number[];
  onSelect: (item: Item) => void;
  placeholder?: string;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items
      .filter((i) => i.active && !exclude.includes(i.id))
      .filter((i) => !q || i.name.toLowerCase().includes(q))
      .slice(0, 8);
  }, [items, exclude, query]);

  return (
    <div ref={ref} className="relative">
      <input
        className={inputClass}
        placeholder={placeholder}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
      />
      {open && results.length > 0 && (
        <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-stone-200 bg-white shadow-lg">
          {results.map((i) => (
            <button
              key={i.id}
              type="button"
              className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-stone-50"
              onClick={() => {
                onSelect(i);
                setQuery("");
                setOpen(false);
              }}
            >
              <span>{i.name}</span>
              <span className="text-xs text-stone-400">
                {TYPE_LABELS[i.type]} · {i.unit}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
