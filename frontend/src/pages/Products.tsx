import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowUp,
  Bell,
  BellOff,
  Copy,
  FolderTree,
  Pencil,
  Percent,
  Plus,
  Power,
  Search,
  SlidersHorizontal,
  Star,
  Tags,
  Truck,
} from "lucide-react";
import { api, money } from "../api";
import type { Category, FlatCategory, Item, ItemType, Supplier } from "../types";
import { Badge, Button, Empty, Field, Modal, PageHeader, Table, inputClass } from "../components/ui";
import { ItemFormModal, TYPE_LABELS, TYPE_TONES, pct, stockState } from "../components/items";
import { checkLowStock, notificationsEnabled, notificationsSupported, requestNotifications } from "../notify";
import { ModifierGroupsModal, PriceListsModal } from "../components/modifiers";
import ItemDetail from "./ItemDetail";

export type ProductsTab = "ALL" | ItemType;
type SortKey = "name" | "salePrice" | "computedCost" | "marginPct" | "stock";

const TAB_TITLES: Record<ProductsTab, string> = {
  ALL: "Productos",
  PRODUCT: "Productos de venta",
  PREPARATION: "Elaboraciones",
  INGREDIENT: "Ingredientes",
};

export default function Products({ tab }: { tab: ProductsTab }) {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["items"] });
    qc.invalidateQueries({ queryKey: ["item"] });
  };

  const { data: items = [] } = useQuery({
    queryKey: ["items"],
    queryFn: () => api.get<Item[]>("/items"),
  });
  const { data: flatCategories = [] } = useQuery({
    queryKey: ["categories-flat"],
    queryFn: () => api.get<FlatCategory[]>("/categories/flat"),
  });

  // Vista: listado o ficha. Cambiar de sección en el menú vuelve al listado.
  const [detailId, setDetailId] = useState<number | null>(null);
  useEffect(() => {
    setDetailId(null);
  }, [tab]);

  // Filtros
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortAsc, setSortAsc] = useState(true);

  // Modales
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Item | null>(null);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [increaseOpen, setIncreaseOpen] = useState(false);
  const [suppliersOpen, setSuppliersOpen] = useState(false);
  const [modifiersOpen, setModifiersOpen] = useState(false);
  const [priceListsOpen, setPriceListsOpen] = useState(false);

  // Alertas de stock bajo (notificación del navegador al sistema operativo)
  const [alertsOn, setAlertsOn] = useState(notificationsEnabled());
  useEffect(() => {
    if (alertsOn) checkLowStock(items);
  }, [items, alertsOn]);

  const toggle = useMutation({
    mutationFn: (item: Item) => api.put(`/items/${item.id}`, { active: !item.active }),
    onSuccess: invalidate,
  });
  const favorite = useMutation({
    mutationFn: (item: Item) => api.put(`/items/${item.id}`, { favorite: !item.favorite }),
    onSuccess: invalidate,
  });
  const duplicate = useMutation({
    mutationFn: (item: Item) => api.post<Item>(`/items/${item.id}/duplicate`, {}),
    onSuccess: (created) => {
      invalidate();
      setDetailId(created.id);
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = items.filter((i) => {
      if (tab !== "ALL" && i.type !== tab) return false;
      if (!showInactive && !i.active) return false;
      if (categoryId && i.categoryId !== Number(categoryId)) return false;
      if (q && !i.name.toLowerCase().includes(q) && !(i.sku ?? "").toLowerCase().includes(q))
        return false;
      return true;
    });
    const dir = sortAsc ? 1 : -1;
    return [...list].sort((a, b) => {
      if (a.favorite !== b.favorite) return a.favorite ? -1 : 1;
      const va = a[sortKey] ?? -Infinity;
      const vb = b[sortKey] ?? -Infinity;
      if (typeof va === "string" && typeof vb === "string") return va.localeCompare(vb) * dir;
      return (Number(va) - Number(vb)) * dir;
    });
  }, [items, tab, search, categoryId, showInactive, sortKey, sortAsc]);

  const sortBy = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else {
      setSortKey(key);
      setSortAsc(key === "name");
    }
  };

  if (detailId !== null) {
    return (
      <ItemDetail
        id={detailId}
        onBack={() => setDetailId(null)}
        onOpenItem={(id) => setDetailId(id)}
      />
    );
  }

  const sortIcon = (key: SortKey) =>
    sortKey === key ? (
      sortAsc ? (
        <ArrowUp size={12} className="inline" />
      ) : (
        <ArrowDown size={12} className="inline" />
      )
    ) : null;

  const header = (label: string, key: SortKey) => (
    <button className="hover:text-stone-800" onClick={() => sortBy(key)}>
      {label} {sortIcon(key)}
    </button>
  );

  return (
    <div>
      <PageHeader title={TAB_TITLES[tab]}>
        {notificationsSupported() && (
          <Button
            variant="secondary"
            onClick={async () => {
              if (!alertsOn) setAlertsOn(await requestNotifications());
            }}
          >
            <span
              className="flex items-center gap-1.5"
              title={
                alertsOn
                  ? "Alertas de stock bajo activadas"
                  : "Activar alertas de stock bajo (notificación del navegador)"
              }
            >
              {alertsOn ? (
                <Bell size={15} className="text-emerald-600" />
              ) : (
                <BellOff size={15} />
              )}
              Alertas
            </span>
          </Button>
        )}
        <Button variant="secondary" onClick={() => setSuppliersOpen(true)}>
          <span className="flex items-center gap-1.5">
            <Truck size={15} /> Proveedores
          </span>
        </Button>
        <Button variant="secondary" onClick={() => setModifiersOpen(true)}>
          <span className="flex items-center gap-1.5">
            <SlidersHorizontal size={15} /> Modificadores
          </span>
        </Button>
        <Button variant="secondary" onClick={() => setPriceListsOpen(true)}>
          <span className="flex items-center gap-1.5">
            <Tags size={15} /> Listas de precios
          </span>
        </Button>
        <Button variant="secondary" onClick={() => setCategoriesOpen(true)}>
          <span className="flex items-center gap-1.5">
            <FolderTree size={15} /> Categorías
          </span>
        </Button>
        <Button variant="secondary" onClick={() => setIncreaseOpen(true)}>
          <span className="flex items-center gap-1.5">
            <Percent size={15} /> Aumento masivo
          </span>
        </Button>
        <Button
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
        >
          <span className="flex items-center gap-1.5">
            <Plus size={15} /> Nuevo item
          </span>
        </Button>
      </PageHeader>

      {/* Filtros */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search size={15} className="absolute left-2.5 top-2 text-stone-400" />
          <input
            className={`${inputClass} w-64 pl-8`}
            placeholder="Buscar por nombre o SKU…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          className={`${inputClass} w-auto`}
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
        >
          <option value="">Todas las categorías</option>
          {flatCategories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.fullName}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-sm text-stone-600">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
          />
          Mostrar inactivos
        </label>
        <span className="ml-auto text-sm text-stone-400">{filtered.length} items</span>
      </div>

      {filtered.length === 0 ? (
        <Empty text="No hay items con estos filtros. Creá uno con «Nuevo item»." />
      ) : (
        <Table
          headers={[
            "",
            header("Item", "name"),
            "Categoría",
            "Tipo",
            header("Precio", "salePrice"),
            header("Costo", "computedCost"),
            "Margen $",
            header("Margen %", "marginPct"),
            "Markup %",
            header("Stock", "stock"),
            "",
          ]}
        >
          {filtered.map((item) => {
            const st = stockState(item);
            return (
              <tr
                key={item.id}
                className={`cursor-pointer hover:bg-stone-50 ${!item.active ? "opacity-50" : ""}`}
                onClick={() => setDetailId(item.id)}
              >
                <td className="w-8 px-2 py-2.5">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      favorite.mutate(item);
                    }}
                    title="Favorito"
                  >
                    <Star
                      size={15}
                      className={
                        item.favorite ? "fill-amber-400 text-amber-400" : "text-stone-300"
                      }
                    />
                  </button>
                </td>
                <td className="px-4 py-2.5">
                  <span className="font-medium">{item.name}</span>
                  {item.sku && <span className="ml-2 text-xs text-stone-400">{item.sku}</span>}
                  <span className="ml-2 space-x-1">
                    {!item.active && <Badge tone="stone">Inactivo</Badge>}
                    {item.active && st === "out" && <Badge tone="red">Sin stock</Badge>}
                    {item.active && st === "low" && <Badge tone="amber">Stock bajo</Badge>}
                    {item.sellable && !item.available && <Badge tone="stone">No disponible</Badge>}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-stone-500">
                  {item.category
                    ? item.category.parent
                      ? `${item.category.parent.name} › ${item.category.name}`
                      : item.category.name
                    : "—"}
                </td>
                <td className="px-4 py-2.5">
                  <Badge tone={TYPE_TONES[item.type]}>{TYPE_LABELS[item.type]}</Badge>
                </td>
                <td className="px-4 py-2.5">
                  {item.sellable ? money.format(item.salePrice) : "—"}
                </td>
                <td className="px-4 py-2.5 text-stone-600">
                  {money.format(item.computedCost)}
                  {item.hasRecipe && (
                    <span className="ml-1 text-xs text-stone-400" title="Calculado desde la receta">
                      ƒ
                    </span>
                  )}
                </td>
                <td className="px-4 py-2.5">{item.sellable ? money.format(item.marginAbs) : "—"}</td>
                <td
                  className={`px-4 py-2.5 ${
                    item.sellable && (item.marginPct ?? 0) < 0 ? "font-medium text-red-600" : ""
                  }`}
                >
                  {item.sellable ? pct(item.marginPct) : "—"}
                </td>
                <td className="px-4 py-2.5">{item.sellable ? pct(item.markupPct) : "—"}</td>
                <td
                  className={`px-4 py-2.5 ${
                    st === "out"
                      ? "font-medium text-red-600"
                      : st === "low"
                        ? "font-medium text-amber-600"
                        : ""
                  }`}
                >
                  {item.trackStock ? `${item.stock} ${item.unit}` : "—"}
                  {st === "low" || st === "out" ? (
                    <span className="block text-xs text-stone-400">mín: {item.minStock}</span>
                  ) : null}
                </td>
                <td className="px-4 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                  <div className="flex justify-end gap-1">
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setEditing(item);
                        setFormOpen(true);
                      }}
                    >
                      <Pencil size={15} />
                    </Button>
                    <Button variant="ghost" onClick={() => duplicate.mutate(item)}>
                      <Copy size={15} />
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => toggle.mutate(item)}
                    >
                      <Power
                        size={15}
                        className={item.active ? "text-emerald-600" : "text-stone-400"}
                      />
                    </Button>
                  </div>
                </td>
              </tr>
            );
          })}
        </Table>
      )}

      <ItemFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        editing={editing}
        defaultType={tab === "ALL" ? "PRODUCT" : tab}
      />
      <CategoriesModal open={categoriesOpen} onClose={() => setCategoriesOpen(false)} />
      <BulkIncreaseModal open={increaseOpen} onClose={() => setIncreaseOpen(false)} />
      <SuppliersModal open={suppliersOpen} onClose={() => setSuppliersOpen(false)} />
      <ModifierGroupsModal open={modifiersOpen} onClose={() => setModifiersOpen(false)} />
      <PriceListsModal open={priceListsOpen} onClose={() => setPriceListsOpen(false)} />
    </div>
  );
}

