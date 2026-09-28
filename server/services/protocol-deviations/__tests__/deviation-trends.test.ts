/**
 * Protocol-deviation trending and signal detection (ICH E6(R3) RBQM;
 * TransCelerate KRI methodology). Rules and the honesty contract: the module
 * header of ../deviation-trends.ts.
 *
 * What these tests pin: months are UTC calendar months and a row outside the
 * window is in no month; a spike needs three prior months inside the window
 * AND both the ≥ 3 and ≥ 2 × mean rules; the severity rise fires at exactly
 * +0.2 and not below; ageing buckets split at 30/31 and 90/91 days; a share
 * with nothing to measure is null, never 0; a closure date or CAPA count that
 * was not supplied is null with a note, never 0; the output is deterministic.
 */
import { describe, it, expect } from 'vitest';
import {
  trendDeviations,
  utcDayOf,
  DEVIATION_TRENDS_BASIS,
  DEVIATION_TREND_DEFAULT_WINDOW_MONTHS,
  SITE_BREAKDOWN_UNAVAILABLE_REASON,
  type DeviationRow,
  type DeviationTrends,
} from '../deviation-trends';

const TODAY = '2026-09-28';

let nextId = 1;
function dev(createdAt: string, over: Partial<DeviationRow> = {}): DeviationRow {
  return {
    id: nextId++,
    category: 'procedure',
    severity: 'minor',
    status: 'open',
    isReportable: false,
    createdAt,
    closedAt: null,
    capaActionsOpen: 0,
    capaActionsTotal: 0,
    ...over,
  };
}

/** `count` deviations recorded mid-month in `month` (YYYY-MM). */
function inMonth(month: string, count: number, over: Partial<DeviationRow> = {}): DeviationRow[] {
  return Array.from({ length: count }, () => dev(`${month}-15T12:00:00Z`, over));
}

const signalsOf = (t: DeviationTrends, code: string) => t.signals.filter((s) => s.code === code);
const monthTotal = (t: DeviationTrends, month: string) => t.byMonth.find((b) => b.month === month)?.total;

// ─── Window and month bucketing ──────────────────────────────────────────────

