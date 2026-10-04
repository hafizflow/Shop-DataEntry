import { Component, lazy, type ComponentType, type ReactNode } from 'react';

/** lazy() that reloads once if the chunk is gone (a new deploy replaced the hashed files this tab still points at). */
export function lazyScreen<T extends ComponentType>(load: () => Promise<{ default: T }>) {
  return lazy(async () => {
    const key = 'chunk-reload';
    try {
      const m = await load();
      try { sessionStorage.removeItem(key); } catch { /* storage blocked */ }
      return m;
    } catch (e) {
      let tried = false;
      try { tried = sessionStorage.getItem(key) === '1'; sessionStorage.setItem(key, '1'); } catch { /* storage blocked */ }
      if (!tried) { location.reload(); return new Promise<never>(() => {}); }
      throw e;
    }
  });
}

/** Keeps a failed screen from unmounting the whole app (which shows as a blank page). */
export class ScreenBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="flex flex-col items-center gap-3 px-4 py-16 text-center">
        <p className="font-medium text-muted">Something went wrong. / কিছু ভুল হয়েছে।</p>
        <button className="btn btn-primary" onClick={() => location.reload()}>Reload / রিলোড</button>
      </div>
    );
  }
}
