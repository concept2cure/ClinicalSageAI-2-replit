/**
 * Regulatory fee estimator — indicative agency fees + waiver logic.
 */

import { describe, it, expect } from 'vitest';
import { estimateFees, getFeeSchedule, FEE_SCHEDULE, type FeeMarket } from '../regulatory-fee-estimator';

const MARKETS: FeeMarket[] = ['FDA', 'EMA', 'PMDA', 'HEALTH_CANADA'];

describe('FEE_SCHEDULE', () => {
  it('models every market with positive fees + a currency', () => {
    for (const m of MARKETS) {
      const s = getFeeSchedule(m)!;
      expect(s.currency).toBeTruthy();
      expect(s.applicationWithClinicalData).toBeGreaterThan(0);
      expect(s.annualProgramFee).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('estimateFees', () => {
  it('sums the application + 1 program year by default (FDA, with clinical data)', () => {
    const e = estimateFees({ market: 'FDA' });
    expect(e.currency).toBe('USD');
    expect(e.total).toBe(FEE_SCHEDULE.FDA.applicationWithClinicalData + FEE_SCHEDULE.FDA.annualProgramFee);
    expect(e.caveats.length).toBeGreaterThan(0);
  });

  it('uses the no-clinical-data application fee when requiresClinicalData is false', () => {
    const e = estimateFees({ market: 'FDA', requiresClinicalData: false, programYears: 0 });
    expect(e.total).toBe(FEE_SCHEDULE.FDA.applicationNoClinicalData);
  });

  it('waives the application + program fees for an orphan product', () => {
    const e = estimateFees({ market: 'FDA', orphan: true });
    expect(e.lineItems.every((li) => li.waived)).toBe(true);
    expect(e.total).toBe(0);
  });

  it('waives the application fee for a small business but not the program fee', () => {
    const e = estimateFees({ market: 'FDA', smallBusiness: true, programYears: 1 });
    const app = e.lineItems.find((li) => li.name.startsWith('Marketing-application'));
    const prog = e.lineItems.find((li) => li.name.startsWith('Annual program'));
    expect(app?.waived).toBe(true);
    expect(prog?.waived).toBe(false);
    expect(e.total).toBe(FEE_SCHEDULE.FDA.annualProgramFee);
  });

  it('multiplies the program fee by programYears', () => {
    const e = estimateFees({ market: 'EMA', programYears: 3 });
    const prog = e.lineItems.find((li) => li.name.includes('3 year'));
    expect(prog?.amount).toBe(FEE_SCHEDULE.EMA.annualProgramFee * 3);
  });

  it('honors a fee-schedule override', () => {
    const e = estimateFees({ market: 'FDA', programYears: 0, feeScheduleOverride: { applicationWithClinicalData: 1 } });
    expect(e.total).toBe(1);
  });

  it('returns a caveat for an unmodeled market', () => {
    const e = estimateFees({ market: 'XYZ' as FeeMarket });
    expect(e.lineItems).toEqual([]);
    expect(e.caveats[0]).toContain('No fee schedule');
  });

  it('is deterministic', () => {
    expect(estimateFees({ market: 'PMDA' })).toEqual(estimateFees({ market: 'PMDA' }));
  });
});
