/**
 * Protocol-deviation trending and signal detection — deviations read as a
 * quality signal, not one record at a time.
 *
 * ## The industry need
 * ICH E6(R3) risk-based quality management expects protocol deviations to be
 * trended and a rising rate treated as a quality signal that feeds the key
 * risk indicator (KRI) process; TransCelerate's RBM methodology uses the
 * deviation rate as a KRI. Every CTMS / eTMF trends deviations by category,
 * severity and time. This repository records and assesses deviations
 * (`./protocol-deviations-logic`, table `protocol_deviations`,
 * migrations/20260629_protocol_deviations.sql and 20260922f) but trended
 * nothing. This module is that trend: monthly counts, the reportable and
 * major-or-critical shares, open-deviation ageing, CAPA closure lag, and three
 * documented signal rules.
 *
 * ## What each part covers
 *  - `window`, `byMonth`, `rates`, and the two month-based signals read ONLY
 *    the deviations whose `createdAt` (protocol_deviations.created_at — the
 *    date the deviation was RECORDED, not `discovered_date`) falls in the
 *    window: the `windowMonths` calendar months ending with today's month.
 *  - `aging` and `capa` are the CURRENT state of every supplied row as of
 *    `today`, whatever month it was recorded in — a deviation open for 200
 *    days is exactly what ageing exists to show, window or not.
 *  - All date arithmetic is on UTC calendar days. A timestamp with no zone
 *    designator is read as UTC; nothing is read in the host's local zone.
 *
 * ## The signal rules (each documented at its function)
 *  - The latest FULL month is the month before today's month; today's month
 *    is partial and is never compared.
 *  - DEV-CATEGORY-SPIKE: that month's count for a category is ≥ 3 AND ≥ 2 × the
 *    mean of the three months before it. Fewer than three prior months inside
 *    the window → not evaluated, and `notAssessed` says why.
 *  - DEV-SEVERITY-RISE: that month has ≥ 3 deviations and its major-or-critical
 *    share exceeds the share over the earlier window months by ≥ 0.2 absolute.
 *    Earlier months with no assessed deviation → not evaluated (`notAssessed`).
 *  - DEV-AGING: any open (status other than `closed`) deviation older than 90
 *    days at `today`.
 *  Thresholds are compared in exact integer arithmetic (cross-multiplied), so
 *  a rise of exactly 0.2 or a count of exactly 2 × the mean is never lost to
 *  floating-point rounding.
 *
 * "Major or critical": the severity union in `./protocol-deviations-logic` is
 * `'minor' | 'major' | 'critical'`, so the names map one-to-one — no
 * translation is made. That scale is the platform's internal one, assessed by
 * a person; it is not the regulatory "important deviation" category.
 *
 * ## The honesty contract
 *  - Pure: no model call, no randomness, no clock (`today` is injected), no
 *    database. Same input → deep-equal output, whatever the row order; the
 *    input is not mutated. An invalid `today` or `windowMonths` is a
 *    programming error and throws a TypeError; bad DATA never throws.
 *  - An unassessed severity is NOT a minor one and an undetermined
 *    reportability is NOT "not reportable": both are counted in the month's
 *    `total`, kept out of every share's numerator AND denominator, counted in
 *    their own `severityUnassessed` / `reportableUndetermined` column, and
 *    named in `notAssessed`.
 *  - A share with nothing to measure is `null`, never 0. Empty input → every
 *    count zero, both shares null, no signals, the window still populated.
 *  - `closedAt` and the CAPA counts are not columns of protocol_deviations.
 *    Absent or null means NOT KNOWN: the metric is null with a note, never 0.
 *  - A rule that could not be evaluated is listed in `notAssessed` with its
 *    reason — "not evaluated" is never rendered as "no signal".
 *  - A row whose `createdAt` cannot be read, or lies after `today`, is not
 *    bucketed or aged, and is named in `notAssessed` — never silently dropped.
 *  - `siteBreakdown.available` is false: protocol_deviations carries no site
 *    linkage, and a site dimension is not faked.
 *
 * @module server/services/protocol-deviations/deviation-trends
 */

import type { DeviationCategory, DeviationSeverity, DeviationStatus } from './protocol-deviations-logic';

