import { queue, sync } from './productRepo';

/** Flush the offline queue and refresh the cache on start, reconnect, app focus and every 30 s. */
export function startAutoSync(): () => void {
  const tick = () => { void queue.flush(); void sync(); };
  const onVisible = () => { if (document.visibilityState === 'visible') tick(); };
  tick();
  window.addEventListener('online', tick);
  document.addEventListener('visibilitychange', onVisible);
  const timer = window.setInterval(() => void queue.flush(), 30_000);
  return () => {
    window.removeEventListener('online', tick);
    document.removeEventListener('visibilitychange', onVisible);
    window.clearInterval(timer);
  };
}
