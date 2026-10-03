import { describe, expect, it } from 'vitest';
import { barcodeVariants, normalizeBarcode } from './barcode';

describe('barcode', () => {
  it('trims', () => expect(normalizeBarcode('  890123 \n')).toBe('890123'));
  it('offers EAN-13 form for a UPC-A code and vice versa', () => {
    expect(barcodeVariants('036000291452')).toEqual(['036000291452', '0036000291452']);
    expect(barcodeVariants('0036000291452')).toEqual(['0036000291452', '036000291452']);
  });
  it('has no variants for other codes', () => {
    expect(barcodeVariants('8901234567890')).toEqual(['8901234567890']);
    expect(barcodeVariants('ABC-123')).toEqual(['ABC-123']);
  });
});
