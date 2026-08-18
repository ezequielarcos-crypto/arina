import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { api, fmtDate } from "../api";
import type { Production } from "../types";
import { Button, Empty, PageHeader, Table } from "../components/ui";

// Historial de producciones. Para registrar una nueva: ficha del item → «Producir».
export default function ProductionPage() {
  const qc = useQueryClient();

  const { data: productions = [] } = useQuery({
    queryKey: ["productions"],
    queryFn: () => api.get<Production[]>("/productions"),
  });

  const cancel = useMutation({
    mutationFn: (id: number) => api.del(`/productions/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["productions"] });
      qc.invalidateQueries({ queryKey: ["items"] });
      qc.invalidateQueries({ queryKey: ["item"] });
    },
  });

  return (
    <div>
      <PageHeader title="Producción" />
      <p className="mb-4 text-sm text-stone-500">
        Para registrar una producción, entrá a la ficha del producto (necesita receta y control
        de stock) y usá el botón «Producir».
      </p>
      {productions.length === 0 ? (
        <Empty text="Todavía no hay producciones registradas." />
      ) : (
        <Table headers={["Fecha", "Producto", "Cantidad", "Observaciones", ""]}>
          {productions.map((p) => (
            <tr key={p.id} className="hover:bg-stone-50">
              <td className="px-4 py-2.5 whitespace-nowrap text-stone-500">{fmtDate(p.date)}</td>
              <td className="px-4 py-2.5 font-medium">{p.item?.name}</td>
              <td className="px-4 py-2.5">
                {p.qty} {p.item?.unit}
              </td>
              <td className="px-4 py-2.5 text-stone-500">{p.notes ?? "—"}</td>
              <td className="px-4 py-2.5 text-right">
                <Button
                  variant="ghost"
                  onClick={() => {
                    if (
                      confirm(
                        "¿Anular esta producción? Se revierten el stock producido y los consumos."
                      )
                    )
                      cancel.mutate(p.id);
                  }}
                >
                  <Trash2 size={15} />
                </Button>
              </td>
            </tr>
          ))}
        </Table>
      )}
      {cancel.error && <p className="mt-2 text-sm text-red-600">{cancel.error.message}</p>}
    </div>
  );
}
