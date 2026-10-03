export const SCAN_FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39'] as const;

export interface Detector { detect(source: CanvasImageSource): Promise<{ rawValue: string }[]> }
type NativeCtor = (new (opts: { formats: string[] }) => Detector) & { getSupportedFormats(): Promise<string[]> };

let cached: Promise<Detector> | null = null;

/** Native BarcodeDetector when it supports all our formats, otherwise the ZXing WASM ponyfill (lazy chunk). */
export function getDetector(): Promise<Detector> {
  return (cached ??= create().catch((e) => { cached = null; throw e; }));
}

async function create(): Promise<Detector> {
  const Native = (globalThis as { BarcodeDetector?: NativeCtor }).BarcodeDetector;
  if (Native) {
    try {
      const supported = await Native.getSupportedFormats();
      if (SCAN_FORMATS.every((f) => supported.includes(f))) return new Native({ formats: [...SCAN_FORMATS] });
    } catch { /* fall through to the ponyfill */ }
  }
  const { BarcodeDetector } = await import('./zxing');
  return new BarcodeDetector({ formats: [...SCAN_FORMATS] }) as unknown as Detector;
}
