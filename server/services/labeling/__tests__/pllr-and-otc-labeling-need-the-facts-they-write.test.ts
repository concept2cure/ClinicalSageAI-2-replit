/**
 * assessPregnancyLactationLabeling and assessOTCLabeling (AnA tools
 * assess_pregnancy_lactation_labeling and assess_otc_labeling) write label
 * guidance only from facts that were stated (2026-10-15).
 *
 * An unstated input was read as its most favourable value. With
 * breastMilkExcretion missing, section 8.2 told the author "Drug is not excreted
 * in breast milk. State this and note whether breastfeeding may be continued";
 * with humanPregnancyData missing, 8.1 said to state "There are no adequate data
 * on the developmental risk ... in pregnant women"; and a Drug Facts panel with
 * targetPopulation missing lost the 21 CFR 201.63 pregnancy/breast-feeding
 * warning. A missing animal-study or ingredient list threw a TypeError.
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
    expect(() => pllr(without(PLLR_FACTS, 'breastMilkExcretion')), 'lactation text written with excretion unstated')
      .toThrow(/breastMilkExcretion/);
  });

  it('requires each fact that decides the 8.1 and 8.3 text', () => {
    for (const k of ['animalReproToxData', 'humanPregnancyData', 'placentalTransfer', 'mechanismBasedRisk']) {
      expect(() => pllr(without(PLLR_FACTS, k)), k).toThrow(new RegExp(k));
    }
  });

  it('names every missing fact in one refusal, so they can all be asked for at once', () => {
    expect(() => pllr({})).toThrow(new RegExp(Object.keys(PLLR_FACTS).join('.*')));
  });

  it('writes "not excreted" only when that was stated', () => {
    const none = pllr({ ...PLLR_FACTS, breastMilkExcretion: 'none' });
    expect(none.section8_2.subsections[0].contentGuidance).toMatch(/not excreted/);
    const unknown = pllr(PLLR_FACTS);
    expect(unknown.section8_2.subsections[0].contentGuidance).toMatch(/no data on the presence/);
  });

  it('is offered to AnA with those facts required', () => {
    expect(ASSESS_PREGNANCY_LACTATION_LABELING.input_schema.required).toEqual(
      expect.arrayContaining(['animalReproToxData', 'humanPregnancyData', 'placentalTransfer', 'breastMilkExcretion', 'mechanismBasedRisk']),
    );
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
