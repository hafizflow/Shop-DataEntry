import wasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url';
import { BarcodeDetector, prepareZXingModule } from 'barcode-detector/ponyfill';

// Serve the WASM from our own origin (bundled and precached by the service worker) instead of the
// default CDN, so scanning also works offline.
prepareZXingModule({
  overrides: {
    locateFile: (path: string, prefix: string) => (path.endsWith('.wasm') ? wasmUrl : prefix + path),
  },
  fireImmediately: false,
});

export { BarcodeDetector };
