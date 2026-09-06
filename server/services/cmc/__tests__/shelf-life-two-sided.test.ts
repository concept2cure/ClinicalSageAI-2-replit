/**
 * ICH Q1E shelf life — a TWO-SIDED acceptance criterion has two ways to fail.
 *
 * `parseAcceptanceCriterion` resolves a range like "4.5 - 6.5" to the LOWER
 * bound with direction 'decreasing' and deliberately carries `upperLimit` +
 * `twoSided` alongside so a caller can honour both. The Q1E estimator passed
 * only `criterion.limit` / `criterion.direction` to `estimateShelfLife`,
 * discarding the upper bound.
 *
 * For an attribute drifting toward the DISCARDED bound the one-sided confidence
 * limit moves away from the evaluated one, so g(t) grows monotonically and the
 * estimate returned the full Q1E allowance — a shelf life reported against a
 * criterion half of which was never evaluated. Because `supportedShelfLife` is
 * the minimum across attributes, an over-long figure on the genuinely limiting
 * attribute becomes the programme's answer, and a shelf life is a label claim.
 *
 * The sibling OOS check in module3Composer already used BOTH bounds
 * (`aboveRange = criterion.twoSided && ... value > criterion.upperLimit`), so
 * the two consumers of the same parsed criterion disagreed.
 */
import { describe, it, expect } from 'vitest';
import { estimateRecordedShelfLife } from '../recorded-stability';
import { parseAcceptanceCriterion } from '../recorded-stability';

/** pH rising 5.0 → 6.4 against "4.5 - 6.5": the upper bound is the real limit. */
const RISING_PH = [
  { parameter: 'pH', timePoint: '0', result: '5.0', specification: '4.5 - 6.5' },
  { parameter: 'pH', timePoint: '6', result: '5.4', specification: '4.5 - 6.5' },
  { parameter: 'pH', timePoint: '12', result: '5.8', specification: '4.5 - 6.5' },
  { parameter: 'pH', timePoint: '24', result: '6.4', specification: '4.5 - 6.5' },
];

/** Assay falling against the same shape of range: the LOWER bound limits. */
const FALLING_ASSAY = [
  { parameter: 'Assay', timePoint: '0', result: '101.0', specification: '95.0 - 105.0' },
  { parameter: 'Assay', timePoint: '6', result: '99.5', specification: '95.0 - 105.0' },
  { parameter: 'Assay', timePoint: '12', result: '98.0', specification: '95.0 - 105.0' },
  { parameter: 'Assay', timePoint: '24', result: '96.0', specification: '95.0 - 105.0' },
];

function study(points: unknown[]) {
  return {
    id: 1,
    studyTitle: 'S',
    productName: 'P',
    batchNumber: 'B1',
    storageConditions: ['25C/60RH'],
    duration: 24,
    stabilityData: points,
  } as any;
}

describe('parseAcceptanceCriterion carries both bounds of a range', () => {
  it('resolves "4.5 - 6.5" to lower=4.5, upper=6.5, twoSided', () => {
    const c = parseAcceptanceCriterion(['4.5 - 6.5']);
    expect(c).toMatchObject({ limit: 4.5, upperLimit: 6.5, twoSided: true, direction: 'decreasing' });
  });
});

describe('estimateRecordedShelfLife — two-sided criteria', () => {
  it('does NOT report the full search horizon for an attribute rising toward the UPPER bound', async () => {
    const out = await estimateRecordedShelfLife(study(RISING_PH));
    expect(out.ok).toBe(true);
    const est: any = (out as any).data.estimates[0];
    expect(est.estimable).toBe(true);
    // Pre-fix: only 4.5 (decreasing) was evaluated, pH rises away from it, so the
    // estimate ran to the whole maxTime horizon (120 months here).
    const maxTime = (out as any).data.maxTimeEvaluated;
    expect(est.shelfLife).toBeLessThan(maxTime);
    // The real constraint is the upper bound, reached well inside the study's
    // own evaluated range.
    expect(est.shelfLife).toBeLessThan(36);
  });

  it('reports the UPPER bound as the limiting one, and shows both were evaluated', async () => {
    const out = await estimateRecordedShelfLife(study(RISING_PH));
    const est: any = (out as any).data.estimates[0];
    expect(est.specLimit).toBe(6.5);
    expect(est.direction).toBe('increasing');
    expect(est.acceptanceCriterion).toMatchObject({
      lowerLimit: 4.5, upperLimit: 6.5, twoSided: true, limitingBound: 'upper',
    });
    expect(est.acceptanceCriterion.boundsEvaluated).toHaveLength(2);
  });

  it('the programme answer follows the limiting bound', async () => {
    const out = await estimateRecordedShelfLife(study(RISING_PH));
    const data: any = (out as any).data;
    expect(data.limitingParameter).toBe('pH');
    expect(data.supportedShelfLife).toBeLessThan(36);
  });

  it('a falling attribute is still limited by the LOWER bound (unchanged path)', async () => {
    const out = await estimateRecordedShelfLife(study(FALLING_ASSAY));
    const est: any = (out as any).data.estimates[0];
    expect(est.specLimit).toBe(95);
    expect(est.direction).toBe('decreasing');
    expect(est.acceptanceCriterion.limitingBound).toBe('lower');
    expect(est.shelfLife).toBeGreaterThan(0);
  });

  it('a ONE-SIDED criterion is unaffected and carries no two-sided block', async () => {
    const out = await estimateRecordedShelfLife(
      study([
        { parameter: 'Impurity A', timePoint: '0', result: '0.10', specification: '<= 2.0%' },
        { parameter: 'Impurity A', timePoint: '6', result: '0.30', specification: '<= 2.0%' },
        { parameter: 'Impurity A', timePoint: '12', result: '0.55', specification: '<= 2.0%' },
        { parameter: 'Impurity A', timePoint: '24', result: '0.95', specification: '<= 2.0%' },
      ]),
    );
    const est: any = (out as any).data.estimates[0];
    expect(est.specLimit).toBe(2);
    expect(est.direction).toBe('increasing');
    expect(est.acceptanceCriterion).toBeUndefined();
    expect(est.estimable).toBe(true);
  });
});