export const DEVIATION_TRENDS_BASIS =
  'ICH E6(R3) — risk-based quality management: deviations trended as a quality signal; TransCelerate RBM KRI methodology';

export const DEVIATION_TREND_DEFAULT_WINDOW_MONTHS = 6;
export const DEVIATION_TREND_MIN_WINDOW_MONTHS = 1;
export const DEVIATION_TREND_MAX_WINDOW_MONTHS = 36;

/** DEV-CATEGORY-SPIKE: minimum count in the latest full month. */
export const SPIKE_MIN_COUNT = 3;
/** DEV-CATEGORY-SPIKE: the count must be at least this multiple of the prior mean. */
export const SPIKE_MULTIPLIER = 2;
/** DEV-CATEGORY-SPIKE: how many months before the latest full month form the mean. */
export const SPIKE_PRIOR_MONTHS = 3;
/** DEV-SEVERITY-RISE: minimum severity-assessed deviations in the latest full month. */
export const SEVERITY_RISE_MIN_COUNT = 3;
// The rise threshold as an exact fraction (1/5 = 0.2), compared cross-multiplied.
const RISE_NUM = 1;
const RISE_DEN = 5;
/** DEV-SEVERITY-RISE: minimum absolute rise in the major-or-critical share. */
export const SEVERITY_RISE_MIN_DELTA = RISE_NUM / RISE_DEN;
/** DEV-AGING: an open deviation strictly older than this many days raises the signal. */
export const AGING_SIGNAL_DAYS = 90;

/**
 * Severity 'minor' on a row recorded on or before this date may be a
 * defaulted value, not an assessment: until 2026-09-22 the writer stored an
 * unassessed deviation as minor (migrations/20260922f_protocol_deviation_assessment.sql).
 */
export const LEGACY_DEFAULT_SEVERITY_THROUGH = '2026-09-22';

export const SITE_BREAKDOWN_UNAVAILABLE_REASON = 'protocol_deviations carries no site linkage';

// Record-keyed so the compiler fails if the unions in ./protocol-deviations-logic change.
const CATEGORY_KEYS: Record<DeviationCategory, true> = {
  enrollment: true, consent: true, procedure: true, safety: true, data: true, other: true,
};
const SEVERITY_KEYS: Record<DeviationSeverity, true> = { minor: true, major: true, critical: true };
const CATEGORIES = Object.keys(CATEGORY_KEYS) as DeviationCategory[];
const SEVERITIES = Object.keys(SEVERITY_KEYS) as DeviationSeverity[];

const DAY_MS = 86_400_000;

// ─── Contract ────────────────────────────────────────────────────────────────

/** One protocol_deviations row as the trend reads it. */
export interface DeviationRow {
  id: number;
  /** protocol_deviations.category (nullable). null = not recorded. */
  category: DeviationCategory | null;
  /** protocol_deviations.severity (nullable). null = not assessed — never read as minor. */
  severity: DeviationSeverity | null;
  status: DeviationStatus;
  /** protocol_deviations.is_reportable (nullable). null = not determined — never read as false. */
  isReportable: boolean | null;
  /** protocol_deviations.created_at, ISO timestamp. */
  createdAt: string;
  /** No column records when a deviation closed. Absent/null = not known. */
  closedAt?: string | null;
  /** Linked protocol_capa_actions with status open|in_progress. Absent/null = not known, never 0. */
  capaActionsOpen?: number | null;
  /** All linked protocol_capa_actions. Absent/null = not known, never 0. */
  capaActionsTotal?: number | null;
}

export interface DeviationTrendOptions {
  /** ISO calendar date (YYYY-MM-DD), injected by the caller. */
  today: string;
  /** Calendar months to trend, ending with today's month. Clamped to 1..36. Default 6. */
  windowMonths?: number;
}

export interface DeviationMonthBucket {
  /** YYYY-MM. */
  month: string;
  total: number;
  byCategory: Record<DeviationCategory, number>;
  /** In `total`, in no category: no category recorded (or an unrecognised value). */
  categoryUnrecorded: number;
  bySeverity: Record<DeviationSeverity, number>;
  /** In `total`, in no severity: not assessed. Not counted as minor. */
  severityUnassessed: number;
  /** isReportable === true. */
  reportable: number;
  /** isReportable === null. Not counted as not reportable. */
  reportableUndetermined: number;
}

