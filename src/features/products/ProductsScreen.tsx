import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronRight, PackageSearch, Search, X } from 'lucide-react';
import { useAuth } from '../../auth/AuthProvider';
import { Bi } from '../../components/Bi';
import { BottomSheet } from '../../components/BottomSheet';
import { ProductDetails } from '../../components/ProductDetails';
import { toast } from '../../components/Toast';
import { remove, searchProducts } from '../../data/productRepo';
import { errorKey, mapError } from '../../data/errors';
import type { Product } from '../../data/types';
import { formatPrice } from '../../lib/format';
import { tt, useT } from '../../lib/i18n';
import { ProductSheet } from '../scan/ProductSheet';
import { useProducts } from '../shared/hooks';

const STEP = 40;

export function ProductsScreen() {
  const { isOwner } = useAuth();
  const t2 = useT();
  const all = useProducts();
  const [query, setQuery] = useState('');
  const deferred = useDeferredValue(query);
  const results = useMemo(() => searchProducts(all, deferred), [all, deferred]);
  const [shown, setShown] = useState(STEP);
  const [open, setOpen] = useState<Product | null>(null);
  const [editing, setEditing] = useState<Product | null>(null);
  const sentinel = useRef<HTMLLIElement>(null);

  async function removeProduct(p: Product) {
    try {
      await remove(p.id);
      toast(tt('product.deleted', { name: p.name }), 'success');
      setOpen(null);
    } catch (e) {
      toast(tt(errorKey(mapError(e).kind)), 'error');
    }
  }

  useEffect(() => setShown(STEP), [deferred]);
  // Infinite scroll: reveal more rows as the sentinel nears the viewport.
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver((e) => { if (e[0].isIntersecting) setShown((n) => n + STEP); }, { rootMargin: '300px' });
    io.observe(el);
    return () => io.disconnect();
  }, [results.length, shown]);

  return (
    <div className="flex flex-col gap-3 px-4 pb-6">
      <div className="sticky top-0 z-10 -mx-4 bg-bg/95 px-4 pb-2 pt-1 backdrop-blur">
        <label className="sr-only" htmlFor="search">{t2('products.search')}</label>
        <span className="relative block">
          <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted" aria-hidden />
          <input id="search" type="search" className="input pl-12 pr-12 [&::-webkit-search-cancel-button]:hidden" placeholder={t2('products.search')} value={query} onChange={(e) => setQuery(e.target.value)} />
          {query && (
            <button type="button" aria-label={t2('products.clear')} onClick={() => setQuery('')}
              className="absolute right-1 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-full text-muted focus-visible:outline-2 focus-visible:outline-accent">
              <X className="size-5" aria-hidden />
            </button>
          )}
        </span>
        <p className="mt-1.5 px-1 text-xs font-medium text-muted"><Bi k="products.count" vars={{ n: results.length }} /></p>
      </div>

      {results.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-16 text-center text-muted">
          <PackageSearch className="size-12" aria-hidden />
          <p className="font-medium"><Bi k="products.empty" /></p>
        </div>
      )}

      <ul className="flex flex-col gap-2">
        {results.slice(0, shown).map((p) => (
          <li key={p.id}>
            <button
              className="card flex min-h-16 w-full items-center gap-3 p-3 text-left transition-colors active:bg-surface-2 focus-visible:outline-2 focus-visible:outline-accent"
              onClick={() => setOpen(p)}
            >
              <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-accent-soft text-lg font-bold uppercase text-accent" aria-hidden>
                {p.name.trim().charAt(0)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{p.name}</span>
                <span className="block truncate text-sm text-muted">{p.company} · <span className="font-mono">{p.barcode ?? t2('product.noBarcode')}</span></span>
                {p.pending && <span className="mt-0.5 inline-block rounded-full bg-warn-soft px-2 text-xs font-bold text-warn"><Bi k="products.syncing" /></span>}
              </span>
              <span className="shrink-0 text-right">
                <span className="block font-bold text-accent">৳ {formatPrice(p.selling_price)}</span>
                <span className="block text-xs text-muted">{t2(`unit.${p.unit}`)}</span>
              </span>
              <ChevronRight className="size-5 shrink-0 text-muted" aria-hidden />
            </button>
          </li>
        ))}
        <li ref={sentinel} aria-hidden />
      </ul>

      {open && !editing && (
        <BottomSheet title={open.name} onClose={() => setOpen(null)}>
          <div className="pb-[max(1rem,env(safe-area-inset-bottom))]">
            <ProductDetails
              product={open}
              onEdit={() => setEditing(open)}
              onDelete={isOwner ? async () => { await removeProduct(open); } : undefined}
            />
            <button className="btn btn-primary mt-3 w-full" onClick={() => setOpen(null)}><Bi k="product.close" /></button>
          </div>
        </BottomSheet>
      )}
      {editing && (
        <ProductSheet
          mode="edit" barcode={editing.barcode} initial={editing} onClose={() => setEditing(null)}
          onSaved={(name) => { toast(tt('save.success', { name }), 'success'); setEditing(null); setOpen(null); }}
        />
      )}
    </div>
  );
}