describe('window and month bucketing', () => {
  it('the default window is six calendar months ending with today\'s month, oldest first', () => {
    const t = trendDeviations([], { today: TODAY });
    expect(DEVIATION_TREND_DEFAULT_WINDOW_MONTHS).toBe(6);
    expect(t.window).toEqual({
      from: '2026-04-01',
      to: '2026-09-28',
      months: ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09'],
    });
    expect(t.byMonth.map((b) => b.month)).toEqual(t.window.months);
  });

  it('buckets by UTC month across the window boundary and excludes rows outside it', () => {
    const rows = [
      dev('2026-03-31T23:59:59Z'), //        before the window → in no month
      dev('2026-04-01T00:00:00Z'), //        first instant of the window
      dev('2026-05-01T01:00:00+02:00'), //   = 2026-04-30T23:00Z → April, not May
      dev('2026-06-15T10:00:00'), //         no zone → read as UTC
      dev('2026-07-01 00:30:00+01'), //      pg text form = 2026-06-30T23:30Z → June
      dev('2026-09-28T23:59:59Z'), //        today, last second
      dev('2026-09-29T00:00:00Z'), //        after today → in no month, named
    ];
    const t = trendDeviations(rows, { today: TODAY });
    expect(t.byMonth.map((b) => b.total)).toEqual([2, 0, 2, 0, 0, 1]);
    expect(t.notAssessed.join(' ')).toMatch(new RegExp(`#${rows[6].id}.*recorded after today`));
    expect(t.notAssessed.join(' ')).not.toMatch(new RegExp(`#${rows[0].id}\\b`));
  });

  it('crosses a year boundary', () => {
    const t = trendDeviations([dev('2025-12-31T23:00:00Z'), dev('2025-11-30T23:00:00Z')], { today: '2026-02-10', windowMonths: 3 });
    expect(t.window).toEqual({ from: '2025-12-01', to: '2026-02-10', months: ['2025-12', '2026-01', '2026-02'] });
    expect(t.byMonth.map((b) => b.total)).toEqual([1, 0, 0]);
  });

  it('clamps windowMonths to 1..36 and floors a fraction', () => {
    expect(trendDeviations([], { today: TODAY, windowMonths: 0 }).window.months).toEqual(['2026-09']);
    expect(trendDeviations([], { today: TODAY, windowMonths: -4 }).window.months).toEqual(['2026-09']);
    const max = trendDeviations([], { today: TODAY, windowMonths: 99 }).window;
    expect(max.months).toHaveLength(36);
    expect(max.months[0]).toBe('2023-10');
    expect(max.from).toBe('2023-10-01');
    expect(trendDeviations([], { today: TODAY, windowMonths: 2.7 }).window.months).toEqual(['2026-08', '2026-09']);
  });

  it('an invalid today is a programming error: TypeError', () => {
    for (const bad of ['2026-02-30', '2026-9-1', 'today', '2026-09-28T00:00:00Z', '', undefined]) {
      expect(() => trendDeviations([], { today: bad as string })).toThrow(TypeError);
    }
    expect(() => trendDeviations([], { today: TODAY, windowMonths: Number.NaN })).toThrow(TypeError);
  });

  it('a row whose createdAt cannot be read is named, not bucketed and not dropped silently', () => {
    const bad = dev('last Tuesday');
    const t = trendDeviations([bad, dev('2026-08-02T00:00:00Z')], { today: TODAY });
    expect(t.byMonth.reduce((n, b) => n + b.total, 0)).toBe(1);
    expect(t.notAssessed.join(' ')).toMatch(new RegExp(`#${bad.id} have a createdAt that cannot be read`));
  });

  it('an unassessed deviation is counted in the month, in no category and no severity — never as minor', () => {
    const t = trendDeviations([dev('2026-09-02T00:00:00Z', { category: null, severity: null, isReportable: null })], { today: TODAY });
    const sep = t.byMonth[5];
    expect(sep.total).toBe(1);
    expect(sep.categoryUnrecorded).toBe(1);
    expect(sep.severityUnassessed).toBe(1);
    expect(sep.reportableUndetermined).toBe(1);
    expect(sep.bySeverity).toEqual({ minor: 0, major: 0, critical: 0 });
    expect(sep.reportable).toBe(0);
  });

  it('utcDayOf reads dates and timestamps in UTC and refuses non-dates', () => {
    expect(utcDayOf('1970-01-02')).toBe(1);
    expect(utcDayOf('1970-01-01T23:59:59-00:01')).toBe(1);
    expect(utcDayOf('2026-02-29')).toBeNull();
    expect(utcDayOf('2026-01-01T24:00:00Z')).toBeNull();
    expect(utcDayOf('nonsense')).toBeNull();
  });
});

// ─── Rates ───────────────────────────────────────────────────────────────────

describe('shares — null when there is nothing to measure, never 0', () => {
  it('empty input: every count zero, both shares null, no signals, window populated', () => {
    const t = trendDeviations([], { today: TODAY });
    expect(t.rates.reportableShare).toBeNull();
    expect(t.rates.majorOrCriticalShare).toBeNull();
    expect(t.rates.denominators).toEqual({ windowTotal: 0, reportabilityDetermined: 0, severityAssessed: 0 });
    expect(t.byMonth).toHaveLength(6);
    expect(t.byMonth.every((b) => b.total === 0 && b.reportable === 0)).toBe(true);
    expect(t.signals).toEqual([]);
    expect(t.aging).toEqual({ open: 0, buckets: { '0-30': 0, '31-90': 0, '>90': 0 } });
    expect(t.capa.closureLagDaysMedian).toBeNull();
    expect(t.capa.withOpenActions).toBe(0);
    expect(t.notAssessed.join(' ')).toMatch(/null \(nothing to measure\), not 0%/);
  });

  it('all severities unassessed and all reportability undetermined → both shares null, not 0', () => {
    const t = trendDeviations(inMonth('2026-08', 4, { severity: null, isReportable: null }), { today: TODAY });
    expect(t.rates.majorOrCriticalShare).toBeNull();
    expect(t.rates.reportableShare).toBeNull();
    expect(t.rates.denominators).toEqual({ windowTotal: 4, reportabilityDetermined: 0, severityAssessed: 0 });
    expect(t.notAssessed.join(' ')).toMatch(/not counted as minor/);
    expect(t.notAssessed.join(' ')).toMatch(/not counted as not reportable/);
  });

  it('shares are over determined / assessed deviations only; the unknown are in neither numerator nor denominator', () => {
    const rows = [
      dev('2026-08-01T00:00:00Z', { severity: 'major', isReportable: true }),
      dev('2026-08-02T00:00:00Z', { severity: 'minor', isReportable: false }),
      dev('2026-08-03T00:00:00Z', { severity: null, isReportable: null }),
      dev('2026-08-04T00:00:00Z', { severity: 'critical', isReportable: true }),
    ];
    const t = trendDeviations(rows, { today: TODAY });
    expect(t.rates.majorOrCriticalShare).toBeCloseTo(2 / 3, 12);
    expect(t.rates.reportableShare).toBeCloseTo(2 / 3, 12);
    expect(t.rates.denominators).toEqual({ windowTotal: 4, reportabilityDetermined: 3, severityAssessed: 3 });
  });

  it('a minor recorded on or before 2026-09-22 is flagged as possibly the legacy default', () => {
    const legacy = trendDeviations([dev('2026-09-10T00:00:00Z')], { today: TODAY });
    expect(legacy.notAssessed.join(' ')).toMatch(/on or before 2026-09-22 carry severity 'minor'/);
    const current = trendDeviations([dev('2026-09-25T00:00:00Z')], { today: TODAY });
    expect(current.notAssessed.join(' ')).not.toMatch(/2026-09-22/);
  });
});

