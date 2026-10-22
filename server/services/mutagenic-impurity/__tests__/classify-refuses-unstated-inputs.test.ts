/**
 * ICH M7(R2) classification refuses an input it was not given.
 *
 * Until 2026-10-15 classifyMutagenicImpurity({}) returned "Class 4: Alerting
 * structure, but Ames-negative (non-mutagenic)" with the control approach "No
 * mutagenic impurity controls required", and printed "undefined" seven times:
 * the last branch of the decision tree caught every Ames value that was not
 * 'not_tested', none at all included. A missing cohort-of-concern flag was read
 * as false, so the output asserted "Compound is NOT in a Cohort of Concern
 * category. Standard TTC (1.5 μg/day lifetime) applies" for a structure nobody
 * had reviewed. AnA reports the result verbatim as deterministic. An unrecorded
 * Ames result is not a negative one.
 */
import { describe, expect, it } from 'vitest';

import { classifyMutagenicImpurity, type ClassifyInput } from '../mutagenic-impurity-knowledge';

const STATED: ClassifyInput = {
  amesMutagenicity: 'negative',
  structuralAlertsPresent: 'yes',
  carcinogenicityData: 'not_tested',
  impurityRelationship: 'process_related',
  cohortOfConcernStructure: false,
};

type Refusal = Error & { code?: string; field?: string };

function refusalOf(input: Record<string, unknown>): Refusal | null {
  try {
    classifyMutagenicImpurity(input as unknown as ClassifyInput);
  } catch (e) {
    return e as Refusal;
  }
  return null;
}

describe('classifyMutagenicImpurity — an unstated input is refused, never read as the favourable one', () => {
  it('refuses an empty input instead of classifying it Class 4, "no mutagenic impurity controls required"', () => {
    const e = refusalOf({});
    expect(e, 'classifyMutagenicImpurity({}) must refuse, not classify').not.toBeNull();
    expect(e?.name).toBe('ComputationRefusal');
    for (const field of ['amesMutagenicity', 'structuralAlertsPresent', 'carcinogenicityData', 'impurityRelationship', 'cohortOfConcernStructure']) {
      expect(e?.message, `the refusal names ${field}`).toContain(field);
    }
  });

  it('refuses a missing Ames result even when every other input is stated', () => {
    const e = refusalOf({ ...STATED, amesMutagenicity: undefined });
    expect(e?.message).toMatch(/amesMutagenicity is required/);
    expect(e?.code).toBe('missing_input');
    expect(e?.field).toBe('amesMutagenicity');
  });

  it('refuses a misspelled Ames result rather than reading it as negative', () => {
    expect(refusalOf({ ...STATED, amesMutagenicity: 'neg' })?.message).toMatch(
      /amesMutagenicity must be one of positive, negative, not_tested/,
    );
  });

  it('refuses an unstated cohort-of-concern status instead of asserting "NOT in a Cohort of Concern"', () => {
    const e = refusalOf({ ...STATED, amesMutagenicity: 'positive', cohortOfConcernStructure: undefined });
    expect(e?.field).toBe('cohortOfConcernStructure');
  });

  // 2026-10-15: was Class 4; the CMC record classes an alert with adequate negative data 5.
  it('still classifies a stated Ames-negative alerting impurity (Class 5), with no "undefined" in the output', () => {
    const r = classifyMutagenicImpurity(STATED);
    expect(r.impurityClass).toBe(5);
    expect(JSON.stringify(r)).not.toContain('undefined');
  });

  it('keeps the stated decision tree: not tested → Class 3, Ames-positive → Class 2, positive carcinogenicity too → Class 1', () => {
    expect(classifyMutagenicImpurity({ ...STATED, amesMutagenicity: 'not_tested' }).impurityClass).toBe(3);
    expect(classifyMutagenicImpurity({ ...STATED, amesMutagenicity: 'positive' }).impurityClass).toBe(2);
    expect(
      classifyMutagenicImpurity({ ...STATED, amesMutagenicity: 'positive', carcinogenicityData: 'positive' }).impurityClass,
    ).toBe(1);
    expect(classifyMutagenicImpurity({ ...STATED, structuralAlertsPresent: 'no' }).impurityClass).toBe(5);
  });

  it('states the cohort of concern only as it was stated', () => {
    const coc = classifyMutagenicImpurity({ ...STATED, amesMutagenicity: 'positive', cohortOfConcernStructure: true });
    expect(coc.cohortOfConcernAssessment.isCohortOfConcern).toBe(true);
    const notCoc = classifyMutagenicImpurity({ ...STATED, amesMutagenicity: 'positive' });
    expect(notCoc.cohortOfConcernAssessment.isCohortOfConcern).toBe(false);
  });
});
