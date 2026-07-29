/**
 * Post-approval pharmacovigilance (PV) obligations expert — per-market obligations + readiness.
 */

import { describe, it, expect } from 'vitest';
import {
  getPvObligations,
  getPvElements,
  assessPvReadiness,
  PV_MARKETS,
  type PvMarket,
} from '../pharmacovigilance-obligations';

describe('PV obligations catalog', () => {
  it('models obligations for all 3 markets with a citation and >=5 elements each', () => {
    expect(PV_MARKETS).toEqual(['FDA', 'EMA', 'PMDA']);
    for (const m of PV_MARKETS) {
      const o = getPvObligations(m);
      expect(o.market).toBe(m);
      expect(o.citation).toBeTruthy();
      expect(o.individualCaseReporting).toBeTruthy();
      expect(o.periodicReport).toBeTruthy();
      expect(o.riskManagement).toBeTruthy();
      expect(o.qualifiedPerson).toBeTruthy();
      expect(o.elements.length).toBeGreaterThanOrEqual(5);
      expect(o.notes.length).toBeGreaterThan(0);
      for (const e of o.elements) {
        expect(e.id).toBeTruthy();
        expect(e.title).toBeTruthy();
        expect(e.requirement).toBeTruthy();
        expect(e.citation).toBeTruthy();
      }
    }
  });

  it('EMA elements include qppv + rmp + psur', () => {
    const ids = getPvElements('EMA');
    expect(ids).toContain('qppv');
    expect(ids).toContain('rmp');
    expect(ids).toContain('psur');
  });

  it('FDA elements include expedited_icsr + faers', () => {
    const ids = getPvElements('FDA');
    expect(ids).toContain('expedited_icsr');
    expect(ids).toContain('faers');
  });

  it('PMDA elements include eppv', () => {
    expect(getPvElements('PMDA')).toContain('eppv');
  });
});

describe('assessPvReadiness', () => {
  it('ready=false with correct missing when an element is omitted', () => {
    const all = getPvElements('EMA');
    const provided = all.filter((id) => id !== 'rmp');
    const r = assessPvReadiness({ market: 'EMA', providedElements: provided });
    expect(r.ready).toBe(false);
    expect(r.missing).toEqual(['rmp']);
    expect(r.coverage).toBeGreaterThan(0);
    expect(r.coverage).toBeLessThan(1);
  });

  it('ready=true + coverage 1 when all provided', () => {
    const all = getPvElements('FDA');
    const r = assessPvReadiness({ market: 'FDA', providedElements: all });
    expect(r.ready).toBe(true);
    expect(r.missing).toEqual([]);
    expect(r.coverage).toBe(1);
    expect(r.provided).toEqual(all);
  });

  it('partial coverage strictly between 0 and 1', () => {
    const all = getPvElements('PMDA');
    const provided = all.slice(0, 2);
    const r = assessPvReadiness({ market: 'PMDA', providedElements: provided });
    expect(r.ready).toBe(false);
    expect(r.coverage).toBeGreaterThan(0);
    expect(r.coverage).toBeLessThan(1);
    expect(r.coverage).toBe(Math.round((2 / all.length) * 100) / 100);
  });

  it('ignores unrecognized provided ids (does not inflate coverage)', () => {
    const r = assessPvReadiness({ market: 'PMDA', providedElements: ['eppv', 'not_a_real_element'] });
    expect(r.provided).toEqual(['eppv']);
    expect(r.coverage).toBe(Math.round((1 / getPvElements('PMDA').length) * 100) / 100);
  });
});

describe('unmodeled market handling', () => {
  it('getPvElements returns [] for an unmodeled market', () => {
    expect(getPvElements('XYZ' as PvMarket)).toEqual([]);
  });

  it('getPvObligations throws for an unmodeled market', () => {
    expect(() => getPvObligations('XYZ' as PvMarket)).toThrow();
  });

  it('assessPvReadiness throws for an unmodeled market', () => {
    expect(() => assessPvReadiness({ market: 'XYZ' as PvMarket, providedElements: [] })).toThrow();
  });
});

describe('determinism', () => {
  it('getPvObligations is deterministic', () => {
    expect(getPvObligations('EMA')).toEqual(getPvObligations('EMA'));
  });

  it('assessPvReadiness is deterministic', () => {
    const input = { market: 'FDA' as PvMarket, providedElements: ['expedited_icsr', 'faers'] };
    expect(assessPvReadiness(input)).toEqual(assessPvReadiness(input));
  });
});
