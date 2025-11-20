/**
 * Simple i18n stub to replace react-i18next dependency
 * This provides a minimal implementation that won't break our application
 */

// Simple translation function that returns the key
export const t = key => {
  return key;
};

// Stub for useTranslation hook
export const useTranslation = () => {
  return {
    t,
    i18n: {
      changeLanguage: lang => Promise.resolve(lang),
      language: 'en',
    },
  };
};

export default {
  t,
  useTranslation,
};
