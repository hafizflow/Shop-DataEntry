import { useState, type FormEvent } from 'react';
import { Keyboard, Search } from 'lucide-react';
import { Bi } from '../../components/Bi';
import { useT } from '../../lib/i18n';

/** Typed barcodes, and hardware scanners that type into the focused field and press Enter. */
export function ManualEntry({ onSubmit, disabled }: { onSubmit(code: string): void; disabled?: boolean }) {
  const tt = useT();
  const [value, setValue] = useState('');
  function submit(e: FormEvent) {
    e.preventDefault();
    const code = value.trim();
    if (!code || disabled) return;
    setValue('');
    onSubmit(code);
  }
  return (
    <form onSubmit={submit} className="flex gap-2">
      <label className="sr-only" htmlFor="manual-barcode">{tt('scan.manual.label')}</label>
      <span className="relative flex-1">
        <Keyboard className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted" aria-hidden />
        <input
          id="manual-barcode" className="input pl-12" inputMode="numeric" autoComplete="off" enterKeyHint="search"
          placeholder={tt('scan.manual.placeholder')} value={value} onChange={(e) => setValue(e.target.value)}
        />
      </span>
      <button className="btn btn-primary px-4" disabled={disabled}>
        <Search className="size-5" aria-hidden /><Bi k="scan.manual.submit" />
      </button>
    </form>
  );
}
