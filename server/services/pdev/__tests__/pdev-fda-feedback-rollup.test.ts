/**
 * Pure-logic tests for the FDA-feedback → PDEV-activity matcher.
 * The scoring and tokenization are deterministic and DB-free.
 */
import { describe, expect, test, vi } from 'vitest';

vi.mock('../../../db', () => ({
  db: {},
  pool: undefined,
  getPool: () => {
    throw new Error('not in test scope');
  },
}));

import {
  tokenize,
  scoreActivityMatch,
  proposeActivityForCommitment,
} from '../pdev-fda-feedback-rollup';
import { PDEV_ACTIVITIES, getActivityByKey } from '../pdev-activity-registry';

describe('pdev fda feedback rollup — tokenize', () => {
  test('strips punctuation and lowercases', () => {
    expect(tokenize('GLP toxicology study, two species.')).toEqual([
      'glp',
      'toxicology',
      'study',
      'two',
      'species',
    ]);
  });
  test('strips short tokens and stopwords', () => {
    expect(tokenize('we will submit a 90-day GLP tox study to the FDA')).toEqual([
      'submit',
      '90-day',
      'glp',
      'tox',
      'study',
      'fda',
    ]);
  });
  test('returns empty for empty input', () => {
    expect(tokenize('')).toEqual([]);
  });
});

describe('pdev fda feedback rollup — scoreActivityMatch', () => {
  test('scores zero for unrelated text', () => {
    const a = getActivityByKey('cmc.formulation_development')!;
    const { score } = scoreActivityMatch('Marketing copy for a website', a);
    expect(score).toBe(0);
  });
  test('produces non-zero for related text', () => {
    const a = getActivityByKey('nonclinical.glp_tox')!;
    const { score, matchedTerms } = scoreActivityMatch(
      'Sponsor commits to running GLP toxicology studies in two species',
      a
    );
    expect(score).toBeGreaterThan(0);
    expect(matchedTerms).toEqual(expect.arrayContaining(['glp']));
  });
  test('higher score for denser overlap', () => {
    const a = getActivityByKey('clinical.statistical_assumptions')!;
    const dense = scoreActivityMatch(
      'Statistical assumptions power sample size analysis primary endpoint',
      a
    );
    const sparse = scoreActivityMatch('Statistical considerations are noted', a);
    expect(dense.score).toBeGreaterThan(sparse.score);
  });
});

describe('pdev fda feedback rollup — proposeActivityForCommitment', () => {
  test('returns empty match for unrelated commitment', () => {
    const result = proposeActivityForCommitment('Marketing copy for a website');
    expect(result.activityKey).toBe('');
    expect(result.confidence).toBe(0);
    expect(result.alternatives).toHaveLength(0);
  });
  test('picks GLP-tox for a tox-flavored commitment', () => {
    const result = proposeActivityForCommitment(
      'Sponsor commits to submitting GLP toxicology study reports in two species'
    );
    expect(result.activityKey).toMatch(/glp_tox|study_reports|safety_margin|species/);
  });
  test('alternatives are sorted descending by confidence', () => {
    const result = proposeActivityForCommitment(
      'CMC formulation development and analytical method qualification'
    );
    expect(result.alternatives.length).toBeGreaterThan(0);
    for (let i = 1; i < result.alternatives.length; i++) {
      expect(result.alternatives[i - 1].confidence).toBeGreaterThanOrEqual(
        result.alternatives[i].confidence
      );
    }
  });
  test('confidence is bounded to [0, 1]', () => {
    for (const activity of PDEV_ACTIVITIES.slice(0, 10)) {
      const result = proposeActivityForCommitment(activity.description);
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    }
  });
});
