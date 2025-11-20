/**
 * LanguageToggle Component
 *
 * Provides a language selection dropdown for the IND Wizard 3.3
 * Supports English, Spanish, Japanese, and French
 */

import { useState } from 'react';
import { useTranslation } from '../utils/i18n-stub.js';
import { Globe } from 'lucide-react';
import clsx from 'clsx';

export default function LanguageToggle({ onLanguageChange }) {
  const { i18n } = useTranslation();
  const [open, setOpen] = useState(false);

  const languages = [
    { code: 'en', name: 'English' },
    { code: 'es', name: 'Español' },
    { code: 'ja', name: '日本語' },
    { code: 'fr', name: 'Français' },
  ];

  const handleLanguageSelect = langCode => {
    i18n.changeLanguage(langCode);
    if (onLanguageChange) {
      onLanguageChange(langCode);
    }
    setOpen(false);
  };

  return (
    <div className="absolute top-4 left-4 z-20">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 text-sm py-1 px-2 rounded-md bg-regulatory-100/50 dark:bg-regulatory-900/30 text-regulatory-800 dark:text-regulatory-300 hover:bg-regulatory-200/50 dark:hover:bg-regulatory-800/30"
      >
        <Globe size={14} />
        <span className="hidden sm:inline">
          {languages.find(l => l.code === i18n.language)?.name || 'English'}
        </span>
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 bg-white dark:bg-slate-800 shadow-md rounded-md overflow-hidden border border-gray-200 dark:border-gray-700">
          <ul className="py-1">
            {languages.map(lang => (
              <li key={lang.code}>
                <button
                  onClick={() => handleLanguageSelect(lang.code)}
                  className={clsx(
                    'w-full text-left px-4 py-2 text-sm hover:bg-regulatory-50 dark:hover:bg-regulatory-900/20',
                    i18n.language === lang.code
                      ? 'bg-regulatory-50 dark:bg-regulatory-900/30 font-medium'
                      : ''
                  )}
                >
                  {lang.name}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
