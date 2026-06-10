/**
 * Tests for the locale-aware formatting helpers, with emphasis on the
 * Japan-tuned era-calendar (和暦) and fiscal-year (年度) conventions used across
 * the Japanese regulatory experience.
 */

import { describe, it, expect } from 'vitest';

import {
  formatDate,
  formatNumber,
  formatJapaneseEraDate,
  getJapaneseFiscalYear,
  formatJapaneseFiscalYear,
} from '../format';

describe('i18n format helpers', () => {
  describe('formatDate', () => {
    it('renders Japanese dates in 年月日 order for ja', () => {
      const out = formatDate('2026-06-10', 'ja', { dateStyle: 'long' });
      expect(out).toContain('年');
      expect(out).toContain('月');
      expect(out).toContain('日');
      expect(out).toContain('2026');
    });

    it('returns empty string for invalid input', () => {
      expect(formatDate('not-a-date', 'ja')).toBe('');
    });
  });

  describe('formatNumber', () => {
    it('groups by locale', () => {
      expect(formatNumber(1234567, 'ja')).toBe('1,234,567');
    });
  });

  describe('formatJapaneseEraDate (和暦)', () => {
    it('formats a 2026 date in the Reiwa era', () => {
      // 2026 is Reiwa 8 (令和8年).
      const out = formatJapaneseEraDate('2026-06-10');
      expect(out).toContain('令和');
      expect(out).toContain('8年');
      expect(out).toContain('6月');
      expect(out).toContain('10日');
    });

    it('is independent of UI language and stays Japanese', () => {
      const out = formatJapaneseEraDate(new Date('2019-05-01')); // first day of Reiwa
      expect(out).toContain('令和');
    });

    it('returns empty string for invalid input', () => {
      expect(formatJapaneseEraDate('nope')).toBe('');
    });
  });

  describe('Japanese fiscal year (年度)', () => {
    it('assigns April–December to the same starting year', () => {
      expect(getJapaneseFiscalYear('2026-04-01')).toBe(2026);
      expect(getJapaneseFiscalYear('2026-12-31')).toBe(2026);
    });

    it('assigns January–March to the previous fiscal year', () => {
      expect(getJapaneseFiscalYear('2026-03-31')).toBe(2025);
      expect(getJapaneseFiscalYear('2026-01-15')).toBe(2025);
    });

    it('formats the 年度 label', () => {
      expect(formatJapaneseFiscalYear('2026-06-10')).toBe('2026年度');
      expect(formatJapaneseFiscalYear('2026-02-10')).toBe('2025年度');
    });

    it('returns empty string for invalid input', () => {
      expect(formatJapaneseFiscalYear('bad')).toBe('');
      expect(Number.isNaN(getJapaneseFiscalYear('bad'))).toBe(true);
    });
  });
});