export type DeviationSignalCode = 'DEV-CATEGORY-SPIKE' | 'DEV-SEVERITY-RISE' | 'DEV-AGING';

export interface DeviationSignal {
  code: DeviationSignalCode;
  category?: DeviationCategory;
  message: string;
  evidence: Record<string, number | string>;
}

export interface DeviationTrends {
  window: { from: string; to: string; months: string[] };
  byMonth: DeviationMonthBucket[];
  rates: {
    /** reportable / deviations with a reportability determination; null when none. */
    reportableShare: number | null;
    /** (major + critical) / severity-assessed deviations; null when none. */
    majorOrCriticalShare: number | null;
    /** What each share was measured over, so a share is never read without its base. */
    denominators: { windowTotal: number; reportabilityDetermined: number; severityAssessed: number };
  };
  aging: { open: number; buckets: { '0-30': number; '31-90': number; '>90': number } };
  capa: {
    closureLagDaysMedian: number | null;
    /** Deviations with ≥ 1 open CAPA action; null when any row's count is not known. */
    withOpenActions: number | null;
    /** Open deviations with no CAPA action recorded (they cannot close); null when not known. */
    openWithoutActions: number | null;
    note?: string;
  };
  signals: DeviationSignal[];
  notAssessed: string[];
  siteBreakdown: { available: false; reason: string };
  basis: string;
}

// ─── Dates (UTC only) ────────────────────────────────────────────────────────

const TS_RE =
  /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?)?\s*(Z|[+-]\d{2}(?::?\d{2})?)?$/i;

/** Day number since 1970-01-01 (UTC) of a real calendar date, else null. */
function calendarDay(y: number, m: number, d: number): number | null {
  const ms = Date.UTC(y, m - 1, d);
  const probe = new Date(ms);
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== m - 1 || probe.getUTCDate() !== d) return null;
  return ms / DAY_MS;
}

/** Offset in minutes east of UTC; null when malformed. No designator = UTC. */
function offsetMinutes(zone: string | undefined): number | null {
  if (!zone || zone.toUpperCase() === 'Z') return 0;
  const sign = zone[0] === '-' ? -1 : 1;
  const digits = zone.slice(1).replace(':', '');
  const h = Number(digits.slice(0, 2));
  const m = digits.length > 2 ? Number(digits.slice(2, 4)) : 0;
  if (h > 23 || m > 59) return null;
  return sign * (h * 60 + m);
}

/** UTC day number of an ISO date or timestamp; null when it cannot be read. */
export function utcDayOf(iso: string): number | null {
  const m = typeof iso === 'string' ? TS_RE.exec(iso.trim()) : null;
  if (!m) return null;
  const day = calendarDay(Number(m[1]), Number(m[2]), Number(m[3]));
  const hh = Number(m[4] ?? 0);
  const mi = Number(m[5] ?? 0);
  const ss = Number(m[6] ?? 0);
  const off = offsetMinutes(m[8]);
  if (day === null || off === null || hh > 23 || mi > 59 || ss > 59) return null;
  const minutesUtc = hh * 60 + mi - off;
  return day + Math.floor(minutesUtc / 1440);
}

function monthKeyOfIndex(monthIndex: number): string {
  const y = Math.floor(monthIndex / 12);
  const mo = monthIndex - y * 12 + 1;
  return `${String(y).padStart(4, '0')}-${String(mo).padStart(2, '0')}`;
}

/** UTC day number of the first day of a month index (year × 12 + month0). */
function firstDayOfMonthIndex(monthIndex: number): number {
  const y = Math.floor(monthIndex / 12);
  return Date.UTC(y, monthIndex - y * 12, 1) / DAY_MS;
}

function monthIndexOfDay(day: number): number {
  const d = new Date(day * DAY_MS);
  return d.getUTCFullYear() * 12 + d.getUTCMonth();
}

function isoOfDay(day: number): string {
  return new Date(day * DAY_MS).toISOString().slice(0, 10);
}

