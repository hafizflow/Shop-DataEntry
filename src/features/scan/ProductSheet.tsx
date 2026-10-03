import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Barcode, Check, PackagePlus, Pencil, WifiOff } from 'lucide-react';
import { BottomSheet } from '../../components/BottomSheet';
import { Bi } from '../../components/Bi';
import { useAuth } from '../../auth/AuthProvider';
import { useProducts } from '../shared/hooks';
import { distinctCompanies, save, update } from '../../data/productRepo';
import { errorKey, mapError } from '../../data/errors';
import { UNITS, type Product, type Unit } from '../../data/types';
import { validateForm, type FieldErrors } from '../../lib/validate';
import { tt, useT, type MessageKey } from '../../lib/i18n';

interface Props {
  mode: 'create' | 'edit';
  barcode: string | null;
  initial?: Product;
  offline?: boolean;
  onClose(): void;
  onSaved(name: string): void;
}

function Field({ id, label, error, children }: { id: string; label: MessageKey; error?: MessageKey; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold"><Bi k={label} /></label>
      {children}
      {error && <p id={`${id}-err`} className="text-sm font-semibold text-danger"><Bi k={error} /></p>}
    </div>
  );
}

export function ProductSheet({ mode, barcode, initial, offline, onClose, onSaved }: Props) {
  const { user } = useAuth();
  const t2 = useT();
  const products = useProducts();
  const companies = useMemo(() => distinctCompanies(products), [products]);
  const [name, setName] = useState(initial?.name ?? '');
  const [unit, setUnit] = useState<Unit>(initial?.unit ?? 'pcs');
  const [price, setPrice] = useState(initial ? String(initial.selling_price) : '');
  const [company, setCompany] = useState(initial?.company ?? '');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<MessageKey | null>(null);
  const [busy, setBusy] = useState(false);

  // Company suggestions: tap instead of typing, which also avoids spelling variants.
  const q = company.trim().toLowerCase();
  const suggestions = useMemo(
    () => companies.filter((c) => (q ? c.toLowerCase().includes(q) && c.toLowerCase() !== q : true)).slice(0, 6),
    [companies, q],
  );
  const snapCompany = () => {
    const hit = companies.find((c) => c.toLowerCase() === company.trim().toLowerCase());
    if (hit) setCompany(hit);
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy || !user) return;
    const v = validateForm({ barcode, name, unit, price, company });
    if (!v.ok) { setErrors(v.errors); return; }
    setErrors({}); setFormError(null); setBusy(true);
    try {
      if (mode === 'create') {
        const r = await save(v.value, user);
        if (r.status === 'duplicate-product') { setFormError('err.duplicateProduct'); setBusy(false); return; }
        if (r.status === 'duplicate-pending') { setFormError('save.queuedDuplicate'); setBusy(false); return; }
      } else {
        const { name: n, unit: u, selling_price, company: c } = v.value;
        await update(initial!.id, { name: n, unit: u, selling_price, company: c });
      }
      onSaved(v.value.name);
    } catch (err) {
      setFormError(errorKey(mapError(err).kind));
      setBusy(false);
    }
  }

  const invalid = (k: keyof FieldErrors) => (errors[k] ? { 'aria-invalid': true, 'aria-describedby': `${k}-err` } : {});
  const titleKey: MessageKey = mode === 'create' ? 'form.new.title' : 'form.edit.title';
  const TitleIcon = mode === 'create' ? PackagePlus : Pencil;

  return (
    <BottomSheet title={tt(titleKey)} onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-4 pb-0" noValidate>
        <div className="flex items-center gap-3 pr-12">
          <span className="grid size-11 place-items-center rounded-2xl bg-accent-soft text-accent"><TitleIcon className="size-6" aria-hidden /></span>
          <h2 className="text-xl font-bold"><Bi k={titleKey} /></h2>
        </div>

        {offline && (
          <p className="flex items-center gap-2.5 rounded-2xl bg-warn-soft px-4 py-3 text-sm font-semibold text-warn">
            <WifiOff className="size-5 shrink-0" aria-hidden /><span><Bi k="scan.offlineNew" /></span>
          </p>
        )}

        <Field id="barcode" label="form.barcode">
          <span className="relative">
            <Barcode className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted" aria-hidden />
            <input id="barcode" className="input bg-surface-2 pl-12 font-mono font-semibold" value={barcode ?? t2('product.noBarcode')} readOnly />
          </span>
        </Field>

        <Field id="name" label="form.name" error={errors.name}>
          <input id="name" className="input" autoFocus autoComplete="off" value={name} onChange={(e) => setName(e.target.value)} {...invalid('name')} />
        </Field>

        <Field id="price" label="form.price" error={errors.price}>
          <span className="relative">
            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-lg font-bold text-muted" aria-hidden>৳</span>
            <input id="price" className="input h-14 pl-10 text-xl font-bold" inputMode="decimal" autoComplete="off" placeholder="0.00" value={price} onChange={(e) => setPrice(e.target.value)} {...invalid('price')} />
          </span>
        </Field>

        <div className="flex flex-col gap-1.5">
          <span id="unit-label" className="text-sm font-semibold"><Bi k="form.unit" /></span>
          <div role="radiogroup" aria-labelledby="unit-label" className="grid grid-cols-4 gap-2">
            {UNITS.map((u) => {
              const on = u === unit;
              return (
                <button
                  key={u} type="button" role="radio" aria-checked={on} onClick={() => setUnit(u)}
                  className={`min-h-12 rounded-2xl border-2 px-1 text-base font-bold transition-colors active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${on ? 'border-accent bg-accent text-accent-fg shadow-sm' : 'border-line bg-surface text-fg'}`}
                >{u === 'g' ? 'gram' : u}</button>
              );
            })}
          </div>
          <p className="px-1 text-xs font-medium text-muted" aria-live="polite">{t2(`unit.${unit}`)}</p>
        </div>

        <Field id="company" label="form.company" error={errors.company}>
          <input id="company" className="input" list="companies" autoComplete="off" value={company}
            onChange={(e) => setCompany(e.target.value)} onBlur={snapCompany} {...invalid('company')} />
          <datalist id="companies">{companies.map((c) => <option key={c} value={c} />)}</datalist>
          {suggestions.length > 0 && (
            <div className="flex flex-wrap gap-2" role="group" aria-label={t2('form.company.pick')}>
              {suggestions.map((c) => (
                <button key={c} type="button" className="chip min-h-10 border border-line active:bg-accent-soft" onClick={() => setCompany(c)}>{c}</button>
              ))}
            </div>
          )}
        </Field>

        {formError && (
          <p role="alert" className="rounded-2xl bg-danger-soft px-4 py-3 text-sm font-semibold text-danger"><Bi k={formError} /></p>
        )}

        <div className="sticky bottom-0 -mx-4 grid grid-cols-[1fr_2fr] gap-3 border-t border-line bg-bg px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
          <button type="button" className="btn btn-secondary" onClick={onClose}><Bi k="form.cancel" /></button>
          <button className="btn btn-primary" disabled={busy}>
            <Check className="size-5" aria-hidden /><Bi k={busy ? 'form.saving' : 'form.save'} />
          </button>
        </div>
      </form>
    </BottomSheet>
  );
}
