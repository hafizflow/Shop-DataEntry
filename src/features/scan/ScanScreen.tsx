import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CircleCheck, Loader, PackagePlus } from 'lucide-react';
import { useAuth } from '../../auth/AuthProvider';
import { BottomSheet } from '../../components/BottomSheet';
import { ProductDetails } from '../../components/ProductDetails';
import { toast } from '../../components/Toast';
import { lookup, remove } from '../../data/productRepo';
import { errorKey, mapError } from '../../data/errors';
import type { Product } from '../../data/types';
import { normalizeBarcode } from '../../lib/barcode';
import { dhakaDayKey, formatPrice } from '../../lib/format';
import { tt } from '../../lib/i18n';
import { Bi } from '../../components/Bi';
import { primeAudio } from '../../scanner/feedback';
import { useKeyboardScanner } from '../../scanner/useKeyboardScanner';
import { useProducts } from '../shared/hooks';
import { ManualEntry } from './ManualEntry';
import { ProductSheet } from './ProductSheet';
import { ScannerView } from './ScannerView';

type View =
  | { kind: 'scan' }
  | { kind: 'busy'; code: string }
  | { kind: 'existing'; product: Product }
  | { kind: 'new'; code: string | null; offline: boolean }
  | { kind: 'edit'; product: Product };

const RESCAN_COOLDOWN_MS = 2000;

export function ScanScreen() {
  const { user, isOwner } = useAuth();
  const products = useProducts();
  const [view, setView] = useState<View>({ kind: 'scan' });
  const scanning = view.kind === 'scan';
  const recent = useRef<{ code: string; at: number } | null>(null);

  useEffect(() => {
    const prime = () => primeAudio();
    window.addEventListener('pointerdown', prime, { once: true });
    return () => window.removeEventListener('pointerdown', prime);
  }, []);

  const handleCode = useCallback(async (raw: string) => {
    const code = normalizeBarcode(raw);
    if (!code) return;
    setView({ kind: 'busy', code });
    try {
      const r = await lookup(code);
      setView(r.product ? { kind: 'existing', product: r.product } : { kind: 'new', code, offline: r.offline });
    } catch (e) {
      console.error('Barcode lookup failed:', e);
      toast(tt(errorKey(mapError(e).kind)), 'error');
      setView({ kind: 'scan' });
    }
  }, []);

  // Camera scans only: after closing a sheet the same item is usually still in front of the lens.
  const onCameraCode = useCallback((code: string) => {
    const now = Date.now();
    if (recent.current?.code === code && now - recent.current.at < RESCAN_COOLDOWN_MS) return;
    recent.current = { code, at: now };
    void handleCode(code);
  }, [handleCode]);

  useKeyboardScanner(handleCode, scanning);
  const resume = useCallback(() => {
    if (recent.current) recent.current.at = Date.now();
    setView({ kind: 'scan' });
  }, []);
  const mine = useMemo(() => {
    if (!user) return [];
    const today = dhakaDayKey(new Date());
    return products
      .filter((p) => p.created_by === user.id && dhakaDayKey(p.created_at) === today)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }, [products, user]);
  const saved = (name: string) => { toast(tt('save.success', { name }), 'success'); resume(); };

  return (
    <div className="flex flex-col gap-4 px-4 pb-6 pt-1">
      <ScannerView enabled={scanning} onDetect={onCameraCode} />

      <div className="card flex items-center gap-4">
        <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-accent-soft text-accent">
          {view.kind === 'busy' ? <Loader className="size-6 animate-spin" aria-hidden /> : <CircleCheck className="size-6" aria-hidden />}
        </span>
        <p className="min-w-0 flex-1 text-sm font-semibold text-muted" aria-live="polite">
          {view.kind === 'busy' ? <Bi k="scan.looking" vars={{ code: view.code }} /> : <Bi k="scan.addedToday" vars={{ n: mine.length }} />}
        </p>
        <span className="text-3xl font-bold text-accent" aria-hidden>{mine.length}</span>
      </div>

      <ManualEntry onSubmit={handleCode} disabled={!scanning} />
      <button className="btn btn-secondary" disabled={!scanning} onClick={() => setView({ kind: 'new', code: null, offline: !navigator.onLine })}>
        <PackagePlus className="size-5" aria-hidden /><Bi k="scan.noBarcode" />
      </button>

      <section aria-labelledby="recent-title" className="flex flex-col gap-2">
        <h2 id="recent-title" className="px-1 text-sm font-bold"><Bi k="scan.recent" /></h2>
        {mine.length === 0 && <p className="px-1 text-sm text-muted"><Bi k="scan.recent.empty" /></p>}
        <ul className="flex flex-col gap-2">
          {mine.slice(0, 3).map((p) => (
            <li key={p.id} className="card flex items-center justify-between gap-3 py-3">
              <span className="min-w-0"><span className="block truncate font-semibold">{p.name}</span><span className="block truncate text-xs text-muted">{p.company}</span></span>
              <span className="shrink-0 font-bold text-accent">৳ {formatPrice(p.selling_price)}</span>
            </li>
          ))}
        </ul>
      </section>

      {view.kind === 'existing' && (
        <BottomSheet title={tt('product.already')} onClose={resume}>
          <ProductDetails
            product={view.product} showAlready
            onEdit={isOwner ? () => setView({ kind: 'edit', product: view.product }) : undefined}
            onDelete={isOwner ? async () => {
              try {
                await remove(view.product.id);
                toast(tt('product.deleted', { name: view.product.name }), 'success');
                resume();
              } catch (e) { toast(tt(errorKey(mapError(e).kind)), 'error'); }
            } : undefined}
          />
          <button className="btn btn-primary mt-3 w-full" onClick={resume}><Bi k="product.close" /></button>
        </BottomSheet>
      )}
      {view.kind === 'new' && (
        <ProductSheet mode="create" barcode={view.code} offline={view.offline} onClose={resume} onSaved={saved} />
      )}
      {view.kind === 'edit' && (
        <ProductSheet mode="edit" barcode={view.product.barcode} initial={view.product} onClose={resume} onSaved={saved} />
      )}
    </div>
  );
}
