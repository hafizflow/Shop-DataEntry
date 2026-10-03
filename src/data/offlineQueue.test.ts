import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetDbForTests } from './db';
import { ApiError } from './errors';
import * as api from './productsApi';
import * as cache from './productCache';
import * as q from './offlineQueue';
import type { NewProduct, Product } from './types';

vi.mock('./productsApi', () => ({ insertProduct: vi.fn(), fetchByBarcodes: vi.fn() }));
const insert = vi.mocked(api.insertProduct);
const fetchBy = vi.mocked(api.fetchByBarcodes);

const np = (barcode: string): NewProduct => ({ barcode, name: `N${barcode}`, unit: 'pcs', selling_price: 5, company: 'Co' });
const saved = (id: string, barcode: string): Product => ({
  ...np(barcode), id, created_at: 'x', created_by: 'u', updated_at: null, created_by_email: 'e',
});

beforeEach(async () => { await resetDbForTests(); vi.resetAllMocks(); });

describe('offlineQueue', () => {
  it('flushes in order, caches the saved row and empties the queue', async () => {
    await q.enqueue(np('1'), 'id1', 'e');
    await q.enqueue(np('2'), 'id2', 'e');
    insert.mockImplementation(async (p) => saved(p.id, p.barcode!));
    await q.flush();
    expect(insert.mock.calls.map((c) => c[0].id)).toEqual(['id1', 'id2']);
    expect(await q.list()).toEqual([]);
    expect((await cache.getByBarcodes(['1']))?.pending).toBeUndefined();
  });

  it('keeps items and stops on a network error, then succeeds later', async () => {
    await q.enqueue(np('1'), 'id1', 'e');
    await q.enqueue(np('2'), 'id2', 'e');
    insert.mockRejectedValueOnce(new ApiError('network', 'Failed to fetch'));
    await q.flush();
    expect(insert).toHaveBeenCalledTimes(1);
    const items = await q.list();
    expect(items).toHaveLength(2);
    expect(items[0].attempts).toBe(1);
    expect(q.visibleCount(items)).toBe(1);
    insert.mockImplementation(async (p) => saved(p.id, p.barcode!));
    await q.flush();
    expect(await q.list()).toEqual([]);
  });

  it('keeps items pending (not failed) when the session expired', async () => {
    await q.enqueue(np('1'), 'id1', 'e');
    insert.mockRejectedValueOnce(new ApiError('auth', 'JWT expired'));
    await q.flush();
    const [item] = await q.list();
    expect(item.status).toBe('pending');
    expect(item.attempts).toBe(1);
  });

  it('treats a duplicate barcode that is our own earlier insert as success', async () => {
    await q.enqueue(np('1'), 'id1', 'e');
    insert.mockRejectedValueOnce(new ApiError('duplicate_barcode', 'x'));
    fetchBy.mockResolvedValueOnce(saved('id1', '1'));
    const notices = vi.fn();
    q.onNotice(notices);
    await q.flush();
    expect(await q.list()).toEqual([]);
    expect(notices).not.toHaveBeenCalled();
  });

  it('drops a duplicate barcode added by someone else, caches theirs, and notifies', async () => {
    await cache.put({ ...saved('id1', '1'), pending: true });
    await q.enqueue(np('1'), 'id1', 'e');
    insert.mockRejectedValueOnce(new ApiError('duplicate_barcode', 'x'));
    fetchBy.mockResolvedValueOnce(saved('other', '1'));
    const notices = vi.fn();
    q.onNotice(notices);
    await q.flush();
    expect(await q.list()).toEqual([]);
    expect((await cache.getByBarcodes(['1']))?.id).toBe('other');
    expect(notices).toHaveBeenCalledWith({ key: 'notice.conflictBarcode', params: { barcode: '1' } });
  });

  it('drops a duplicate name+company+unit and removes the ghost cache row', async () => {
    await cache.put({ ...saved('id1', '1'), pending: true });
    await q.enqueue(np('1'), 'id1', 'e');
    insert.mockRejectedValueOnce(new ApiError('duplicate_product', 'x'));
    const notices = vi.fn();
    q.onNotice(notices);
    await q.flush();
    expect(await q.list()).toEqual([]);
    expect(await cache.getByBarcodes(['1'])).toBeUndefined();
    expect(notices).toHaveBeenCalledWith({ key: 'notice.conflictProduct', params: { name: 'N1' } });
  });

  it('marks permission errors as needing attention and does not retry them on flush', async () => {
    await q.enqueue(np('1'), 'id1', 'e');
    insert.mockRejectedValueOnce(new ApiError('permission', 'denied'));
    await q.flush();
    const [item] = await q.list();
    expect(item.status).toBe('attention');
    insert.mockClear();
    await q.flush();
    expect(insert).not.toHaveBeenCalled();
    insert.mockImplementation(async (p) => saved(p.id, p.barcode!));
    await q.retry('id1');
    await q.flush();
    expect(await q.list()).toEqual([]);
  });

  it('can discard an item that needs attention', async () => {
    await q.enqueue(np('1'), 'id1', 'e');
    insert.mockRejectedValueOnce(new ApiError('validation', 'bad'));
    await q.flush();
    await q.discard('id1');
    expect(await q.list()).toEqual([]);
  });

  it('knows which barcodes are already queued (double-tap guard)', async () => {
    await q.enqueue(np('1'), 'id1', 'e');
    expect(await q.isQueued('1')).toBe(true);
    expect(await q.isQueued('2')).toBe(false);
  });

  it('treats a request that never answers as a network failure', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }); // leave setImmediate to fake-indexeddb
    try {
      await q.enqueue(np('1'), 'id1', 'e');
      insert.mockReturnValue(new Promise(() => {}));
      const done = q.flush();
      await vi.advanceTimersByTimeAsync(q.INSERT_TIMEOUT_MS + 1);
      await done;
      const [item] = await q.list();
      expect(item.status).toBe('pending');
      expect(item.attempts).toBe(1);
    } finally { vi.useRealTimers(); }
  });

  it('runs a single flush at a time', async () => {
    await q.enqueue(np('1'), 'id1', 'e');
    insert.mockImplementation(async (p) => saved(p.id, p.barcode!));
    await Promise.all([q.flush(), q.flush(), q.flush()]);
    expect(insert).toHaveBeenCalledTimes(1);
  });
});
