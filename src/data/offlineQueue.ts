import { getDb } from './db';
import { ApiError, mapError } from './errors';
import { fetchByBarcodes, insertProduct } from './productsApi';
import * as cache from './productCache';
import { createEmitter } from '../lib/emitter';
import { withTimeout } from './timeout';
import type { MessageKey } from '../lib/i18n';
import type { NewProduct, Product, QueueItem } from './types';

export interface QueueNotice { key: MessageKey; params: Record<string, string> }

const changes = createEmitter();
const notices = createEmitter<QueueNotice>();
export const onChange = (fn: () => void) => changes.on(fn);
export const onNotice = (fn: (n: QueueNotice) => void) => notices.on(fn);

export async function list(): Promise<QueueItem[]> {
  const items = await (await getDb()).getAll('queue');
  return items.sort((a, b) => a.createdAt - b.createdAt);
}
/** Items worth showing in the "Pending sync (n)" badge: failed at least once, or needing attention. */
export const visibleCount = (items: QueueItem[]) =>
  items.filter((i) => i.attempts > 0 || i.status === 'attention').length;

export async function isQueued(barcode: string | null): Promise<boolean> {
  return barcode !== null && (await list()).some((i) => i.product.barcode === barcode);
}

export async function enqueue(product: NewProduct, id: string, authorEmail: string | null) {
  const item: QueueItem = { id, product, authorEmail, status: 'pending', attempts: 0, createdAt: Date.now() };
  await (await getDb()).put('queue', item);
  changes.emit();
}

async function save(item: QueueItem) {
  await (await getDb()).put('queue', item);
  changes.emit();
}
async function drop(id: string) {
  await (await getDb()).delete('queue', id);
  changes.emit();
}

async function succeed(item: QueueItem, row: Product) {
  await cache.put({ ...row, pending: undefined });
  await drop(item.id);
}

export const INSERT_TIMEOUT_MS = 15_000;

let running: Promise<void> | null = null;
/** Single-flight: concurrent callers share one run. */
export function flush(): Promise<void> {
  return (running ??= run().finally(() => { running = null; }));
}

async function run() {
  for (const item of (await list()).filter((i) => i.status === 'pending')) {
    try {
      await succeed(item, await withTimeout(insertProduct({ ...item.product, id: item.id }), INSERT_TIMEOUT_MS));
    } catch (e) {
      const err = e instanceof ApiError ? e : mapError(e);
      if (err.kind === 'network' || err.kind === 'auth') {
        await save({ ...item, attempts: item.attempts + 1 });
        return; // still offline / signed out: keep everything, try again later
      }
      if (err.kind === 'duplicate_barcode') {
        const existing = item.product.barcode ? await fetchByBarcodes([item.product.barcode]).catch(() => null) : null;
        if (existing?.id === item.id) { await succeed(item, existing); continue; } // our own earlier insert
        await cache.remove(item.id); // our optimistic local row
        if (existing) await cache.put(existing);
        await drop(item.id);
        notices.emit({ key: 'notice.conflictBarcode', params: { barcode: item.product.barcode ?? '' } });
      } else if (err.kind === 'duplicate_product') {
        await cache.remove(item.id);
        await drop(item.id);
        notices.emit({ key: 'notice.conflictProduct', params: { name: item.product.name } });
      } else {
        await cache.remove(item.id);
        await save({ ...item, status: 'attention', error: err.message });
      }
    }
  }
}

export async function retry(id: string) {
  const item = await (await getDb()).get('queue', id);
  if (item) { await save({ ...item, status: 'pending', attempts: 0, error: undefined }); void flush(); }
}
export const discard = drop;
