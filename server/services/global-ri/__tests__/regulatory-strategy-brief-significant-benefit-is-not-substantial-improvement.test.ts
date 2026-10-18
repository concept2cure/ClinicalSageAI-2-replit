/**
 * Strategy brief: the EU orphan criterion "significant benefit over existing
 * methods" (Regulation (EC) No 141/2000 Art 3(1)(b)) and the expedited-program
 * criterion "substantial improvement over existing therapy" (FDA Breakthrough /
 * Priority Review, PMDA priority review / SAKIGAKE) are different facts, stated
 * separately.
 *
 * Until 2026-10-15 buildStrategyBrief passed disease.significantBenefit to the
 * expedited-program screen as substantialImprovementOverExisting, so a stated
 * orphan "significant benefit" alone screened a US product eligible for FDA
 * Priority Review, and nothing could state substantial improvement on its own.
 * Served via POST /api/global-ri/strategy-brief and the AnA tool
 * global_ri_strategy_brief.
 */

import { describe, it, expect } from 'vitest';
import { buildStrategyBrief } from '../regulatory-strategy-brief';
import { EXPEDITED_PROGRAMS } from '../expedited-programs';

const PRIORITY_REVIEW = EXPEDITED_PROGRAMS.find((p) => p.id === 'fda-priority-review')!.name;

describe('significant benefit (orphan) is not substantial improvement (expedited)', () => {
  it('a stated orphan significant benefit does not screen FDA Priority Review eligible', () => {
    const brief = buildStrategyBrief({ productType: 'small_molecule_nce', targetMarkets: ['US'], disease: { significantBenefit: true } });
    const ex = brief.markets[0].expeditedPrograms!;
    expect(ex.eligible.map((p) => p.name)).not.toContain(PRIORITY_REVIEW);
    expect(ex.notAssessed.find((p) => p.name === PRIORITY_REVIEW)?.missing).toEqual(['substantialImprovementOverExisting']);
  });

  it('substantial improvement is its own disease fact and reaches the expedited screen', () => {
    const brief = buildStrategyBrief({
      productType: 'small_molecule_nce',
      targetMarkets: ['US'],
      disease: { substantialImprovementOverExisting: true },
    });
    expect(brief.markets[0].expeditedPrograms!.eligible.map((p) => p.name)).toContain(PRIORITY_REVIEW);
    // … and it is not read as the EU orphan criterion.
    const eu = buildStrategyBrief({
      productType: 'small_molecule_nce',
      targetMarkets: ['EU'],
      disease: { euPrevalencePer10k: 3, seriousOrLifeThreatening: true, substantialImprovementOverExisting: true },
    });
    expect(eu.markets[0].designations!.orphan.eligible).toBe('not_assessed');
    expect(eu.markets[0].designations!.orphan.missing).toEqual(['noSatisfactoryTreatment', 'significantBenefit']);
  });

  it('significant benefit still decides the EU orphan screen', () => {
    const brief = buildStrategyBrief({
      productType: 'small_molecule_nce',
      targetMarkets: ['EU'],
      disease: { euPrevalencePer10k: 3, seriousOrLifeThreatening: true, significantBenefit: true },
    });
    expect(brief.markets[0].designations!.orphan.eligible).toBe(true);
  });
});