function parseToday(today: unknown): number {
  const day = typeof today === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(today) ? utcDayOf(today) : null;
  if (day === null) {
    throw new TypeError(`trendDeviations: opts.today must be an ISO calendar date (YYYY-MM-DD); got ${JSON.stringify(today)}.`);
  }
  return day;
}

function resolveWindow(windowMonths: unknown): number {
  if (windowMonths === undefined) return DEVIATION_TREND_DEFAULT_WINDOW_MONTHS;
  if (typeof windowMonths !== 'number' || !Number.isFinite(windowMonths)) {
    throw new TypeError(`trendDeviations: opts.windowMonths must be a finite number; got ${JSON.stringify(windowMonths)}.`);
  }
  return Math.min(DEVIATION_TREND_MAX_WINDOW_MONTHS, Math.max(DEVIATION_TREND_MIN_WINDOW_MONTHS, Math.floor(windowMonths)));
}

// ─── Row classification ──────────────────────────────────────────────────────

interface Classified {
  row: DeviationRow;
  category: DeviationCategory | null;
  severity: DeviationSeverity | null;
  /** UTC day the deviation was recorded; null when createdAt cannot be read. */
  day: number | null;
}

function classify(row: DeviationRow): Classified {
  const category = CATEGORIES.includes(row.category as DeviationCategory) ? row.category : null;
  const severity = SEVERITIES.includes(row.severity as DeviationSeverity) ? row.severity : null;
  return { row, category, severity, day: utcDayOf(row.createdAt) };
}

const idList = (xs: Classified[]): string => xs.map((x) => `#${x.row.id}`).join(', ');

/** Rows the trend could not place, and value anomalies — named, never dropped silently. */
function rowGaps(all: Classified[], todayDay: number): string[] {
  const gaps: string[] = [];
  const unreadable = all.filter((c) => c.day === null);
  const future = all.filter((c) => c.day !== null && c.day > todayDay);
  const badCat = all.filter((c) => c.category === null && c.row.category !== null);
  const badSev = all.filter((c) => c.severity === null && c.row.severity !== null);
  if (unreadable.length) gaps.push(`Deviation(s) ${idList(unreadable)} have a createdAt that cannot be read as an ISO date; they are in no month and are not aged.`);
  if (future.length) gaps.push(`Deviation(s) ${idList(future)} are recorded after today (${isoOfDay(todayDay)}); they are in no month and are not aged.`);
  if (badCat.length) gaps.push(`Deviation(s) ${idList(badCat)} carry an unrecognised category value; they are counted as uncategorised.`);
  if (badSev.length) gaps.push(`Deviation(s) ${idList(badSev)} carry an unrecognised severity value; they are counted as unassessed.`);
  return gaps;
}

// ─── Monthly buckets ─────────────────────────────────────────────────────────

function emptyBucket(month: string): DeviationMonthBucket {
  const byCategory = Object.fromEntries(CATEGORIES.map((c) => [c, 0])) as Record<DeviationCategory, number>;
  const bySeverity = Object.fromEntries(SEVERITIES.map((s) => [s, 0])) as Record<DeviationSeverity, number>;
  return { month, total: 0, byCategory, categoryUnrecorded: 0, bySeverity, severityUnassessed: 0, reportable: 0, reportableUndetermined: 0 };
}

function addToBucket(b: DeviationMonthBucket, c: Classified): void {
  b.total += 1;
  if (c.category === null) b.categoryUnrecorded += 1; else b.byCategory[c.category] += 1;
  if (c.severity === null) b.severityUnassessed += 1; else b.bySeverity[c.severity] += 1;
  if (c.row.isReportable === true) b.reportable += 1;
  if (c.row.isReportable !== true && c.row.isReportable !== false) b.reportableUndetermined += 1;
}

function bucketByMonth(inWindow: Classified[], months: string[]): DeviationMonthBucket[] {
  const buckets = months.map(emptyBucket);
  const at = new Map(months.map((m, i) => [m, i]));
  for (const c of inWindow) {
    const i = at.get(monthKeyOfIndex(monthIndexOfDay(c.day as number)));
    if (i !== undefined) addToBucket(buckets[i], c);
  }
  return buckets;
}

