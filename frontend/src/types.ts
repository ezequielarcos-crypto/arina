export type ItemType = "PRODUCT" | "INGREDIENT" | "PREPARATION";

export interface Category {
  id: number;
  name: string;
  parentId: number | null;
  sortOrder: number;
  active: boolean;
  parent?: Category | null;
  children?: (Category & { _count?: { items: number } })[];
  _count?: { items: number };
}

export interface FlatCategory extends Category {
  fullName: string;
}

// Item unificado: producto, ingrediente o elaboración.
// computedCost/márgenes vienen calculados del backend (fuente única de verdad).
export interface Item {
  id: number;
  name: string;
  sku: string | null;
  type: ItemType;
  unit: string;
  description: string | null;
  categoryId: number | null;
  category: Category | null;
  active: boolean;
  favorite: boolean;
  sellable: boolean;
  available: boolean;
  salePrice: number;
  taxRate: number | null;
  cost: number;
  wastePct: number;
  trackStock: boolean;
  stock: number;
  minStock: number;
  maxStock: number | null;
  allowSaleWithoutStock: boolean;
  // calculados
  computedCost: number;
  hasRecipe: boolean;
  marginAbs: number;
  marginPct: number | null;
  markupPct: number | null;
}

export interface RecipeLine {
  id: number;
  componentId: number;
  component: Item;
  qty: number;
  wastePct: number | null;
  // calculados
  effectiveWastePct: number;
  grossQty: number;
  componentUnitCost: number;
  lineCost: number;
  componentHasRecipe: boolean;
}

export interface Recipe {
  id: number;
  itemId: number;
  yieldQty: number;
  yieldUnit: string;
  notes: string | null;
  items: RecipeLine[];
  totalCost: number;
  costPerUnit: number;
}

export interface Purchase {
  id: number;
  itemId: number;
  quantity: number;
  totalCost: number;
  date: string;
  item?: Item;
}

export interface ItemDetail extends Item {
  recipe: Recipe | null;
  usedIn: Item[];
  purchases: Purchase[];
}

export interface Client {
  id: number;
  name: string;
  phone: string | null;
  email: string | null;
  preferences: string | null;
  _count?: { sales: number };
}

export interface SaleItem {
  id: number;
  itemId: number;
  quantity: number;
  unitPrice: number;
  item: Item;
}

export interface Sale {
  id: number;
  date: string;
  clientId: number | null;
  client: Client | null;
  total: number;
  items: SaleItem[];
}

export interface CashReport {
  income: number;
  expenses: number;
  balance: number;
  salesCount: number;
  sales: Sale[];
  purchases: Purchase[];
}
