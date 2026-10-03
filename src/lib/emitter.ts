export function createEmitter<T = void>() {
  const listeners = new Set<(v: T) => void>();
  return {
    on(fn: (v: T) => void) { listeners.add(fn); return () => { listeners.delete(fn); }; },
    emit(v: T) { listeners.forEach((fn) => fn(v)); },
  };
}
