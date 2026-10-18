/**
 * Orphan screen: a criterion the screen does not assess is named as not
 * assessed; it never yields "not eligible", and it never lets a screen pass.
 *
 * Until 2026-10-15 assessDesignationEligibility:
 *  - EMA: returned eligible:false ("Does not meet EMA orphan criteria: prevalence
 *    6 per 10,000 exceeds 5") for a prevalence over 5 in 10,000, and likewise for
 *    a condition stated not life-threatening/seriously debilitating, though
 *    Regulation (EC) No 141/2000 Art 3(1)(a) has an alternative
 *    insufficient-return-on-investment limb that nothing assessed;
 *  - FDA: returned eligible:false for a US prevalence of 200,000 or more while its
 *    own note said the cost-recovery prong "may still" qualify;
 *  - PMDA: returned eligible:true and listed the designation for a prevalence under
 *    50,000, though the record's other two criteria (serious disease with high
 *    medical need; sound rationale and feasible development plan) were never
 *    assessed — a note asked the reader to "confirm qualitatively".
 * Served via POST /api/global-ri/designations/assess, the AnA tools
 * global_ri_special_designations and global_ri_strategy_brief.
 */

import { describe, it, expect } from 'vitest';
import { assessDesignationEligibility, DESIGNATION_REFERENCE } from '../special-designations';
import { buildStrategyBrief } from '../regulatory-strategy-brief';
import { getJpProgram } from '../../ind/ctd/jp-programs';

const JP_ORPHAN_CRITERIA = getJpProgram('pmda-orphan-drug').criteria;

describe('EMA — the insufficient-return limb of Art 3(1)(a) is not assessed, so the prevalence limb alone decides nothing', () => {
  it('prevalence over 5 in 10,000 with the other criteria met: not assessed, the limb named', () => {
    const r = assessDesignationEligibility({
      market: 'EMA',
      euPrevalencePer10k: 6,
      seriousOrLifeThreatening: true,
      noSatisfactoryTreatment: true,
    });
    expect(r.orphan.eligible).toBe('not_assessed');
    expect(r.orphan.notAssessedCriteria).toHaveLength(1);
    expect(r.orphan.notAssessedCriteria[0]).toMatch(/insufficient return/i);
    expect(r.orphan.notAssessedCriteria[0]).toMatch(/141\/2000 Art 3\(1\)\(a\)/);
    expect(r.orphan.rationale).toMatch(/exceeds 5/);
    expect(r.orphan.rationale).not.toMatch(/Does not meet/i);
    expect(r.orphan.missing).toEqual([]);
    expect(r.designations).toEqual([]);
  });

  it('prevalence over 5 and nothing else stated: not assessed; only the facts that can still decide it are missing', () => {
    const r = assessDesignationEligibility({ market: 'EMA', euPrevalencePer10k: 6 });
    expect(r.orphan.eligible).toBe('not_assessed');
    expect(r.orphan.missing).toEqual(['noSatisfactoryTreatment', 'significantBenefit']);
  });

  it('a condition stated not life-threatening/seriously debilitating closes the prevalence limb only', () => {
    const r = assessDesignationEligibility({
      market: 'EMA',
      euPrevalencePer10k: 3,
      seriousOrLifeThreatening: false,
      noSatisfactoryTreatment: true,
    });
    expect(r.orphan.eligible).toBe('not_assessed');
    expect(r.orphan.rationale).toMatch(/not life-threatening/i);
    expect(r.orphan.notAssessedCriteria[0]).toMatch(/insufficient return/i);
  });

  it('criterion (b) stated failed is not eligible whichever limb of (a) applies', () => {
    const r = assessDesignationEligibility({
      market: 'EMA',
      euPrevalencePer10k: 6,
      seriousOrLifeThreatening: true,
      noSatisfactoryTreatment: false,
      significantBenefit: false,
    });
    expect(r.orphan.eligible).toBe(false);
    expect(r.orphan.rationale).toMatch(/neither/i);
    expect(r.orphan.notAssessedCriteria).toEqual([]);
  });

  it('a met prevalence limb needs no alternative: eligible, nothing unassessed', () => {
    const r = assessDesignationEligibility({
      market: 'EMA',
      euPrevalencePer10k: 4,
      seriousOrLifeThreatening: true,
      noSatisfactoryTreatment: true,
    });
    expect(r.orphan.eligible).toBe(true);
    expect(r.orphan.notAssessedCriteria).toEqual([]);
  });

  it('the criteria reference names the alternative limb', () => {
    expect(DESIGNATION_REFERENCE.EMA.orphanCriteria).toMatch(/insufficient return/i);
  });
});

