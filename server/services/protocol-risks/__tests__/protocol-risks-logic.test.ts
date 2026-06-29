/**
 * Protocol Risk Register pure logic — likelihood × impact scoring, level bands,
 * register summary. Pure, no DB/LLM.
 */

import { describe, it, expect } from 'vitest';
import { riskScore, riskLevel, scoreRisk, summarizeRiskRegister, type RiskView } from '../protocol-risks-logic';

describe('riskScore + riskLevel', () => {
  it('multiplies likelihood × impact ranks (1–25)', () => {
    expect(riskScore('rare', 'negligible')).toBe(1);
    expect(riskScore('almost_certain', 'severe')).toBe(25);
    expect(riskScore('possible', 'moderate')).toBe(9);
  });
  it('bands scores into low/medium/high/extreme', () => {
    expect(riskLevel(1)).toBe('low');
    expect(riskLevel(4)).toBe('medium');
    expect(riskLevel(9)).toBe('high');
    expect(riskLevel(20)).toBe('extreme');
  });
});

describe('scoreRisk', () => {
  it('computes inherent and residual scores when residual targets set', () => {
    const s = scoreRisk({ likelihood: 'likely', impact: 'major', residualLikelihood: 'unlikely', residualImpact: 'minor' });
    expect(s.inherentScore).toBe(16);
    expect(s.inherentLevel).toBe('extreme');
    expect(s.residualScore).toBe(4);
    expect(s.residualLevel).toBe('medium');
  });
  it('leaves residual null when not set', () => {
    const s = scoreRisk({ likelihood: 'rare', impact: 'minor' });
    expect(s.residualScore).toBeNull();
    expect(s.residualLevel).toBeNull();
  });
});

describe('summarizeRiskRegister', () => {
  it('counts by effective level and flags open high/extreme', () => {
    const risks: RiskView[] = [
      { likelihood: 'almost_certain', impact: 'severe', status: 'open' }, // extreme, open
      { likelihood: 'likely', impact: 'major', residualLikelihood: 'rare', residualImpact: 'minor', status: 'mitigating' }, // residual low
      { likelihood: 'possible', impact: 'moderate', status: 'closed' }, // high but closed
    ];
    const s = summarizeRiskRegister(risks);
    expect(s.total).toBe(3);
    expect(s.byLevel.extreme).toBe(1);
    expect(s.byLevel.low).toBe(1);
    expect(s.openHighOrExtreme).toBe(1); // only the first; third is closed, second residual-low
    expect(s.basis).toMatch(/ICH E6/);
  });
});
