/**
 * designREMS (AnA tool design_rems) says which stated inputs did not shape the
 * design (2026-10-15).
 *
 * The tool said the design "accounts for product-specific risk profiles, target
 * population characteristics", that riskFrequency "affects REMS burden-benefit
 * calculus" and that a generic triggers shared-system considerations. The
 * engine read only safetySignalType and riskSeverity: a generic with a rare risk
 * in a named population got exactly the elements of any other product, nothing
 * said so, and the stated identifiedRisk was dropped for the signal type ("The
 * identified risk (teratogenicity, severity: moderate)").
 */
import { describe, expect, it } from 'vitest';
import { designREMS, type DesignREMSInput } from '../labeling-intelligence-knowledge';
import { DESIGN_REMS } from '../../ana/labelingIntelligenceTools';

const rems = (p: unknown) => designREMS(p as DesignREMSInput);
const elements = (p: unknown) => rems(p).recommendedElements.map((e) => e.element);

const STATED = {
  identifiedRisk: 'embryo-fetal toxicity',
  safetySignalType: 'teratogenicity',
  productType: 'generic',
  riskSeverity: 'moderate',
  riskFrequency: 'rare',
  targetPopulation: 'women of reproductive potential',
  riskMitigationOptions: ['pregnancy testing'],
};

describe('designREMS', () => {
  it('names each stated input the elements were not chosen from', () => {
    const r = rems(STATED);
    expect(r.inputsNotUsed, 'stated inputs the design never read').toEqual([
      expect.stringMatching(/^productType "generic" — FD&C Act 505-1\(i\).* is not applied$/),
      'riskFrequency "rare"',
      'targetPopulation "women of reproductive potential"',
      'riskMitigationOptions ["pregnancy testing"]',
    ]);
    // Which is the truth: the same signal and severity give the same elements whatever else is stated.
    expect(elements(STATED)).toEqual(elements({ safetySignalType: 'teratogenicity', riskSeverity: 'moderate' }));
  });

  it('designs for the risk as described, and says when it was not', () => {
    const r = rems(STATED);
    expect(r.identifiedRisk).toBe('embryo-fetal toxicity');
    expect(r.recommendedElements[0].rationale).toMatch(/embryo-fetal toxicity/);
    const bare = rems({ safetySignalType: 'hepatotoxicity', riskSeverity: 'high' });
    expect(bare.identifiedRisk).toBeNull();
    expect(bare.inputsNotUsed).toEqual([]);
    expect(bare.recommendedElements[0].rationale).toMatch(/not described/);
  });

  it('no longer tells AnA it accounts for inputs it does not read', () => {
    expect(DESIGN_REMS.description).not.toMatch(/target population characteristics/);
    // Within the 1024 characters OpenAI keeps of a tool description.
    expect(DESIGN_REMS.description.slice(0, 1024)).toMatch(/listed in inputsNotUsed — report them as not used/);
    const props = DESIGN_REMS.input_schema.properties as Record<string, { description: string }>;
    expect(props.riskFrequency.description).not.toMatch(/affects/i);
    expect(props.targetPopulation.description).not.toMatch(/influences/i);
    expect(props.productType.description).not.toMatch(/trigger/i);
    expect(DESIGN_REMS.input_schema.required).not.toContain('productType');
  });
});
