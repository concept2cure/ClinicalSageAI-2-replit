/**
 * PLLR now returns structure only, with no product statements from typed facts
 * (Rule 2 S4). The OTC Drug Facts contract still requires the product facts
 * deciding its panel; that independent behavior remains pinned here.
 */
import { describe, expect, it } from 'vitest';
import {
  assessOTCLabeling,
  assessPregnancyLactationLabeling,
  type AssessOTCLabelingInput,
  type AssessPregnancyLactationInput,
} from '../labeling-intelligence-knowledge';
import { ASSESS_PREGNANCY_LACTATION_LABELING } from '../../ana/labelingIntelligenceTools';

const pllr = (p: unknown) => assessPregnancyLactationLabeling(p as AssessPregnancyLactationInput);
const otc = (p: unknown) => assessOTCLabeling(p as AssessOTCLabelingInput);

/** The input with one key left out. */
function without(input: Record<string, unknown>, key: string): Record<string, unknown> {
  const copy = { ...input };
  delete copy[key];
  return copy;
}

const PLLR_FACTS: Record<string, unknown> = {
  animalReproToxData: [],
  humanPregnancyData: false,
  placentalTransfer: 'unknown',
  breastMilkExcretion: 'unknown',
  mechanismBasedRisk: false,
};

describe('assessPregnancyLactationLabeling', () => {
  it('does not write "not excreted in breast milk" when excretion was not stated', () => {
    const result = pllr(without(PLLR_FACTS, 'breastMilkExcretion'));
    expect(result.section8_2.requiredStatements).toBeNull();
    expect(result.section8_2.subsections[0].contentGuidance).not.toMatch(/not excreted/);
  });

  it('does not request conversation facts for product label text it cannot assess', () => {
    const structure = pllr({});
    for (const k of ['animalReproToxData', 'humanPregnancyData', 'placentalTransfer', 'mechanismBasedRisk']) {
      const result = pllr(without(PLLR_FACTS, k));
      expect(result.section8_1, k).toEqual(structure.section8_1);
      expect(result.section8_3, k).toEqual(structure.section8_3);
    }
  });

  it('returns a structure and the no-records reason with nothing supplied', () => {
    const result = pllr({});
    expect(result).toMatchObject({ status: 'not_assessed', ignoredSuppliedFigures: false });
    expect(result.reason).toMatch(/no .*records.*read/i);
  });

  it('a stated excretion answer does not become a product label statement', () => {
    const none = pllr({ ...PLLR_FACTS, breastMilkExcretion: 'none' });
    const unknown = pllr(PLLR_FACTS);
    expect(none.section8_2).toEqual(unknown.section8_2);
    expect(none.section8_2.requiredStatements).toBeNull();
    expect(none.ignoredSuppliedFigures).toBe(true);
  });

  it('is offered to AnA without product facts or figures', () => {
    expect(ASSESS_PREGNANCY_LACTATION_LABELING.input_schema.properties).toEqual({});
    expect(ASSESS_PREGNANCY_LACTATION_LABELING.input_schema.required).toEqual([]);
  });
});

describe('assessOTCLabeling', () => {
  const PRODUCT: Record<string, unknown> = {
    otcCategory: 'analgesic',
    activeIngredients: ['ibuprofen 200 mg'],
    dosageForm: 'tablet',
    targetPopulation: 'adult',
  };

  it('does not drop the pregnancy/breast-feeding warning because the population was not stated', () => {
    expect(() => otc(without(PRODUCT, 'targetPopulation')), 'Drug Facts written with the population unstated')
      .toThrow(/targetPopulation/);
  });

  it('requires the category, ingredients and dosage form it writes from', () => {
    for (const k of ['otcCategory', 'activeIngredients', 'dosageForm']) {
      expect(() => otc(without(PRODUCT, k)), k).toThrow(new RegExp(k));
    }
    expect(() => otc({ ...PRODUCT, activeIngredients: [] })).toThrow(/activeIngredients/);
  });

  it('gives a stated adult product the warning', () => {
    const warnings = otc(PRODUCT).drugFactsPanel.find((s) => s.heading === 'Warnings');
    expect(warnings?.contentGuidance).toMatch(/Pregnancy\/breast-feeding warning/);
  });
});
