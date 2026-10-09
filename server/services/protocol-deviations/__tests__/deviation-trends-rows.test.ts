/**
 * What each protocol_deviations row can be counted as in the deviation trend
 * (../deviation-trends-rows, exercised through trendDeviations).
 *
 * What these tests pin:
 *  - The replaced writer's defaults are set aside. Before 2026-09-23 the writer
 *    stored 'minor', 'other' and an is_reportable false computed from them
 *    (migrations/20260922f). Such a value is in the month's total but in no
 *    share, category or signal, is counted in legacyDefaults, and is named
 *    with the figures it moves.
 *  - An assessment on record (assessedAt) confirms a stored minor or false.
 *    It does not confirm a legacy 'other'. A false with no assessment is the
 *    old writer's whatever its date.
 *  - The cutoff is inclusive of 2026-09-23 and read in UTC.
 *  - Values outside the vocabulary are not coerced. Ids that are not safe
 *    integers, and conflicting duplicates, are counted in nothing. An
 *    identical duplicate is counted once. All are named, whatever the row order.
 */
import { describe, it, expect } from 'vitest';
import { trendDeviations, LEGACY_DEFAULTS_THROUGH, type DeviationRow, type DeviationTrends } from '../deviation-trends';

const TODAY = '2026-09-28';
const ASSESSED = '2026-09-27T09:00:00Z';

let nextId = 1;
/** A legacy-shaped row: minor / other / not reportable, no assessedAt supplied (the current caller). */
function row(createdAt: string, over: Partial<DeviationRow> = {}): DeviationRow {
  return {
    id: nextId++, category: 'other', severity: 'minor', status: 'open', isReportable: false, createdAt,
    closedAt: null, capaActionsOpen: 0, capaActionsTotal: 0, ...over,
  };
}
const notes = (t: DeviationTrends) => t.notAssessed.join(' ');
const sum = (t: DeviationTrends, pick: (b: DeviationTrends['byMonth'][number]) => number) => t.byMonth.reduce((n, b) => n + pick(b), 0);

describe('legacy defaults — set aside, counted, and named with the figures they move', () => {
  it('ten pre-fix rows stored minor / other / false are not "0% reportable over 10 determined"', () => {
    const t = trendDeviations(Array.from({ length: 10 }, () => row('2026-09-10T12:00:00Z')), { today: TODAY });
    expect(t.rates.reportableShare).toBeNull();
    expect(t.rates.majorOrCriticalShare).toBeNull();
    expect(t.rates.denominators).toEqual({ windowTotal: 10, reportabilityDetermined: 0, severityAssessed: 0 });
    const sep = t.byMonth[5];
    expect(sep).toMatchObject({ total: 10, reportable: 0, reportableUndetermined: 10, severityUnassessed: 10, categoryUnrecorded: 10 });
    expect(sep.byCategory.other).toBe(0);
    expect(sep.bySeverity.minor).toBe(0);
    expect(sep.legacyDefaults).toEqual({ minorSeverity: 10, otherCategory: 10, notReportable: 10 });
    expect(notes(t)).toMatch(/10 deviation\(s\) in the window carry is_reportable false with no assessment recorded.*outside reportableShare and denominators\.reportabilityDetermined/);
    expect(notes(t)).toMatch(/10 deviation\(s\) in the window carry severity 'minor' with no assessment recorded.*outside majorOrCriticalShare, denominators\.severityAssessed and DEV-SEVERITY-RISE/);
    expect(notes(t)).toMatch(/10 deviation\(s\) in the window carry category 'other'.*outside byCategory\.other and DEV-CATEGORY-SPIKE on 'other'/);
    expect(notes(t)).toMatch(/no readable assessedAt, so a possible default is detected by record date alone/);
  });

  it('a legacy false or minor is outside the share; a real major and a real true are in it', () => {
    const rows = [
      row('2026-06-10T00:00:00Z'),
      row('2026-06-11T00:00:00Z'),
      row('2026-06-12T00:00:00Z', { severity: 'major', isReportable: true, category: 'consent' }),
    ];
    const t = trendDeviations(rows, { today: TODAY });
    expect(t.rates.reportableShare).toBe(1);
    expect(t.rates.majorOrCriticalShare).toBe(1);
    expect(t.rates.denominators).toEqual({ windowTotal: 3, reportabilityDetermined: 1, severityAssessed: 1 });
  });

  it('an assessment on record confirms a stored minor and false, but not a legacy other', () => {
    const t = trendDeviations([row('2026-09-10T00:00:00Z', { assessedAt: ASSESSED })], { today: TODAY });
    const sep = t.byMonth[5];
    expect(sep.bySeverity.minor).toBe(1);
    expect(sep.reportableUndetermined).toBe(0);
    expect(t.rates.reportableShare).toBe(0);
    expect(sep.legacyDefaults).toEqual({ minorSeverity: 0, otherCategory: 1, notReportable: 0 });
    expect(notes(t)).not.toMatch(/record date alone/);
  });

  it('a false with NO assessment on record is the old writer\'s whatever its date — the current writer never stores one', () => {
    // Recorded after the cutoff (the fix had not reached this database yet).
    const t = trendDeviations([row('2026-09-25T00:00:00Z', { assessedAt: null })], { today: TODAY });
    expect(t.byMonth[5].legacyDefaults).toEqual({ minorSeverity: 1, otherCategory: 1, notReportable: 1 });
    expect(t.rates.reportableShare).toBeNull();
  });

  it('after the cutoff, a reporter\'s minor with no assessment yet (is_reportable null) is the reporter\'s value, not a default', () => {
    const t = trendDeviations([row('2026-09-25T00:00:00Z', { assessedAt: null, isReportable: null, category: 'procedure' })], { today: TODAY });
    const sep = t.byMonth[5];
    expect(sep.bySeverity.minor).toBe(1);
    expect(sep.byCategory.procedure).toBe(1);
    expect(sep.legacyDefaults).toEqual({ minorSeverity: 0, otherCategory: 0, notReportable: 0 });
  });

  it('the cutoff is 2026-09-23 inclusive, in UTC', () => {
    expect(LEGACY_DEFAULTS_THROUGH).toBe('2026-09-23');
    const legacyAt = (createdAt: string) => trendDeviations([row(createdAt)], { today: TODAY }).byMonth[5].legacyDefaults;
    expect(legacyAt('2026-09-22T12:00:00Z')).toEqual({ minorSeverity: 1, otherCategory: 1, notReportable: 1 });
    expect(legacyAt('2026-09-23T23:59:59Z')).toEqual({ minorSeverity: 1, otherCategory: 1, notReportable: 1 });
    expect(legacyAt('2026-09-24T01:00:00+02:00')).toEqual({ minorSeverity: 1, otherCategory: 1, notReportable: 1 }); // = 23:00Z on the 23rd
    expect(legacyAt('2026-09-24T00:00:00Z')).toEqual({ minorSeverity: 0, otherCategory: 0, notReportable: 0 });
  });

  it('a legacy other cannot raise or hide a DEV-CATEGORY-SPIKE on other', () => {
    const t = trendDeviations(Array.from({ length: 5 }, () => row('2026-08-15T00:00:00Z', { assessedAt: ASSESSED })), { today: TODAY });
    expect(t.signals.filter((s) => s.code === 'DEV-CATEGORY-SPIKE')).toEqual([]);
    expect(notes(t)).toMatch(/5 deviation\(s\) in 2026-05\.\.2026-08 carry no category the rule can use/);
  });

  it('an unreadable assessedAt is named and falls back to the record date', () => {
    const r = row('2026-09-10T00:00:00Z', { assessedAt: 'yesterday' });
    const t = trendDeviations([r], { today: TODAY });
    expect(notes(t)).toMatch(new RegExp(`#${r.id} carry an assessedAt that cannot be read`));
    expect(t.byMonth[5].legacyDefaults.minorSeverity).toBe(1);
  });
});

