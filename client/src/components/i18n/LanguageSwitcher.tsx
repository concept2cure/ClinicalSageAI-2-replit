/**
 * LanguageSwitcher — the single language toggle reused everywhere (module
 * TopBars, the login screen, and the account/settings surface).
 *
 * Renders an accessible native <select> of the supported languages by their
 * endonyms (English / Français / Deutsch / 日本語 / 中文). Each <option> carries
 * its own `lang` so CJK names render in the correct font.
 *
 * It prefers LanguageContext (which also syncs the choice to the account), but
 * degrades gracefully to driving i18next directly when no LanguageProvider is
 * mounted — e.g. when a module shell is rendered in isolation by a smoke test.
 */

import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Globe } from 'lucide-react';
import i18n from '@/i18n';
import LanguageContext from '@/contexts/LanguageContext';
import {
  LANGUAGES,
  LANGUAGE_STORAGE_KEY,
  isSupportedLanguage,
  getLanguageDef,
  type LanguageCode,
  type LanguageDef,
} from '@/i18n/languages';
import styles from './LanguageSwitcher.module.css';

type Variant = 'topbar' | 'menu' | 'auth';

interface LanguageSwitcherProps {
  variant?: Variant;
  className?: string;
  /** Show the leading globe icon (default: true for topbar/auth). */
  showIcon?: boolean;
}

interface LanguageControls {
  language: LanguageCode;
  availableLanguages: readonly LanguageDef[];
  setLanguage: (code: LanguageCode) => void;
}

// Provider-optional language controls. Hooks are always called in the same
// order; the context is simply preferred over the i18n-only fallback.
function useLanguageControls(): LanguageControls {
  const ctx = React.useContext(LanguageContext);
  const [fallbackLang, setFallbackLang] = React.useState<LanguageCode>(
    () => getLanguageDef((i18n.language || 'en').split('-')[0]).code
  );

  React.useEffect(() => {
    if (ctx) return; // context drives re-renders when present
    const onChanged = (lng: string) => setFallbackLang(getLanguageDef(lng).code);
    i18n.on('languageChanged', onChanged);
    return () => i18n.off('languageChanged', onChanged);
  }, [ctx]);

  if (ctx) return ctx;

  return {
    language: fallbackLang,
    availableLanguages: LANGUAGES,
    setLanguage: (code: LanguageCode) => {
      void i18n.changeLanguage(code);
      try {
        localStorage.setItem(LANGUAGE_STORAGE_KEY, code);
      } catch {
        /* private mode / quota — still applies for this session */
      }
    },
  };
}

export function LanguageSwitcher({
  variant = 'topbar',
  className,
  showIcon,
}: LanguageSwitcherProps) {
  const { language, availableLanguages, setLanguage } = useLanguageControls();
  const { t } = useTranslation('common');
  const withIcon = showIcon ?? variant !== 'menu';

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const next = e.target.value;
    if (isSupportedLanguage(next)) setLanguage(next as LanguageCode);
  };

  return (
    <div className={[styles.root, styles[variant], className].filter(Boolean).join(' ')}>
      {withIcon && <Globe className={styles.icon} size={14} strokeWidth={1.75} aria-hidden="true" />}
      <select
        className={styles.select}
        value={language}
        onChange={handleChange}
        aria-label={t('language.select')}
        title={t('language.label')}
      >
        {availableLanguages.map(lng => (
          <option key={lng.code} value={lng.code} lang={lng.code}>
            {lng.native}
          </option>
        ))}
      </select>
    </div>
  );
}

export default LanguageSwitcher;