// ─── DEV-CATEGORY-SPIKE ──────────────────────────────────────────────────────

describe('DEV-CATEGORY-SPIKE — latest full month vs the three months before it', () => {
  const consent = { category: 'consent' as const };

  it('fires at ≥ 3 and ≥ 2 × the prior mean, with its evidence', () => {
    const rows = [...inMonth('2026-05', 1, consent), ...inMonth('2026-06', 1, consent), ...inMonth('2026-07', 1, consent), ...inMonth('2026-08', 3, consent)];
    const spikes = signalsOf(trendDeviations(rows, { today: TODAY }), 'DEV-CATEGORY-SPIKE');
    expect(spikes).toHaveLength(1);
    expect(spikes[0].category).toBe('consent');
    expect(spikes[0].evidence).toMatchObject({ month: '2026-08', count: 3, priorMonths: '2026-05, 2026-06, 2026-07', priorCounts: '1, 1, 1', priorMean: 1, threshold: 3 });
  });

  it('the ≥ 3 floor: 2 against a zero baseline does not fire, 3 does', () => {
    expect(signalsOf(trendDeviations(inMonth('2026-08', 2, consent), { today: TODAY }), 'DEV-CATEGORY-SPIKE')).toHaveLength(0);
    expect(signalsOf(trendDeviations(inMonth('2026-08', 3, consent), { today: TODAY }), 'DEV-CATEGORY-SPIKE')).toHaveLength(1);
  });

  it('the 2 × mean rule, exact at the boundary: mean 2 → 3 does not fire, 4 does', () => {
    const prior = [...inMonth('2026-05', 2, consent), ...inMonth('2026-06', 2, consent), ...inMonth('2026-07', 2, consent)];
    expect(signalsOf(trendDeviations([...prior, ...inMonth('2026-08', 3, consent)], { today: TODAY }), 'DEV-CATEGORY-SPIKE')).toHaveLength(0);
    const at = signalsOf(trendDeviations([...prior, ...inMonth('2026-08', 4, consent)], { today: TODAY }), 'DEV-CATEGORY-SPIKE');
    expect(at).toHaveLength(1);
    expect(at[0].evidence.threshold).toBe(4);
  });

  it('reads exactly the three months before: an earlier window month does not enter the mean', () => {
    const rows = [...inMonth('2026-04', 30, consent), ...inMonth('2026-08', 3, consent)];
    expect(signalsOf(trendDeviations(rows, { today: TODAY }), 'DEV-CATEGORY-SPIKE')).toHaveLength(1);
  });

  it('is evaluated per category: another category\'s volume is not this one\'s spike', () => {
    const rows = [...inMonth('2026-08', 5, { category: 'data' }), ...inMonth('2026-08', 2, consent)];
    const spikes = signalsOf(trendDeviations(rows, { today: TODAY }), 'DEV-CATEGORY-SPIKE');
    expect(spikes.map((s) => s.category)).toEqual(['data']);
  });

  it('with only one prior month in the window nothing is declared, and notAssessed says why', () => {
    const t = trendDeviations(inMonth('2026-08', 10, consent), { today: TODAY, windowMonths: 3 });
    expect(signalsOf(t, 'DEV-CATEGORY-SPIKE')).toHaveLength(0);
    expect(t.notAssessed.join(' ')).toMatch(/DEV-CATEGORY-SPIKE not evaluated: only 1 month\(s\) before the latest full month 2026-08/);
  });

  it('with two prior months: not evaluated; with three (windowMonths 5): evaluated and fires', () => {
    const rows = inMonth('2026-08', 10, consent);
    const four = trendDeviations(rows, { today: TODAY, windowMonths: 4 });
    expect(signalsOf(four, 'DEV-CATEGORY-SPIKE')).toHaveLength(0);
    expect(four.notAssessed.join(' ')).toMatch(/only 2 month\(s\)/);
    const five = trendDeviations(rows, { today: TODAY, windowMonths: 5 });
    expect(signalsOf(five, 'DEV-CATEGORY-SPIKE')).toHaveLength(1);
    expect(five.notAssessed.join(' ')).not.toMatch(/DEV-CATEGORY-SPIKE not evaluated/);
  });

  it('a one-month window holds no full month', () => {
    const t = trendDeviations(inMonth('2026-09', 10, consent), { today: TODAY, windowMonths: 1 });
    expect(t.signals).toEqual([]);
    expect(t.notAssessed.join(' ')).toMatch(/DEV-CATEGORY-SPIKE not evaluated: a 1-month window holds no full month/);
  });

  it('today\'s partial month is never compared', () => {
    expect(signalsOf(trendDeviations(inMonth('2026-09', 10, consent), { today: TODAY }), 'DEV-CATEGORY-SPIKE')).toHaveLength(0);
  });

  it('uncategorised deviations are named as untestable, not treated as no spike', () => {
    const t = trendDeviations(inMonth('2026-08', 4, { category: null }), { today: TODAY });
    expect(signalsOf(t, 'DEV-CATEGORY-SPIKE')).toHaveLength(0);
    expect(t.notAssessed.join(' ')).toMatch(/4 deviation\(s\) in 2026-05\.\.2026-08 carry no category/);
  });
});

