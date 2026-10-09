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
 * nothing. This module is that trend: monthly counts, the prompt-IRB-report
 * and major-or-critical shares, open-deviation ageing, CAPA closure lag, and
 * three documented signal rules. What each row may be counted as is decided
 * first, in `./deviation-trends-rows`.
 *
 * ## What each part covers
 *  - `window`, `byMonth`, `rates`, and the two month-based signals read ONLY
 *    the deviations whose `createdAt` (protocol_deviations.created_at — the
 *    date the deviation was RECORDED, not `discovered_date`) falls in the
 *    window: the `windowMonths` calendar months ending with today's month.
 *  - `aging` and `capa` are the CURRENT state of every supplied row as of
 *    `today`, whatever month it was recorded in — a deviation open for 200
 *    days is exactly what ageing exists to show, window or not. Age is
 *    counted from the record date, and a note says so.
 *  - All date arithmetic is on UTC calendar days; nothing is read in the
 *    host's local zone.
 *
 * ## The signal rules (each documented at its function)
 *  - The latest FULL month is the month before today's month; today's month
 *    is partial and is never compared.
 *  - DEV-CATEGORY-SPIKE: that month's count for a category is ≥ 3 AND ≥ 2 × the
 *    mean of the three months before it. Fewer than three prior months inside
 *    the window → not evaluated, and `notAssessed` says why.
 *  - DEV-SEVERITY-RISE: that month has ≥ 3 severity-ASSESSED deviations and
 *    its major-or-critical share exceeds the share over the earlier window
 *    months by ≥ 0.2 absolute. Earlier months with no assessed deviation →
 *    not evaluated (`notAssessed`).
 *  - DEV-AGING: any open deviation (a recognised status other than `closed`)
 *    older than 90 days at `today`.
 *  Thresholds are compared in exact integer arithmetic (cross-multiplied), so
 *  a rise of exactly 0.2 or a count of exactly 2 × the mean is never lost to
 *  floating-point rounding.
 *
 * "Major or critical": the severity union in `./protocol-deviations-logic` is
 * `'minor' | 'major' | 'critical'`, so the names map one-to-one. That scale is
 * the platform's internal one, assessed by a person; it is not the regulatory
 * "important deviation" category. "Reportable" is is_reportable: a PROMPT IRB
 * report is indicated. Every deviation is still documented and reported to
 * the sponsor (ICH E6(R2) 4.5.3), so the rest are not "not reported".
 *
 * ## The honesty contract
 *  - Pure: no model call, no randomness, no clock (`today` is injected), no
 *    database. Same input → deep-equal output, whatever the row order; the
 *    input is not mutated. An invalid `rows`, `today` or `windowMonths` is a
 *    programming error and throws a TypeError; bad DATA never throws.
 *  - An unassessed severity is NOT a minor one and an undetermined
 *    reportability is NOT "no prompt report indicated": both are counted in
 *    the month's `total`, kept out of every share's numerator AND denominator,
 *    counted in `severityUnassessed` / `reportableUndetermined`, and named.
 *  - A value the replaced writer may have defaulted (a 'minor', an 'other', an
 *    is_reportable false; see LEGACY_DEFAULTS_THROUGH) is treated the same
 *    way. It is also counted in `legacyDefaults`, and `notAssessed` names every
 *    figure it moves and in which direction.
 *  - A share with nothing to measure is `null`, never 0. Empty input → every
 *    count zero, both shares null, no signals, the window still populated.
 *  - `closedAt` and the CAPA counts are not columns of protocol_deviations.
 *    Absent, null, impossible (after today, before createdAt) or inconsistent
 *    (more open actions than actions) means NOT KNOWN. The metric is then
 *    null or excludes the row, with a note. It is never 0 and never computed
 *    from the bad value.
 *  - A rule that could not be evaluated is listed in `notAssessed` with its
 *    reason — "not evaluated" is never rendered as "no signal".
 *  - A row whose `createdAt` cannot be read or lies after `today` is in no
 *    month and in no ageing bucket. An open one still counts in `aging.open`.
 *    Both are named. A row with an unrecognised status, an invalid id or a
 *    conflicting duplicate id is named too. No row is dropped silently.
 *  - `siteBreakdown.available` is false: protocol_deviations carries no site
 *    linkage, and a site dimension is not faked.
 *
 * @module server/services/protocol-deviations/deviation-trends
 */

