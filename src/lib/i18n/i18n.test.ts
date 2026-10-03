import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { en } from './en';
import { bn } from './bn';
import { setBilingual, t, tb, tt } from './index';

afterEach(() => setBilingual(false));

describe('i18n', () => {
  it('has a Bangla text for every English key, with the same {placeholders}', () => {
    const vars = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join();
    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      expect(bn[key], key).toBeTruthy();
      expect(vars(bn[key]), key).toBe(vars(en[key]));
    }
  });
  it('shows English only by default, and both languages in bilingual mode', () => {
    expect(tt('tab.scan')).toBe('Scan');
    setBilingual(true);
    expect(tt('tab.scan')).toBe('Scan · স্ক্যান');
    expect(tt('save.success', { name: 'Rice' })).toBe('Saved Rice · Rice সংরক্ষিত হয়েছে');
    expect(t('tab.scan')).toBe('Scan');
    expect(tb('tab.scan')).toBe('স্ক্যান');
  });
});

describe('no emojis in the UI', () => {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const f of readdirSync(dir)) {
      const p = join(dir, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(tsx?|css|html)$/.test(f)) files.push(p);
    }
  };
  walk('src'); files.push('index.html');
  it('uses icons, not emoji characters', () => {
    for (const f of files) {
      const hits = readFileSync(f, 'utf8').match(/\p{Extended_Pictographic}/gu);
      expect(hits, `${f} contains emoji ${hits?.join('')}`).toBeNull();
    }
  });
});
