export interface Category {
  id: number;
  name: string;
}

export interface Product {
  id: number;
  name: string;
  price: number;
  stock: number;
  categoryId: number | null;
  category: Category | null;
}

export interface Purchase {
  id: number;
  rawMaterialId: number;
  quantity: number;
  totalCost: number;
  date: string;
  rawMaterial?: RawMaterial;
}

export interface RawMaterial {
  id: number;
  name: string;
  unit: string;
  stock: number;
  lastCost: number;
  purchases?: Purchase[];
}

export interface RecipeItem {
  id: number;
  rawMaterialId: number;
  quantity: number;
  rawMaterial: RawMaterial;
}

export interface Recipe {
  id: number;
  name: string;
  yieldQty: number;
  yieldUnit: string;
  notes: string | null;
  productId: number | null;
  product: Product | null;
  items: RecipeItem[];
  totalCost: number;
  costPerUnit: number;
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
  productId: number;
  quantity: number;
  unitPrice: number;
  product: Product;
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
