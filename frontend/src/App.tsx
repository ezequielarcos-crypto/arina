import { useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Package,
  ShoppingCart,
  Users,
  Croissant,
} from "lucide-react";
import Products from "./pages/Products";
import Clients from "./pages/Clients";
import Sales from "./pages/Sales";

// Productos ahora incluye ingredientes, elaboraciones y recetas.
const MODULES = [
  { key: "products", label: "Productos", icon: Package, page: <Products /> },
  { key: "clients", label: "Clientes", icon: Users, page: <Clients /> },
  { key: "sales", label: "Ventas y Caja", icon: ShoppingCart, page: <Sales /> },
];

export default function App() {
  const [active, setActive] = useState("products");
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="flex min-h-screen">
      <aside
        className={`sticky top-0 flex h-screen flex-col border-r border-stone-200 bg-white transition-all ${
          collapsed ? "w-16" : "w-56"
        }`}
      >
        <div className="flex items-center gap-2 px-4 py-5">
          <Croissant size={24} className="shrink-0 text-amber-600" />
          {!collapsed && <span className="text-xl font-bold tracking-tight">Arina</span>}
        </div>

        <nav className="flex-1 space-y-1 px-2">
          {MODULES.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setActive(key)}
              title={label}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                active === key
                  ? "bg-stone-800 text-white"
                  : "text-stone-600 hover:bg-stone-100"
              }`}
            >
              <Icon size={18} className="shrink-0" />
              {!collapsed && label}
            </button>
          ))}
        </nav>

        <button
          onClick={() => setCollapsed(!collapsed)}
          className="m-2 flex items-center justify-center rounded-lg p-2 text-stone-400 hover:bg-stone-100"
          title={collapsed ? "Expandir" : "Contraer"}
        >
          {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        </button>
      </aside>

      <main className="flex-1 p-6">
        {MODULES.find((m) => m.key === active)?.page}
      </main>
    </div>
  );
}
