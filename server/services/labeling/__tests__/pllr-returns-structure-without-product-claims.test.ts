/** Rule 2 S4: typed evidence is not the product's recorded labeling basis. */
import { describe, expect, it } from 'vitest';
import { assessPregnancyLactationLabeling } from '../labeling-intelligence-knowledge';
import { ASSESS_PREGNANCY_LACTATION_LABELING } from '../../ana/labelingIntelligenceTools';

const STATED = {
  animalReproToxData: [{ species: 'rat', dose: '30 mg/kg/day', findings: 'no malformations or embryolethality observed' }],
  humanPregnancyData: false,
  placentalTransfer: 'unknown' as const,
  breastMilkExcretion: 'unknown' as const,
  mechanismBasedRisk: false,
  pregnancyRegistryData: false,
};

describe('PLLR structure without product risk statements', () => {
  it('does not turn negated findings typed in a call into fetal-risk label advice', () => {
    const out = assessPregnancyLactationLabeling(STATED);
    expect(out.section8_1.requiredStatements).toBeNull();
    expect(JSON.stringify(out.section8_1)).not.toContain('Based on animal data, advise pregnant women');
    expect(out).toMatchObject({ status: 'not_assessed', ignoredSuppliedFigures: true });
  });

  it('returns the PLLR section structure without asking for model-typed product facts', () => {
    const out = assessPregnancyLactationLabeling({} as typeof STATED);
    expect([out.section8_1, out.section8_2, out.section8_3].map(section => section.sectionTitle)).toEqual([
      '8.1 Pregnancy', '8.2 Lactation', '8.3 Females and Males of Reproductive Potential',
    ]);
    for (const section of [out.section8_1, out.section8_2, out.section8_3]) {
      expect(section.requiredStatements).toBeNull();
      expect(section.subsections.length).toBeGreaterThan(0);
    }
    expect(out).toMatchObject({ status: 'not_assessed', ignoredSuppliedFigures: false });
    expect(out.reason).toMatch(/no .*records.*read/i);
  });

  it('does not derive different product labeling from different stated evidence', () => {
    const negative = assessPregnancyLactationLabeling(STATED);
    const positive = assessPregnancyLactationLabeling({ ...STATED, mechanismBasedRisk: true, breastMilkExcretion: 'none' });
    expect(positive.section8_1).toEqual(negative.section8_1);
    expect(positive.section8_2).toEqual(negative.section8_2);
    expect(positive.section8_3).toEqual(negative.section8_3);
  });

  it('does not authorize choosing a generic risk template from conversation facts', () => {
    const out = assessPregnancyLactationLabeling(STATED);
    expect(out.instruction).toMatch(/structure only/i);
    expect(out.instruction).toMatch(/product-specific .*remain unassessed/i);
    expect(out.instruction).toMatch(/do not select or apply .*template.*conversation facts/i);
  });

  it('offers structure only and tells AnA not to pass product findings or facts', () => {
    expect(ASSESS_PREGNANCY_LACTATION_LABELING.input_schema.properties).toEqual({});
    expect(ASSESS_PREGNANCY_LACTATION_LABELING.input_schema.required).toEqual([]);
    expect(ASSESS_PREGNANCY_LACTATION_LABELING.description).toMatch(/do not pass/i);
    expect(ASSESS_PREGNANCY_LACTATION_LABELING.description.length).toBeLessThanOrEqual(1024);
  });
});