// ─── Rates ───────────────────────────────────────────────────────────────────

/** num / den, or null when there is nothing to measure — never 0 for "nothing". */
function share(num: number, den: number): number | null {
  return den === 0 ? null : num / den;
}

interface SeverityTally { majorOrCritical: number; assessed: number; unassessed: number }

function severityTally(buckets: DeviationMonthBucket[]): SeverityTally {
  const t: SeverityTally = { majorOrCritical: 0, assessed: 0, unassessed: 0 };
  for (const b of buckets) {
    t.majorOrCritical += b.bySeverity.major + b.bySeverity.critical;
    t.assessed += b.bySeverity.minor + b.bySeverity.major + b.bySeverity.critical;
    t.unassessed += b.severityUnassessed;
  }
  return t;
}

function computeRates(buckets: DeviationMonthBucket[], months: string[], gaps: string[]): DeviationTrends['rates'] {
  const windowTotal = buckets.reduce((n, b) => n + b.total, 0);
  const reportable = buckets.reduce((n, b) => n + b.reportable, 0);
  const undetermined = buckets.reduce((n, b) => n + b.reportableUndetermined, 0);
  const sev = severityTally(buckets);
  const span = `${months[0]}..${months[months.length - 1]}`;
  if (windowTotal === 0) {
    gaps.push(`No deviation is recorded in the window ${span}; both shares are null (nothing to measure), not 0%.`);
  } else {
    if (undetermined > 0) {
      gaps.push(`${undetermined} of ${windowTotal} deviation(s) in the window have no reportability determination; reportableShare is over the ${windowTotal - undetermined} determined, and an undetermined one is not counted as not reportable.`);
    }
    if (sev.unassessed > 0) {
      gaps.push(`${sev.unassessed} of ${windowTotal} deviation(s) in the window have no assessed severity; majorOrCriticalShare is over the ${sev.assessed} assessed, and an unassessed one is not counted as minor.`);
    }
  }
  return {
    reportableShare: share(reportable, windowTotal - undetermined),
    majorOrCriticalShare: share(sev.majorOrCritical, sev.assessed),
    denominators: { windowTotal, reportabilityDetermined: windowTotal - undetermined, severityAssessed: sev.assessed },
  };
}

/** Rows whose 'minor' may be the pre-2026-09-22 default rather than an assessment. */
function legacySeverityGap(inWindow: Classified[]): string[] {
  const cutoff = utcDayOf(LEGACY_DEFAULT_SEVERITY_THROUGH) as number;
  const legacy = inWindow.filter((c) => c.severity === 'minor' && (c.day as number) <= cutoff);
  if (legacy.length === 0) return [];
  return [
    `${legacy.length} deviation(s) in the window recorded on or before ${LEGACY_DEFAULT_SEVERITY_THROUGH} carry severity 'minor', ` +
    'which the writer of that time stored by default for an unassessed deviation (migrations/20260922f_protocol_deviation_assessment.sql); ' +
    'the shares and the severity rule count them as minor, which may understate the major-or-critical share.',
  ];
}

// ─── Signals ─────────────────────────────────────────────────────────────────

const round2 = (x: number): number => Math.round(x * 100) / 100;
const pct = (x: number): string => `${Math.round(x * 100)}%`;

/**
 * DEV-CATEGORY-SPIKE, per category: the latest full month (the month before
 * today's) has ≥ SPIKE_MIN_COUNT deviations of the category AND ≥
 * SPIKE_MULTIPLIER × the mean of the SPIKE_PRIOR_MONTHS months before it.
 * Compared as `n·count ≥ k·priorSum` over n prior months — exact. Evaluated
 * only when all three prior months fall inside the window; otherwise nothing
 * is declared and `notAssessed` says why. Uncategorised deviations are in no
 * category, so the test cannot cover them; they are named when present.
 */