import type { DeviationCategory, DeviationSeverity } from './protocol-deviations-logic';
import {
  CATEGORIES,
  SEVERITIES,
  capList,
  firstDayOfMonthIndex,
  idList,
  isoOfDay,
  legacyGaps,
  monthIndexOfDay,
  monthKeyOfIndex,
  readRows,
  utcDayOf,
  valueGaps,
  type Classified,
  type DeviationRow,
} from './deviation-trends-rows';

export { utcDayOf, LEGACY_DEFAULTS_THROUGH, MAX_LISTED_IDS, type DeviationRow } from './deviation-trends-rows';

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

export const SITE_BREAKDOWN_UNAVAILABLE_REASON = 'protocol_deviations carries no site linkage';

/** What `rates.reportableShare` measures, carried in the output so it is never read as "the rest need not be reported". */
export const REPORTABLE_SHARE_MEANING =
  'Share of deviations with a determination for which a prompt IRB report is indicated (is_reportable true). ' +
  'It is not the share that must be reported: every deviation is documented and reported to the sponsor (ICH E6(R2) 4.5.3), and the IRB\'s written procedures decide which deviations it requires.';

export const AGING_FROM_RECORD_DATE_NOTE =
  'Ageing is counted from the record date (createdAt), not the discovery date, which is not supplied. A deviation discovered before it was recorded is older than shown, so the ageing buckets and DEV-AGING may understate age.';

// ─── Contract ────────────────────────────────────────────────────────────────

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
  /** In `total`, in no category: unrecorded, an unrecognised value, or a legacy 'other' set aside. */
  categoryUnrecorded: number;
  bySeverity: Record<DeviationSeverity, number>;
  /** In `total`, in no severity: unassessed, an unrecognised value, or a legacy 'minor' set aside. Not counted as minor. */
  severityUnassessed: number;
  /** A prompt IRB report is indicated (isReportable true). */
  reportable: number;
  /** No determination, or a legacy false set aside. Not counted as "no prompt report indicated". */
  reportableUndetermined: number;
  /** Of the three columns above, the rows set aside as a possible default of the replaced writer. */
  legacyDefaults: { minorSeverity: number; otherCategory: number; notReportable: number };
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
    /** reportable / deviations with a determination; null when none. See `reportableShareMeaning`. */
    reportableShare: number | null;
    reportableShareMeaning: string;
    /** (major + critical) / severity-assessed deviations; null when none. */
    majorOrCriticalShare: number | null;
    /** What each share was measured over, so a share is never read without its base. */
    denominators: { windowTotal: number; reportabilityDetermined: number; severityAssessed: number };
  };
  /** `open`: recognised non-closed statuses. A row that cannot be aged is in `open` but in no bucket. */
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

// ─── Inputs ──────────────────────────────────────────────────────────────────

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

// ─── Monthly buckets ─────────────────────────────────────────────────────────

function emptyBucket(month: string): DeviationMonthBucket {
  const byCategory = Object.fromEntries(CATEGORIES.map((c) => [c, 0])) as Record<DeviationCategory, number>;
  const bySeverity = Object.fromEntries(SEVERITIES.map((s) => [s, 0])) as Record<DeviationSeverity, number>;
  return {
    month, total: 0, byCategory, categoryUnrecorded: 0, bySeverity, severityUnassessed: 0, reportable: 0, reportableUndetermined: 0,
    legacyDefaults: { minorSeverity: 0, otherCategory: 0, notReportable: 0 },
  };
}