// ─── DEV-SEVERITY-RISE ───────────────────────────────────────────────────────

describe('DEV-SEVERITY-RISE — latest full month vs the earlier window months', () => {
  // Spread over categories so no category spike muddies the fixtures.
  const earlierFive = (majors: number): DeviationRow[] => [
    ...inMonth('2026-05', majors, { severity: 'major', category: 'data' }),
    ...inMonth('2026-06', 5 - majors, { severity: 'minor', category: 'other' }),
  ];

  it('fires at a rise of exactly 0.2 (0.4 → 0.6) — no floating-point loss at the boundary', () => {
    const latest = [
      ...inMonth('2026-08', 2, { severity: 'major', category: 'consent' }),
      ...inMonth('2026-08', 1, { severity: 'critical', category: 'safety' }),
      ...inMonth('2026-08', 2, { severity: 'minor', category: 'data' }),
    ];
    const rises = signalsOf(trendDeviations([...earlierFive(2), ...latest], { today: TODAY }), 'DEV-SEVERITY-RISE');
    expect(rises).toHaveLength(1);
    expect(rises[0].evidence).toMatchObject({
      month: '2026-08', latestMajorOrCritical: 3, latestAssessed: 5, latestShare: 0.6,
      earlierMonths: '2026-04..2026-07', earlierMajorOrCritical: 2, earlierAssessed: 5, earlierShare: 0.4, rise: 0.2,
    });
  });

  it('does not fire below 0.2 (0.45 → 0.6)', () => {
    const earlier = [...inMonth('2026-05', 9, { severity: 'major' }), ...inMonth('2026-06', 11, { severity: 'minor' })];
    const latest = [...inMonth('2026-08', 3, { severity: 'major' }), ...inMonth('2026-08', 2, { severity: 'minor' })];
    expect(signalsOf(trendDeviations([...earlier, ...latest], { today: TODAY }), 'DEV-SEVERITY-RISE')).toHaveLength(0);
  });

  it('needs ≥ 3 deviations in the latest full month: 2 critical against 0% does not fire', () => {
    const t = trendDeviations([...earlierFive(0), ...inMonth('2026-08', 2, { severity: 'critical' })], { today: TODAY });
    expect(signalsOf(t, 'DEV-SEVERITY-RISE')).toHaveLength(0);
    expect(t.notAssessed.join(' ')).not.toMatch(/DEV-SEVERITY-RISE/);
  });

  it('earlier months with no deviation → not evaluated, and notAssessed says why', () => {
    const t = trendDeviations(inMonth('2026-08', 3, { severity: 'critical' }), { today: TODAY });
    expect(signalsOf(t, 'DEV-SEVERITY-RISE')).toHaveLength(0);
    expect(t.notAssessed.join(' ')).toMatch(/DEV-SEVERITY-RISE not evaluated: the earlier window months 2026-04\.\.2026-07 hold no deviation/);
  });

  it('an unassessed deviation that would decide the floor → not evaluated, never read as minor', () => {
    const latest = [...inMonth('2026-08', 2, { severity: 'critical' }), ...inMonth('2026-08', 1, { severity: null })];
    const t = trendDeviations([...earlierFive(0), ...latest], { today: TODAY });
    expect(signalsOf(t, 'DEV-SEVERITY-RISE')).toHaveLength(0);
    expect(t.notAssessed.join(' ')).toMatch(/2026-08 has 3 deviation\(s\) but only 2 with an assessed severity/);
  });

  it('a two-month window has nothing earlier to compare against', () => {
    const t = trendDeviations(inMonth('2026-08', 3, { severity: 'critical' }), { today: TODAY, windowMonths: 2 });
    expect(t.notAssessed.join(' ')).toMatch(/DEV-SEVERITY-RISE not evaluated: a 2-month window/);
  });
});

