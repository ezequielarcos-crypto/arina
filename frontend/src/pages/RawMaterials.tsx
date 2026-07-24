import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, ShoppingBag, Trash2 } from "lucide-react";
import { api, money } from "../api";
import type { RawMaterial } from "../types";
import { Button, Empty, Field, Modal, PageHeader, Table, inputClass } from "../components/ui";

const emptyForm = { name: "", unit: "kg", stock: "", lastCost: "" };

export default function RawMaterials() {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["raw-materials"] });
    qc.invalidateQueries({ queryKey: ["recipes"] });
  };

  const { data: materials = [] } = useQuery({
    queryKey: ["raw-materials"],
    queryFn: () => api.get<RawMaterial[]>("/raw-materials"),
  });

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<RawMaterial | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [buying, setBuying] = useState<RawMaterial | null>(null);
  const [purchase, setPurchase] = useState({ quantity: "", totalCost: "" });

  const save = useMutation({
    mutationFn: () => {
      const body = {
        name: form.name,
        unit: form.unit,
        stock: Number(form.stock) || 0,
        lastCost: Number(form.lastCost) || 0,
      };
      return editing
        ? api.put(`/raw-materials/${editing.id}`, body)
        : api.post("/raw-materials", body);
    },
    onSuccess: () => {
      invalidate();
      setModalOpen(false);
    },
  });

  const remove = useMutation({
    mutationFn: (id: number) => api.del(`/raw-materials/${id}`),
    onSuccess: invalidate,
  });

  const registerPurchase = useMutation({
    mutationFn: () =>
      api.post(`/raw-materials/${buying!.id}/purchases`, {
        quantity: Number(purchase.quantity),
        totalCost: Number(purchase.totalCost),
      }),
    onSuccess: () => {
      invalidate();
      qc.invalidateQueries({ queryKey: ["cash"] });
      setBuying(null);
      setPurchase({ quantity: "", totalCost: "" });
    },
  });

  const openNew = () => {
    setEditing(null);
    setForm(emptyForm);
    setModalOpen(true);
  };
  const openEdit = (m: RawMaterial) => {
    setEditing(m);
    setForm({
      name: m.name,
      unit: m.unit,
      stock: String(m.stock),
      lastCost: String(m.lastCost),
    });
    setModalOpen(true);
  };

  return (
    <div>
      <PageHeader title="Materia prima">
        <Button onClick={openNew}>
          <span className="flex items-center gap-1.5">
            <Plus size={15} /> Nueva materia prima
          </span>
        </Button>
      </PageHeader>

      {materials.length === 0 ? (
        <Empty text="Sin materia prima cargada. Agregá insumos para poder costear recetas." />
      ) : (
        <Table headers={["Insumo", "Stock", "Último costo", "", ""]}>
          {materials.map((m) => (
            <tr key={m.id} className="hover:bg-stone-50">
              <td className="px-4 py-2.5 font-medium">{m.name}</td>
              <td className={`px-4 py-2.5 ${m.stock <= 0 ? "text-red-600 font-medium" : ""}`}>
                {m.stock} {m.unit}
              </td>
              <td className="px-4 py-2.5">
                {money.format(m.lastCost)}/{m.unit}
              </td>
              <td className="px-4 py-2.5">
                <Button variant="secondary" onClick={() => setBuying(m)}>
                  <span className="flex items-center gap-1.5">
                    <ShoppingBag size={14} /> Registrar compra
                  </span>
                </Button>
              </td>
              <td className="px-4 py-2.5 text-right">
                <div className="flex justify-end gap-1">
                  <Button variant="ghost" onClick={() => openEdit(m)}>
                    <Pencil size={15} />
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      if (confirm(`¿Eliminar «${m.name}»?`)) remove.mutate(m.id);
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
        title={editing ? "Editar materia prima" : "Nueva materia prima"}
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
          <div className="grid grid-cols-3 gap-3">
            <Field label="Unidad">
              <select
                className={inputClass}
                value={form.unit}
                onChange={(e) => setForm({ ...form, unit: e.target.value })}
              >
                {["kg", "g", "l", "ml", "unidad", "docena", "paquete"].map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Stock inicial">
              <input
                className={inputClass}
                type="number"
                step="0.01"
                value={form.stock}
                onChange={(e) => setForm({ ...form, stock: e.target.value })}
              />
            </Field>
            <Field label="Costo por unidad">
              <input
                className={inputClass}
                type="number"
                step="0.01"
                min="0"
                value={form.lastCost}
                onChange={(e) => setForm({ ...form, lastCost: e.target.value })}
              />
            </Field>
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

      <Modal
        open={buying !== null}
        onClose={() => setBuying(null)}
        title={`Registrar compra — ${buying?.name ?? ""}`}
      >
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            registerPurchase.mutate();
          }}
        >
          <p className="text-sm text-stone-500">
            La compra suma stock, actualiza el costo unitario y queda registrada como gasto en la
            Caja.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <Field label={`Cantidad (${buying?.unit ?? ""})`}>
              <input
                className={inputClass}
                type="number"
                step="0.01"
                min="0.01"
                value={purchase.quantity}
                onChange={(e) => setPurchase({ ...purchase, quantity: e.target.value })}
                required
              />
            </Field>
            <Field label="Precio total pagado ($)">
              <input
                className={inputClass}
                type="number"
                step="0.01"
                min="0"
                value={purchase.totalCost}
                onChange={(e) => setPurchase({ ...purchase, totalCost: e.target.value })}
                required
              />
            </Field>
          </div>
          {Number(purchase.quantity) > 0 && Number(purchase.totalCost) > 0 && (
            <p className="text-sm text-stone-500">
              Costo unitario resultante:{" "}
              <span className="font-medium text-stone-800">
                {money.format(Number(purchase.totalCost) / Number(purchase.quantity))}/
                {buying?.unit}
              </span>
            </p>
          )}
          {registerPurchase.error && (
            <p className="text-sm text-red-600">{registerPurchase.error.message}</p>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setBuying(null)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={registerPurchase.isPending}>
              Registrar
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
