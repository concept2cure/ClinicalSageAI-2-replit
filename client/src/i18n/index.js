// Simple i18n implementation that doesn't require external packages
// Translation files
import enCommon from './locales/en/common.json';
import frCommon from './locales/fr/common.json';
import deCommon from './locales/de/common.json';
import jaCommon from './locales/ja/common.json';

const resources = {
  en: { common: enCommon },
  fr: { common: frCommon },
  de: { common: deCommon },
  ja: { common: jaCommon },
};

// Get the user's preferred language
const getUserLanguage = () => {
  try {
    const savedLng = localStorage.getItem('lng');
    if (savedLng) return savedLng;
  } catch { /* private browsing */ }

  const browserLng = navigator.language.slice(0, 2);
  return resources[browserLng] ? browserLng : 'en';
};

// Simple translation function
export const t = (key, namespace = 'common') => {
  const language = getUserLanguage();
  const translations = resources[language]?.[namespace] || resources.en[namespace];
  return translations[key] || key;
};

// Change language
export const changeLanguage = lng => {
  try { localStorage.setItem('lng', lng); } catch { /* private browsing */ }
  window.location.reload();
};

// Initialize
const initI18n = () => {
  // Set the initial language
  const language = getUserLanguage();
  document.documentElement.lang = language;
  localStorage.setItem('lng', language);

  // Create a global t function for convenience
  window.t = t;
};

initI18n();

export default { t, changeLanguage };