// ─── Ageing ──────────────────────────────────────────────────────────────────

describe('ageing — open deviations at today, in whole UTC days', () => {
  const at30 = () => dev('2026-08-29T23:59:59Z', { status: 'open' });
  const at31 = () => dev('2026-08-28T00:00:00Z', { status: 'under_review' });
  const at90 = () => dev('2026-06-30T12:00:00Z', { status: 'capa_pending' });
  const at91 = () => dev('2026-06-29T00:00:00Z', { status: 'open' });

  it('buckets at 30 | 31 and 90 | 91 days; closed deviations are not open', () => {
    const old91 = at91();
    const t = trendDeviations([at30(), at31(), at90(), old91, dev('2025-01-01T00:00:00Z', { status: 'closed' })], { today: TODAY });
    expect(t.aging).toEqual({ open: 4, buckets: { '0-30': 1, '31-90': 2, '>90': 1 } });
    const aging = signalsOf(t, 'DEV-AGING');
    expect(aging).toHaveLength(1);
    expect(aging[0].evidence).toMatchObject({ openOverThreshold: 1, thresholdDays: 90, oldestAgeDays: 91, deviationIds: String(old91.id) });
  });

  it('exactly 90 days does not raise DEV-AGING', () => {
    expect(signalsOf(trendDeviations([at90()], { today: TODAY }), 'DEV-AGING')).toHaveLength(0);
  });

  it('ages every open deviation, not only those inside the window', () => {
    const t = trendDeviations([at91()], { today: TODAY, windowMonths: 1 });
    expect(t.aging.buckets['>90']).toBe(1);
    expect(signalsOf(t, 'DEV-AGING')).toHaveLength(1);
  });
});

// ─── CAPA ────────────────────────────────────────────────────────────────────

