/**
 * Lifecycle obligations calendar — recurring post-approval obligations per market.
 */

import { describe, it, expect } from 'vitest';
import {
  getLifecycleObligations,
  computeObligationSchedule,
  LIFECYCLE_MARKETS,
  type Market,
} from '../lifecycle-obligations-calendar';

describe('lifecycle-obligations catalog', () => {
  it('models obligations for all 3 markets, each with a name + citation', () => {
    expect(LIFECYCLE_MARKETS).toEqual(['FDA', 'EMA', 'PMDA']);
    for (const m of LIFECYCLE_MARKETS) {
      const cat = getLifecycleObligations(m);
      expect(cat.market).toBe(m);
      expect(cat.citation).toBeTruthy();
      expect(cat.obligations.length).toBeGreaterThan(0);
      for (const o of cat.obligations) {
        expect(o.id).toBeTruthy();
        expect(o.name).toBeTruthy();
        expect(o.citation).toBeTruthy();
        expect(o.cadence).toBeTruthy();
      }
    }
  });

  it('FDA includes pader_periodic + annual_report', () => {
    const ids = getLifecycleObligations('FDA').obligations.map((o) => o.id);
    expect(ids).toContain('pader_periodic');
    expect(ids).toContain('annual_report');
  });

  it('EMA includes psur + renewal due at 60 months', () => {
    const obs = getLifecycleObligations('EMA').obligations;
    const ids = obs.map((o) => o.id);
    expect(ids).toContain('psur');
    const renewal = obs.find((o) => o.id === 'renewal')!;
    expect(renewal.firstDueMonths).toBe(60);
    expect(renewal.intervalMonths).toBeNull();
  });

  it('PMDA includes eppv + reexamination', () => {
    const ids = getLifecycleObligations('PMDA').obligations.map((o) => o.id);
    expect(ids).toContain('eppv');
    expect(ids).toContain('reexamination');
  });
});

describe('computeObligationSchedule — FDA', () => {
  it('horizon 12: annual report at 2027-01-01 and quarterly PADERs', () => {
    const s = computeObligationSchedule({ market: 'FDA', approvalDate: '2026-01-01', horizonMonths: 12 });
    const annual = s.entries.filter((e) => e.obligationId === 'annual_report').map((e) => e.dueDate);
    expect(annual).toContain('2027-01-01');

    const paders = s.entries.filter((e) => e.obligationId === 'pader_periodic').map((e) => e.dueDate);
    expect(paders).toEqual(['2026-04-01', '2026-07-01', '2026-10-01', '2027-01-01']);
  });
});

describe('computeObligationSchedule — EMA', () => {
  it('renewal is a one-off at 2031-01-01 for approval 2026-01-01 horizon 72', () => {
    const s = computeObligationSchedule({ market: 'EMA', approvalDate: '2026-01-01', horizonMonths: 72 });
    const renewals = s.entries.filter((e) => e.obligationId === 'renewal');
    expect(renewals.length).toBe(1);
    expect(renewals[0].dueDate).toBe('2031-01-01');
    expect(renewals[0].occurrence).toBe(1);
  });

  it('psur is excluded beyond the horizon (one-off-style filtering)', () => {
    // 6-month PSURs within a 12-month horizon → only 2 entries (6m, 12m).
    const s = computeObligationSchedule({ market: 'EMA', approvalDate: '2026-01-01', horizonMonths: 12 });
    const psurs = s.entries.filter((e) => e.obligationId === 'psur').map((e) => e.dueDate);
    expect(psurs).toEqual(['2026-07-01', '2027-01-01']);
  });
});

describe('computeObligationSchedule — ordering + determinism', () => {
  it('entries are sorted ascending by dueDate', () => {
    const s = computeObligationSchedule({ market: 'FDA', approvalDate: '2026-01-01', horizonMonths: 24 });
    const dates = s.entries.map((e) => e.dueDate);
    const sorted = [...dates].sort();
    expect(dates).toEqual(sorted);
  });

  it('is deterministic (no Date.now)', () => {
    const a = computeObligationSchedule({ market: 'PMDA', approvalDate: '2026-03-31' });
    const b = computeObligationSchedule({ market: 'PMDA', approvalDate: '2026-03-31' });
    expect(a).toEqual(b);
  });

  it('clamps month overflow (Jan 31 + 1 month → Feb 28)', () => {
    // FDA first PADER is +3 months; use a month-end anchor that exercises clamping.
    const s = computeObligationSchedule({ market: 'EMA', approvalDate: '2026-08-31', horizonMonths: 12 });
    // PSUR at +6 months from Aug 31 → Feb 28 2027 (clamped).
    const psurs = s.entries.filter((e) => e.obligationId === 'psur').map((e) => e.dueDate);
    expect(psurs[0]).toBe('2027-02-28');
  });

  it('uses default horizon of 60 months when omitted', () => {
    const s = computeObligationSchedule({ market: 'FDA', approvalDate: '2026-01-01' });
    expect(s.horizonMonths).toBe(60);
  });
});

describe('computeObligationSchedule — errors', () => {
  it('throws for an unmodeled market', () => {
    expect(() => computeObligationSchedule({ market: 'XYZ' as Market, approvalDate: '2026-01-01' })).toThrow();
    expect(() => getLifecycleObligations('XYZ' as Market)).toThrow();
  });

  it('throws for an invalid approvalDate', () => {
    expect(() => computeObligationSchedule({ market: 'FDA', approvalDate: 'not-a-date' })).toThrow();
  });
});
