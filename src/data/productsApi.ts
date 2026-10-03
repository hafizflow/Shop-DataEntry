import { supabase } from '../lib/supabase';
import { mapError } from './errors';
import type { NewProduct, Product } from './types';

const COLS = 'id,barcode,name,unit,selling_price,company,created_at,created_by,created_by_email,updated_at';
const PAGE = 1000;

/** Supabase returns {error} for server errors but can also throw (fetch failures). Normalise both. */
async function guard<T>(run: () => PromiseLike<{ data: T | null; error: unknown }>): Promise<T | null> {
  try {
    const { data, error } = await run();
    if (error) throw error;
    return data;
  } catch (e) {
    throw mapError(e);
  }
}

export async function fetchByBarcodes(barcodes: string[]): Promise<Product | null> {
  const rows = await guard(() => supabase.from('products').select(COLS).in('barcode', barcodes).limit(1));
  return ((rows as Product[] | null) ?? [])[0] ?? null;
}

/** Products changed since an ISO timestamp (inclusive, so ties are never missed), or all when null. */
export async function fetchChangedSince(since: string | null): Promise<Product[]> {
  const out: Product[] = [];
  for (let from = 0; ; from += PAGE) {
    let q = supabase.from('products').select(COLS)
      .order('updated_at', { ascending: true }).order('id').range(from, from + PAGE - 1);
    if (since) q = q.gte('updated_at', since);
    const rows = ((await guard(() => q)) as Product[] | null) ?? [];
    out.push(...rows);
    if (rows.length < PAGE) return out;
  }
}

export async function insertProduct(p: NewProduct & { id: string }): Promise<Product> {
  const row = (await guard(() => supabase.from('products').insert(p).select(COLS).single())) as Product | null;
  if (!row) throw mapError(new Error('insert returned no row'));
  return row;
}

export async function updateProduct(id: string, patch: Partial<Omit<NewProduct, 'barcode'>>): Promise<Product> {
  const rows = ((await guard(() => supabase.from('products').update(patch).eq('id', id).select(COLS))) as Product[] | null) ?? [];
  if (!rows[0]) throw mapError({ code: '42501', message: 'update affected no rows' }); // RLS hides the row
  return rows[0];
}

export async function deleteProduct(id: string): Promise<void> {
  const rows = ((await guard(() => supabase.from('products').delete().eq('id', id).select('id'))) as { id: string }[] | null) ?? [];
  if (!rows[0]) throw mapError({ code: '42501', message: 'delete affected no rows' }); // RLS hides the row
}

export async function fetchProfileRole(userId: string): Promise<'owner' | 'employee'> {
  const row = await guard(() => supabase.from('profiles').select('role').eq('id', userId).single());
  return (row as { role: string } | null)?.role === 'owner' ? 'owner' : 'employee';
}
