import type { ApiErrorKind } from './types';
import type { MessageKey } from '../lib/i18n';

export class ApiError extends Error {
  constructor(public kind: ApiErrorKind, message: string, public code?: string) {
    super(message);
    this.name = 'ApiError';
  }
}

export function mapError(err: unknown): ApiError {
  if (err instanceof ApiError) return err;
  const e = (err ?? {}) as { code?: string; message?: string; status?: number };
  const msg = e.message ?? String(err);
  const code = e.code;
  if (/failed to fetch|networkerror|load failed|network request failed/i.test(msg)) return new ApiError('network', msg, code);
  if (code === '23505') {
    return new ApiError(msg.includes('products_barcode_key') ? 'duplicate_barcode' : 'duplicate_product', msg, code);
  }
  if (code === '23514' || code === '22P02' || code === '22003' || code === '23502') return new ApiError('validation', msg, code);
  if (code === 'PGRST301' || e.status === 401 || /jwt expired|invalid jwt/i.test(msg)) return new ApiError('auth', msg, code);
  if (code === 'PGRST205' || code === 'PGRST202' || code === '42P01') return new ApiError('setup', msg, code);
  if (code === '42501') return new ApiError('permission', msg, code);
  return new ApiError('unknown', msg, code);
}

const KEYS: Record<ApiErrorKind, MessageKey> = {
  network: 'err.network', auth: 'err.auth', duplicate_barcode: 'err.duplicateBarcode',
  duplicate_product: 'err.duplicateProduct', validation: 'err.validation',
  permission: 'err.permission', setup: 'err.setup', unknown: 'err.unknown',
};
export const errorKey = (kind: ApiErrorKind): MessageKey => KEYS[kind];
