import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { useT } from '../lib/i18n';

export function BottomSheet({ title, onClose, children }: { title: string; onClose(): void; children: ReactNode }) {
  const tt = useT();
  const dialog = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  // Runs once: parents pass inline callbacks, and re-running would steal focus from the form.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    if (!dialog.current?.contains(document.activeElement)) dialog.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeRef.current(); };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); previous?.focus?.(); };
  }, []);

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/55 backdrop-blur-[2px]" aria-hidden />
      <div
        ref={dialog} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="sheet-enter relative max-h-[92dvh] w-full max-w-xl overflow-y-auto rounded-t-[2rem] bg-bg px-4 pt-3 shadow-2xl outline-none"
      >
        <div className="mx-auto mb-2 h-1.5 w-10 rounded-full bg-line" aria-hidden />
        <button
          type="button" onClick={onClose} aria-label={tt('product.close.aria')}
          className="absolute right-3 top-3 grid size-11 place-items-center rounded-full text-muted hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-accent"
        >
          <X className="size-5" aria-hidden />
        </button>
        {children}
      </div>
    </div>
  );
}
