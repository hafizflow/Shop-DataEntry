import { Barcode, Clock, Pencil, Trash2, TriangleAlert, UserRound, type LucideIcon } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import type { Product } from '../data/types';
import { formatDhaka, formatPrice } from '../lib/format';
import type { MessageKey } from '../lib/i18n';
import { useT } from '../lib/i18n';
import { Bi } from './Bi';

function Row({ Icon, label, children }: { Icon: LucideIcon; label: MessageKey; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-2.5">
      <Icon className="mt-0.5 size-5 shrink-0 text-muted" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-muted"><Bi k={label} /></p>
        <p className="break-words font-semibold">{children}</p>
      </div>
    </div>
  );
}

interface Props {
  product: Product;
  showAlready?: boolean;
  onEdit?: () => void;
  /** owner only; asks to confirm, then resolves when the product is gone */
  onDelete?: () => Promise<void>;
}

export function ProductDetails({ product: p, showAlready, onEdit, onDelete }: Props) {
  const tt = useT();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  async function del() {
    setBusy(true);
    try { await onDelete!(); } finally { setBusy(false); setConfirming(false); }
  }
  return (
    <div className="flex flex-col gap-3">
      {showAlready && (
        <div role="alert" className="flex items-center gap-3 rounded-2xl bg-warn-soft px-4 py-3 pr-14 font-bold text-warn">
          <TriangleAlert className="size-6 shrink-0" aria-hidden />
          <span><Bi k="product.already" /></span>
        </div>
      )}
      <div className="card">
        <h2 className="text-xl font-bold leading-snug">{p.name}</h2>
        <p className="text-muted">{p.company}</p>
        <p className="mt-3 flex items-baseline gap-2">
          <span className="text-3xl font-bold text-accent">৳ {formatPrice(p.selling_price)}</span>
          <span className="chip">{tt(`unit.${p.unit}`)}</span>
        </p>
        <div className="mt-3 divide-y divide-line border-t border-line">
          <Row Icon={Barcode} label="product.barcode"><span className="font-mono">{p.barcode ?? tt('product.noBarcode')}</span></Row>
          <Row Icon={UserRound} label="product.addedByLabel">{p.created_by_email ?? tt('product.unknownUser')}</Row>
          <Row Icon={Clock} label="product.addedAt">{formatDhaka(p.created_at)}</Row>
        </div>
        {p.pending && <p className="mt-2 rounded-xl bg-warn-soft px-3 py-2 text-sm font-semibold text-warn"><Bi k="product.syncing" /></p>}
      </div>
      {onDelete && !p.pending && !confirming && (
        <button className="btn btn-secondary text-danger" onClick={() => setConfirming(true)}><Trash2 className="size-5" aria-hidden /><Bi k="product.delete" /></button>
      )}
      {onDelete && confirming && (
        <div role="alert" className="flex flex-col gap-3 rounded-2xl bg-danger-soft p-4">
          <p className="font-semibold text-danger"><Bi k="product.delete.confirm" vars={{ name: p.name }} /></p>
          <div className="grid grid-cols-2 gap-3">
            <button className="btn btn-secondary" disabled={busy} onClick={() => setConfirming(false)}><Bi k="form.cancel" /></button>
            <button className="btn bg-danger text-white" disabled={busy} onClick={() => void del()}><Bi k={busy ? 'product.delete.busy' : 'product.delete.yes'} /></button>
          </div>
        </div>
      )}
      {onEdit && !p.pending && <button className="btn btn-secondary" onClick={onEdit}><Pencil className="size-5" aria-hidden /><Bi k="product.edit" /></button>}
    </div>
  );
}
