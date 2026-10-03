export const normalizeBarcode = (s: string) => s.trim();

/** A UPC-A code (12 digits) is an EAN-13 with a leading 0; scanners report either form. */
export function barcodeVariants(code: string): string[] {
  const c = normalizeBarcode(code);
  if (/^\d{12}$/.test(c)) return [c, `0${c}`];
  if (/^0\d{12}$/.test(c)) return [c, c.slice(1)];
  return [c];
}
