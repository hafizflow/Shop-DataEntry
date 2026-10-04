import { useState } from 'react';
import { CircleCheck, CloudUpload, Download, LogOut, RefreshCw, ShieldCheck, TriangleAlert, UserRound } from 'lucide-react';
import { useAuth } from '../../auth/AuthProvider';
import { Bi } from '../../components/Bi';
import { toast } from '../../components/Toast';
import { fetchAllForExport, queue, sync } from '../../data/productRepo';
import { errorKey, mapError } from '../../data/errors';
import { buildCsv } from '../../lib/csv';
import { dhakaDayKey } from '../../lib/format';
import { tt } from '../../lib/i18n';
import { useQueueItems } from '../shared/hooks';

export function AccountScreen() {
  const { user, isOwner, signOut } = useAuth();
  const items = useQueueItems();
  const pending = items.length;
  const attention = items.filter((i) => i.status === 'attention');
  const [exporting, setExporting] = useState(false);
  const [syncing, setSyncing] = useState(false);

  async function exportData(format: 'csv' | 'json') {
    setExporting(true);
    try {
      const products = await fetchAllForExport();
      const [body, type] = format === 'csv'
        ? [buildCsv(products), 'text/csv;charset=utf-8']
        : [JSON.stringify(products, null, 2), 'application/json;charset=utf-8'];
      const url = URL.createObjectURL(new Blob([body], { type }));
      const a = document.createElement('a');
      a.href = url; a.download = `products-${dhakaDayKey(new Date())}.${format}`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) { toast(tt(errorKey(mapError(e).kind)), 'error'); }
    setExporting(false);
  }

  async function syncNow() {
    setSyncing(true);
    await Promise.allSettled([queue.flush(), sync()]);
    setSyncing(false);
  }

  return (
    <div className="flex flex-col gap-4 px-4 pb-6 pt-1">
      <div className="card flex items-center gap-4">
        <span className="grid size-14 shrink-0 place-items-center rounded-full bg-accent-soft text-accent"><UserRound className="size-7" aria-hidden /></span>
        <div className="min-w-0">
          <p className="truncate font-bold">{user?.email}</p>
          <p className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-bold text-accent">
            <ShieldCheck className="size-3.5" aria-hidden /><Bi k={isOwner ? 'account.role.owner' : 'account.role.employee'} />
          </p>
        </div>
      </div>

      <div className="card flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <span className={`grid size-11 shrink-0 place-items-center rounded-2xl ${pending ? 'bg-warn-soft text-warn' : 'bg-accent-soft text-accent'}`}>
            {pending ? <CloudUpload className="size-6" aria-hidden /> : <CircleCheck className="size-6" aria-hidden />}
          </span>
          <p className="font-semibold"><Bi k={pending ? 'account.pending' : 'account.allSynced'} vars={{ n: pending }} /></p>
        </div>
        <button className="btn btn-secondary" disabled={syncing} onClick={() => void syncNow()}>
          <RefreshCw className={`size-5 ${syncing ? 'animate-spin' : ''}`} aria-hidden /><Bi k="account.syncNow" />
        </button>
      </div>

      {attention.length > 0 && (
        <div className="card flex flex-col gap-3 border-danger/40" role="alert">
          <p className="flex items-center gap-2 font-bold text-danger"><TriangleAlert className="size-5" aria-hidden /><Bi k="account.attention" /></p>
          {attention.map((i) => (
            <div key={i.id} className="flex flex-col gap-2 border-t border-line pt-3">
              <p><span className="font-semibold">{i.product.name}</span> <span className="font-mono text-sm text-muted">{i.product.barcode}</span></p>
              <p className="text-sm text-muted">{i.error}</p>
              <div className="grid grid-cols-2 gap-2">
                <button className="btn btn-secondary" onClick={() => void queue.retry(i.id)}><Bi k="account.retry" /></button>
                <button className="btn btn-secondary" onClick={() => void queue.discard(i.id)}><Bi k="account.discard" /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {isOwner && (
        <div className="grid grid-cols-2 gap-2">
          <button className="btn btn-secondary" disabled={exporting} onClick={() => void exportData('csv')}>
            <Download className="size-5" aria-hidden /><Bi k={exporting ? 'account.exporting' : 'account.export'} />
          </button>
          <button className="btn btn-secondary" disabled={exporting} onClick={() => void exportData('json')}>
            <Download className="size-5" aria-hidden /><Bi k={exporting ? 'account.exporting' : 'account.exportJson'} />
          </button>
        </div>
      )}

      {/* The queue is not tied to a user, so sign-out waits until everything has synced. */}
      <button className="btn btn-primary" disabled={pending > 0} onClick={() => void signOut()}>
        <LogOut className="size-5" aria-hidden /><Bi k="account.signOut" />
      </button>
      {pending > 0 && <p className="px-1 text-sm text-muted"><Bi k="account.signOutBlocked" /></p>}
    </div>
  );
}
