import { useEffect, useState } from 'react';
import { getAllProducts, onProductsChange, queue } from '../../data/productRepo';
import type { Product, QueueItem } from '../../data/types';

export function useProducts(): Product[] {
  const [items, setItems] = useState<Product[]>([]);
  useEffect(() => {
    let alive = true;
    const load = () => void getAllProducts().then((p) => alive && setItems(p));
    load();
    const off = onProductsChange(load);
    return () => { alive = false; off(); };
  }, []);
  return items;
}

export function useQueueItems(): QueueItem[] {
  const [items, setItems] = useState<QueueItem[]>([]);
  useEffect(() => {
    let alive = true;
    const load = () => void queue.list().then((i) => alive && setItems(i));
    load();
    const off = queue.onChange(load);
    return () => { alive = false; off(); };
  }, []);
  return items;
}

/** Browser online/offline state, for the connection indicator. */
export function useOnline(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down); };
  }, []);
  return online;
}
