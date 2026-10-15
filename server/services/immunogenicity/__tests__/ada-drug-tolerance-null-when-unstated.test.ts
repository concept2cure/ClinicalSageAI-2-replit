/**
 * The ADA strategy reports no drug-tolerance figure when the expected
 * circulating drug level was not stated (audit finding 30, 2026-10-15).
 *
 * What the code used to do: `expectedCirculatingDrug_ug_per_mL ?? 0`, so an
 * unstated drug level came back in the structured result as
 * `expectedCirculatingDrug_ug_per_mL: 0` and
 * `recommendedDrugTolerance_ug_per_mL: 0`. The prose summary hedged, but AnA
 * reports the numbers verbatim, and those said the assay needs no drug
 * tolerance.
 */
import { describe, expect, it } from 'vitest';
import {
  designADAAssayStrategy,
  type ADAAssayStrategyParams,
} from '../immunogenicity-knowledge';

describe('designADAAssayStrategy: drug tolerance', () => {
  it('is null, not 0, when the expected circulating drug was not stated', () => {
    const r = designADAAssayStrategy({ productType: 'humanized_mab' });

    expect(r.drugTolerance.expectedCirculatingDrug_ug_per_mL).toBeNull();
    expect(r.drugTolerance.recommendedDrugTolerance_ug_per_mL).toBeNull();
  });

  it('is derived from a stated level', () => {
    const r = designADAAssayStrategy({ productType: 'humanized_mab', expectedCirculatingDrug_ug_per_mL: 25 });

    expect(r.drugTolerance.expectedCirculatingDrug_ug_per_mL).toBe(25);
    expect(r.drugTolerance.recommendedDrugTolerance_ug_per_mL).toBe(25);
  });

  it('refuses a negative level rather than reporting a tolerance of 0', () => {
    let err: { name?: string; code?: string; field?: string } | undefined;
    try {
      designADAAssayStrategy({
        productType: 'humanized_mab',
        expectedCirculatingDrug_ug_per_mL: -5,
      } as ADAAssayStrategyParams);
    } catch (e) {
      err = e as typeof err;
    }
    expect(err).toMatchObject({
      name: 'ComputationRefusal',
      code: 'invalid_input',
      field: 'expectedCirculatingDrug_ug_per_mL',
    });
  });
});
