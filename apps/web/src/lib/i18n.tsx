/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import {
  applyDocumentLocale,
  getLocale,
  LOCALES,
  readStoredLocale,
  setLocaleGlobal,
  storeLocale,
  type Locale,
} from './locale';
import common from './i18n/zh/common';
import labels from './i18n/zh/labels';
import auth from './i18n/zh/auth';
import projects from './i18n/zh/projects';
import dashboard from './i18n/zh/dashboard';
import items from './i18n/zh/items';
import verification from './i18n/zh/verification';
import risks from './i18n/zh/risks';
import report from './i18n/zh/report';
import settings from './i18n/zh/settings';
import teams from './i18n/zh/teams';
import app from './i18n/zh/app';
import ja from './i18n/locales/ja';
import es from './i18n/locales/es';
import fr from './i18n/locales/fr';
import de from './i18n/locales/de';

export type TranslationVariables = Record<string, string | number>;

const zhMessages: Record<string, string> = {
  ...common,
  ...labels,
  ...auth,
  ...projects,
  ...dashboard,
  ...items,
  ...verification,
  ...risks,
  ...report,
  ...settings,
  ...teams,
  ...app,
};

const messages: Record<Locale, Record<string, string>> = {
  en: {},
  zh: zhMessages,
  ja,
  es,
  fr,
  de,
};

function interpolate(template: string, variables?: TranslationVariables): string {
  if (!variables) return template;
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, name: string) => {
    const value = variables[name];
    return value === undefined ? match : String(value);
  });
}

export function translate(locale: Locale, key: string, variables?: TranslationVariables): string {
  const template = messages[locale]?.[key] ?? key;
  return interpolate(template, variables);
}

export function translateCurrent(key: string, variables?: TranslationVariables): string {
  return translate(getLocale(), key, variables);
}

interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, variables?: TranslationVariables) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => {
    const initial = readStoredLocale();
    setLocaleGlobal(initial);
    return initial;
  });

  const changeLocale = useCallback((next: Locale) => {
    setLocaleGlobal(next);
    setLocaleState(next);
  }, []);

  useEffect(() => {
    setLocaleGlobal(locale);
    storeLocale(locale);
    applyDocumentLocale(locale);
  }, [locale]);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== 'throughline.locale') return;
      if (event.newValue && LOCALES.some((option) => option.code === event.newValue)) {
        changeLocale(event.newValue as Locale);
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [changeLocale]);

  const t = useCallback(
    (key: string, variables?: TranslationVariables) => translate(locale, key, variables),
    [locale],
  );

  const value = useMemo<I18nContextValue>(
    () => ({ locale, setLocale: changeLocale, t }),
    [changeLocale, locale, t],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext);
  if (!context) throw new Error('useI18n must be used inside I18nProvider');
  return context;
}
