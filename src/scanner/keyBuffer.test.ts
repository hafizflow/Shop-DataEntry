import { describe, expect, it, vi } from 'vitest';
import { createKeyBuffer } from './keyBuffer';

function type(buf: ReturnType<typeof createKeyBuffer>, s: string, start: number, step: number) {
  let t = start;
  for (const ch of s) { buf.push(ch, t); t += step; }
  return t;
}

describe('createKeyBuffer', () => {
  it('emits a code when Enter follows fast keystrokes', () => {
    const on = vi.fn();
    const b = createKeyBuffer(on, 100);
    const t = type(b, '8901234', 0, 20);
    b.push('Enter', t);
    expect(on).toHaveBeenCalledWith('8901234');
  });
  it('ignores slow human typing', () => {
    const on = vi.fn();
    const b = createKeyBuffer(on, 100);
    const t = type(b, '8901234', 0, 400);
    b.push('Enter', t);
    expect(on).not.toHaveBeenCalled();
  });
  it('ignores short bursts and modifier keys', () => {
    const on = vi.fn();
    const b = createKeyBuffer(on, 100);
    b.push('a', 0); b.push('Shift', 10); b.push('Enter', 20);
    expect(on).not.toHaveBeenCalled();
  });
  it('clears the buffer after emitting', () => {
    const on = vi.fn();
    const b = createKeyBuffer(on, 100);
    const t = type(b, '1234', 0, 10);
    b.push('Enter', t); b.push('Enter', t + 10);
    expect(on).toHaveBeenCalledTimes(1);
  });
});
