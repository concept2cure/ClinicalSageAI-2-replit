/**
 * Lightweight i18n pass-through (re-exports from the main i18n module).
 *
 * This file exists so that existing imports from '../utils/i18n-stub.js'
 * continue to work. All logic lives in src/i18n.js.
 */

export { useTranslation, default } from '../i18n';

// Also export t directly for convenience
export { default as i18n } from '../i18n';
