import { ApiError } from './errors';

/** Rejects with a 'network' ApiError if the work has not settled in time (captive portal, dead link). */
export function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new ApiError('network', 'Request timed out')), ms);
  });
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}
