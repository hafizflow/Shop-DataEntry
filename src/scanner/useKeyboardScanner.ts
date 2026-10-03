import { useEffect } from 'react';
import { createKeyBuffer } from './keyBuffer';

const TYPING = /^(INPUT|TEXTAREA|SELECT)$/;

/** USB/Bluetooth barcode scanners that act like a keyboard. Ignored while a form field has focus. */
export function useKeyboardScanner(onCode: (code: string) => void, enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const buffer = createKeyBuffer(onCode, 100);
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (TYPING.test(el.tagName) || el.isContentEditable)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      buffer.push(e.key, performance.now());
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCode, enabled]);
}