describe('CAPA — closure lag and open actions; not known is null, never 0', () => {
  const closed = (created: string, closedAt: string | null) => dev(created, { status: 'closed', closedAt });

  it('median closure lag, odd count', () => {
    const rows = [closed('2026-09-01', '2026-09-11'), closed('2026-08-01', '2026-08-21'), closed('2026-07-01', '2026-08-10')];
    expect(trendDeviations(rows, { today: TODAY }).capa.closureLagDaysMedian).toBe(20);
  });

  it('median closure lag, even count', () => {
    const rows = [closed('2026-09-01', '2026-09-11'), closed('2026-08-01', '2026-08-21'), closed('2026-07-01', '2026-08-10'), closed('2026-06-01', '2026-07-01')];
    expect(trendDeviations(rows, { today: TODAY }).capa.closureLagDaysMedian).toBe(25);
  });

  it('closed deviations with no closedAt → lag null with a note, not 0', () => {
    const t = trendDeviations([closed('2026-08-01', null), dev('2026-08-02', { status: 'closed', closedAt: undefined })], { today: TODAY });
    expect(t.capa.closureLagDaysMedian).toBeNull();
    expect(t.capa.note).toMatch(/Closure lag not known for 2 of 2 closed deviation\(s\).*null, not 0/);
    expect(t.notAssessed.join(' ')).toMatch(/Closure lag not known/);
  });

  it('some closedAt missing → the median is over those that have one, and the rest are named', () => {
    const t = trendDeviations([closed('2026-08-01', '2026-08-11'), closed('2026-08-02', null), closed('2026-08-05', '2026-08-01')], { today: TODAY });
    expect(t.capa.closureLagDaysMedian).toBe(10);
    expect(t.capa.note).toMatch(/not known for 2 of 3 .*over the 1 with one/);
  });

  it('no closed deviation → lag null with a stated reason', () => {
    const t = trendDeviations([dev('2026-08-01')], { today: TODAY });
    expect(t.capa.closureLagDaysMedian).toBeNull();
    expect(t.capa.note).toMatch(/No supplied deviation is closed/);
  });

  it('CAPA counts not supplied → withOpenActions / openWithoutActions null with a note, not 0', () => {
    const known = dev('2026-08-01', { capaActionsOpen: 2, capaActionsTotal: 3 });
    const unknown = dev('2026-08-02', { capaActionsOpen: undefined, capaActionsTotal: null });
    const t = trendDeviations([known, unknown], { today: TODAY });
    expect(t.capa.withOpenActions).toBeNull();
    expect(t.capa.openWithoutActions).toBeNull();
    expect(t.capa.note).toMatch(new RegExp(`not known for deviation\\(s\\) #${unknown.id}; withOpenActions is null \\(at least 1 have open actions\\), not 0`));
  });

  it('CAPA counts supplied → counted', () => {
    const rows = [
      dev('2026-08-01', { capaActionsOpen: 1, capaActionsTotal: 2 }),
      dev('2026-08-02', { capaActionsOpen: 0, capaActionsTotal: 0 }),
      dev('2026-08-03', { status: 'closed', closedAt: '2026-08-10', capaActionsOpen: 0, capaActionsTotal: 0 }),
    ];
    const t = trendDeviations(rows, { today: TODAY });
    expect(t.capa.withOpenActions).toBe(1);
    expect(t.capa.openWithoutActions).toBe(1);
  });
});

// ─── Determinism and fixed parts ─────────────────────────────────────────────

describe('determinism and the fixed parts of the output', () => {
  const fixture = (): DeviationRow[] => {
    nextId = 1000;
    return [
      ...inMonth('2026-05', 1, { category: 'consent' }),
      ...inMonth('2026-08', 4, { category: 'consent', severity: 'major', isReportable: true }),
      dev('2026-06-01T00:00:00Z', { status: 'under_review', severity: null, isReportable: null }),
      dev('2026-07-01T00:00:00Z', { status: 'closed', closedAt: null }),
      dev('garbage'),
    ];
  };

  it('same input → deep-equal output, whatever the row order; the input is not mutated', () => {
    const rows = fixture();
    const snapshot = JSON.stringify(rows);
    const a = trendDeviations(rows, { today: TODAY });
    const b = trendDeviations(fixture(), { today: TODAY });
    const c = trendDeviations([...fixture()].reverse(), { today: TODAY });
    expect(b).toEqual(a);
    expect(JSON.stringify(c)).toBe(JSON.stringify(a));
    expect(JSON.stringify(rows)).toBe(snapshot);
    expect(a.signals.map((s) => s.code)).toEqual(['DEV-CATEGORY-SPIKE', 'DEV-SEVERITY-RISE', 'DEV-AGING']);
  });

  it('site breakdown is unavailable with its reason — no site dimension is faked', () => {
    const t = trendDeviations(fixture(), { today: TODAY });
    expect(t.siteBreakdown).toEqual({ available: false, reason: 'protocol_deviations carries no site linkage' });
    expect(SITE_BREAKDOWN_UNAVAILABLE_REASON).toBe('protocol_deviations carries no site linkage');
  });

  it('carries its regulatory basis', () => {
    expect(trendDeviations([], { today: TODAY }).basis).toBe(DEVIATION_TRENDS_BASIS);
    expect(DEVIATION_TRENDS_BASIS).toMatch(/ICH E6\(R3\).*TransCelerate/);
  });

  it('a month counts exactly the rows recorded in it', () => {
    expect(monthTotal(trendDeviations(fixture(), { today: TODAY }), '2026-08')).toBe(4);
  });
});