describe('vocabulary — an unrecognised value is not coerced, and is named', () => {
  it('category "Consent" and severity "high" count as uncategorised / unassessed; the key sets stay fixed', () => {
    const r = row('2026-09-25T00:00:00Z', {
      category: 'Consent' as DeviationRow['category'], severity: 'high' as DeviationRow['severity'], isReportable: true, assessedAt: ASSESSED,
    });
    const t = trendDeviations([r], { today: TODAY });
    const sep = t.byMonth[5];
    expect(sep).toMatchObject({ total: 1, categoryUnrecorded: 1, severityUnassessed: 1 });
    expect(Object.keys(sep.byCategory)).toEqual(['enrollment', 'consent', 'procedure', 'safety', 'data', 'other']);
    expect(Object.values(sep.byCategory).every((n) => n === 0)).toBe(true);
    expect(Object.keys(sep.bySeverity)).toEqual(['minor', 'major', 'critical']);
    expect(notes(t)).toMatch(new RegExp(`#${r.id} carry an unrecognised category value; they are counted as uncategorised`));
    expect(notes(t)).toMatch(new RegExp(`#${r.id} carry an unrecognised severity value; they are counted as unassessed`));
  });
});

describe('identity — ids, duplicates and order', () => {
  const major = (id: number, createdAt = '2026-08-15T00:00:00Z'): DeviationRow => ({
    id, category: 'consent', severity: 'major', status: 'open', isReportable: true, createdAt, assessedAt: ASSESSED, capaActionsOpen: 0, capaActionsTotal: 0,
  });

  it('one deviation supplied three times is counted once, named, and raises no spike', () => {
    const t = trendDeviations([major(7), major(7), major(7)], { today: TODAY });
    expect(sum(t, (b) => b.total)).toBe(1);
    expect(t.signals.filter((s) => s.code === 'DEV-CATEGORY-SPIKE')).toEqual([]);
    expect(notes(t)).toMatch(/#7 are supplied more than once with identical content; each is counted once/);
  });

  it('copies of an id that differ are counted in nothing, and named', () => {
    const t = trendDeviations([major(8), { ...major(8), severity: 'minor' }, major(9)], { today: TODAY });
    expect(sum(t, (b) => b.total)).toBe(1);
    expect(notes(t)).toMatch(/#8 are supplied more than once with differing content; which copy is the record is not known/);
  });

  it('a row with no valid id is counted in nothing, the number is stated, and the output does not depend on order', () => {
    const bad = [major(Number.NaN, 'x'), major(1.5, 'x'), { ...major(0, 'x'), id: '4' as unknown as number }, null as unknown as DeviationRow];
    const rows = [...bad, major(3, 'x'), major(1, 'x')];
    const a = trendDeviations(rows, { today: TODAY });
    const b = trendDeviations([...rows].reverse(), { today: TODAY });
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
    expect(notes(a)).toMatch(/4 supplied row\(s\) carry no valid deviation id/);
    expect(notes(a)).toMatch(/Deviation\(s\) #1, #3 have a createdAt that cannot be read/);
  });
});
