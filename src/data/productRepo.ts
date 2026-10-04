import * as api from './productsApi';
import * as cache from './productCache';
import * as queue from './offlineQueue';
import { mapError } from './errors';
import { withTimeout } from './timeout';
import { barcodeVariants } from '../lib/barcode';
import { dhakaDayKey } from '../lib/format';
import type { NewProduct, Product } from './types';

/** The only data API the UI uses. Supabase and IndexedDB stay behind this file. */
export { queue };
export const onProductsChange = cache.onChange;
export const getAllProducts = cache.getAll;

/** The Supabase client retries failed requests with backoff (~8 s); a scanner must not wait that long. */
export const LOOKUP_TIMEOUT_MS = 4000;

export async function lookup(barcode: string): Promise<{ product: Product | null; offline: boolean }> {
  const variants = barcodeVariants(barcode);
  const cached = await cache.getByBarcodes(variants);
  if (cached) return { product: cached, offline: false };
  if (!navigator.onLine) return { product: null, offline: true };
  try {
    const found = await withTimeout(api.fetchByBarcodes(variants), LOOKUP_TIMEOUT_MS);
    if (found) await cache.put(found);
    return { product: found, offline: false };
  } catch (e) {
    const err = mapError(e);
    if (err.kind === 'network') return { product: null, offline: true };
    throw err;
  }
}

export type SaveResult =
  | { status: 'accepted'; id: string }
  | { status: 'duplicate-product'; existing: Product }
  | { status: 'duplicate-pending' };

/** Optimistic: resolves once the product is stored locally; the insert runs in the background. */
export async function save(input: NewProduct, user: { id: string; email: string | null }): Promise<SaveResult> {
  if (await queue.isQueued(input.barcode)) return { status: 'duplicate-pending' };
  const existing = await cache.findDuplicateTriple(input);
  if (existing) return { status: 'duplicate-product', existing };
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await cache.put({ ...input, id, created_at: now, created_by: user.id, created_by_email: user.email, updated_at: now, pending: true });
  await queue.enqueue(input, id, user.email);
  void queue.flush();
  return { status: 'accepted', id };
}

export async function update(id: string, patch: Partial<Omit<NewProduct, 'barcode'>>): Promise<Product> {
  const updated = await api.updateProduct(id, patch);
  await cache.put(updated);
  return updated;
}

export async function remove(id: string): Promise<void> {
  await api.deleteProduct(id);
  await cache.remove(id);
}

const DAY = 24 * 60 * 60 * 1000;
/** Delta sync by updated_at, plus an id check so rows deleted on the server disappear too. False when offline. */
export async function sync(): Promise<boolean> {
  try {
    const lastFull = await cache.getMeta<number>('lastFullSync');
    const full = !lastFull || Date.now() - lastFull > DAY;
    const rows = await api.fetchChangedSince(full ? null : ((await cache.getMeta<string>('lastSync')) ?? null));
    if (full) { await cache.replaceAll(rows); await cache.setMeta('lastFullSync', Date.now()); }
    else {
      await cache.putMany(rows);
      await cache.removeMissing(await api.fetchAllIds()); // deltas never include deletions
    }
    const newest = rows.map((r) => r.updated_at ?? '').sort().pop();
    if (newest) await cache.setMeta('lastSync', newest);
    return true;
  } catch (e) {
    const err = mapError(e);
    if (err.kind === 'network' || err.kind === 'auth') return false;
    throw err;
  }
}

export async function fetchAllForExport(): Promise<Product[]> {
  try { return await api.fetchChangedSince(null); } catch { return cache.getAll(); }
}

export function searchProducts(all: Product[], query: string): Product[] {
  const q = query.trim().toLowerCase();
  const hits = q
    ? all.filter((p) => p.name.toLowerCase().includes(q) || (p.barcode ?? '').toLowerCase().includes(q) || p.company.toLowerCase().includes(q))
    : [...all];
  return hits.sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export function distinctCompanies(all: Product[]): string[] {
  const seen = new Map<string, string>();
  for (const p of all) {
    const key = p.company.trim().toLowerCase();
    if (!seen.has(key)) seen.set(key, p.company.trim());
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}

export function addedTodayCount(all: Product[], userId: string, now = new Date()): number {
  const today = dhakaDayKey(now);
  return all.filter((p) => p.created_by === userId && dhakaDayKey(p.created_at) === today).length;
}
