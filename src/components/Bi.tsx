import { t, tb, useBilingual, type MessageKey } from '../lib/i18n';

interface Props {
  k: MessageKey;
  vars?: Record<string, string | number>;
  /** put Bangla on its own smaller line (tab labels, headings) instead of after a dot */
  stack?: boolean;
}

/** English text, with the Bangla beside it for staff accounts. */
export function Bi({ k, vars, stack }: Props) {
  const both = useBilingual();
  if (!both) return <span>{t(k, vars)}</span>;
  if (stack) {
    return (
      <span className="flex flex-col leading-tight">
        <span>{t(k, vars)}</span>
        <span className="bn text-[0.82em] font-medium opacity-80">{tb(k, vars)}</span>
      </span>
    );
  }
  return <span>{t(k, vars)}<span className="bn font-medium opacity-80"> · {tb(k, vars)}</span></span>;
}
