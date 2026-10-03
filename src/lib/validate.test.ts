import { describe, expect, it } from 'vitest';
import { parsePrice, validateForm } from './validate';

describe('parsePrice', () => {
  it.each([['45', 45], ['45.5', 45.5], ['45.50', 45.5], ['0', 0], [' 12,50 ', 12.5], ['.5', 0.5]])(
    'accepts %s', (input, out) => expect(parsePrice(input)).toBe(out));
  it.each(['', 'abc', '-1', '12.505', '1e3', '1,234.50', '12..5', '99999999999', 'Infinity'])(
    'rejects %s', (input) => expect(parsePrice(input)).toBeNull());
});

describe('validateForm', () => {
  const ok = { barcode: ' 123 ', name: '  Basmati Rice ', unit: 'kg', price: '120', company: ' Pran ' };
  it('trims and converts', () => {
    expect(validateForm(ok)).toEqual({
      ok: true,
      value: { barcode: '123', name: 'Basmati Rice', unit: 'kg', selling_price: 120, company: 'Pran' },
    });
  });
  it('collapses inner whitespace in name and company', () => {
    const r = validateForm({ ...ok, name: 'Basmati   Rice', company: ' Pran   Foods ' });
    expect(r.ok && [r.value.name, r.value.company]).toEqual(['Basmati Rice', 'Pran Foods']);
  });
  it('treats a blank barcode as no barcode', () => {
    const r = validateForm({ ...ok, barcode: '  ' });
    expect(r.ok && r.value.barcode).toBeNull();
  });
  it('reports each bad field', () => {
    const r = validateForm({ barcode: '', name: ' ', unit: 'tonne', price: 'x', company: '' });
    expect(r).toEqual({
      ok: false,
      errors: {
        name: 'err.name.required', unit: 'err.unit.invalid',
        price: 'err.price.invalid', company: 'err.company.required',
      },
    });
  });
});
