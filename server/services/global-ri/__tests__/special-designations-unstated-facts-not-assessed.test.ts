/**
 * Orphan screen: a fact nobody stated is "not assessed", never "not eligible",
 * and only a stated-false fact is named as unmet.
 *
 * Until 2026-10-15 assessDesignationEligibility returned eligible:false when the
 * prevalence was not supplied (rationale "cannot be assessed", verdict "no"), and
 * the EMA screen read seriousOrLifeThreatening / noSatisfactoryTreatment /
 * significantBenefit with `=== true`, so {market:'EMA', euPrevalencePer10k:3}
 * came back "Does not meet EMA orphan criteria: not life-threatening/seriously
 * debilitating; neither …" for facts nobody stated. The strategy brief then
 * summarised those markets as not orphan-eligible ("none").
 */

import { describe, it, expect } from 'vitest';
import { assessDesignationEligibility } from '../special-designations';

describe('orphan screen — unstated facts', () => {
  it('FDA without a prevalence: not_assessed, names usPrevalence, lists no designation', () => {
    const r = assessDesignationEligibility({ market: 'FDA' });
    expect(r.orphan.eligible).toBe('not_assessed');
    expect(r.orphan.missing).toEqual(['usPrevalence']);
    expect(r.designations).toEqual([]);
  });

  it('PMDA without a prevalence: not_assessed, names jpPrevalence', () => {
    const r = assessDesignationEligibility({ market: 'PMDA' });
    expect(r.orphan.eligible).toBe('not_assessed');
    expect(r.orphan.missing).toEqual(['jpPrevalence']);
  });

  it('EMA with only a qualifying prevalence: not_assessed, and no unstated criterion is called unmet', () => {
    const r = assessDesignationEligibility({ market: 'EMA', euPrevalencePer10k: 3 });
    expect(r.orphan.eligible).toBe('not_assessed');
    expect(r.orphan.missing).toEqual(['seriousOrLifeThreatening', 'noSatisfactoryTreatment', 'significantBenefit']);
    expect(r.orphan.rationale).not.toMatch(/Does not meet|not life-threatening|neither/i);
    expect(r.designations).toEqual([]);
  });

  it('EMA with one benefit prong stated false and the other unstated: not_assessed on the unstated prong', () => {
    const r = assessDesignationEligibility({
      market: 'EMA',
      euPrevalencePer10k: 3,
      seriousOrLifeThreatening: true,
      noSatisfactoryTreatment: false,
    });
    expect(r.orphan.eligible).toBe('not_assessed');
    expect(r.orphan.missing).toEqual(['significantBenefit']);
  });

  it('EMA with a stated-false criterion is not eligible, and the rationale names only that criterion', () => {
    const r = assessDesignationEligibility({ market: 'EMA', euPrevalencePer10k: 3, seriousOrLifeThreatening: false });
    expect(r.orphan.eligible).toBe(false);
    expect(r.orphan.rationale).toMatch(/not life-threatening/i);
    expect(r.orphan.rationale).not.toMatch(/neither/i);
  });

  it('EMA over the prevalence threshold is not eligible without claiming anything about seriousness', () => {
    const r = assessDesignationEligibility({ market: 'EMA', euPrevalencePer10k: 6 });
    expect(r.orphan.eligible).toBe(false);
    expect(r.orphan.rationale).toMatch(/exceeds 5/);
    expect(r.orphan.rationale).not.toMatch(/life-threatening|neither/i);
  });

  it('a fully assessed screen carries no missing facts', () => {
    const r = assessDesignationEligibility({ market: 'FDA', usPrevalence: 150000 });
    expect(r.orphan.eligible).toBe(true);
    expect(r.orphan.missing).toEqual([]);
  });
});
