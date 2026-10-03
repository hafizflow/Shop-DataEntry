import { Package, ScanBarcode, UserRound, type LucideIcon } from 'lucide-react';
import type { MessageKey } from '../lib/i18n';
import { Bi } from './Bi';

export type Tab = 'scan' | 'products' | 'account';
const TABS: { id: Tab; label: MessageKey; Icon: LucideIcon }[] = [
  { id: 'scan', label: 'tab.scan', Icon: ScanBarcode },
  { id: 'products', label: 'tab.products', Icon: Package },
  { id: 'account', label: 'tab.account', Icon: UserRound },
];

export function TabBar({ tab, onChange }: { tab: Tab; onChange(t: Tab): void }) {
  return (
    <nav className="grid grid-cols-3 border-t border-line bg-surface/95 px-2 pb-[env(safe-area-inset-bottom)] backdrop-blur" aria-label="Main">
      {TABS.map(({ id, label, Icon }) => {
        const active = tab === id;
        return (
          <button
            key={id} onClick={() => onChange(id)} aria-current={active ? 'page' : undefined}
            className={`flex min-h-16 flex-col items-center justify-center gap-1 rounded-2xl text-[0.7rem] font-semibold focus-visible:outline-2 focus-visible:outline-accent ${active ? 'text-accent' : 'text-muted'}`}
          >
            <span className={`grid h-8 w-14 place-items-center rounded-full transition-colors ${active ? 'bg-accent-soft' : ''}`}>
              <Icon className="size-6" strokeWidth={active ? 2.4 : 2} aria-hidden />
            </span>
            <span className="text-center"><Bi k={label} stack /></span>
          </button>
        );
      })}
    </nav>
  );
}