function addToBucket(b: DeviationMonthBucket, c: Classified): void {
  b.total += 1;
  if (c.category === null) b.categoryUnrecorded += 1; else b.byCategory[c.category] += 1;
  if (c.severity === null) b.severityUnassessed += 1; else b.bySeverity[c.severity] += 1;
  if (c.reportable === true) b.reportable += 1;
  if (c.reportable === null) b.reportableUndetermined += 1;
  if (c.legacy.minor) b.legacyDefaults.minorSeverity += 1;
  if (c.legacy.other) b.legacyDefaults.otherCategory += 1;
  if (c.legacy.notReportable) b.legacyDefaults.notReportable += 1;
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

interface SeverityTally { majorOrCritical: number; assessed: number; unassessed: number; legacyMinor: number }

function severityTally(buckets: DeviationMonthBucket[]): SeverityTally {
  const t: SeverityTally = { majorOrCritical: 0, assessed: 0, unassessed: 0, legacyMinor: 0 };
  for (const b of buckets) {
    t.majorOrCritical += b.bySeverity.major + b.bySeverity.critical;
    t.assessed += b.bySeverity.minor + b.bySeverity.major + b.bySeverity.critical;
    t.unassessed += b.severityUnassessed;
    t.legacyMinor += b.legacyDefaults.minorSeverity;
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
      gaps.push(`${undetermined} of ${windowTotal} deviation(s) in the window have no prompt-IRB-report determination; reportableShare is over the ${windowTotal - undetermined} determined, and an undetermined one is not counted as no-prompt-report-indicated.`);
    }
    if (sev.unassessed > 0) {
      gaps.push(`${sev.unassessed} of ${windowTotal} deviation(s) in the window have no assessed severity; majorOrCriticalShare is over the ${sev.assessed} assessed, and an unassessed one is not counted as minor.`);
    }
  }
  return {
    reportableShare: share(reportable, windowTotal - undetermined),
    reportableShareMeaning: REPORTABLE_SHARE_MEANING,
    majorOrCriticalShare: share(sev.majorOrCritical, sev.assessed),
    denominators: { windowTotal, reportabilityDetermined: windowTotal - undetermined, severityAssessed: sev.assessed },
  };
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
 * is declared and `notAssessed` says why. Uncategorised deviations (including
 * a legacy 'other' set aside) are in no category, so the test cannot cover
 * them; they are named when present.
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
    gaps.push(`DEV-CATEGORY-SPIKE covers categorised deviations only: ${uncategorised} deviation(s) in ${prior[0].month}..${latest.month} carry no category the rule can use (unrecorded, unrecognised, or a legacy 'other' set aside) and could not be tested.`);
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

/** Why DEV-SEVERITY-RISE cannot be evaluated over these tallies, or null when it can. */
function riseNotEvaluated(l: SeverityTally, e: SeverityTally, latestMonth: string, total: number, earlierSpan: string): string | null {
  if (l.assessed < SEVERITY_RISE_MIN_COUNT) {
    return `DEV-SEVERITY-RISE not evaluated: ${latestMonth} has ${total} deviation(s) but only ${l.assessed} with an assessed severity (the rule needs ${SEVERITY_RISE_MIN_COUNT}).`;
  }
  if (e.assessed === 0) {
    return `DEV-SEVERITY-RISE not evaluated: the earlier window months ${earlierSpan} hold no deviation with an assessed severity to compare ${latestMonth} against.`;
  }
  return null;
}

/**
 * DEV-SEVERITY-RISE: the latest full month has ≥ SEVERITY_RISE_MIN_COUNT
 * deviations and its major-or-critical share exceeds the share over the
 * earlier window months by ≥ SEVERITY_RISE_MIN_DELTA (absolute). Shares are
 * over SEVERITY-ASSESSED deviations only. A legacy 'minor' set aside is not
 * assessed, so a defaulted minor can neither manufacture nor hide a rise. The
 * floor of 3 applies to assessed deviations, so a month whose unassessed ones
 * would decide it is reported not evaluated. Earlier months with no assessed
 * deviation → not evaluated. Compared cross-multiplied — exact at 0.2.
 */
function severityRise(buckets: DeviationMonthBucket[], gaps: string[]): DeviationSignal[] {
  const li = buckets.length - 2;
  if (li < 1) {
    gaps.push(`DEV-SEVERITY-RISE not evaluated: a ${buckets.length}-month window holds no month before the latest full month to compare against (windowMonths ≥ 3).`);
    return [];
  }
  const latestBucket = buckets[li];
  if (latestBucket.total < SEVERITY_RISE_MIN_COUNT) return [];
  const earlier = buckets.slice(0, li);
  const l = severityTally([latestBucket]);
  const e = severityTally(earlier);
  const earlierSpan = `${earlier[0].month}..${earlier[earlier.length - 1].month}`;
  const legacyMinor = l.legacyMinor + e.legacyMinor;
  if (legacyMinor > 0) {
    gaps.push(`DEV-SEVERITY-RISE is evaluated without the ${legacyMinor} legacy 'minor' in ${earlier[0].month}..${latestBucket.month} that may be a default; counted as minor they could manufacture or hide a rise.`);
  }
  const reason = riseNotEvaluated(l, e, latestBucket.month, latestBucket.total, earlierSpan);
  if (reason !== null) {
    gaps.push(reason);
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
      unassessedExcluded: l.unassessed + e.unassessed,
      legacyMinorExcluded: legacyMinor,
    },
  }];
}

