/**
 * Language registry — the single source of truth for every locale the
 * Concept2Cure.RI app supports.
 *
 * Both the UI i18n layer (LanguageSwitcher, i18next init) and any
 * document-language pickers import from here so language codes and native
 * names never drift out of sync. The AnA persona layer on the server mirrors
 * these codes in its LANGUAGE_OVERLAYS map.
 */

export type LanguageCode = 'en' | 'fr' | 'de' | 'ja' | 'zh' | 'ko' | 'es' | 'pt';

export interface LanguageDef {
  /** BCP-47 primary subtag used by i18next, Intl, and <html lang>. */
  code: LanguageCode;
  /** English name, for aria-labels and developer-facing copy. */
  label: string;
  /** Endonym — how speakers of the language name it themselves. */
  native: string;
  /** Writing direction. All current languages are ltr; kept for future RTL. */
  dir: 'ltr' | 'rtl';
  /** Default Intl locale for date/number formatting. */
  intlLocale: string;
}

export const LANGUAGES: readonly LanguageDef[] = [
  { code: 'en', label: 'English',  native: 'English',  dir: 'ltr', intlLocale: 'en-US' },
  { code: 'fr', label: 'French',   native: 'Français', dir: 'ltr', intlLocale: 'fr-FR' },
  { code: 'de', label: 'German',   native: 'Deutsch',  dir: 'ltr', intlLocale: 'de-DE' },
  { code: 'ja', label: 'Japanese', native: '日本語',    dir: 'ltr', intlLocale: 'ja-JP' },
  { code: 'zh', label: 'Chinese',  native: '中文',      dir: 'ltr', intlLocale: 'zh-CN' },
  { code: 'ko', label: 'Korean',     native: '한국어',     dir: 'ltr', intlLocale: 'ko-KR' },
  { code: 'es', label: 'Spanish',    native: 'Español',   dir: 'ltr', intlLocale: 'es-ES' },
  { code: 'pt', label: 'Portuguese', native: 'Português', dir: 'ltr', intlLocale: 'pt-BR' },
] as const;

export const DEFAULT_LANGUAGE: LanguageCode = 'en';

/** localStorage key holding the user's chosen UI language. */
export const LANGUAGE_STORAGE_KEY = 'c2c.language';

export const SUPPORTED_LANGUAGE_CODES: LanguageCode[] = LANGUAGES.map(l => l.code);

export function isSupportedLanguage(value: unknown): value is LanguageCode {
  return typeof value === 'string' && SUPPORTED_LANGUAGE_CODES.includes(value as LanguageCode);
}

export function getLanguageDef(code: string | null | undefined): LanguageDef {
  return LANGUAGES.find(l => l.code === code) ?? LANGUAGES[0];
}