describe('FDA — the cost-recovery prong is not assessed, so prevalence alone decides nothing', () => {
  it('US prevalence of 200,000 or more: not assessed, the prong named, no designation listed', () => {
    for (const usPrevalence of [200000, 500000]) {
      const r = assessDesignationEligibility({ market: 'FDA', usPrevalence });
      expect(r.orphan.eligible).toBe('not_assessed');
      expect(r.orphan.notAssessedCriteria).toHaveLength(1);
      expect(r.orphan.notAssessedCriteria[0]).toMatch(/recovering development and marketing costs/i);
      expect(r.orphan.rationale).toMatch(/not fewer than 200,000/);
      expect(r.designations).toEqual([]);
    }
  });

  it('under 200,000: eligible, nothing unassessed', () => {
    const r = assessDesignationEligibility({ market: 'FDA', usPrevalence: 150000 });
    expect(r.orphan.eligible).toBe(true);
    expect(r.orphan.notAssessedCriteria).toEqual([]);
  });
});

describe('PMDA — the record criteria other than prevalence are not assessed', () => {
  it('prevalence under 50,000: not assessed, the two other record criteria named, no designation listed', () => {
    const r = assessDesignationEligibility({ market: 'PMDA', jpPrevalence: 40000 });
    expect(r.orphan.eligible).toBe('not_assessed');
    expect(r.orphan.notAssessedCriteria).toEqual(JP_ORPHAN_CRITERIA.slice(1));
    expect(r.orphan.notAssessedCriteria).toEqual(
      expect.arrayContaining([expect.stringMatching(/medical need/i), expect.stringMatching(/development plan/i)]),
    );
    expect(r.orphan.missing).toEqual([]);
    expect(r.designations).toEqual([]);
  });

  it('prevalence of 50,000 or more fails the record\'s first criterion: not eligible', () => {
    const r = assessDesignationEligibility({ market: 'PMDA', jpPrevalence: 60000 });
    expect(r.orphan.eligible).toBe(false);
    expect(r.orphan.notAssessedCriteria).toEqual([]);
  });

  it('no prevalence: not assessed, jpPrevalence missing and the other criteria named', () => {
    const r = assessDesignationEligibility({ market: 'PMDA' });
    expect(r.orphan.eligible).toBe('not_assessed');
    expect(r.orphan.missing).toEqual(['jpPrevalence']);
    expect(r.orphan.notAssessedCriteria).toEqual(JP_ORPHAN_CRITERIA.slice(1));
  });
});

describe('strategy brief — the summary carries these screens as not assessed', () => {
  it('JP on prevalence alone and EU over the threshold are not assessed, not eligible / not "none"', () => {
    const brief = buildStrategyBrief({
      productType: 'small_molecule_nce',
      targetMarkets: ['EU', 'JP'],
      disease: { euPrevalencePer10k: 6, jpPrevalence: 40000, seriousOrLifeThreatening: true, noSatisfactoryTreatment: true },
    });
    expect(brief.summary.orphanEligibleMarkets).toEqual([]);
    expect(brief.summary.orphanNotAssessedMarkets).toEqual(['EMA', 'PMDA']);
  });
});
