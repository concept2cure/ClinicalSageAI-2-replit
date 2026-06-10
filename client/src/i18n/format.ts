/**
 * Locale-aware formatting helpers.
 *
 * Thin wrappers over the platform `Intl` APIs so dates, numbers and relative
 * times render correctly in every supported language (notably JA/ZH numerals,
 * era handling, and DE/FR grouping separators). Drive `locale` from
 * `useLanguage().language` or `i18n.language`.
 */

import { getLanguageDef } from './languages';

function resolveLocale(lang: string | undefined): string {
  return getLanguageDef(lang).intlLocale;
}

export function formatDate(
  value: Date | number | string,
  lang: string,
  options: Intl.DateTimeFormatOptions = { dateStyle: 'medium' },
): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(resolveLocale(lang), options).format(date);
}

export function formatDateTime(
  value: Date | number | string,
  lang: string,
  options: Intl.DateTimeFormatOptions = { dateStyle: 'medium', timeStyle: 'short' },
): string {
  return formatDate(value, lang, options);
}

export function formatNumber(
  value: number,
  lang: string,
  options: Intl.NumberFormatOptions = {},
): string {
  return new Intl.NumberFormat(resolveLocale(lang), options).format(value);
}

export function formatPercent(value: number, lang: string, fractionDigits = 0): string {
  return new Intl.NumberFormat(resolveLocale(lang), {
    style: 'percent',
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);
}

// ─────────────────────────────────────────────────────────────────────────────
// Japan-tuned formatting
//
// Japanese regulatory, pricing and administrative documents lean on two
// conventions the generic Intl wrappers above do not surface: the Japanese era
// calendar (和暦 — e.g. 令和8年) and the Japanese fiscal year (年度), which runs
// April→March. These helpers give the Japanese client base output that matches
// what they see from PMDA/MHLW and on 薬価 (NHI pricing) paperwork.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Format a date in the Japanese era calendar (和暦), e.g. `令和8年6月10日`.
 *
 * Uses the platform `japanese` calendar via the `ja-JP-u-ca-japanese` locale,
 * so era transitions (Heisei→Reiwa) are handled by the Intl data, not by us.
 * Independent of the active UI language — this is intentionally always Japanese,
 * for documents and fields that must read in 和暦.
 */
export function formatJapaneseEraDate(
  value: Date | number | string,
  options: Intl.DateTimeFormatOptions = { era: 'long', year: 'numeric', month: 'long', day: 'numeric' },
): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('ja-JP-u-ca-japanese', options).format(date);
}

/**
 * Japanese fiscal year (年度) for a date. The fiscal year runs 1 April→31 March
 * and is named for its starting calendar year: 2026-04-01…2027-03-31 ⇒ 2026.
 * Dates in Jan–Mar therefore belong to the previous calendar year's 年度.
 */
export function getJapaneseFiscalYear(value: Date | number | string): number {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return Number.NaN;
  const year = date.getFullYear();
  // getMonth() is 0-based: 0–2 = Jan–Mar ⇒ previous fiscal year.
  return date.getMonth() <= 2 ? year - 1 : year;
}

/** Japanese fiscal year as a label, e.g. `2026年度`. */
export function formatJapaneseFiscalYear(value: Date | number | string): string {
  const fy = getJapaneseFiscalYear(value);
  return Number.isNaN(fy) ? '' : `${fy}年度`;
}

const RELATIVE_DIVISIONS: Array<{ amount: number; unit: Intl.RelativeTimeFormatUnit }> = [
  { amount: 60, unit: 'second' },
  { amount: 60, unit: 'minute' },
  { amount: 24, unit: 'hour' },
  { amount: 7, unit: 'day' },
  { amount: 4.34524, unit: 'week' },
  { amount: 12, unit: 'month' },
  { amount: Number.POSITIVE_INFINITY, unit: 'year' },
];

export function formatRelativeTime(value: Date | number | string, lang: string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const formatter = new Intl.RelativeTimeFormat(resolveLocale(lang), { numeric: 'auto' });
  let duration = (date.getTime() - Date.now()) / 1000;
  for (const division of RELATIVE_DIVISIONS) {
    if (Math.abs(duration) < division.amount) {
      return formatter.format(Math.round(duration), division.unit);
    }
    duration /= division.amount;
  }
  return '';
}
