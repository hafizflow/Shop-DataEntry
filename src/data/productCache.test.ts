import { beforeEach, describe, expect, it } from 'vitest';
import { resetDbForTests } from './db';
import * as cache from './productCache';
import type { Product } from './types';

const p = (barcode: string, over: Partial<Product> = {}): Product => ({
  id: barcode, barcode, name: `N${barcode}`, unit: 'pcs', selling_price: 1, company: 'Co',
  created_at: '2026-10-04T00:00:00Z', created_by: 'u', updated_at: null, created_by_email: null, ...over,
});

beforeEach(resetDbForTests);

describe('productCache', () => {
  it('puts and finds by any of several barcodes', async () => {
    await cache.put(p('111'));
    expect((await cache.getByBarcodes(['999', '111']))?.id).toBe('111');
    expect(await cache.getByBarcodes(['999'])).toBeUndefined();
  });
  it('replaceAll drops server rows that disappeared but keeps pending local rows', async () => {
    await cache.putMany([p('1'), p('2'), p('3', { pending: true })]);
    await cache.replaceAll([p('2')]);
    expect((await cache.getAll()).map((x) => x.barcode).sort()).toEqual(['2', '3']);
  });
  it('finds a duplicate name+company+unit ignoring case and spacing', async () => {
    await cache.put(p('1', { name: 'Basmati Rice', company: 'Pran', unit: 'kg' }));
    const dup = await cache.findDuplicateTriple({ barcode: '2', name: '  basmati  RICE', company: 'PRAN ', unit: 'kg', selling_price: 1 });
    expect(dup?.barcode).toBe('1');
    expect(await cache.findDuplicateTriple({ barcode: '2', name: 'Basmati Rice', company: 'Pran', unit: 'g', selling_price: 1 })).toBeUndefined();
  });
  it('stores meta and notifies listeners on change', async () => {
    let n = 0;
    const off = cache.onChange(() => { n++; });
    await cache.put(p('1'));
    await cache.setMeta('lastSync', 'x');
    expect(await cache.getMeta('lastSync')).toBe('x');
    off();
    expect(n).toBe(1);
  });
});
