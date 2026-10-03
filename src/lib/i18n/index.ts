import { useSyncExternalStore } from 'react';
import { en, type MessageKey } from './en';
import { bn } from './bn';
export type { MessageKey };

type Vars = Record<string, string | number>;
const fill = (text: string, vars?: Vars) =>
  vars ? text.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? '')) : text;

/** English only. */
export const t = (key: MessageKey, vars?: Vars): string => fill(en[key], vars);
/** Bangla only. */
export const tb = (key: MessageKey, vars?: Vars): string => fill(bn[key], vars);

// Staff accounts see Bangla beside English; the owner sees English only.
let bilingual = false;
const listeners = new Set<() => void>();
export function setBilingual(on: boolean) {
  if (on === bilingual) return;
  bilingual = on;
  listeners.forEach((l) => l());
}
export const isBilingual = () => bilingual;
const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
export const useBilingual = () => useSyncExternalStore(subscribe, isBilingual);

/** One string for places that cannot render two spans (toasts, placeholders, aria labels). */
export const tt = (key: MessageKey, vars?: Vars): string =>
  bilingual ? `${t(key, vars)} · ${tb(key, vars)}` : t(key, vars);
/** Hook form of tt: re-renders the component when the language mode changes. */
export function useT() {
  useBilingual();
  return tt;
}
