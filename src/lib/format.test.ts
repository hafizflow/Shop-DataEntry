import { describe, expect, it } from 'vitest';
import { dhakaDayKey, formatDhaka, formatPrice } from './format';

describe('format', () => {
  it('formats in Asia/Dhaka', () => {
    expect(formatDhaka('2026-10-03T19:49:00Z')).toBe('4 Oct 2026, 1:49 AM');
    expect(formatDhaka('2026-10-04T08:05:00Z')).toBe('4 Oct 2026, 2:05 PM');
  });
  it('uses the Dhaka calendar day, not UTC (day boundary)', () => {
    expect(dhakaDayKey('2026-10-03T23:30:00Z')).toBe('2026-10-04');
    expect(dhakaDayKey('2026-10-03T17:59:00Z')).toBe('2026-10-03');
  });
  it('formats price with 2 decimals', () => {
    expect(formatPrice(45)).toBe('45.00');
    expect(formatPrice(1234.5)).toBe('1,234.50');
  });
});
