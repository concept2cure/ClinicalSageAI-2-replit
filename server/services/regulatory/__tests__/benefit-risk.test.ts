import { describe, it, expect } from 'vitest';
import { assessBenefitRisk } from '../benefit-risk.js';

describe('assessBenefitRisk', () => {
  it('computes weighted benefit/risk, net, and a favorable call', () => {
    const r = assessBenefitRisk({
      benefits: [
        { name: 'Efficacy', weight: 3, score: 80, evidenceQuality: 'high' },
        { name: 'Convenience', weight: 1, score: 60 },
      ],
      risks: [
        { name: 'Common AEs', weight: 2, score: 30 },
        { name: 'Serious AEs', weight: 1, score: 20 },
      ],
    });
    // benefit = 0.75*80 + 0.25*60 = 75 ; risk = (2/3)*30 + (1/3)*20 = 26.67
    expect(r.weightedBenefit).toBeCloseTo(75, 2);
    expect(r.weightedRisk).toBeCloseTo(26.6667, 2);
    expect(r.netBenefitScore).toBeCloseTo(48.3333, 2);
    expect(r.favorability).toBe('favorable');
    expect(r.benefitContributions).toHaveLength(2);
  });

  it('classifies unfavorable and borderline by the threshold', () => {
    const unfav = assessBenefitRisk({
      benefits: [{ name: 'B', weight: 1, score: 20 }],
      risks: [{ name: 'R', weight: 1, score: 80 }],
    });
    expect(unfav.favorability).toBe('unfavorable');

    const borderline = assessBenefitRisk({
      benefits: [{ name: 'B', weight: 1, score: 55 }],
      risks: [{ name: 'R', weight: 1, score: 50 }],
      favorabilityThreshold: 10,
    });
    expect(borderline.favorability).toBe('borderline');
  });

  it('validates inputs', () => {
    expect(() => assessBenefitRisk({ benefits: [], risks: [{ name: 'R', weight: 1, score: 1 }] })).toThrow(/benefit/);
    expect(() => assessBenefitRisk({ benefits: [{ name: 'B', weight: 1, score: 120 }], risks: [{ name: 'R', weight: 1, score: 1 }] })).toThrow(/\[0,100\]/);
    expect(() => assessBenefitRisk({ benefits: [{ name: 'B', weight: 0, score: 1 }], risks: [{ name: 'R', weight: 1, score: 1 }] })).toThrow(/cannot all be zero/);
  });

  it('is deterministic', () => {
    const input = { benefits: [{ name: 'B', weight: 1, score: 50 }], risks: [{ name: 'R', weight: 1, score: 40 }] };
    expect(assessBenefitRisk(input)).toEqual(assessBenefitRisk(input));
  });
});
