import type { Product } from '../data/types';
import { formatDhaka, formatPrice } from './format';

function cell(v: string): string {
  const safe = /^[=+\-@]/.test(v) ? `'${v}` : v; // stop spreadsheet formula injection
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function buildCsv(products: Product[]): string {
  const header = 'barcode,name,unit,selling_price,company,added_by,created_at';
  const rows = products.map((p) => [
    p.barcode ?? '', p.name, p.unit, formatPrice(p.selling_price).replace(/,/g, ''),
    p.company, p.created_by_email ?? '', formatDhaka(p.created_at),
  ].map(cell).join(','));
  return '﻿' + [header, ...rows].join('\r\n');
}