function categorySpikes(buckets: DeviationMonthBucket[], gaps: string[]): DeviationSignal[] {
  const li = buckets.length - 2;
  if (li < 0) {
    gaps.push(`DEV-CATEGORY-SPIKE not evaluated: a ${buckets.length}-month window holds no full month (the current month is partial).`);
    return [];
  }
  const latest = buckets[li];
  if (li < SPIKE_PRIOR_MONTHS) {
    gaps.push(
      `DEV-CATEGORY-SPIKE not evaluated: only ${li} month(s) before the latest full month ${latest.month} fall inside the window; ` +
      `the rule compares against the mean of the ${SPIKE_PRIOR_MONTHS} months before it (windowMonths ≥ ${SPIKE_PRIOR_MONTHS + 2}).`,
    );
    return [];
  }
  const prior = buckets.slice(li - SPIKE_PRIOR_MONTHS, li);
  const uncategorised = latest.categoryUnrecorded + prior.reduce((n, b) => n + b.categoryUnrecorded, 0);
  if (uncategorised > 0) {
    gaps.push(`DEV-CATEGORY-SPIKE covers categorised deviations only: ${uncategorised} deviation(s) in ${prior[0].month}..${latest.month} carry no category and could not be tested.`);
  }
  return CATEGORIES.flatMap((category) => spikeFor(category, latest, prior));
}

function spikeFor(category: DeviationCategory, latest: DeviationMonthBucket, prior: DeviationMonthBucket[]): DeviationSignal[] {
  const count = latest.byCategory[category];
  const priorCounts = prior.map((b) => b.byCategory[category]);
  const priorSum = priorCounts.reduce((n, x) => n + x, 0);
  if (count < SPIKE_MIN_COUNT || prior.length * count < SPIKE_MULTIPLIER * priorSum) return [];
  const priorMean = priorSum / prior.length;
  return [{
    code: 'DEV-CATEGORY-SPIKE',
    category,
    message:
      `${count} '${category}' deviations in ${latest.month}, against a mean of ${round2(priorMean)} over ` +
      `${prior[0].month}..${prior[prior.length - 1].month} (rule: ≥ ${SPIKE_MIN_COUNT} and ≥ ${SPIKE_MULTIPLIER} × the prior mean).`,
    evidence: {
      month: latest.month,
      count,
      priorMonths: prior.map((b) => b.month).join(', '),
      priorCounts: priorCounts.join(', '),
      priorMean: round2(priorMean),
      threshold: round2(Math.max(SPIKE_MIN_COUNT, SPIKE_MULTIPLIER * priorMean)),
    },
  }];
}

/**
 * DEV-SEVERITY-RISE: the latest full month has ≥ SEVERITY_RISE_MIN_COUNT
 * deviations and its major-or-critical share exceeds the share over the
 * earlier window months by ≥ SEVERITY_RISE_MIN_DELTA (absolute). Shares are
 * over SEVERITY-ASSESSED deviations only; the floor of 3 applies to assessed
 * deviations, so a month whose unassessed ones would decide it is reported
 * not evaluated. Earlier months with no assessed deviation → not evaluated.
 * Compared cross-multiplied — exact at the 0.2 boundary.
 */
