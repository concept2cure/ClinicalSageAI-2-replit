/**
 * Unit tests for the deterministic RBM engine (ICH E6(R3)/E8(R1) scoring +
 * seed libraries). Pure functions — no I/O, no LLM.
 */

import { describe, it, expect } from 'vitest';
import {
  scoreRisk, bandFromScore, overallRiskFromScores,
  kriStatus, qtlStatus, monitoringTierFromRisk, defaultPlanStrategy,
  DEFAULT_CTQ_FACTORS, DEFAULT_KRIS, DEFAULT_QTLS,
} from '../rbm-engine';

describe('scoreRisk / bandFromScore', () => {
  it('computes likelihood × impact and clamps 1..5', () => {
    expect(scoreRisk(3, 5)).toEqual({ score: 15, band: 'high' });
    expect(scoreRisk(0, 9)).toEqual({ score: 5, band: 'low' });
  });
  it('bands by RACT thresholds (>=15 high, >=8 medium, else low)', () => {
    expect(bandFromScore(15)).toBe('high');
    expect(bandFromScore(8)).toBe('medium');
    expect(bandFromScore(7)).toBe('low');
  });
});

describe('overallRiskFromScores', () => {
  it('any high score -> high', () => {
    expect(overallRiskFromScores([4, 16])).toBe('high');
  });
  it('two+ medium -> high; one medium -> medium; none -> low', () => {
    expect(overallRiskFromScores([8, 9])).toBe('high');
    expect(overallRiskFromScores([8, 4])).toBe('medium');
    expect(overallRiskFromScores([4, 2])).toBe('low');
    expect(overallRiskFromScores([])).toBe('low');
  });
});

describe('kriStatus', () => {
  it('higher_worse: red at/above red, amber at/above amber', () => {
    expect(kriStatus(6, 2, 5, 'higher_worse')).toBe('red');
    expect(kriStatus(3, 2, 5, 'higher_worse')).toBe('amber');
    expect(kriStatus(1, 2, 5, 'higher_worse')).toBe('green');
  });
  it('lower_worse inverts the comparison', () => {
    expect(kriStatus(0.5, 0.8, 0.6, 'lower_worse')).toBe('red');
    expect(kriStatus(0.7, 0.8, 0.6, 'lower_worse')).toBe('amber');
    expect(kriStatus(0.9, 0.8, 0.6, 'lower_worse')).toBe('green');
  });
  it('an indicator with no reading is not evaluated — never green', () => {
    expect(kriStatus(null, 2, 5)).toBe('not_evaluated');
    expect(kriStatus(undefined, 2, 5)).toBe('not_evaluated');
  });
  it('an indicator with no threshold to read against is not evaluated', () => {
    expect(kriStatus(3, null, null)).toBe('not_evaluated');
  });
  it('one configured threshold is enough to evaluate', () => {
    expect(kriStatus(6, null, 5, 'higher_worse')).toBe('red');
    expect(kriStatus(3, 2, null, 'higher_worse')).toBe('amber');
    expect(kriStatus(1, 2, null, 'higher_worse')).toBe('green');
  });
});

describe('qtlStatus', () => {
  // "Important protocol deviation rate <= 15%": worse as it rises.
  const upper = { threshold: 0.15, secondaryLimit: 0.1 };
  // "Primary endpoint data completeness >= 90%": worse as it falls.
  const lower = { threshold: 0.9, secondaryLimit: 0.95, direction: 'lower' as const };
  // "Randomisation ratio within 0.9–1.1": breached at either end.
  const twoSided = {
    threshold: 1.1,
    secondaryLimit: 1.05,
    thresholdLower: 0.9,
    secondaryLimitLower: 0.95,
    direction: 'two_sided' as const,
  };

  it('upper: breached at/above threshold, approaching at/above secondary', () => {
    expect(qtlStatus(0.2, upper)).toBe('breached');
    expect(qtlStatus(0.12, upper)).toBe('approaching');
    expect(qtlStatus(0.05, upper)).toBe('within');
  });

  it('upper is the default direction, so an unspecified limit keeps its meaning', () => {
    expect(qtlStatus(0.2, { threshold: 0.15 })).toBe('breached');
    expect(qtlStatus(0.05, { threshold: 0.15 })).toBe('within');
  });

  it('lower: breached at/below threshold — an attainment limit is not inverted', () => {
    // The defect this direction exists for: 40% completeness against a 90%
    // limit is a breach. Read as an upper bound it reported "within tolerance".
    expect(qtlStatus(0.4, lower)).toBe('breached');
    expect(qtlStatus(0.9, lower)).toBe('breached');
    expect(qtlStatus(0.93, lower)).toBe('approaching');
    expect(qtlStatus(0.99, lower)).toBe('within');
  });

  it('two_sided: breached beyond either bound, approaching inside either', () => {
    expect(qtlStatus(1.2, twoSided)).toBe('breached');
    expect(qtlStatus(0.8, twoSided)).toBe('breached');
    expect(qtlStatus(1.07, twoSided)).toBe('approaching');
    expect(qtlStatus(0.93, twoSided)).toBe('approaching');
    expect(qtlStatus(1.0, twoSided)).toBe('within');
  });

  it('a QTL with no value or no limit is not evaluated — never within', () => {
    expect(qtlStatus(null, upper)).toBe('not_evaluated');
    expect(qtlStatus(undefined, upper)).toBe('not_evaluated');
    expect(qtlStatus(0.05, { threshold: null, secondaryLimit: 0.1 })).toBe('not_evaluated');
  });

  it('two_sided with only one bound configured is not evaluated', () => {
    // Half a range cannot say whether a value sits inside it; assuming the
    // missing side would invent a tolerance nobody approved.
    expect(qtlStatus(1.0, { threshold: 1.1, direction: 'two_sided' })).toBe('not_evaluated');
    expect(qtlStatus(1.0, { threshold: null, thresholdLower: 0.9, direction: 'two_sided' })).toBe('not_evaluated');
  });
});

describe('monitoringTierFromRisk', () => {
  it('maps composite risk to a proportionate tier', () => {
    expect(monitoringTierFromRisk(70)).toBe('enhanced');
    expect(monitoringTierFromRisk(40)).toBe('standard');
    expect(monitoringTierFromRisk(10)).toBe('reduced');
  });
});

describe('defaultPlanStrategy', () => {
  it('escalates strategy with overall risk', () => {
    expect(defaultPlanStrategy('high')).toBe('hybrid');
    expect(defaultPlanStrategy('medium')).toBe('risk_based');
    expect(defaultPlanStrategy('low')).toBe('centralized');
  });
});

describe('seed libraries', () => {
  it('ship non-empty, well-formed catalogs', () => {
    expect(DEFAULT_CTQ_FACTORS.length).toBeGreaterThan(0);
    expect(DEFAULT_KRIS.length).toBeGreaterThan(0);
    expect(DEFAULT_QTLS.length).toBeGreaterThan(0);
    for (const f of DEFAULT_CTQ_FACTORS) {
      expect(f.likelihood).toBeGreaterThanOrEqual(1);
      expect(f.impact).toBeLessThanOrEqual(5);
    }
    for (const q of DEFAULT_QTLS) {
      expect(q.secondaryFraction).toBeGreaterThan(0);
      expect(q.secondaryFraction).toBeLessThanOrEqual(1);
    }
  });
});
