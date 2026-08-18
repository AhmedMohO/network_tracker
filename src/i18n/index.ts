import { getLocales } from 'expo-localization';
import Storage from 'expo-sqlite/kv-store';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { I18nManager } from 'react-native';

import { ar } from './ar';
import { en } from './en';

export const LANGUAGES = ['en', 'ar'] as const;
export type Language = (typeof LANGUAGES)[number];

const KEY = 'language.v1';
const RTL_LANGUAGES: Language[] = ['ar'];

function isLanguage(value: unknown): value is Language {
  return LANGUAGES.includes(value as Language);
}

/** Stored choice first, device locale second, English last. */
function initialLanguage(): Language {
  // Sync so the first render is already in the right language; the kv store is
  // SQLite-backed and this is a single small read.
  const saved = Storage.getItemSync(KEY);
  if (isLanguage(saved)) return saved;
  const device = getLocales()[0]?.languageCode;
  return isLanguage(device) ? device : 'en';
}

i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, ar: { translation: ar } },
  lng: initialLanguage(),
  fallbackLng: 'en',
  // React already escapes everything it renders.
  interpolation: { escapeValue: false },
});

export function isRtl(language: string): boolean {
  return RTL_LANGUAGES.includes(language as Language);
}

/**
 * Aligns the native layout direction with `language`.
 *
 * @returns true when the direction actually changed, which Android only picks
 * up after the JS bundle is reloaded — the caller has to do that.
 */
export function syncLayoutDirection(language: string): boolean {
  const rtl = isRtl(language);
  if (rtl === I18nManager.isRTL) return false;
  I18nManager.allowRTL(rtl);
  I18nManager.forceRTL(rtl);
  return true;
}

/** Persists the choice and switches the UI. Returns true if a reload is due. */
export async function setLanguage(language: Language): Promise<boolean> {
  Storage.setItemSync(KEY, language);
  await i18n.changeLanguage(language);
  return syncLayoutDirection(language);
}

export default i18n;
