import { CloudUpload, Wifi, WifiOff } from 'lucide-react';
import { queue } from '../data/productRepo';
import { useOnline, useQueueItems } from '../features/shared/hooks';
import { Bi } from './Bi';

/** Connection and sync state, always visible in the header. */
export function StatusPill() {
  const online = useOnline();
  const n = queue.visibleCount(useQueueItems());
  if (n > 0) {
    return (
      <span className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-warn-soft px-3 text-xs font-bold text-warn">
        <CloudUpload className="size-4" aria-hidden /><Bi k="badge.pending" vars={{ n }} />
      </span>
    );
  }
  return online ? (
    <span className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-accent-soft px-3 text-xs font-bold text-accent">
      <Wifi className="size-4" aria-hidden /><Bi k="status.online" />
    </span>
  ) : (
    <span className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-warn-soft px-3 text-xs font-bold text-warn">
      <WifiOff className="size-4" aria-hidden /><Bi k="status.offline" />
    </span>
  );
}