// ─── Ageing ──────────────────────────────────────────────────────────────────

interface AgingResult { aging: DeviationTrends['aging']; signals: DeviationSignal[] }

/**
 * Every deviation with a recognised non-closed status, aged in whole UTC days
 * from createdAt to today. Buckets: 0–30, 31–90, > 90. DEV-AGING when any is
 * older than AGING_SIGNAL_DAYS. A deviation that cannot be aged (unreadable or
 * future createdAt) is in `open` but in no bucket, and is named by valueGaps.
 */
function computeAging(all: Classified[], todayDay: number, gaps: string[]): AgingResult {
  const open = all.filter((c) => c.status !== null && c.status !== 'closed');
  const buckets = { '0-30': 0, '31-90': 0, '>90': 0 };
  const overdue: number[] = [];
  let oldest = 0;
  for (const c of open) {
    if (c.day === null || c.day > todayDay) continue;
    const age = todayDay - c.day;
    if (age <= 30) buckets['0-30'] += 1;
    else if (age <= AGING_SIGNAL_DAYS) buckets['31-90'] += 1;
    else buckets['>90'] += 1;
    if (age > AGING_SIGNAL_DAYS) overdue.push(c.row.id);
    if (age > oldest) oldest = age;
  }
  const aging = { open: open.length, buckets };
  if (buckets['0-30'] + buckets['31-90'] + buckets['>90'] > 0) gaps.push(AGING_FROM_RECORD_DATE_NOTE);
  if (overdue.length === 0) return { aging, signals: [] };
  return {
    aging,
    signals: [{
      code: 'DEV-AGING',
      message: `${overdue.length} open deviation(s) older than ${AGING_SIGNAL_DAYS} days at ${isoOfDay(todayDay)}; the oldest is ${oldest} days.`,
      evidence: {
        openOverThreshold: overdue.length,
        thresholdDays: AGING_SIGNAL_DAYS,
        oldestAgeDays: oldest,
        deviationIds: capList(overdue.map(String)),
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

const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;

/** A closed deviation's lag in days, or why it is not known. */
function lagOf(c: Classified, todayDay: number): number | string {
  const end = c.row.closedAt == null ? null : utcDayOf(c.row.closedAt);
  if (end === null) return 'no readable closure date (protocol_deviations records no closure timestamp)';
  if (c.day === null) return 'a createdAt that cannot be read';
  if (c.day > todayDay || end > todayDay) return `a createdAt or closure date after today (${isoOfDay(todayDay)})`;
  if (end < c.day) return 'a closure date before createdAt';
  return end - c.day;
}

/** Median days from createdAt to closedAt over closed deviations whose lag is known. */
function closureLag(all: Classified[], todayDay: number, notes: string[]): number | null {
  const closed = all.filter((c) => c.status === 'closed');
  if (closed.length === 0) {
    notes.push('No supplied deviation is closed, so there is no closure lag to measure.');
    return null;
  }
  const lags: number[] = [];
  const why = new Map<string, Classified[]>();
  for (const c of closed) {
    const lag = lagOf(c, todayDay);
    if (typeof lag === 'number') { lags.push(lag); continue; }
    const same = why.get(lag);
    if (same) same.push(c); else why.set(lag, [c]);
  }
  if (why.size > 0) {
    const unknown = closed.length - lags.length;
    const reasons = [...why].map(([reason, cs]) => `${reason}: ${idList(cs)}`).join('; ');
    notes.push(
      `Closure lag not known for ${unknown} of ${closed.length} closed deviation(s) (${reasons}); ` +
      (lags.length ? `the median is over the ${lags.length} with one.` : 'the median is null, not 0.'),
    );
  }
  return lags.length ? median(lags) : null;
}

/** A row's CAPA counts; both not known when they contradict each other. */
function capaOf(c: Classified): { open: number | null; total: number | null; inconsistent: boolean } {
  const open = isCount(c.row.capaActionsOpen) ? c.row.capaActionsOpen : null;
  const total = isCount(c.row.capaActionsTotal) ? c.row.capaActionsTotal : null;
  if (open !== null && total !== null && open > total) return { open: null, total: null, inconsistent: true };
  return { open, total, inconsistent: false };
}

function capaCounts(all: Classified[], notes: string[]): Pick<DeviationTrends['capa'], 'withOpenActions' | 'openWithoutActions'> {
  const k = all.map((c) => ({ c, ...capaOf(c) }));
  const inconsistent = k.filter((x) => x.inconsistent).map((x) => x.c);
  if (inconsistent.length > 0) {
    notes.push(`Deviation(s) ${idList(inconsistent)} report more open CAPA actions than CAPA actions in total; both counts are treated as not known.`);
  }
  const unknownOpen = k.filter((x) => x.open === null).map((x) => x.c);
  const withOpen = k.filter((x) => x.open !== null && x.open > 0).length;
  if (unknownOpen.length > 0) {
    notes.push(`Open CAPA action counts are not known for deviation(s) ${idList(unknownOpen)}; withOpenActions is null (at least ${withOpen} have open actions), not 0.`);
  }
  const openDevs = k.filter((x) => x.c.status !== null && x.c.status !== 'closed');
  const unknownTotal = openDevs.filter((x) => x.total === null).map((x) => x.c);
  if (unknownTotal.length > 0) {
    notes.push(`CAPA action totals are not known for open deviation(s) ${idList(unknownTotal)}; openWithoutActions is null, not 0.`);
  }
  const unknownStatus = all.filter((c) => c.status === null);
  if (unknownStatus.length > 0) {
    notes.push(`Whether deviation(s) ${idList(unknownStatus)} are open is not known (unrecognised status); openWithoutActions is null, not 0.`);
  }
  return {
    withOpenActions: unknownOpen.length > 0 ? null : withOpen,
    openWithoutActions: unknownTotal.length > 0 || unknownStatus.length > 0 ? null : openDevs.filter((x) => x.total === 0).length,
  };
}

function computeCapa(all: Classified[], todayDay: number, gaps: string[]): DeviationTrends['capa'] {
  const notes: string[] = [];
  const closureLagDaysMedian = closureLag(all, todayDay, notes);
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
 * @throws TypeError when `rows` is not an array, `today` is not a real
 *   YYYY-MM-DD date, or `windowMonths` is not a finite number (a programming
 *   error, not data).
 */
export function trendDeviations(rows: readonly DeviationRow[], opts: DeviationTrendOptions): DeviationTrends {
  if (!Array.isArray(rows)) throw new TypeError('trendDeviations: rows must be an array.');
  const todayDay = parseToday(opts?.today);
  const n = resolveWindow(opts?.windowMonths);
  const todayMonth = monthIndexOfDay(todayDay);
  const months = Array.from({ length: n }, (_, i) => monthKeyOfIndex(todayMonth - (n - 1) + i));
  const fromDay = firstDayOfMonthIndex(todayMonth - (n - 1));

  const { all, gaps } = readRows(rows);
  const inWindow = all.filter((c) => c.day !== null && c.day >= fromDay && c.day <= todayDay);
  const notAssessed = [...gaps, ...valueGaps(all, todayDay)];

  const byMonth = bucketByMonth(inWindow, months);
  const rates = computeRates(byMonth, months, notAssessed);
  notAssessed.push(...legacyGaps(inWindow));
  const spikes = categorySpikes(byMonth, notAssessed);
  const rise = severityRise(byMonth, notAssessed);
  const { aging, signals: agingSignals } = computeAging(all, todayDay, notAssessed);
  const capa = computeCapa(all, todayDay, notAssessed);

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
