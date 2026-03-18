/**
 * Lightweight i18n implementation (pass-through for English).
 *
 * Provides a minimal API compatible with react-i18next so the rest of the
 * codebase can import { useTranslation } or the default i18n object without
 * pulling in a heavy dependency. The `t` function simply returns the key,
 * which works perfectly for an English-only app. When full i18n is needed,
 * swap this file for a real i18next setup.
 */

const noop = () => {};

/**
 * Translate a key. In pass-through mode this returns the key itself,
 * with basic interpolation support for {{variable}} patterns.
 */
const t = (key, options = {}) => {
  if (!key) return '';
  // Support defaultValue
  const base = options.defaultValue || key;
  // Support simple {{variable}} interpolation
  if (options && typeof base === 'string') {
    return base.replace(/\{\{(\w+)\}\}/g, (_, varName) =>
      options[varName] !== undefined ? String(options[varName]) : `{{${varName}}}`
    );
  }
  return base;
};

const i18n = {
  t,
  language: 'en',
  languages: ['en'],
  changeLanguage: (lng) => {
    i18n.language = lng || 'en';
    return Promise.resolve(lng);
  },
  use: () => i18n,
  init: () => Promise.resolve(i18n),
  on: noop,
  off: noop,
  exists: () => true,
  getFixedT: (_lng, ns) => t,
  isInitialized: true,
};

export default i18n;

/**
 * Hook compatible with react-i18next's useTranslation.
 * @param {string} [ns] - Optional namespace (ignored in pass-through mode).
 * @returns {{ t: Function, i18n: object, ready: boolean }}
 */
export const useTranslation = (ns) => {
  return {
    t,
    i18n,
    ready: true,
  };
};
