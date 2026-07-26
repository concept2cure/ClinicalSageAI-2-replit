/**
 * Prediction governance — the inference-time honesty invariant, locked against the
 * REAL feature extractor. If a future change leaks regulatory evidence (or a
 * realized post-submission outcome) into the serving feature vector, these fail.
 * Pure (the feature builders are side-effect-free).
 */

import { describe, it, expect } from 'vitest';
import { buildFeatures, featuresForDraft } from '../outcome-feature-extraction';
import {
  findLeakedOutcomeFeatures, findRegulatoryEvidenceFeatures, assertInferenceFeaturesClean,
  PredictionGovernanceError, REALIZED_OUTCOME_FEATURES,
} from '../prediction-governance';

const draftCtx = {
  submissionType: 'bla', agency: 'fda', therapeuticArea: 'oncology',
  readinessPercentage: 82, missingCriticalCount: 1, missingImportantCount: 3,
  weakSectionCount: 2, harmonizeIssueCount: 4, openEscalations: 1,
};

describe('prediction governance — inference invariant (real feature extractor)', () => {
  it('the serving vector (featuresForDraft) leaks no realized-outcome feature', () => {
    const f = featuresForDraft(draftCtx);
    expect(findLeakedOutcomeFeatures(f)).toEqual([]);
    for (const name of REALIZED_OUTCOME_FEATURES) expect(Number(f[name] ?? 0)).toBe(0);
    expect(() => assertInferenceFeaturesClean(f)).not.toThrow();
  });

  it('the real feature schema contains no regulatory-evidence feature name', () => {
    expect(findRegulatoryEvidenceFeatures(Object.keys(featuresForDraft(draftCtx)))).toEqual([]);
  });

  it('detects a leak when realized post-submission outcomes are non-zero at inference', () => {
    const withOutcomes = buildFeatures({
      ...draftCtx, reviewDays: 200, questionsReceived: 5, informationRequests: 2,
      deficienciesCited: 3, hadAdvisoryCommittee: true,
    });
    const leaked = findLeakedOutcomeFeatures(withOutcomes);
    expect(leaked).toContain('deficiencies');
    expect(leaked).toContain('questions_received');
    expect(leaked).toContain('had_advcomm');
    expect(() => assertInferenceFeaturesClean(withOutcomes)).toThrow(PredictionGovernanceError);
  });

  it('flags a regulatory-evidence back-door feature name', () => {
    expect(
      findRegulatoryEvidenceFeatures(['stype_bla', 'crl_finding_count', 'precedent_approval_rate', 'completeness_pct']),
    ).toEqual(['crl_finding_count', 'precedent_approval_rate']);
    expect(() => assertInferenceFeaturesClean({ completeness_pct: 0.8, approval_probability: 0.7 } as never))
      .toThrow(/inference/i);
  });
});
