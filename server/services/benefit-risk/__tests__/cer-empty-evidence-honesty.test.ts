/**
 * The deterministic benefit-risk builders must not manufacture a favourable
 * determination from evidence that was never supplied. An uncharacterized
 * benefit or risk dimension is a NON-determination, not a favourable one — the
 * CER these strings are reported into verbatim goes to a Notified Body.
 *
 * Each test below fails on the pre-fix code (empty risks → "readily manageable",
 * net 0 → "benefit modestly exceeds risk", benefits-with-no-risks → "favourable").
 */
import { describe, it, expect } from 'vitest';
import {
  structureBenefitRiskFramework,
  assessBenefitRiskBalance,
} from '../benefit-risk-knowledge';

describe('structureBenefitRiskFramework — an uncharacterized dimension is not favourable', () => {
  it('does NOT call unsupplied risks "readily manageable"; states no risk determination can be made', () => {
    const r = structureBenefitRiskFramework({
      productName: 'DeviceX',
      indication: 'chronic wound care',
      keyBenefits: [{ description: 'faster healing', endpointType: 'clinical', magnitude: 'large', uncertainty: 'low' }],
      // keyRisks intentionally omitted — the safety profile is uncharacterized
    } as any);
    const riskRow = r.rows.find((row: any) => row.dimension === 'Risk and Risk Management');
    expect(riskRow).toBeDefined();
    expect(riskRow!.conclusionsAndReasons).not.toMatch(/readily manageable/i);
    expect(riskRow!.conclusionsAndReasons).toMatch(/no risk.*can be made|not established/i);
  });

  it('does NOT say "benefit modestly exceeds risk" when a dimension was not characterized', () => {
    const r = structureBenefitRiskFramework({
      productName: 'DeviceX',
      indication: 'chronic wound care',
      // neither benefits nor risks supplied → net 0 must not read as favourable
    } as any);
    expect(r.integratedAssessmentNarrative).not.toMatch(/benefit (modestly|clearly) exceeds risk/i);
    expect(r.integratedAssessmentNarrative).toMatch(/balance cannot be determined/i);
  });

  it('still produces the ordinary directional narrative when BOTH sides are characterized', () => {
    const r = structureBenefitRiskFramework({
      productName: 'DeviceX',
      indication: 'chronic wound care',
      keyBenefits: [{ description: 'faster healing', endpointType: 'clinical', magnitude: 'large', uncertainty: 'low' }],
      keyRisks: [{ description: 'mild irritation', severity: 'mild', reversibility: 'reversible', frequency: 'uncommon' }],
    } as any);
    expect(r.integratedAssessmentNarrative).not.toMatch(/balance cannot be determined/i);
  });
});

describe('assessBenefitRiskBalance — empty EITHER side is indeterminate, not favourable', () => {
  it('returns indeterminate when strong benefits are set against zero characterized risks', () => {
    const r = assessBenefitRiskBalance({
      productName: 'DeviceX',
      indication: 'chronic wound care',
      benefits: [{ name: 'healing', magnitude: 'large', uncertainty: 'low' }],
      risks: [],
    } as any);
    expect(r.verdict).toBe('indeterminate');
    // The balance must be stated as NOT determinable, never affirmed favourable.
    expect(r.structuredConclusion).toMatch(/not determinable as clearly favourable/i);
    expect(r.structuredConclusion).not.toMatch(/balance of [^.]* is favourable/i);
  });

  it('still reaches a favourable verdict when both sides are characterized and benefit dominates', () => {
    const r = assessBenefitRiskBalance({
      productName: 'DeviceX',
      indication: 'chronic wound care',
      benefits: [{ name: 'healing', magnitude: 'large', uncertainty: 'low' }],
      risks: [{ name: 'irritation', severity: 'mild', reversibility: 'reversible', frequency: 'rare', mitigated: true }],
    } as any);
    expect(['favourable', 'favourable_with_conditions']).toContain(r.verdict);
  });
});
