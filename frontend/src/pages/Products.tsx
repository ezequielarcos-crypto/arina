import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Percent, Plus, Trash2 } from "lucide-react";
import { api, money } from "../api";
import type { Category, Product } from "../types";
import { Button, Empty, Field, Modal, PageHeader, Table, inputClass } from "../components/ui";

const emptyForm = { name: "", price: "", stock: "", categoryId: "" };

export default function Products() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ["products"] });

  const { data: products = [] } = useQuery({
    queryKey: ["products"],
    queryFn: () => api.get<Product[]>("/products"),
  });
  const { data: categories = [] } = useQuery({
    queryKey: ["categories"],
    queryFn: () => api.get<Category[]>("/categories"),
  });

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [increaseOpen, setIncreaseOpen] = useState(false);
  const [percent, setPercent] = useState("");
  const [increaseCategory, setIncreaseCategory] = useState("");
  const [newCategory, setNewCategory] = useState("");

  const save = useMutation({
    mutationFn: () => {
      const body = {
        name: form.name,
        price: Number(form.price),
        stock: Number(form.stock) || 0,
        categoryId: form.categoryId ? Number(form.categoryId) : null,
      };
      return editing ? api.put(`/products/${editing.id}`, body) : api.post("/products", body);
    },
    onSuccess: () => {
      invalidate();
      setModalOpen(false);
    },
  });

  const remove = useMutation({
    mutationFn: (id: number) => api.del(`/products/${id}`),
    onSuccess: invalidate,
  });

  const bulkIncrease = useMutation({
    mutationFn: () =>
      api.post("/products/bulk-increase", {
        percent: Number(percent),
        categoryId: increaseCategory ? Number(increaseCategory) : undefined,
      }),
    onSuccess: () => {
      invalidate();
      setIncreaseOpen(false);
      setPercent("");
    },
  });

  const addCategory = useMutation({
    mutationFn: () => api.post("/categories", { name: newCategory }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["categories"] });
      setNewCategory("");
    },
  });

  const openNew = () => {
    setEditing(null);
    setForm(emptyForm);
    setModalOpen(true);
  };
  const openEdit = (p: Product) => {
    setEditing(p);
    setForm({
      name: p.name,
      price: String(p.price),
      stock: String(p.stock),
      categoryId: p.categoryId ? String(p.categoryId) : "",
    });
    setModalOpen(true);
  };

  return (
    <div>
      <PageHeader title="Productos">
        <Button variant="secondary" onClick={() => setIncreaseOpen(true)}>
          <span className="flex items-center gap-1.5">
            <Percent size={15} /> Aumento masivo
          </span>
        </Button>
        <Button onClick={openNew}>
          <span className="flex items-center gap-1.5">
            <Plus size={15} /> Nuevo producto
          </span>
        </Button>
      </PageHeader>

      {products.length === 0 ? (
        <Empty text="Todavía no hay productos. Creá el primero con «Nuevo producto»." />
      ) : (
        <Table headers={["Producto", "Categoría", "Precio", "Stock", ""]}>
          {products.map((p) => (
            <tr key={p.id} className="hover:bg-stone-50">
              <td className="px-4 py-2.5 font-medium">{p.name}</td>
              <td className="px-4 py-2.5 text-stone-500">{p.category?.name ?? "—"}</td>
              <td className="px-4 py-2.5">{money.format(p.price)}</td>
              <td className={`px-4 py-2.5 ${p.stock <= 0 ? "text-red-600 font-medium" : ""}`}>
                {p.stock}
              </td>
              <td className="px-4 py-2.5 text-right">
                <div className="flex justify-end gap-1">
                  <Button variant="ghost" onClick={() => openEdit(p)}>
                    <Pencil size={15} />
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      if (confirm(`¿Eliminar «${p.name}»?`)) remove.mutate(p.id);
                    }}
                  >
                    <Trash2 size={15} />
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </Table>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? "Editar producto" : "Nuevo producto"}
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
            <Field label="Precio ($)">
              <input
                className={inputClass}
                type="number"
                step="0.01"
                min="0"
                value={form.price}
                onChange={(e) => setForm({ ...form, price: e.target.value })}
                required
              />
            </Field>
            <Field label="Stock">
              <input
                className={inputClass}
                type="number"
                step="1"
                value={form.stock}
                onChange={(e) => setForm({ ...form, stock: e.target.value })}
              />
            </Field>
          </div>
          <Field label="Categoría">
            <select
              className={inputClass}
              value={form.categoryId}
              onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
            >
              <option value="">Sin categoría</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <div className="flex gap-2">
            <input
              className={inputClass}
              placeholder="Nueva categoría…"
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
            />
            <Button
              variant="secondary"
              disabled={!newCategory.trim()}
              onClick={() => addCategory.mutate()}
            >
              Agregar
            </Button>
          </div>
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

      <Modal open={increaseOpen} onClose={() => setIncreaseOpen(false)} title="Aumento masivo de precios">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            bulkIncrease.mutate();
          }}
        >
          <p className="text-sm text-stone-500">
            Aplica un aumento porcentual a todos los productos (o solo a una categoría). Usá un
            porcentaje negativo para bajar precios.
          </p>
          <Field label="Porcentaje (%)">
            <input
              className={inputClass}
              type="number"
              step="0.1"
              value={percent}
              onChange={(e) => setPercent(e.target.value)}
              required
            />
          </Field>
          <Field label="Aplicar a">
            <select
              className={inputClass}
              value={increaseCategory}
              onChange={(e) => setIncreaseCategory(e.target.value)}
            >
              <option value="">Todos los productos</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  Solo «{c.name}»
                </option>
              ))}
            </select>
          </Field>
          {bulkIncrease.error && (
            <p className="text-sm text-red-600">{bulkIncrease.error.message}</p>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setIncreaseOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={bulkIncrease.isPending}>
              Aplicar aumento
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
