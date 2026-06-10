/**
 * i18next initialisation for Concept2Cure.RI.
 *
 * Detection / precedence (documented because it is subtle):
 *   1. At init (synchronous, flicker-free first paint):
 *        localStorage('c2c.language')  →  navigator language  →  'en'
 *      This fully covers the unauthenticated case.
 *   2. After auth hydration (async, handled in LanguageContext):
 *        the account's `preferences.language` wins if present and differs,
 *        via i18n.changeLanguage(...). So for a signed-in user the account
 *        preference is authoritative on load, while localStorage gives an
 *        instant default before the profile request resolves.
 *
 * Locale resources are served as static JSON from `client/public/locales/...`
 * and lazy-loaded per language + namespace by i18next-http-backend, so the
 * initial bundle ships only `en/common` and CJK strings are fetched on demand.
 */

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import HttpBackend from 'i18next-http-backend';

import {
  DEFAULT_LANGUAGE,
  LANGUAGE_STORAGE_KEY,
  SUPPORTED_LANGUAGE_CODES,
  getLanguageDef,
} from './languages';

export const I18N_NAMESPACES = ['common', 'auth', 'home', 'settings'] as const;

// Keep <html lang> / <html dir> in sync with the active language so that
// :lang() CSS rules (CJK typography) and assistive technology stay correct.
function applyDocumentLanguage(lng: string): void {
  if (typeof document === 'undefined') return;
  const def = getLanguageDef(lng);
  document.documentElement.lang = def.code;
  document.documentElement.dir = def.dir;
}

void i18n
  .use(HttpBackend)
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    fallbackLng: DEFAULT_LANGUAGE,
    supportedLngs: [...SUPPORTED_LANGUAGE_CODES],
    nonExplicitSupportedLngs: true, // ja-JP -> ja, zh-CN -> zh
    load: 'languageOnly',
    ns: ['common'],
    defaultNS: 'common',
    fallbackNS: 'common',
    interpolation: { escapeValue: false }, // React already escapes
    react: { useSuspense: false },
    backend: {
      loadPath: '/locales/{{lng}}/{{ns}}.json',
    },
    detection: {
      // Account preference is layered on top later (see LanguageContext).
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: LANGUAGE_STORAGE_KEY,
      caches: ['localStorage'],
    },
  });

i18n.on('languageChanged', applyDocumentLanguage);
applyDocumentLanguage(i18n.language || DEFAULT_LANGUAGE);

export default i18n;
