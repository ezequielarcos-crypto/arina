import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { api, money } from "../api";
import type { Product, RawMaterial, Recipe } from "../types";
import { Button, Empty, Field, Modal, PageHeader, inputClass } from "../components/ui";

type ItemForm = { rawMaterialId: string; quantity: string };
const emptyForm = {
  name: "",
  yieldQty: "1",
  yieldUnit: "unidades",
  notes: "",
  productId: "",
};

export default function Recipes() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ["recipes"] });

  const { data: recipes = [] } = useQuery({
    queryKey: ["recipes"],
    queryFn: () => api.get<Recipe[]>("/recipes"),
  });
  const { data: materials = [] } = useQuery({
    queryKey: ["raw-materials"],
    queryFn: () => api.get<RawMaterial[]>("/raw-materials"),
  });
  const { data: products = [] } = useQuery({
    queryKey: ["products"],
    queryFn: () => api.get<Product[]>("/products"),
  });

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Recipe | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [items, setItems] = useState<ItemForm[]>([]);

  const save = useMutation({
    mutationFn: () => {
      const body = {
        name: form.name,
        yieldQty: Number(form.yieldQty) || 1,
        yieldUnit: form.yieldUnit,
        notes: form.notes || null,
        productId: form.productId ? Number(form.productId) : null,
        items: items
          .filter((it) => it.rawMaterialId && Number(it.quantity) > 0)
          .map((it) => ({
            rawMaterialId: Number(it.rawMaterialId),
            quantity: Number(it.quantity),
          })),
      };
      return editing ? api.put(`/recipes/${editing.id}`, body) : api.post("/recipes", body);
    },
    onSuccess: () => {
      invalidate();
      setModalOpen(false);
    },
  });

  const remove = useMutation({
    mutationFn: (id: number) => api.del(`/recipes/${id}`),
    onSuccess: invalidate,
  });

  const openNew = () => {
    setEditing(null);
    setForm(emptyForm);
    setItems([{ rawMaterialId: "", quantity: "" }]);
    setModalOpen(true);
  };
  const openEdit = (r: Recipe) => {
    setEditing(r);
    setForm({
      name: r.name,
      yieldQty: String(r.yieldQty),
      yieldUnit: r.yieldUnit,
      notes: r.notes ?? "",
      productId: r.productId ? String(r.productId) : "",
    });
    setItems(
      r.items.map((it) => ({
        rawMaterialId: String(it.rawMaterialId),
        quantity: String(it.quantity),
      }))
    );
    setModalOpen(true);
  };

  // Costo estimado en vivo dentro del formulario
  const draftCost = items.reduce((sum, it) => {
    const mat = materials.find((m) => m.id === Number(it.rawMaterialId));
    return sum + (mat ? mat.lastCost * (Number(it.quantity) || 0) : 0);
  }, 0);

  return (
    <div>
      <PageHeader title="Recetas">
        <Button onClick={openNew}>
          <span className="flex items-center gap-1.5">
            <Plus size={15} /> Nueva receta
          </span>
        </Button>
      </PageHeader>

      {recipes.length === 0 ? (
        <Empty text="Sin recetas todavía. Cargá materia prima en el Módulo 3 y armá tu primera receta." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {recipes.map((r) => (
            <div key={r.id} className="rounded-xl border border-stone-200 bg-white p-4">
              <div className="mb-2 flex items-start justify-between">
                <div>
                  <h3 className="font-semibold">{r.name}</h3>
                  <p className="text-xs text-stone-500">
                    Rinde {r.yieldQty} {r.yieldUnit}
                    {r.product && ` · vinculada a «${r.product.name}»`}
                  </p>
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" onClick={() => openEdit(r)}>
                    <Pencil size={15} />
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      if (confirm(`¿Eliminar «${r.name}»?`)) remove.mutate(r.id);
                    }}
                  >
                    <Trash2 size={15} />
                  </Button>
                </div>
              </div>

              <ul className="mb-3 space-y-1 text-sm text-stone-600">
                {r.items.map((it) => (
                  <li key={it.id} className="flex justify-between">
                    <span>
                      {it.rawMaterial.name} — {it.quantity} {it.rawMaterial.unit}
                    </span>
                    <span className="text-stone-400">
                      {money.format(it.quantity * it.rawMaterial.lastCost)}
                    </span>
                  </li>
                ))}
              </ul>

              <div className="border-t border-stone-100 pt-2 text-sm">
                <div className="flex justify-between font-medium">
                  <span>Costo total</span>
                  <span>{money.format(r.totalCost)}</span>
                </div>
                <div className="flex justify-between text-stone-500">
                  <span>Costo por {r.yieldUnit.replace(/s$/, "") || "unidad"}</span>
                  <span>{money.format(r.costPerUnit)}</span>
                </div>
              </div>
              {r.notes && <p className="mt-2 text-xs text-stone-400">{r.notes}</p>}
            </div>
          ))}
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? "Editar receta" : "Nueva receta"}
      >
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <Field label="Nombre">
            <input
              className={inputClass}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Rendimiento">
              <input
                className={inputClass}
                type="number"
                step="0.1"
                min="0"
                value={form.yieldQty}
                onChange={(e) => setForm({ ...form, yieldQty: e.target.value })}
              />
            </Field>
            <Field label="Unidad de rendimiento">
              <input
                className={inputClass}
                placeholder="unidades, porciones…"
                value={form.yieldUnit}
                onChange={(e) => setForm({ ...form, yieldUnit: e.target.value })}
              />
            </Field>
          </div>
          <Field label="Producto vinculado (opcional)">
            <select
              className={inputClass}
              value={form.productId}
              onChange={(e) => setForm({ ...form, productId: e.target.value })}
            >
              <option value="">Ninguno</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>

          <div>
            <span className="mb-1 block text-sm font-medium text-stone-600">Ingredientes</span>
            <div className="space-y-2">
              {items.map((it, i) => (
                <div key={i} className="flex gap-2">
                  <select
                    className={inputClass}
                    value={it.rawMaterialId}
                    onChange={(e) => {
                      const next = [...items];
                      next[i] = { ...it, rawMaterialId: e.target.value };
                      setItems(next);
                    }}
                  >
                    <option value="">Materia prima…</option>
                    {materials.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} ({money.format(m.lastCost)}/{m.unit})
                      </option>
                    ))}
                  </select>
                  <input
                    className={`${inputClass} w-24`}
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="Cant."
                    value={it.quantity}
                    onChange={(e) => {
                      const next = [...items];
                      next[i] = { ...it, quantity: e.target.value };
                      setItems(next);
                    }}
                  />
                  <Button variant="ghost" onClick={() => setItems(items.filter((_, j) => j !== i))}>
                    <Trash2 size={15} />
                  </Button>
                </div>
              ))}
            </div>
            <div className="mt-2">
              <Button
                variant="secondary"
                onClick={() => setItems([...items, { rawMaterialId: "", quantity: "" }])}
              >
                + Agregar ingrediente
              </Button>
            </div>
          </div>

          <Field label="Notas (opcional)">
            <textarea
              className={inputClass}
              rows={2}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </Field>

          <p className="text-sm text-stone-500">
            Costo estimado: <span className="font-medium text-stone-800">{money.format(draftCost)}</span>
          </p>
          {save.error && <p className="text-sm text-red-600">{save.error.message}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setModalOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={save.isPending}>
              Guardar
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
