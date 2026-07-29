import { describe, it, expect } from 'vitest';
import { computeBudgetImpact, computeCostEffectiveness } from '../heor-models.js';

describe('computeBudgetImpact', () => {
  it('computes incremental impact and PMPM over the horizon', () => {
    const r = computeBudgetImpact({
      populationSize: 1_000_000,
      eligibleFraction: 0.01, // 10,000 eligible
      treatedFraction: 1,
      annualCostNew: 12_000,
      annualCostComparator: 2_000,
      newShareByYear: [0.1, 0.2, 0.3],
    });
    expect(r.eligiblePopulation).toBe(10_000);
    expect(r.years).toHaveLength(3);
    // Year 1: 1000 on new (Δ10000 each) → 10,000,000 incremental.
    expect(r.years[0].budgetImpact).toBe(10_000_000);
    expect(r.years[1].budgetImpact).toBe(20_000_000);
    expect(r.totalBudgetImpact).toBe(60_000_000);
    // PMPM year1 = 10,000,000 / 1,000,000 / 12
    expect(r.years[0].pmpm).toBeCloseTo(0.83, 2);
  });

  it('rejects out-of-range fractions and negative costs', () => {
    expect(() => computeBudgetImpact({ populationSize: 1, eligibleFraction: 2, annualCostNew: 1, annualCostComparator: 1, newShareByYear: [0.5] })).toThrow(/eligibleFraction/);
    expect(() => computeBudgetImpact({ populationSize: 1, eligibleFraction: 0.5, annualCostNew: -1, annualCostComparator: 1, newShareByYear: [0.5] })).toThrow(/annualCostNew/);
    expect(() => computeBudgetImpact({ populationSize: 1, eligibleFraction: 0.5, annualCostNew: 1, annualCostComparator: 1, newShareByYear: [] })).toThrow(/newShareByYear/);
  });
});

describe('computeCostEffectiveness', () => {
  it('computes ICER and NMB for a trade-off', () => {
    const r = computeCostEffectiveness({ costIntervention: 50_000, effectIntervention: 5, costComparator: 30_000, effectComparator: 4, willingnessToPay: 50_000 });
    expect(r.incrementalCost).toBe(20_000);
    expect(r.incrementalEffect).toBe(1);
    expect(r.icer).toBe(20_000);
    expect(r.dominance).toBe('tradeoff');
    expect(r.netMonetaryBenefit).toBe(30_000); // 50000*1 - 20000
    expect(r.costEffectiveAtThreshold).toBe(true);
  });

  it('detects dominance (cheaper and better)', () => {
    const r = computeCostEffectiveness({ costIntervention: 20_000, effectIntervention: 6, costComparator: 30_000, effectComparator: 4 });
    expect(r.dominance).toBe('dominant');
  });

  it('returns null ICER when effects are equal', () => {
    const r = computeCostEffectiveness({ costIntervention: 20_000, effectIntervention: 4, costComparator: 10_000, effectComparator: 4 });
    expect(r.icer).toBeNull();
    expect(r.dominance).toBe('no_effect_difference');
  });
});
