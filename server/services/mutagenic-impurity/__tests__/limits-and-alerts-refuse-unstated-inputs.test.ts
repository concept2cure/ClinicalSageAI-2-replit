/**
 * The TTC, control-strategy and structural-alert engines refuse an unstated
 * input instead of reading it as the favourable value.
 *
 * Until 2026-10-15:
 * - calculateTTC with no compoundClass applied the standard 1.5 μg/day TTC and
 *   stated "Compound is NOT in a Cohort of Concern" (the default N-nitrosamine
 *   intake is 18 ng/day, about 83× lower); with no route it stated "Oral route";
 *   with no impurity count it stated "Single mutagenic impurity — full TTC
 *   allocation applies to this impurity".
 * - controlMutagenicImpurity defaulted compoundClass to 'not_coc' (the same
 *   1.5 μg/day), stated the specification limit as "NaN ppm" when no maximum
 *   daily dose was given, and printed "Current purge factor: 0×" when purge data
 *   was said to exist but no factor was given.
 * - assessStructuralAlerts reported NEGATIVE — "None of the provided functional
 *   groups (epoxide) match known ICH M7 alerting structures" — for an epoxide or
 *   an aldehyde, both ICH M7 alerts, because its keyword list holds the plural
 *   category names. A keyword miss was reported as a negative assessment.
 */
import { describe, expect, it } from 'vitest';

import {
  assessStructuralAlerts,
  calculateTTC,
  controlMutagenicImpurity,
  type ControlStrategyInput,
  type StructuralAlertInput,
  type TTCInput,
} from '../mutagenic-impurity-knowledge';

const TTC: TTCInput = { treatmentDuration: 'lifetime', route: 'oral', compoundClass: 'not_coc' };

const CONTROL: ControlStrategyInput = {
  impurityClass: 2,
  drugProductType: 'tablet',
  maxDailyDoseG: 0.5,
  treatmentDuration: 'lifetime',
  developmentPhase: 'commercial',
  compoundClass: 'not_coc',
};

describe('calculateTTC — no limit from an unstated cohort, route or duration', () => {
  it('refuses an unstated compound class instead of applying the standard TTC', () => {
    expect(() => calculateTTC({ ...TTC, compoundClass: undefined } as unknown as TTCInput)).toThrow(/compoundClass is required/);
  });

  it('refuses a missing route or duration with a "must be" refusal rather than a TypeError or "Oral route"', () => {
    expect(() => calculateTTC({ ...TTC, route: undefined } as unknown as TTCInput)).toThrow(/route is required/);
    expect(() => calculateTTC({ ...TTC, treatmentDuration: 'chronic' } as unknown as TTCInput)).toThrow(
      /treatmentDuration must be one of single_dose, up_to_1_month, 1_to_12_months, 1_to_10_years, lifetime/,
    );
  });

  it('does not assert a single impurity when the number of mutagenic impurities was not stated', () => {
    const unstated = calculateTTC(TTC).multipleImpurityConsideration;
    expect(unstated).not.toMatch(/Single mutagenic impurity/);
    expect(unstated).toMatch(/not stated/);
    expect(calculateTTC({ ...TTC, numberOfMutagenicImpurities: 1 }).multipleImpurityConsideration).toMatch(/Single mutagenic impurity/);
    expect(() => calculateTTC({ ...TTC, numberOfMutagenicImpurities: 0 })).toThrow(/numberOfMutagenicImpurities must be/);
  });
});

describe('controlMutagenicImpurity — no specification limit from an unstated input', () => {
  it('refuses an unstated compound class instead of defaulting to not_coc', () => {
    expect(() => controlMutagenicImpurity({ ...CONTROL, compoundClass: undefined } as unknown as ControlStrategyInput)).toThrow(
      /compoundClass is required/,
    );
  });

  it('refuses a missing maximum daily dose instead of stating "NaN ppm"', () => {
    expect(() => controlMutagenicImpurity({ ...CONTROL, maxDailyDoseG: undefined } as unknown as ControlStrategyInput)).toThrow(
      /maxDailyDoseG is required/,
    );
  });

  it('refuses "purge data available" without a purge factor instead of printing 0×', () => {
    expect(() => controlMutagenicImpurity({ ...CONTROL, purgeFactorAvailable: true })).toThrow(/purgeFactorValue must be/);
  });

  it('still states the limit for a stated cohort: N-nitrosamine default 18 ng/day', () => {
    const r = controlMutagenicImpurity({ ...CONTROL, compoundClass: 'CoC_nitrosamine' });
    expect(r.specificationLimit.ai_ug_per_day).toBe(0.018);
  });
});

describe('assessStructuralAlerts — a keyword miss is not a negative assessment', () => {
  // 2026-10-15: epoxide/aldehyde now match their categories (singular names are
  // curated); a term no category names still comes back inconclusive.
  it('reports a term the keyword list misses as inconclusive, never NEGATIVE', () => {
    for (const group of ['thiophene', 'carboxylic acid']) {
      const r = assessStructuralAlerts({ functionalGroupsPresent: [group] });
      expect(r.overallAssessment, `${group} matched nothing`).not.toBe('negative');
      expect(r.overallAssessment).toBe('inconclusive');
      expect(r.regulatorySummary).not.toMatch(/NEGATIVE/);
      expect(r.assessmentDescription).toMatch(/not a \(Q\)SAR prediction/);
    }
  });

  it('still reports a matched alert as positive', () => {
    expect(assessStructuralAlerts({ functionalGroupsPresent: ['aromatic amine'] }).overallAssessment).toBe('positive');
  });

  it('refuses a missing functional-group list rather than throwing a TypeError', () => {
    expect(() => assessStructuralAlerts({} as StructuralAlertInput)).toThrow(/functionalGroupsPresent is required/);
  });
});
