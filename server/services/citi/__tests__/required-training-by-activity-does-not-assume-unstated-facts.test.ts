/**
 * REQUIRED_TRAINING_BY_ACTIVITY does not assume a fact it was not given.
 *
 * What the code used to do: it built the checklist profile with
 * `involvesHumanGeneTransfer: false` and `region: 'us'` hard-coded, because the
 * CITI profile carries no gene-transfer fact. Biosafety training that human gene
 * transfer requires was therefore dropped from the list without anyone having
 * said the activity involves no gene transfer, and a stated gene-transfer fact
 * could not even be passed in.
 *
 * Now: gene transfer can be stated; an omitted or null fact is not stated; and a
 * list the stated facts do not determine is refused, naming what is missing,
 * rather than returned short.
 */
import { describe, it, expect } from 'vitest';
import { REQUIRED_TRAINING_BY_ACTIVITY } from '../citi-logic';

const NONE = { involvesHumanSubjects: false, involvesAnimals: false, involvesRecombinantDNA: false, fundingSource: 'internal' as const };

describe('REQUIRED_TRAINING_BY_ACTIVITY', () => {
  it('refuses, rather than drops biosafety, when gene transfer was not stated', () => {
    expect(() => REQUIRED_TRAINING_BY_ACTIVITY(NONE)).toThrow(/biosafety.*human gene transfer involvement not stated/);
  });

  it('requires biosafety for stated human gene transfer', () => {
    expect(REQUIRED_TRAINING_BY_ACTIVITY({ ...NONE, involvesHumanGeneTransfer: true })).toEqual(['biosafety']);
  });

  it('returns no training only when every fact it reads was stated', () => {
    expect(REQUIRED_TRAINING_BY_ACTIVITY({ ...NONE, involvesHumanGeneTransfer: false })).toEqual([]);
  });

  it('refuses when the funding source was not stated (FCOI / RCR / GCP depend on it)', () => {
    expect(() => REQUIRED_TRAINING_BY_ACTIVITY({ ...NONE, involvesHumanGeneTransfer: false, involvesHumanSubjects: true, fundingSource: null }))
      .toThrow(/citi_gcp.*funding source not stated/);
  });
});
