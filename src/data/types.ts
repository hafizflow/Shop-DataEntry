export const UNITS = ['pcs', 'kg', 'g', 'litre', 'ml', 'dozen', 'pack', 'box'] as const;
export type Unit = (typeof UNITS)[number];

export interface NewProduct {
  /** null for products that have no barcode */
  barcode: string | null;
  name: string;
  unit: Unit;
  selling_price: number;
  company: string;
}

export interface Product extends NewProduct {
  id: string;
  created_at: string;
  created_by: string | null;
  /** email of the employee who added it; stamped by a database trigger */
  created_by_email: string | null;
  updated_at: string | null;
  /** true while only stored locally (queued, not yet confirmed by the server) */
  pending?: boolean;
}

export interface QueueItem {
  id: string; // client-generated product id, sent on insert so retries are idempotent
  product: NewProduct;
  authorEmail: string | null;
  status: 'pending' | 'attention';
  attempts: number;
  error?: string;
  createdAt: number;
}

export type ApiErrorKind =
  | 'network' | 'auth' | 'duplicate_barcode' | 'duplicate_product'
  | 'validation' | 'permission' | 'setup' | 'unknown';
