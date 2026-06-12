import { describe, it, expect } from 'vitest';
// @ts-expect-error — pure-Node ESM checker, no type declarations needed for the test
import { checkI18nIntegrity, checkI18nKeyUsage } from '../../../../scripts/ci/check-i18n-integrity.mjs';
import { LANGUAGES, SUPPORTED_LANGUAGE_CODES, DEFAULT_LANGUAGE } from '../languages';
import {
  LANGUAGE_OVERLAYS,
  CULTURAL_OVERLAYS,
  LANGUAGE_HOME_MARKET,
  MARKET_BRIEFS,
} from '../../../../server/services/ana-ri/locale-overlays';

/**
 * Locale & overlay integrity — the safety net for the multi-language UI and the
 * AnA persona layer. Three sources of truth must never drift apart:
 *   (1) the client language registry (languages.ts),
 *   (2) the on-disk locale bundles (client/public/locales/<lng>/*.json),
 *   (3) the server-side AnA overlays keyed by AnaLanguage.
 * It also enforces faithful translations (key/placeholder/markup parity) via the
 * shared check-i18n-integrity checker so the Vitest suite fails fast on drift.
 */
describe('i18n locale & overlay integrity', () => {
  it('keeps every locale bundle key/placeholder/markup-faithful to English', () => {
    const { errors, languages, namespaces } = checkI18nIntegrity();
    // Surface the precise violations rather than a bare boolean.
    expect(errors).toEqual([]);
    expect(languages.length).toBeGreaterThanOrEqual(SUPPORTED_LANGUAGE_CODES.length);
    expect(namespaces).toContain('common');
  });

  it('resolves every static t()/i18nKey reference in the client to a real key', () => {
    const { errors, checked } = checkI18nKeyUsage();
    // Catches code that references a missing/renamed key (renders the raw key to
    // the user) — the failure mode bundle-vs-bundle parity cannot see.
    expect(errors).toEqual([]);
    // Guard against a vacuous pass (e.g. the scanner silently matching nothing).
    expect(checked).toBeGreaterThan(50);
  });

  it('keeps the client registry, locale dirs and server AnaLanguage overlays in sync', () => {
    const registry = [...SUPPORTED_LANGUAGE_CODES].sort();
    const overlayLangs = Object.keys(LANGUAGE_OVERLAYS).sort();
    const culturalLangs = Object.keys(CULTURAL_OVERLAYS).sort();
    // The server overlay tables (Record<AnaLanguage,…>) must cover exactly the
    // languages the client registry advertises — no orphan, no gap.
    expect(overlayLangs).toEqual(registry);
    expect(culturalLangs).toEqual(registry);
  });

  it('gives every non-English language a non-empty response + cultural overlay', () => {
    for (const code of SUPPORTED_LANGUAGE_CODES) {
      if (code === DEFAULT_LANGUAGE) {
        // English is the base voice — overlays are intentionally empty.
        expect(LANGUAGE_OVERLAYS[code]).toBe('');
        expect(CULTURAL_OVERLAYS[code]).toBe('');
        continue;
      }
      expect(LANGUAGE_OVERLAYS[code]?.trim().length, `LANGUAGE_OVERLAYS[${code}]`).toBeGreaterThan(0);
      expect(CULTURAL_OVERLAYS[code]?.trim().length, `CULTURAL_OVERLAYS[${code}]`).toBeGreaterThan(0);
    }
  });

  it('maps every language home-market to a real market brief', () => {
    const briefKeys = new Set(Object.keys(MARKET_BRIEFS));
    for (const [lang, market] of Object.entries(LANGUAGE_HOME_MARKET)) {
      expect(SUPPORTED_LANGUAGE_CODES, `home-market key '${lang}'`).toContain(lang);
      expect(briefKeys.has(market as string), `home-market '${lang}' -> '${market}'`).toBe(true);
    }
  });

  it('declares a usable Intl locale and endonym for every registered language', () => {
    expect(LANGUAGES.map((l) => l.code).sort()).toEqual([...SUPPORTED_LANGUAGE_CODES].sort());
    for (const def of LANGUAGES) {
      expect(def.native.trim().length, `native name for ${def.code}`).toBeGreaterThan(0);
      expect(def.label.trim().length, `label for ${def.code}`).toBeGreaterThan(0);
      // A malformed BCP-47 tag would throw — this keeps date/number formatting safe.
      expect(() => new Intl.DateTimeFormat(def.intlLocale), `intlLocale for ${def.code}`).not.toThrow();
    }
  });
});
