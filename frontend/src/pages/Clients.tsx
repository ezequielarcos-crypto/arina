import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { History, Pencil, Plus, Trash2 } from "lucide-react";
import { api, fmtDate, money } from "../api";
import type { Client, Sale } from "../types";
import { Button, Empty, Field, Modal, PageHeader, Table, inputClass } from "../components/ui";

const emptyForm = { name: "", phone: "", email: "", preferences: "" };

export default function Clients() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ["clients"] });

  const { data: clients = [] } = useQuery({
    queryKey: ["clients"],
    queryFn: () => api.get<Client[]>("/clients"),
  });

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Client | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [historyClient, setHistoryClient] = useState<Client | null>(null);

  const { data: history = [] } = useQuery({
    queryKey: ["client-sales", historyClient?.id],
    queryFn: () => api.get<Sale[]>(`/clients/${historyClient!.id}/sales`),
    enabled: historyClient !== null,
  });

  const save = useMutation({
    mutationFn: () => {
      const body = {
        name: form.name,
        phone: form.phone || null,
        email: form.email || null,
        preferences: form.preferences || null,
      };
      return editing ? api.put(`/clients/${editing.id}`, body) : api.post("/clients", body);
    },
    onSuccess: () => {
      invalidate();
      setModalOpen(false);
    },
  });

  const remove = useMutation({
    mutationFn: (id: number) => api.del(`/clients/${id}`),
    onSuccess: invalidate,
  });

  const openNew = () => {
    setEditing(null);
    setForm(emptyForm);
    setModalOpen(true);
  };
  const openEdit = (c: Client) => {
    setEditing(c);
    setForm({
      name: c.name,
      phone: c.phone ?? "",
      email: c.email ?? "",
      preferences: c.preferences ?? "",
    });
    setModalOpen(true);
  };

  return (
    <div>
      <PageHeader title="Clientes">
        <Button onClick={openNew}>
          <span className="flex items-center gap-1.5">
            <Plus size={15} /> Nuevo cliente
          </span>
        </Button>
      </PageHeader>

      {clients.length === 0 ? (
        <Empty text="Sin clientes cargados todavía." />
      ) : (
        <Table headers={["Nombre", "Teléfono", "Email", "Preferencias", "Compras", ""]}>
          {clients.map((c) => (
            <tr key={c.id} className="hover:bg-stone-50">
              <td className="px-4 py-2.5 font-medium">{c.name}</td>
              <td className="px-4 py-2.5 text-stone-500">{c.phone ?? "—"}</td>
              <td className="px-4 py-2.5 text-stone-500">{c.email ?? "—"}</td>
              <td className="max-w-48 truncate px-4 py-2.5 text-stone-500">
                {c.preferences ?? "—"}
              </td>
              <td className="px-4 py-2.5">{c._count?.sales ?? 0}</td>
              <td className="px-4 py-2.5 text-right">
                <div className="flex justify-end gap-1">
                  <Button variant="ghost" onClick={() => setHistoryClient(c)}>
                    <History size={15} />
                  </Button>
                  <Button variant="ghost" onClick={() => openEdit(c)}>
                    <Pencil size={15} />
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      if (confirm(`¿Eliminar a «${c.name}»?`)) remove.mutate(c.id);
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
        title={editing ? "Editar cliente" : "Nuevo cliente"}
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
            <Field label="Teléfono">
              <input
                className={inputClass}
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </Field>
            <Field label="Email">
              <input
                className={inputClass}
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </Field>
          </div>
          <Field label="Preferencias de compra">
            <textarea
              className={inputClass}
              rows={2}
              placeholder="Ej: sin gluten, retira los viernes…"
              value={form.preferences}
              onChange={(e) => setForm({ ...form, preferences: e.target.value })}
            />
          </Field>
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
        open={historyClient !== null}
        onClose={() => setHistoryClient(null)}
        title={`Historial de compras — ${historyClient?.name ?? ""}`}
      >
        {history.length === 0 ? (
          <p className="py-4 text-center text-sm text-stone-400">
            Este cliente todavía no tiene compras registradas.
          </p>
        ) : (
          <div className="space-y-3">
            {history.map((s) => (
              <div key={s.id} className="rounded-lg border border-stone-200 p-3">
                <div className="mb-1 flex justify-between text-sm">
                  <span className="text-stone-500">{fmtDate(s.date)}</span>
                  <span className="font-semibold">{money.format(s.total)}</span>
                </div>
                <ul className="text-sm text-stone-600">
                  {s.items.map((it) => (
                    <li key={it.id}>
                      {it.quantity} × {it.item.name} ({money.format(it.unitPrice)})
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
}
