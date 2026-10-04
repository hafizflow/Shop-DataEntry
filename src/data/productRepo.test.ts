import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetDbForTests } from './db';
import { ApiError } from './errors';
import * as api from './productsApi';
import * as cache from './productCache';
import * as q from './offlineQueue';
import * as repo from './productRepo';
import type { NewProduct, Product } from './types';

vi.mock('./productsApi', () => ({
  insertProduct: vi.fn(), fetchByBarcodes: vi.fn(), fetchChangedSince: vi.fn(), fetchAllIds: vi.fn(), updateProduct: vi.fn(), deleteProduct: vi.fn(),
}));
const A = vi.mocked(api);

const np = (barcode: string, over: Partial<NewProduct> = {}): NewProduct =>
  ({ barcode, name: `N${barcode}`, unit: 'pcs', selling_price: 5, company: 'Co', ...over });
const row = (barcode: string, over: Partial<Product> = {}): Product => ({
  ...np(barcode), id: `id${barcode}`, created_at: '2026-10-04T05:00:00Z', created_by: 'u1',
  updated_at: null, created_by_email: 'e', ...over,
});
const user = { id: 'u1', email: 'e@x.com' };

beforeEach(async () => { await resetDbForTests(); vi.resetAllMocks(); });

describe('lookup', () => {
  it('answers from the cache without calling the server', async () => {
    await cache.put(row('111'));
    const r = await repo.lookup(' 111 ');
    expect(r.product?.barcode).toBe('111');
    expect(A.fetchByBarcodes).not.toHaveBeenCalled();
  });
  it('finds a UPC-A product stored as EAN-13 and vice versa', async () => {
    await cache.put(row('0036000291452'));
    expect((await repo.lookup('036000291452')).product?.barcode).toBe('0036000291452');
  });
  it('falls back to the server and caches the result', async () => {
    A.fetchByBarcodes.mockResolvedValueOnce(row('222'));
    expect((await repo.lookup('222')).product?.id).toBe('id222');
    expect((await cache.getByBarcodes(['222']))?.id).toBe('id222');
  });
  it('returns null (not found) when the server has nothing', async () => {
    A.fetchByBarcodes.mockResolvedValueOnce(null);
    expect(await repo.lookup('333')).toEqual({ product: null, offline: false });
  });
  it('reports offline when the server is unreachable and the cache misses', async () => {
    A.fetchByBarcodes.mockRejectedValueOnce(new ApiError('network', 'x'));
    expect(await repo.lookup('444')).toEqual({ product: null, offline: true });
  });
  it('rethrows non-network errors', async () => {
    A.fetchByBarcodes.mockRejectedValueOnce(new ApiError('auth', 'x'));
    await expect(repo.lookup('555')).rejects.toMatchObject({ kind: 'auth' });
  });
});

describe('lookup on a bad connection', () => {
  it('does not wait for the server when the browser knows it is offline', async () => {
    const spy = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    try {
      expect(await repo.lookup('777')).toEqual({ product: null, offline: true });
      expect(A.fetchByBarcodes).not.toHaveBeenCalled();
    } finally { spy.mockRestore(); }
  });
  it('treats a server that is too slow as offline instead of hanging the scanner', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      A.fetchByBarcodes.mockReturnValue(new Promise(() => {}));
      const pending = repo.lookup('888');
      await vi.waitFor(() => expect(A.fetchByBarcodes).toHaveBeenCalled()); // cache miss first, then the timer starts
      await vi.advanceTimersByTimeAsync(repo.LOOKUP_TIMEOUT_MS + 1);
      expect(await pending).toEqual({ product: null, offline: true });
    } finally { vi.useRealTimers(); }
  });
});

describe('save', () => {
  it('stores a pending row locally, queues it, and syncs in the background', async () => {
    A.insertProduct.mockImplementation(async (p) => row(p.barcode!, { id: p.id }));
    const r = await repo.save(np('1'), user);
    expect(r.status).toBe('accepted');
    await q.flush(); // joins the background flush started by save
    expect(A.insertProduct).toHaveBeenCalledTimes(1);
    expect((await cache.getByBarcodes(['1']))?.pending).toBeUndefined();
    expect(await q.list()).toEqual([]);
  });
  it('shows the product locally at once, before the server answers', async () => {
    let answer!: (p: Product) => void;
    A.insertProduct.mockReturnValue(new Promise<Product>((r) => { answer = r; })); // server is slow
    await repo.save(np('1'), user);
    const local = await cache.getByBarcodes(['1']);
    expect(local?.pending).toBe(true);
    expect(local?.created_by_email).toBe('e@x.com');
    answer(row('1', { id: local!.id }));
    await q.flush();
  });
  it('stays queued when offline', async () => {
    A.insertProduct.mockRejectedValue(new ApiError('network', 'x'));
    await repo.save(np('1'), user);
    await q.flush();
    expect(q.visibleCount(await q.list())).toBe(1);
  });
  it('refuses a same name+company+unit locally, before any network call', async () => {
    await cache.put(row('9', { name: 'Rice', company: 'Pran', unit: 'kg' }));
    const r = await repo.save(np('1', { name: ' rice ', company: 'PRAN', unit: 'kg' }), user);
    expect(r.status).toBe('duplicate-product');
    expect(A.insertProduct).not.toHaveBeenCalled();
  });
  it('ignores a second save of the same barcode (double tap)', async () => {
    A.insertProduct.mockRejectedValue(new ApiError('network', 'x'));
    await repo.save(np('1'), user);
    const second = await repo.save(np('1', { name: 'Other' }), user);
    expect(second.status).toBe('duplicate-pending');
    expect(await q.list()).toHaveLength(1);
  });
});

