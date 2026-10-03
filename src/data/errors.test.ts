import { describe, expect, it } from 'vitest';
import { mapError } from './errors';

describe('mapError', () => {
  it('maps duplicate barcode vs duplicate product by constraint name', () => {
    expect(mapError({ code: '23505', message: 'duplicate key value violates unique constraint "products_barcode_key"' }).kind).toBe('duplicate_barcode');
    expect(mapError({ code: '23505', message: 'duplicate key value violates unique constraint "products_name_company_unit_key"' }).kind).toBe('duplicate_product');
  });
  it('maps check violations and bad input to validation', () => {
    expect(mapError({ code: '23514', message: 'x' }).kind).toBe('validation');
    expect(mapError({ code: '22P02', message: 'x' }).kind).toBe('validation');
  });
  it('maps RLS denial to permission', () => {
    expect(mapError({ code: '42501', message: 'new row violates row-level security policy' }).kind).toBe('permission');
  });
  it('maps expired JWT to auth', () => {
    expect(mapError({ code: 'PGRST301', message: 'JWT expired' }).kind).toBe('auth');
    expect(mapError({ message: 'Invalid JWT', status: 401 }).kind).toBe('auth');
  });
  it('maps fetch failures to network', () => {
    expect(mapError(new TypeError('Failed to fetch')).kind).toBe('network');
    expect(mapError({ message: 'TypeError: Load failed' }).kind).toBe('network');
    expect(mapError({ message: 'NetworkError when attempting to fetch resource.' }).kind).toBe('network');
  });
  it('maps a missing table/function (schema not applied) to setup', () => {
    expect(mapError({ code: 'PGRST205', message: "Could not find the table 'public.products' in the schema cache" }).kind).toBe('setup');
    expect(mapError({ code: '42P01', message: 'relation "products" does not exist' }).kind).toBe('setup');
  });
  it('falls back to unknown and passes ApiError through', () => {
    expect(mapError({ code: 'XX000', message: 'boom' }).kind).toBe('unknown');
    const e = mapError({ code: '42501', message: 'x' });
    expect(mapError(e)).toBe(e);
  });
});
