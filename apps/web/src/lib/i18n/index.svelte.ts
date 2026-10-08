import { en, type MessageKey } from './en';
import { it } from './it';

export type Locale = 'en' | 'it';
export const LOCALES: readonly Locale[] = ['en', 'it'];
const dictionaries = { en, it } as const;
const STORAGE_KEY = 'processchess.locale';

function detect(): Locale {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'en' || saved === 'it') return saved;
  } catch {
    // storage unavailable: fall through to the browser language
  }
  const langs =
    typeof navigator === 'undefined' ? [] : (navigator.languages ?? [navigator.language]);
  return langs.some((l) => l?.toLowerCase().startsWith('it')) ? 'it' : 'en';
}

export const i18n = $state<{ locale: Locale }>({ locale: 'en' });

/** Call once on startup (browser only). */
export function initLocale(): void {
  setLocale(detect(), false);
}

export function setLocale(locale: Locale, remember = true): void {
  i18n.locale = locale;
  document.documentElement.lang = locale;
  if (remember) {
    try {
      localStorage.setItem(STORAGE_KEY, locale);
    } catch {
      // ignore
    }
  }
}

/** Translates `key`, replacing `{name}` placeholders with `params`. Reactive on the locale. */
export function t(key: MessageKey, params: Record<string, string | number> = {}): string {
  const template: string = dictionaries[i18n.locale][key];
  return template.replace(/\{(\w+)\}/g, (_, name: string) => String(params[name] ?? `{${name}}`));
}

export function formatDate(d: Date): string {
  return new Intl.DateTimeFormat(i18n.locale, { dateStyle: 'medium', timeStyle: 'short' }).format(
    d,
  );
}

export function formatPercent(x: number): string {
  return new Intl.NumberFormat(i18n.locale, { style: 'percent', maximumFractionDigits: 0 }).format(
    x,
  );
}

export type { MessageKey };
