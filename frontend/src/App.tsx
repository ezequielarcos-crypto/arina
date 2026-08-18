import { useEffect, useRef, useState } from "react";
import {
  CakeSlice,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Croissant,
  Factory,
  Fish,
  Package,
  Pizza,
  ShoppingCart,
  Users,
} from "lucide-react";
import type { LucideProps } from "lucide-react";
import Products, { type ProductsTab } from "./pages/Products";
import Production from "./pages/Production";
import Clients from "./pages/Clients";
import Sales from "./pages/Sales";

// ── Íconos del sistema (clic en el logo para cambiarlo) ────────
// Dos diseñados a mano con la misma estética de trazo que lucide.
function PastaIcon({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M8 9c1-1-.7-2.5.3-4" />
      <path d="M12 9c1-1-.7-3.5.3-5" />
      <path d="M16 9c1-1-.7-2.5.3-4" />
      <path d="M3 12h18" />
      <path d="M5 12a7 7 0 0 0 14 0" />
      <path d="M9 20h6" />
    </svg>
  );
}

function HotDogIcon({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M4 9.5C4.5 7 8 5.5 12 5.5S19.5 7 20 9.5" />
      <rect x="2" y="10.25" width="20" height="3.5" rx="1.75" />
      <path d="M4 14.5c.5 2.5 4 4 8 4s7.5-1.5 8-4" />
    </svg>
  );
}

type IconComponent = (props: LucideProps & { size?: number; className?: string }) =>
  | React.ReactNode
  | null;

const LOGOS: { key: string; label: string; Icon: IconComponent }[] = [
  { key: "croissant", label: "Medialuna", Icon: Croissant as IconComponent },
  { key: "pizza", label: "Pizza", Icon: Pizza as IconComponent },
  { key: "pasta", label: "Plato de pastas", Icon: PastaIcon },
  { key: "hotdog", label: "Hot dog", Icon: HotDogIcon },
  { key: "fish", label: "Pescado", Icon: Fish as IconComponent },
  { key: "cake", label: "Porción de torta", Icon: CakeSlice as IconComponent },
];

// ── Estructura del menú ────────────────────────────────────────
// Productos tiene un submenú desplegable dentro del menú lateral.
const PRODUCT_TABS: { key: ProductsTab | "production"; label: string }[] = [
  { key: "ALL", label: "Todos" },
  { key: "PRODUCT", label: "Productos" },
  { key: "PREPARATION", label: "Elaboraciones" },
  { key: "INGREDIENT", label: "Ingredientes" },
  { key: "production", label: "Producción" },
];

export default function App() {
  const [active, setActive] = useState("products");
  const [productsTab, setProductsTab] = useState<ProductsTab>("ALL");
  const [collapsed, setCollapsed] = useState(false);
  const [submenuOpen, setSubmenuOpen] = useState(
    () => localStorage.getItem("arina-submenu") !== "closed"
  );
  const [logoKey, setLogoKey] = useState(() => localStorage.getItem("arina-logo") ?? "croissant");
  const [logoPickerOpen, setLogoPickerOpen] = useState(false);
  const logoRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    localStorage.setItem("arina-submenu", submenuOpen ? "open" : "closed");
  }, [submenuOpen]);
  useEffect(() => {
    localStorage.setItem("arina-logo", logoKey);
  }, [logoKey]);
  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!logoRef.current?.contains(e.target as Node)) setLogoPickerOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const Logo = (LOGOS.find((l) => l.key === logoKey) ?? LOGOS[0]).Icon;

  const navButton = (
    key: string,
    label: string,
    Icon: IconComponent,
    onClick: () => void,
    trailing?: React.ReactNode
  ) => (
    <button
      key={key}
      onClick={onClick}
      title={label}
      className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
        active === key ? "bg-stone-800 text-white" : "text-stone-600 hover:bg-stone-100"
      }`}
    >
      <Icon size={18} className="shrink-0" />
      {!collapsed && <span className="flex-1 text-left">{label}</span>}
      {!collapsed && trailing}
    </button>
  );

  return (
    <div className="flex min-h-screen">
      <aside
        className={`sticky top-0 flex h-screen flex-col border-r border-stone-200 bg-white transition-all ${
          collapsed ? "w-16" : "w-56"
        }`}
      >
        {/* Logo con selector de ícono */}
        <div ref={logoRef} className="relative flex items-center gap-2 px-4 py-5">
          <button
            onClick={() => setLogoPickerOpen(!logoPickerOpen)}
            title="Cambiar ícono"
            className="shrink-0 rounded-lg p-0.5 text-amber-600 transition-colors hover:bg-amber-50"
          >
            <Logo size={24} />
          </button>
          {!collapsed && <span className="text-xl font-bold tracking-tight">Arina</span>}
          {logoPickerOpen && (
            <div className="absolute left-3 top-14 z-50 grid grid-cols-3 gap-1 rounded-xl border border-stone-200 bg-white p-2 shadow-lg">
              {LOGOS.map(({ key, label, Icon }) => (
                <button
                  key={key}
                  onClick={() => {
                    setLogoKey(key);
                    setLogoPickerOpen(false);
                  }}
                  title={label}
                  className={`rounded-lg p-2 transition-colors ${
                    logoKey === key
                      ? "bg-amber-100 text-amber-700"
                      : "text-stone-500 hover:bg-stone-100"
                  }`}
                >
                  <Icon size={20} />
                </button>
              ))}
            </div>
          )}
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-2">
          {/* Productos con submenú desplegable */}
          {navButton(
            "products",
            "Productos",
            Package as IconComponent,
            () => setActive("products"),
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                setSubmenuOpen(!submenuOpen);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.stopPropagation();
                  setSubmenuOpen(!submenuOpen);
                }
              }}
              title={submenuOpen ? "Contraer submenú" : "Desplegar submenú"}
              className={`rounded p-0.5 transition-transform hover:bg-white/20 ${
                submenuOpen ? "" : "-rotate-90"
              }`}
            >
              <ChevronDown size={15} />
            </span>
          )}
          {!collapsed && submenuOpen && (
            <div className="ml-4 space-y-0.5 border-l border-stone-200 pl-3">
              {PRODUCT_TABS.map(({ key, label }) => {
                const isProduction = key === "production";
                const current = isProduction
                  ? active === "production"
                  : active === "products" && productsTab === key;
                return (
                  <button
                    key={key}
                    onClick={() => {
                      if (isProduction) {
                        setActive("production");
                      } else {
                        setActive("products");
                        setProductsTab(key as ProductsTab);
                      }
                    }}
                    className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors ${
                      current
                        ? "bg-stone-100 font-medium text-stone-900"
                        : "text-stone-500 hover:bg-stone-50 hover:text-stone-800"
                    }`}
                  >
                    {isProduction && <Factory size={14} className="shrink-0" />}
                    {label}
                  </button>
                );
              })}
            </div>
          )}

          {navButton("clients", "Clientes", Users as IconComponent, () => setActive("clients"))}
          {navButton("sales", "Ventas y Caja", ShoppingCart as IconComponent, () =>
            setActive("sales")
          )}
        </nav>

        {/* Flecha para esconder/expandir el menú (solo íconos) */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="m-2 flex items-center justify-center rounded-lg p-2 text-stone-400 hover:bg-stone-100"
          title={collapsed ? "Expandir menú" : "Esconder menú"}
        >
          {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        </button>
      </aside>

      <main className="flex-1 p-6">
        {active === "products" && <Products tab={productsTab} />}
        {active === "production" && <Production />}
        {active === "clients" && <Clients />}
        {active === "sales" && <Sales />}
      </main>
    </div>
  );
}
