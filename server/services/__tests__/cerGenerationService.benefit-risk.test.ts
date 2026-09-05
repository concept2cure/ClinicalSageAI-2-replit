/**
 * Regression — CER benefit-risk verdict must not be fabricated from an empty
 * risk analysis.
 *
 * cerGenerationService.calculateBenefitRiskRatio() historically returned
 * "Highly favorable" whenever benefits > 0 and risks === 0, and
 * generateRiskBenefitConclusion() then asserted "The documented clinical
 * benefits outweigh the residual risks." But zero RECORDED risks is not a
 * zero-risk device — it is an unperformed / not-yet-recorded risk assessment.
 * The data model carries no explicit "risk assessment completed" signal, so
 * an empty risk analysis must fail closed to the same honest "Needs review"
 * state the empty-benefits path already uses, rather than certify a favorable
 * benefit-risk conclusion off an analysis that was never performed.
 *
 * These assertions FAIL against the pre-fix code (which returned
 * "Highly favorable" / "benefits outweigh the residual risks" for risks === 0).
 */

import { describe, it, expect } from 'vitest';
import cerGenerationService from '../cerGenerationService';

// calculateBenefitRiskRatio / generateRiskBenefitConclusion are private helpers;
// reach them on the exported singleton via an untyped view.
const svc = cerGenerationService as any;

describe('calculateBenefitRiskRatio — empty risk analysis fails closed', () => {
  it('benefits > 0 with an EMPTY risk analysis (risks === 0) is "Needs review", NOT "Highly favorable"', () => {
    const verdict = svc.calculateBenefitRiskRatio({
      benefits: [{ description: 'reduced procedure time' }],
      risks: [],
    });
    expect(verdict).toBe('Needs review');
    expect(verdict).not.toBe('Highly favorable');
  });

  it('missing risks field entirely is treated the same as an empty risk analysis', () => {
    const verdict = svc.calculateBenefitRiskRatio({
      benefits: [{ description: 'reduced procedure time' }],
      // no `risks` key at all
    });
    expect(verdict).toBe('Needs review');
  });

  it('empty benefits still fails closed to "Needs review" (pre-existing guard, unchanged)', () => {
    expect(svc.calculateBenefitRiskRatio({ benefits: [], risks: [] })).toBe('Needs review');
  });

  it('genuinely favorable analysis (benefits AND risks documented, ratio > 2) is still "Highly favorable"', () => {
    const verdict = svc.calculateBenefitRiskRatio({
      benefits: [{ d: 1 }, { d: 2 }, { d: 3 }],
      risks: [{ d: 1 }],
    });
    expect(verdict).toBe('Highly favorable');
  });
});

describe('generateRiskBenefitConclusion — never asserts benefits outweigh risks off an empty analysis', () => {
  it('does NOT claim benefits outweigh residual risks when the risk analysis is empty', () => {
    const conclusion = svc.generateRiskBenefitConclusion({
      benefits: [{ description: 'reduced procedure time' }],
      risks: [],
    });
    expect(conclusion).not.toMatch(/outweigh the residual risks/i);
    expect(conclusion).toMatch(/cannot be drawn/i);
    expect(conclusion.toLowerCase()).toContain('needs review');
  });

  it('does assert benefits outweigh risks only when the analysis actually supports it', () => {
    const conclusion = svc.generateRiskBenefitConclusion({
      benefits: [{ d: 1 }, { d: 2 }, { d: 3 }],
      risks: [{ d: 1 }],
    });
    expect(conclusion).toMatch(/outweigh the residual risks/i);
  });
});