// ── Gestión de proveedores ─────────────────────────────────────
function SuppliersModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ["suppliers"] });
  const { data: suppliers = [] } = useQuery({
    queryKey: ["suppliers"],
    queryFn: () => api.get<Supplier[]>("/suppliers"),
    enabled: open,
  });

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");

  const create = useMutation({
    mutationFn: () => api.post("/suppliers", { name, phone }),
    onSuccess: () => {
      invalidate();
      setName("");
      setPhone("");
    },
  });
  const toggle = useMutation({
    mutationFn: (s: Supplier) => api.put(`/suppliers/${s.id}`, { active: !s.active }),
    onSuccess: invalidate,
  });
  const rename = useMutation({
    mutationFn: ({ id, newName }: { id: number; newName: string }) =>
      api.put(`/suppliers/${id}`, { name: newName }),
    onSuccess: invalidate,
  });

  return (
    <Modal open={open} onClose={onClose} title="Proveedores">
      <div className="space-y-1">
        {suppliers.length === 0 && <Empty text="Todavía no hay proveedores." />}
        {suppliers.map((s) => (
          <div
            key={s.id}
            className={`flex items-center justify-between rounded px-2 py-1.5 hover:bg-stone-50 ${
              !s.active ? "opacity-50" : ""
            }`}
          >
            <span className="text-sm">
              {s.name}
              {s.phone && <span className="ml-2 text-xs text-stone-400">{s.phone}</span>}
              <span className="ml-2 text-xs text-stone-400">
                {s._count?.items ?? 0} items · {s._count?.purchases ?? 0} compras
              </span>
            </span>
            <span className="flex gap-1">
              <Button
                variant="ghost"
                onClick={() => {
                  const newName = prompt("Nuevo nombre:", s.name);
                  if (newName?.trim()) rename.mutate({ id: s.id, newName: newName.trim() });
                }}
              >
                <Pencil size={13} />
              </Button>
              <Button variant="ghost" onClick={() => toggle.mutate(s)}>
                <Power size={13} className={s.active ? "text-emerald-600" : "text-stone-400"} />
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
          placeholder="Nuevo proveedor…"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          className={`${inputClass} w-36`}
          placeholder="Teléfono"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
        <Button type="submit" disabled={!name.trim() || create.isPending}>
          Agregar
        </Button>
      </form>
      {create.error && <p className="mt-2 text-sm text-red-600">{create.error.message}</p>}
    </Modal>
  );
}

// ── Gestión de categorías y subcategorías ──────────────────────
function CategoriesModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["categories"] });
    qc.invalidateQueries({ queryKey: ["categories-flat"] });
  };
  const { data: tree = [] } = useQuery({
    queryKey: ["categories"],
    queryFn: () => api.get<Category[]>("/categories"),
    enabled: open,
  });

  const [name, setName] = useState("");
  const [parentId, setParentId] = useState("");

  const create = useMutation({
    mutationFn: () =>
      api.post("/categories", { name, parentId: parentId ? Number(parentId) : null }),
    onSuccess: () => {
      invalidate();
      setName("");
    },
  });
  const remove = useMutation({
    mutationFn: (id: number) => api.del(`/categories/${id}`),
    onSuccess: invalidate,
  });
  const rename = useMutation({
    mutationFn: ({ id, newName }: { id: number; newName: string }) =>
      api.put(`/categories/${id}`, { name: newName }),
    onSuccess: invalidate,
  });

  const row = (c: Category & { _count?: { items: number } }, isChild = false) => (
    <div
      key={c.id}
      className={`flex items-center justify-between rounded px-2 py-1.5 hover:bg-stone-50 ${
        isChild ? "ml-6" : ""
      }`}
    >
      <span className="text-sm">
        {c.name}
        <span className="ml-2 text-xs text-stone-400">{c._count?.items ?? 0} items</span>
      </span>
      <span className="flex gap-1">
        <Button
          variant="ghost"
          onClick={() => {
            const newName = prompt("Nuevo nombre:", c.name);
            if (newName?.trim()) rename.mutate({ id: c.id, newName: newName.trim() });
          }}
        >
          <Pencil size={13} />
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            if (confirm(`¿Eliminar «${c.name}»?`)) remove.mutate(c.id);
          }}
        >
          <span className="text-red-500">×</span>
        </Button>
      </span>
    </div>
  );

  return (
    <Modal open={open} onClose={onClose} title="Categorías">
      <div className="space-y-1">
        {tree.length === 0 && <Empty text="Todavía no hay categorías." />}
        {tree.map((c) => (
          <div key={c.id}>
            {row(c)}
            {c.children?.map((ch) => row(ch, true))}
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
          placeholder="Nueva categoría…"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <select
          className={`${inputClass} w-44`}
          value={parentId}
          onChange={(e) => setParentId(e.target.value)}
        >
          <option value="">Nivel principal</option>
          {tree.map((c) => (
            <option key={c.id} value={c.id}>
              Dentro de «{c.name}»
            </option>
          ))}
        </select>
        <Button type="submit" disabled={!name.trim() || create.isPending}>
          Agregar
        </Button>
      </form>
      {(create.error || remove.error) && (
        <p className="mt-2 text-sm text-red-600">
          {create.error?.message ?? remove.error?.message}
        </p>
      )}
    </Modal>
  );
}

// ── Aumento masivo de precios ──────────────────────────────────
function BulkIncreaseModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [percent, setPercent] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const { data: flatCategories = [] } = useQuery({
    queryKey: ["categories-flat"],
    queryFn: () => api.get<FlatCategory[]>("/categories/flat"),
    enabled: open,
  });

  const apply = useMutation({
    mutationFn: () =>
      api.post("/items/bulk-increase", {
        percent: Number(percent),
        categoryId: categoryId ? Number(categoryId) : undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["items"] });
      onClose();
      setPercent("");
    },
  });

  return (
    <Modal open={open} onClose={onClose} title="Aumento masivo de precios">
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          apply.mutate();
        }}
      >
        <p className="text-sm text-stone-500">
          Aplica un aumento porcentual al precio de venta de los items vendibles (o solo de una
          categoría). Usá un porcentaje negativo para bajar precios.
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
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
          >
            <option value="">Todos los items vendibles</option>
            {flatCategories.map((c) => (
              <option key={c.id} value={c.id}>
                Solo «{c.fullName}»
              </option>
            ))}
          </select>
        </Field>
        {apply.error && <p className="text-sm text-red-600">{apply.error.message}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={apply.isPending}>
            Aplicar aumento
          </Button>
        </div>
      </form>
    </Modal>
  );
}
