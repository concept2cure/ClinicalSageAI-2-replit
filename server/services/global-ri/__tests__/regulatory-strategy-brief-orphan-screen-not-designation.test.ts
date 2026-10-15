/**
 * Strategy brief: meeting an orphan screen is not holding a designation, a
 * declared pediatric programme is not an earned extension, and a fact nobody
 * stated is "not assessed", not "none".
 *
 * Until 2026-10-15 buildStrategyBrief passed `designations.orphan.eligible` (a
 * prevalence screen) to the fee estimator and the exclusivity engine as a held
 * designation, and `pediatricDevelopment` (a declared intent) as an earned
 * pediatric extension. With usPrevalence 150000, euPrevalencePer10k 3, serious
 * and significantBenefit, both fee lines read "Waived — orphan-designated
 * product" with total 0, EU exclusivity was 144 months ("Orphan market
 * exclusivity + pediatric extension") and summary.maxExclusivityMonths 144. With
 * no disease facts the summary read orphanEligibleMarkets [] and
 * totalExpeditedPrograms 0: "none" for facts nobody gave. Served via POST
 * /api/global-ri/strategy-brief and the AnA tool global_ri_strategy_brief.
 */

import { describe, it, expect } from 'vitest';
import { buildStrategyBrief, type StrategyBriefInput } from '../regulatory-strategy-brief';

const RARE: StrategyBriefInput = {
  productType: 'small_molecule_nce',
  targetMarkets: ['US', 'EU'],
  disease: { usPrevalence: 150000, euPrevalencePer10k: 3, seriousOrLifeThreatening: true, significantBenefit: true },
  pediatricDevelopment: true,
};

describe('fees — an orphan screen is not a designation', () => {
  it('charges the fees in full and labels the lines an orphan designation would waive', () => {
    const brief = buildStrategyBrief(RARE);
    for (const m of brief.markets) {
      expect(m.designations?.orphan.eligible).toBe(true); // the screen is met …
      const fees = m.feeEstimate!;
      expect(fees.total).toBeGreaterThan(0); // … but nothing is waived on it
      expect(fees.lineItems.every((li) => li.waived === false)).toBe(true);
      for (const li of fees.lineItems) {
        expect(li.note ?? '').not.toMatch(/orphan-designated product|orphan exemption from/i);
        expect(li.note ?? '').toMatch(/would be waived if orphan-designated/i);
      }
    }
  });
});

describe('exclusivity — orphan exclusivity and the pediatric extension are potential, not counted', () => {
  it('EU: the binding period is the 8+2 regime; orphan + PIP extension are listed with conditions, outside the summary', () => {
    const brief = buildStrategyBrief(RARE);
    const eu = brief.markets.find((m) => m.agency === 'EMA')!;
    expect(eu.exclusivity!.bindingMonths).toBe(120);
    expect(eu.exclusivity!.bindingType).not.toMatch(/orphan|pediatric/i);
    expect(eu.potentialExclusivity!.map((c) => [c.type, c.months])).toEqual([
      ['Orphan market exclusivity', 120],
      ['Pediatric extension', 24],
    ]);
    for (const c of eu.potentialExclusivity!) expect(c.condition).toMatch(/^If /);
    expect(brief.summary.maxExclusivityMonths).toBe(120);
  });

  it('US: NCE 60 months binding; orphan 84 and pediatric 6 listed as potential', () => {
    const brief = buildStrategyBrief(RARE);
    const us = brief.markets.find((m) => m.agency === 'FDA')!;
    expect(us.exclusivity!.bindingMonths).toBe(60);
    expect(us.potentialExclusivity!.map((c) => c.months)).toEqual([84, 6]);
  });

  it('no orphan screen met and no pediatric programme: nothing potential', () => {
    const brief = buildStrategyBrief({ productType: 'small_molecule_nce', targetMarkets: ['US'], disease: { usPrevalence: 900000 } });
    expect(brief.markets[0].potentialExclusivity).toEqual([]);
  });

  it('summary figures are null, not 0, when no target market models them', () => {
    const brief = buildStrategyBrief({ productType: 'small_molecule_nce', targetMarkets: ['AU'] });
    expect(brief.summary.maxExclusivityMonths).toBeNull();
    expect(brief.summary.totalExpeditedPrograms).toBeNull();
    expect(brief.summary.expeditedProgramsNotAssessed).toBeNull();
    expect(brief.markets[0].potentialExclusivity).toBeNull();
  });
});

describe('absent disease facts are not assessed, not none', () => {
  it('reports the orphan screens and expedited programs as not assessed', () => {
    const brief = buildStrategyBrief({ productType: 'small_molecule_nce', targetMarkets: ['US', 'EU'] });
    expect(brief.summary.orphanEligibleMarkets).toEqual([]);
    expect(brief.summary.orphanNotAssessedMarkets).toEqual(['FDA', 'EMA']);
    expect(brief.summary.totalExpeditedPrograms).toBe(0);
    expect(brief.summary.expeditedProgramsNotAssessed).toBeGreaterThan(0);
    for (const m of brief.markets) {
      expect(m.designations!.orphan.eligible).toBe('not_assessed');
      expect(m.expeditedPrograms!.notAssessed.length).toBeGreaterThan(0);
      for (const p of m.expeditedPrograms!.notAssessed) expect(p.missing.length).toBeGreaterThan(0);
      // Fees are not labelled with an orphan waiver nobody screened for.
      for (const li of m.feeEstimate!.lineItems) expect(li.note ?? '').not.toMatch(/orphan/i);
    }
  });

  it('EU with only a prevalence figure does not say the condition is not life-threatening', () => {
    const brief = buildStrategyBrief({ productType: 'small_molecule_nce', targetMarkets: ['EU'], disease: { euPrevalencePer10k: 3 } });
    const orphan = brief.markets[0].designations!.orphan;
    expect(orphan.eligible).toBe('not_assessed');
    expect(orphan.rationale).not.toMatch(/not life-threatening|neither/i);
    expect(orphan.missing).toEqual(expect.arrayContaining(['seriousOrLifeThreatening']));
  });
});
