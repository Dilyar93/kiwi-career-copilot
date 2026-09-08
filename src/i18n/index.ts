import english from './en-NZ.json';
import chinese from './zh-CN.json';

export const DEFAULT_LOCALE = 'en-NZ' as const;
export type AppLocale = 'en-NZ' | 'zh-CN';
export type TranslationKey = keyof typeof english;

const messages: Record<AppLocale, Record<TranslationKey, string>> = {
  'en-NZ': english,
  'zh-CN': chinese,
};

let locale: AppLocale = DEFAULT_LOCALE;

export function getRuntimeLocale(): AppLocale {
  return locale;
}

export function setRuntimeLocale(nextLocale: AppLocale): void {
  locale = nextLocale;
}

export function t(
  key: TranslationKey,
  parameters: Record<string, string | number> = {},
): string {
  let result = messages[locale][key];
  for (const [name, value] of Object.entries(parameters)) {
    result = result.replaceAll(`{${name}}`, String(value));
  }
  return result;
}
