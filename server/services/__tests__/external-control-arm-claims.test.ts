/**
 * External control arm — the regulatory package may not claim a method that
 * was never performed.
 *
 * ── The defect ──────────────────────────────────────────────────────────────
 * generateRegulatoryPackage() built its methods paragraph by looking
 * control.method up in a table of fixed descriptions. For 'propensity_score'
 * that description read, in the past tense:
 *
 *   "Propensity score methodology was used to construct a balanced external
 *    control arm. Propensity scores estimated the probability of belonging to
 *    the treatment population conditional on measured baseline covariates."
 *
 * No propensity scores were necessarily estimated. Selecting that method runs
 * propensityScoreMatching(), which calls naivePooling() and attaches baseline
 * covariate MEANS — no scores, no matching, no weighting. It says so in its own
 * `note` ("Initial synthesis. Call fitPropensityModel for full propensity-score
 * adjustment."), but that note sat inside synthesisParameters, two levels below
 * a paragraph asserting the opposite, and no reader weighs a nested field
 * against the prose. Only fitPropensityModel() estimates scores, and it records
 * that by inserting a propensityModels row.
 *
 * The output is persisted to syntheticControls.regulatoryJustification and
 * returned as a submission-facing methods statement. An unadjusted pooled
 * estimate described to an agency as propensity-score adjusted is a false
 * methods statement — and the agency reader cannot tell from the document.
 *
 * ── No test doubles in this file ────────────────────────────────────────────
 * Nothing is mocked, stubbed or faked. The truthfulness decision was extracted
 * into two pure functions precisely so it could be proved without a database
 * pretending to be a database: they take the evidence as an argument and return
 * prose. What remains in the service is the query that gathers that evidence.
 */

import { describe, it, expect } from 'vitest';
import {
  describeSynthesisMethod,
  synthesisMethodLimitations,
  type SynthesisMethod,
} from '../external-control-arm-service';

const FITTED = { propensityModelFitted: true };
const NOT_FITTED = { propensityModelFitted: false };

/** The claim that must never appear without a fitted model. */
const PAST_TENSE_CLAIM = 'Propensity scores estimated the probability of belonging to';

describe('describeSynthesisMethod', () => {
  it('does not claim propensity scores were estimated when no model was fitted', async () => {
    const prose = describeSynthesisMethod('propensity_score', NOT_FITTED);
    expect(prose).not.toContain(PAST_TENSE_CLAIM);
    expect(prose).not.toContain('Propensity score methodology was used');
  });

  it('states plainly what was done instead', async () => {
    const prose = describeSynthesisMethod('propensity_score', NOT_FITTED);
    // A reader must learn three things: no model, what actually produced the
    // numbers, and what to do about it.
    expect(prose).toContain('NO propensity model has been fitted');
    expect(prose).toContain('sample-size-weighted pooling');
    expect(prose).toContain('Fit a propensity model');
  });

  it('makes the full claim once a model has actually been fitted', async () => {
    const prose = describeSynthesisMethod('propensity_score', FITTED);
    expect(prose).toContain(PAST_TENSE_CLAIM);
    expect(prose).not.toContain('NO propensity model has been fitted');
  });

  it('leaves the other three methods’ descriptions untouched by the evidence', async () => {
    // Guard against over-correction: only the propensity claim depended on a
    // fact the service had not checked. Rewriting the others would be a
    // different, unreviewed change to submission prose.
    for (const method of ['naive_pooling', 'ipw', 'bayesian_borrowing'] as SynthesisMethod[]) {
      expect(describeSynthesisMethod(method, FITTED)).toBe(
        describeSynthesisMethod(method, NOT_FITTED),
      );
      expect(describeSynthesisMethod(method, NOT_FITTED)).not.toBe('Method details not available.');
    }
  });
});

describe('synthesisMethodLimitations', () => {
  it('discloses the unadjusted estimate in the limitations section too', async () => {
    // The methods paragraph and the limitations section are read by different
    // people; the fact has to survive either one being read alone.
    const limitations = synthesisMethodLimitations('propensity_score', NOT_FITTED);
    expect(limitations).toHaveLength(1);
    expect(limitations[0]).toContain('UNADJUSTED');
    expect(limitations[0]).toContain('must not be described');
    expect(limitations[0]).toContain('between-study heterogeneity');
  });

  it('adds no propensity caveat once a model is fitted', async () => {
    expect(synthesisMethodLimitations('propensity_score', FITTED)).toEqual([]);
  });

  it('keeps the pre-existing naive-pooling caveat regardless of evidence', async () => {
    for (const evidence of [FITTED, NOT_FITTED]) {
      const limitations = synthesisMethodLimitations('naive_pooling', evidence);
      expect(limitations).toHaveLength(1);
      expect(limitations[0]).toContain('does not adjust for between-study heterogeneity');
    }
  });

  it('adds nothing for methods that carry no evidence-dependent caveat', async () => {
    expect(synthesisMethodLimitations('ipw', NOT_FITTED)).toEqual([]);
    expect(synthesisMethodLimitations('bayesian_borrowing', NOT_FITTED)).toEqual([]);
  });
});