function severityRise(buckets: DeviationMonthBucket[], gaps: string[]): DeviationSignal[] {
  const li = buckets.length - 2;
  if (li < 1) {
    gaps.push(`DEV-SEVERITY-RISE not evaluated: a ${buckets.length}-month window holds no month before the latest full month to compare against (windowMonths ≥ 3).`);
    return [];
  }
  const latestBucket = buckets[li];
  if (latestBucket.total < SEVERITY_RISE_MIN_COUNT) return [];
  const l = severityTally([latestBucket]);
  if (l.assessed < SEVERITY_RISE_MIN_COUNT) {
    gaps.push(`DEV-SEVERITY-RISE not evaluated: ${latestBucket.month} has ${latestBucket.total} deviation(s) but only ${l.assessed} with an assessed severity (the rule needs ${SEVERITY_RISE_MIN_COUNT}).`);
    return [];
  }
  const earlier = buckets.slice(0, li);
  const e = severityTally(earlier);
  const earlierSpan = `${earlier[0].month}..${earlier[earlier.length - 1].month}`;
  if (e.assessed === 0) {
    gaps.push(`DEV-SEVERITY-RISE not evaluated: the earlier window months ${earlierSpan} hold no deviation with an assessed severity to compare ${latestBucket.month} against.`);
    return [];
  }
  if (l.unassessed > 0) {
    gaps.push(`DEV-SEVERITY-RISE for ${latestBucket.month} is over its ${l.assessed} assessed deviation(s); ${l.unassessed} unassessed are excluded.`);
  }
  // rise ≥ RISE_NUM/RISE_DEN  ⇔  RISE_DEN·(lMC·eA − eMC·lA) ≥ RISE_NUM·lA·eA   (lA, eA > 0)
  const lhs = RISE_DEN * (l.majorOrCritical * e.assessed - e.majorOrCritical * l.assessed);
  if (lhs < RISE_NUM * l.assessed * e.assessed) return [];
  const latestShare = l.majorOrCritical / l.assessed;
  const earlierShare = e.majorOrCritical / e.assessed;
  return [{
    code: 'DEV-SEVERITY-RISE',
    message:
      `Major-or-critical share rose from ${pct(earlierShare)} (${e.majorOrCritical} of ${e.assessed}, ${earlierSpan}) ` +
      `to ${pct(latestShare)} (${l.majorOrCritical} of ${l.assessed}) in ${latestBucket.month} (rule: rise ≥ ${SEVERITY_RISE_MIN_DELTA}).`,
    evidence: {
      month: latestBucket.month,
      latestMajorOrCritical: l.majorOrCritical,
      latestAssessed: l.assessed,
      latestShare: round2(latestShare),
      earlierMonths: earlierSpan,
      earlierMajorOrCritical: e.majorOrCritical,
      earlierAssessed: e.assessed,
      earlierShare: round2(earlierShare),
      rise: round2(latestShare - earlierShare),
    },
  }];
}

// ─── Ageing ──────────────────────────────────────────────────────────────────

interface AgingResult { aging: DeviationTrends['aging']; signals: DeviationSignal[] }

/**
 * Every non-closed deviation, aged in whole UTC days from createdAt to today.
 * Buckets: 0–30, 31–90, > 90. DEV-AGING when any is older than
 * AGING_SIGNAL_DAYS. A deviation that cannot be aged (unreadable or future
 * createdAt) is in `open` but in no bucket, and is named by rowGaps.
 */
function computeAging(all: Classified[], todayDay: number): AgingResult {
  const open = all.filter((c) => c.row.status !== 'closed');
  const buckets = { '0-30': 0, '31-90': 0, '>90': 0 };
  const overdue: Array<{ c: Classified; age: number }> = [];
  for (const c of open) {
    if (c.day === null || c.day > todayDay) continue;
    const age = todayDay - c.day;
    if (age <= 30) buckets['0-30'] += 1;
    else if (age <= AGING_SIGNAL_DAYS) buckets['31-90'] += 1;
    else buckets['>90'] += 1;
    if (age > AGING_SIGNAL_DAYS) overdue.push({ c, age });
  }
  const aging = { open: open.length, buckets };
  if (overdue.length === 0) return { aging, signals: [] };
  const oldest = Math.max(...overdue.map((o) => o.age));
  return {
    aging,
    signals: [{
      code: 'DEV-AGING',
      message: `${overdue.length} open deviation(s) older than ${AGING_SIGNAL_DAYS} days at ${isoOfDay(todayDay)}; the oldest is ${oldest} days.`,
      evidence: {
        openOverThreshold: overdue.length,
        thresholdDays: AGING_SIGNAL_DAYS,
        oldestAgeDays: oldest,
        deviationIds: overdue.map((o) => o.c.row.id).join(', '),
        today: isoOfDay(todayDay),
      },
    }],
  };
}

// ─── CAPA ────────────────────────────────────────────────────────────────────

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0;

