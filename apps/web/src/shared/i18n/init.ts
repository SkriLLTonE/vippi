import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import type { Locale } from '@vippi/shared';
import { env } from '../config';
import ru from './locales/ru.json';
import uz from './locales/uz.json';

const STORAGE_KEY = 'vippi.locale';

function storedLocale(): Locale {
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    if (v === 'ru' || v === 'uz') return v;
  } catch {
    return env.defaultLocale;
  }
  return env.defaultLocale;
}

export function initI18n(): typeof i18n {
  const lng = storedLocale();
  void i18n.use(initReactI18next).init({
    resources: { ru: { translation: ru }, uz: { translation: uz } },
    lng,
    fallbackLng: 'ru',
    interpolation: { escapeValue: false },
    returnNull: false,
  });
  document.documentElement.lang = lng;
  return i18n;
}

/** Applies a locale to i18next, <html lang> and localStorage. */
export function applyLocale(locale: Locale): void {
  if (i18n.language !== locale) void i18n.changeLanguage(locale);
  document.documentElement.lang = locale;
  try {
    window.localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // Storage may be unavailable (private mode); the choice still applies for this tab.
    return;
  }
}

export function currentLocale(): Locale {
  return i18n.language === 'uz' ? 'uz' : 'ru';
}
