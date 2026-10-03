import { describe, expect, it } from 'vitest';
import { buildCsv } from './csv';
import type { Product } from '../data/types';

const p = (over: Partial<Product>): Product => ({
  id: '1', barcode: '123', name: 'Rice', unit: 'kg', selling_price: 10, company: 'Pran',
  created_at: '2026-10-03T19:49:00Z', created_by: 'u', updated_at: null, created_by_email: 'a@b.c', ...over,
});

describe('buildCsv', () => {
  it('writes header and rows with BOM', () => {
    const csv = buildCsv([p({})]);
    expect(csv.startsWith('﻿barcode,name,unit,selling_price,company,added_by,created_at')).toBe(true);
    expect(csv).toContain('123,Rice,kg,10.00,Pran,a@b.c,"4 Oct 2026, 1:49 AM"'); // date has a comma, so it is quoted
  });
  it('quotes commas, quotes and newlines', () => {
    expect(buildCsv([p({ name: 'Salt, "fine"\nbag' })])).toContain('"Salt, ""fine""\nbag"');
  });
  it('neutralises spreadsheet formulas', () => {
    expect(buildCsv([p({ name: '=SUM(A1)' })])).toContain("'=SUM(A1)");
  });
});
