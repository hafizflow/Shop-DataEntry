import { getDb } from './db';
import { createEmitter } from '../lib/emitter';
import type { NewProduct, Product } from './types';

const changes = createEmitter();
export const onChange = (fn: () => void) => changes.on(fn);

export async function getByBarcodes(barcodes: string[]): Promise<Product | undefined> {
  const db = await getDb();
  for (const b of barcodes) {
    const hit = await db.getFromIndex('products', 'barcode', b);
    if (hit) return hit;
  }
  return undefined;
}
export async function getAll(): Promise<Product[]> {
  return (await getDb()).getAll('products');
}
export async function put(p: Product) {
  await (await getDb()).put('products', p);
  changes.emit();
}
export async function putMany(ps: Product[]) {
  const db = await getDb();
  const tx = db.transaction('products', 'readwrite');
  await Promise.all([...ps.map((p) => tx.store.put(p)), tx.done]);
  changes.emit();
}
export async function remove(id: string) {
  await (await getDb()).delete('products', id);
  changes.emit();
}
/** Replace server-known rows; locally pending rows are kept until the queue confirms them. */
export async function replaceAll(ps: Product[]) {
  const db = await getDb();
  const tx = db.transaction('products', 'readwrite');
  const existing = await tx.store.getAll();
  const fresh = new Set(ps.map((p) => p.id));
  await Promise.all([
    ...existing.filter((e) => !e.pending && !fresh.has(e.id)).map((e) => tx.store.delete(e.id)),
    ...ps.map((p) => tx.store.put(p)),
    tx.done,
  ]);
  changes.emit();
}

/** Drop synced rows the server no longer has (deleted elsewhere); pending rows are kept. */
export async function removeMissing(serverIds: string[]) {
  const db = await getDb();
  const tx = db.transaction('products', 'readwrite');
  const keep = new Set(serverIds);
  const gone = (await tx.store.getAll()).filter((e) => !e.pending && !keep.has(e.id));
  await Promise.all([...gone.map((e) => tx.store.delete(e.id)), tx.done]);
  if (gone.length) changes.emit();
}

const norm = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();
export async function findDuplicateTriple(n: NewProduct): Promise<Product | undefined> {
  const all = await getAll();
  return all.find((p) => norm(p.name) === norm(n.name) && norm(p.company) === norm(n.company) && p.unit.toLowerCase() === n.unit.toLowerCase());
}

export async function getMeta<T>(key: string): Promise<T | undefined> {
  return (await (await getDb()).get('meta', key)) as T | undefined;
}
export async function setMeta(key: string, value: unknown) {
  await (await getDb()).put('meta', value, key);
}
