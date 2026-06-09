/**
 * LanguageSwitcher — the single language toggle reused everywhere (module
 * TopBars, the login screen, and the account/settings surface).
 *
 * Renders an accessible native <select> of the supported languages by their
 * endonyms (English / Français / Deutsch / 日本語 / 中文). Each <option> carries
 * its own `lang` so CJK names render in the correct font. All state is derived
 * from LanguageContext — the component holds none of its own.
 */

import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Globe } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { isSupportedLanguage, type LanguageCode } from '@/i18n/languages';
import styles from './LanguageSwitcher.module.css';

type Variant = 'topbar' | 'menu' | 'auth';

interface LanguageSwitcherProps {
  variant?: Variant;
  className?: string;
  /** Show the leading globe icon (default: true for topbar/auth). */
  showIcon?: boolean;
}

export function LanguageSwitcher({
  variant = 'topbar',
  className,
  showIcon,
}: LanguageSwitcherProps) {
  const { language, availableLanguages, setLanguage } = useLanguage();
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
