/**
 * Unit tests for the pure NIH Other Support logic (Capability C2C-24A).
 */

import { describe, it, expect } from 'vitest';
import {
  computeOtherSupportSummary,
  evaluateOtherSupportReadiness,
  buildOtherSupportExport,
  MAX_CALENDAR_MONTHS_PER_YEAR,
  type OtherSupportEntryView,
} from '../other-support-logic';

function entry(over: Partial<OtherSupportEntryView> = {}): OtherSupportEntryView {
  return {
    projectTitle: 'R01 Cancer Study',
    fundingSource: 'NIH/NCI',
    status: 'active',
    isForeign: false,
    foreignCountry: null,
    personMonthsCalendar: 3,
    personMonthsAcademic: 0,
    personMonthsSummer: 0,
    majorGoals: 'Investigate tumor microenvironment.',
    overlapStatement: 'No scientific or budgetary overlap.',
    ...over,
  };
}

describe('computeOtherSupportSummary', () => {
  it('totals committed person-months by status and combined', () => {
    const s = computeOtherSupportSummary([
      entry({ personMonthsCalendar: 3 }),
      entry({ status: 'pending', personMonthsCalendar: 2, personMonthsSummer: 1 }),
    ]);
    expect(s.entryCount).toBe(2);
    expect(s.activeCount).toBe(1);
    expect(s.pendingCount).toBe(1);
    expect(s.active.total).toBe(3);
    expect(s.pending.total).toBe(3);
    expect(s.combined.total).toBe(6);
    expect(s.overcommitted).toBe(false);
  });

  it('flags overcommitment when active committed effort exceeds 12 calendar months', () => {
    const s = computeOtherSupportSummary([
      entry({ personMonthsCalendar: 7 }),
      entry({ personMonthsCalendar: 6 }),
    ]);
    expect(s.active.total).toBe(13);
    expect(s.overcommitted).toBe(true);
  });

  it('does not count pending effort toward overcommitment', () => {
    const s = computeOtherSupportSummary([
      entry({ personMonthsCalendar: 6 }),
      entry({ status: 'pending', personMonthsCalendar: 9 }),
    ]);
    expect(s.active.total).toBe(6);
    expect(s.overcommitted).toBe(false);
    expect(s.pending.total).toBe(9);
  });

  it('treats exactly 12 active months as not overcommitted (boundary)', () => {
    const s = computeOtherSupportSummary([entry({ personMonthsCalendar: MAX_CALENDAR_MONTHS_PER_YEAR })]);
    expect(s.overcommitted).toBe(false);
  });

  it('counts foreign entries', () => {
    const s = computeOtherSupportSummary([entry(), entry({ isForeign: true, foreignCountry: 'Germany' })]);
    expect(s.foreignCount).toBe(1);
  });
});

describe('evaluateOtherSupportReadiness', () => {
  it('blocks when there are no entries', () => {
    const r = evaluateOtherSupportReadiness([]);
    expect(r.readyToCertify).toBe(false);
    expect(r.blockers.length).toBeGreaterThan(0);
  });

  it('blocks an entry missing major goals or overlap statement', () => {
    const r = evaluateOtherSupportReadiness([entry({ majorGoals: '  ', overlapStatement: null })]);
    expect(r.readyToCertify).toBe(false);
    expect(r.blockers.some((b) => /major goals/i.test(b))).toBe(true);
    expect(r.blockers.some((b) => /overlap/i.test(b))).toBe(true);
  });

  it('blocks a foreign entry missing its country', () => {
    const r = evaluateOtherSupportReadiness([entry({ isForeign: true, foreignCountry: null })]);
    expect(r.readyToCertify).toBe(false);
    expect(r.blockers.some((b) => /country/i.test(b))).toBe(true);
  });

  it('blocks on effort overcommitment', () => {
    const r = evaluateOtherSupportReadiness([entry({ personMonthsCalendar: 14 })]);
    expect(r.readyToCertify).toBe(false);
    expect(r.blockers.some((b) => /overcommit|exceeds/i.test(b))).toBe(true);
  });

  it('is ready when a complete, in-budget entry is present', () => {
    const r = evaluateOtherSupportReadiness([entry()]);
    expect(r.readyToCertify).toBe(true);
    expect(r.blockers).toHaveLength(0);
    expect(r.findings).toHaveLength(0);
  });
});

describe('buildOtherSupportExport', () => {
  it('assembles ordered rows with per-entry person-month totals + summary + readiness', () => {
    const exp = buildOtherSupportExport([
      entry({ supportType: 'grant', awardIdentifier: '5R01CA000000' }),
      entry({ status: 'pending', supportType: 'in_kind' }),
    ]);
    expect(exp.rows).toHaveLength(2);
    expect(exp.rows[0].order).toBe(1);
    expect(exp.rows[0].awardIdentifier).toBe('5R01CA000000');
    expect(exp.rows[0].personMonths.total).toBe(3);
    expect(exp.summary.entryCount).toBe(2);
    expect(exp.readiness.readyToCertify).toBe(true);
  });
});
