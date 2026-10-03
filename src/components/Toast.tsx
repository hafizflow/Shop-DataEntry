import { useEffect, useState } from 'react';
import { CircleCheck, Info, TriangleAlert, type LucideIcon } from 'lucide-react';
import { createEmitter } from '../lib/emitter';

type Kind = 'success' | 'error' | 'info';
interface ToastMsg { id: number; message: string; kind: Kind }
const bus = createEmitter<ToastMsg>();
let seq = 0;
export const toast = (message: string, kind: Kind = 'info') => bus.emit({ id: ++seq, message, kind });

const STYLE: Record<Kind, { box: string; Icon: LucideIcon }> = {
  success: { box: 'bg-accent text-accent-fg', Icon: CircleCheck },
  error: { box: 'bg-danger text-white', Icon: TriangleAlert },
  info: { box: 'bg-fg text-bg', Icon: Info },
};

export function Toaster() {
  const [items, setItems] = useState<ToastMsg[]>([]);
  useEffect(() => bus.on((m) => {
    setItems((x) => [...x.slice(-2), m]);
    window.setTimeout(() => setItems((x) => x.filter((i) => i.id !== m.id)), 3800);
  }), []);
  return (
    <div className="pointer-events-none fixed inset-x-0 top-[max(0.75rem,env(safe-area-inset-top))] z-50 flex flex-col items-center gap-2 px-4" role="status" aria-live="polite">
      {items.map(({ id, message, kind }) => {
        const { box, Icon } = STYLE[kind];
        return (
          <div key={id} className={`toast-enter flex max-w-md items-center gap-2.5 rounded-2xl px-4 py-3 text-sm font-semibold shadow-xl ${box}`}>
            <Icon className="size-5 shrink-0" aria-hidden />
            <span>{message}</span>
          </div>
        );
      })}
    </div>
  );
}
