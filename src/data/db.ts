import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Product, QueueItem } from './types';

interface Schema extends DBSchema {
  products: { key: string; value: Product; indexes: { barcode: string } };
  queue: { key: string; value: QueueItem };
  meta: { key: string; value: unknown };
}

let dbPromise: Promise<IDBPDatabase<Schema>> | null = null;

export function getDb() {
  return (dbPromise ??= openDB<Schema>('shop-entry', 2, {
    async upgrade(db, oldVersion, _newVersion, tx) {
      if (oldVersion < 1) {
        db.createObjectStore('queue', { keyPath: 'id' });
        db.createObjectStore('meta');
      }
      // v2: products are keyed by id (barcode can be missing); keep any rows (incl. pending) from v1.
      const old = oldVersion >= 1 ? await tx.objectStore('products' as never).getAll() as Product[] : [];
      if (oldVersion >= 1) db.deleteObjectStore('products');
      const store = db.createObjectStore('products', { keyPath: 'id' });
      store.createIndex('barcode', 'barcode');
      for (const p of old) await store.put(p);
    },
  }));
}

export async function resetDbForTests() {
  if (dbPromise) (await dbPromise).close();
  dbPromise = null;
  await new Promise<void>((res, rej) => {
    const r = indexedDB.deleteDatabase('shop-entry');
    r.onsuccess = () => res();
    r.onerror = () => rej(r.error);
  });
}