/** Median days from createdAt to closedAt over closed deviations whose closedAt is known. */
function closureLag(all: Classified[], notes: string[]): number | null {
  const closed = all.filter((c) => c.row.status === 'closed');
  if (closed.length === 0) {
    notes.push('No supplied deviation is closed, so there is no closure lag to measure.');
    return null;
  }
  const lags: number[] = [];
  const unknown: Classified[] = [];
  for (const c of closed) {
    const end = c.row.closedAt == null ? null : utcDayOf(c.row.closedAt);
    if (end === null || c.day === null || end < c.day) unknown.push(c); else lags.push(end - c.day);
  }
  if (unknown.length > 0) {
    notes.push(
      `Closure lag not known for ${unknown.length} of ${closed.length} closed deviation(s) (${idList(unknown)}): no readable closure date at or after createdAt ` +
      '(protocol_deviations records no closure timestamp); ' +
      (lags.length ? `the median is over the ${lags.length} with one.` : 'the median is null, not 0.'),
    );
  }
  return lags.length ? median(lags) : null;
}

function capaCounts(all: Classified[], notes: string[]): Pick<DeviationTrends['capa'], 'withOpenActions' | 'openWithoutActions'> {
  const unknownOpen = all.filter((c) => !isCount(c.row.capaActionsOpen));
  const known = all.filter((c) => isCount(c.row.capaActionsOpen));
  const withOpen = known.filter((c) => (c.row.capaActionsOpen as number) > 0).length;
  if (unknownOpen.length > 0) {
    notes.push(`Open CAPA action counts are not known for deviation(s) ${idList(unknownOpen)}; withOpenActions is null (at least ${withOpen} have open actions), not 0.`);
  }
  const openDevs = all.filter((c) => c.row.status !== 'closed');
  const unknownTotal = openDevs.filter((c) => !isCount(c.row.capaActionsTotal));
  if (unknownTotal.length > 0) {
    notes.push(`CAPA action totals are not known for open deviation(s) ${idList(unknownTotal)}; openWithoutActions is null, not 0.`);
  }
  return {
    withOpenActions: unknownOpen.length > 0 ? null : withOpen,
    openWithoutActions: unknownTotal.length > 0 ? null : openDevs.filter((c) => c.row.capaActionsTotal === 0).length,
  };
}

function computeCapa(all: Classified[], gaps: string[]): DeviationTrends['capa'] {
  const notes: string[] = [];
  const closureLagDaysMedian = closureLag(all, notes);
  const counts = capaCounts(all, notes);
  gaps.push(...notes);
  return { closureLagDaysMedian, ...counts, ...(notes.length ? { note: notes.join(' ') } : {}) };
}

// ─── Entry point ─────────────────────────────────────────────────────────────

/**
 * Trend protocol deviations over a window of calendar months ending with the
 * month of `today`, and raise the documented signals. Pure; see the module
 * header for every rule and the honesty contract.
 *
 * @throws TypeError when `today` is not a real YYYY-MM-DD date or
 *   `windowMonths` is not a finite number (a programming error, not data).
 */
export function trendDeviations(rows: DeviationRow[], opts: DeviationTrendOptions): DeviationTrends {
  const todayDay = parseToday(opts?.today);
  const n = resolveWindow(opts?.windowMonths);
  const todayMonth = monthIndexOfDay(todayDay);
  const months = Array.from({ length: n }, (_, i) => monthKeyOfIndex(todayMonth - (n - 1) + i));
  const fromDay = firstDayOfMonthIndex(todayMonth - (n - 1));

  const all = rows.map(classify).sort((a, b) => a.row.id - b.row.id);
  const inWindow = all.filter((c) => c.day !== null && c.day >= fromDay && c.day <= todayDay);
  const notAssessed = rowGaps(all, todayDay);

  const byMonth = bucketByMonth(inWindow, months);
  const rates = computeRates(byMonth, months, notAssessed);
  notAssessed.push(...legacySeverityGap(inWindow));
  const spikes = categorySpikes(byMonth, notAssessed);
  const rise = severityRise(byMonth, notAssessed);
  const { aging, signals: agingSignals } = computeAging(all, todayDay);
  const capa = computeCapa(all, notAssessed);

  return {
    window: { from: isoOfDay(fromDay), to: isoOfDay(todayDay), months },
    byMonth,
    rates,
    aging,
    capa,
    signals: [...spikes, ...rise, ...agingSignals],
    notAssessed,
    siteBreakdown: { available: false, reason: SITE_BREAKDOWN_UNAVAILABLE_REASON },
    basis: DEVIATION_TRENDS_BASIS,
  };
}
