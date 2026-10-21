export type Locale = 'en' | 'zh' | 'ja' | 'es' | 'fr' | 'de';

export interface LocaleOption {
  code: Locale;
  label: string;
  intl: string;
}

export const LOCALES: LocaleOption[] = [
  { code: 'en', label: 'English', intl: 'en-US' },
  { code: 'zh', label: '简体中文', intl: 'zh-CN' },
  { code: 'ja', label: '日本語', intl: 'ja-JP' },
  { code: 'es', label: 'Español', intl: 'es-ES' },
  { code: 'fr', label: 'Français', intl: 'fr-FR' },
  { code: 'de', label: 'Deutsch', intl: 'de-DE' },
];

const STORAGE_KEY = 'throughline.locale';
const SUPPORTED = new Set<Locale>(LOCALES.map((locale) => locale.code));

let activeLocale: Locale = 'en';

export function getLocale(): Locale {
  return activeLocale;
}

export function getIntlLocale(): string {
  return LOCALES.find((locale) => locale.code === activeLocale)?.intl ?? 'en-US';
}

export function setLocaleGlobal(locale: Locale): void {
  activeLocale = locale;
}

export function readStoredLocale(): Locale {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored && SUPPORTED.has(stored as Locale)) return stored as Locale;
  } catch {
    // Storage may be unavailable in private or restricted contexts.
  }
  return 'en';
}

export function storeLocale(locale: Locale): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // Ignore storage failures; the switch still works for the current session.
  }
}

export function applyDocumentLocale(locale: Locale): void {
  document.documentElement.lang = LOCALES.find((option) => option.code === locale)?.intl ?? 'en-US';
}

export function isChinese(): boolean {
  return activeLocale === 'zh';
}
