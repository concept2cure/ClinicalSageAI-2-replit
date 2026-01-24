// Stub version of i18n.js while we fix the dependency issues
// We'll replace this with the actual implementation once the packages are installed

const i18n = {
  // Basic stub functions
  t: (key, options = {}) => {
    console.warn('[stub] i18n.t() called – replace when i18next is properly installed');
    return key;
  },
  changeLanguage: lng => {
    console.warn(
      '[stub] i18n.changeLanguage() called – replace when i18next is properly installed'
    );
  },
  // Add other methods as needed
};

export default i18n;

// Export necessary hooks and functions for compatibility
export const useTranslation = () => {
  return {
    t: i18n.t,
    i18n,
  };
};
