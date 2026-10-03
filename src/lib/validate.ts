import { UNITS, type NewProduct, type Unit } from '../data/types';
import type { MessageKey } from './i18n';
import { normalizeBarcode } from './barcode';

export interface FormInput { barcode: string | null; name: string; unit: string; price: string; company: string }
export type FieldErrors = Partial<Record<'name' | 'unit' | 'price' | 'company', MessageKey>>;

/** Trim and collapse inner whitespace, so "Basmati  Rice " and "Basmati Rice" are the same product. */
const collapse = (s: string) => s.trim().replace(/\s+/g, ' ');

/** Accepts 45, 45.5, 45.50, .5 and a single decimal comma (12,50). Max 10 integer digits (numeric(12,2)). */
export function parsePrice(input: string): number | null {
  let s = input.trim();
  if (/^\d*,\d{1,2}$/.test(s)) s = s.replace(',', '.');
  if (!/^(\d{1,10}(\.\d{1,2})?|\.\d{1,2})$/.test(s)) return null;
  return Number(s);
}

export function validateForm(i: FormInput):
  { ok: true; value: NewProduct } | { ok: false; errors: FieldErrors } {
  const errors: FieldErrors = {};
  const barcode = normalizeBarcode(i.barcode ?? '') || null; // empty = product without a barcode
  const name = collapse(i.name);
  const company = collapse(i.company);
  const price = parsePrice(i.price);
  if (!name) errors.name = 'err.name.required';
  if (!(UNITS as readonly string[]).includes(i.unit)) errors.unit = 'err.unit.invalid';
  if (price === null) errors.price = 'err.price.invalid';
  if (!company) errors.company = 'err.company.required';
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: { barcode, name, unit: i.unit as Unit, selling_price: price!, company } };
}
