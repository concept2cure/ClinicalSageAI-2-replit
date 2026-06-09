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
