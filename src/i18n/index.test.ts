import { describe, expect, it } from 'vitest';
import english from './en-NZ.json';
import chinese from './zh-CN.json';
import { DEFAULT_LOCALE, setRuntimeLocale, t } from '.';

describe('runtime translations', () => {
  it('starts in English (New Zealand)', () => {
    setRuntimeLocale(DEFAULT_LOCALE);
    expect(DEFAULT_LOCALE).toBe('en-NZ');
    expect(t('appName')).toBe('Kiwi Career Copilot');
    expect(t('summaryCounts', { scanned: 2, shown: 1, hidden: 1 })).toBe(
      'Scanned 2 · Shown 1 · Hidden 1',
    );
  });

  it('keeps locale keys, values, and placeholders aligned', () => {
    expect(Object.keys(chinese).sort()).toEqual(Object.keys(english).sort());
    for (const key of Object.keys(english) as Array<keyof typeof english>) {
      expect(english[key].trim()).not.toBe('');
      expect(chinese[key].trim()).not.toBe('');
      expect(chinese[key].match(/\{[^}]+\}/g)?.sort() ?? []).toEqual(
        english[key].match(/\{[^}]+\}/g)?.sort() ?? [],
      );
    }
  });

  it('switches runtime text without a reload', () => {
    setRuntimeLocale('zh-CN');
    expect(t('settings')).toBe('设置');
    setRuntimeLocale(DEFAULT_LOCALE);
  });
});