describe('products without a barcode', () => {
  it('can be saved several times, and survive each other in the cache', async () => {
    A.insertProduct.mockRejectedValue(new ApiError('network', 'x'));
    const a = await repo.save({ ...np('x'), barcode: null, name: 'Loose A' }, user);
    const b = await repo.save({ ...np('x'), barcode: null, name: 'Loose B' }, user);
    expect([a.status, b.status]).toEqual(['accepted', 'accepted']);
    expect(await cache.getAll()).toHaveLength(2);
    expect(await q.list()).toHaveLength(2);
  });
});

describe('remove', () => {
  it('deletes on the server, then from the cache', async () => {
    await cache.put(row('1'));
    await repo.remove('id1');
    expect(A.deleteProduct).toHaveBeenCalledWith('id1');
    expect(await cache.getAll()).toEqual([]);
  });
  it('keeps the cached row when the server refuses', async () => {
    await cache.put(row('1'));
    A.deleteProduct.mockRejectedValue(new ApiError('permission', 'x'));
    await expect(repo.remove('id1')).rejects.toThrow();
    expect(await cache.getAll()).toHaveLength(1);
  });
});

describe('pure helpers', () => {
  const all = [
    row('1', { name: 'Basmati Rice', company: 'Pran', created_at: '2026-10-01T00:00:00Z' }),
    row('2', { name: 'Soap', company: 'Lux', created_at: '2026-10-03T00:00:00Z' }),
    row('3', { name: 'Salt', company: 'pran', created_at: '2026-10-02T00:00:00Z' }),
  ];
  it('searches name, barcode and company, newest first', () => {
    expect(repo.searchProducts(all, 'pran').map((p) => p.barcode)).toEqual(['3', '1']);
    expect(repo.searchProducts(all, '2').map((p) => p.barcode)).toEqual(['2']);
    expect(repo.searchProducts(all, '  ').map((p) => p.barcode)).toEqual(['2', '3', '1']);
  });
  it('lists distinct companies case-insensitively, keeping the first spelling', () => {
    expect(repo.distinctCompanies([all[2], all[0], all[1]])).toEqual(['Lux', 'pran']);
  });
  it('counts what this user added today in Dhaka time', () => {
    const now = new Date('2026-10-04T10:00:00Z'); // 4 Oct, 4pm Dhaka
    const mine = (iso: string, by = 'u1') => row(iso, { created_at: iso, created_by: by });
    const items = [
      mine('2026-10-03T23:30:00Z'), // 4 Oct 05:30 Dhaka -> today
      mine('2026-10-03T17:00:00Z'), // 3 Oct 23:00 Dhaka -> yesterday
      mine('2026-10-04T01:00:00Z', 'u2'), // someone else
    ];
    expect(repo.addedTodayCount(items, 'u1', now)).toBe(1);
  });
});

describe('sync', () => {
  it('does a full refresh the first time, then deltas', async () => {
    A.fetchChangedSince.mockResolvedValueOnce([row('1', { updated_at: '2026-10-04T01:00:00Z' })]);
    expect(await repo.sync()).toBe(true);
    expect(A.fetchChangedSince).toHaveBeenLastCalledWith(null);
    A.fetchChangedSince.mockResolvedValueOnce([]);
    await repo.sync();
    expect(A.fetchChangedSince).toHaveBeenLastCalledWith('2026-10-04T01:00:00Z');
  });
  it('drops cached rows deleted on the server, but keeps pending ones', async () => {
    await cache.putMany([row('1'), row('2'), row('3', { pending: true })]);
    await cache.setMeta('lastFullSync', Date.now());
    A.fetchChangedSince.mockResolvedValueOnce([]);
    A.fetchAllIds.mockResolvedValueOnce(['id1']);
    await repo.sync();
    expect((await cache.getAll()).map((p) => p.id).sort()).toEqual(['id1', 'id3']);
  });
  it('returns false when offline', async () => {
    A.fetchChangedSince.mockRejectedValueOnce(new ApiError('network', 'x'));
    expect(await repo.sync()).toBe(false);
  });
});
