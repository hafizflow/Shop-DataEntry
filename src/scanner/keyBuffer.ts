/** Keyboard-wedge scanners type digits very fast then press Enter. Slow typing resets the buffer. */
export function createKeyBuffer(onCode: (code: string) => void, gapMs = 100) {
  let buf = '';
  let last = 0;
  return {
    push(key: string, now: number) {
      if (key === 'Enter') {
        const code = buf; buf = '';
        if (code.length >= 4) onCode(code);
        return;
      }
      if (key.length !== 1) return;
      if (now - last > gapMs) buf = '';
      buf += key; last = now;
    },
  };
}
