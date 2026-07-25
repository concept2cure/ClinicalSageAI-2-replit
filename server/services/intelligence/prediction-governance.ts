/**
 * Prediction governance — the inference-time honesty invariant for the calibrated
 * regulatory risk model (server/services/intelligence/risk-model.ts).
 *
 * The work order requires that FDA CRL / clinical-regulatory evidence influence a
 * prediction ONLY through the honest, holdout-validated logistic path: evidence
 * becomes a LABELED TRAINING OUTCOME (a landed submission_outcome retrains the
 * versioned model, and activation refuses a model that does not improve holdout
 * log-loss), never an inference-time shortcut that bumps a probability from the
 * mere presence of a CRL or a precedent. Two properties keep that invariant
 * durable, and this module lets a test lock both against the real feature
 * extractor so a future change that leaks evidence into inference fails CI:
 *
 *   1. No regulatory-evidence feature at inference. The serving feature vector
 *      (outcome-feature-extraction.featuresForDraft) carries only completeness /
 *      submission-metadata signals. A feature named for a precedent, a CRL, or a
 *      derived approval probability would be a back-door for evidence to drive the
 *      score outside the trained coefficients.
 *   2. Realized post-submission outcomes are zero at draft scoring. review_days,
 *      questions_received, information_requests, deficiencies and had_advcomm are
 *      only known AFTER submission; at scoring time they must be 0, or the model
 *      would be peeking at the very outcome it is meant to predict.
 *
 * Pure — no DB, no model load. Intended for the invariant test and as an optional
 * runtime assertion at the serving boundary.
 *
 * @module server/services/intelligence/prediction-governance
 */

import type { FeatureMap } from './risk-model.js';

/** Features encoding a realized post-submission outcome — must be 0 at inference. */
export const REALIZED_OUTCOME_FEATURES = [
  'questions_received', 'info_requests', 'deficiencies', 'review_days_norm', 'had_advcomm',
] as const;

/**
 * A feature name that would mean regulatory evidence (a precedent, a CRL, or a
 * derived outcome probability) is feeding inference directly — the exact back-door
 * the honest-path invariant forbids. Deliberately broad: it guards the *name space*
 * so a future evidence-derived feature can never be added to the serving vector
 * without tripping this guard.
 */
export const REGULATORY_EVIDENCE_FEATURE_PATTERN =
  /(?:^|_)(?:crl|cre|precedent|finding|approval[_-]?prob(?:ability)?|success[_-]?rate|outcome[_-]?prob(?:ability)?|regulatory[_-]?outcome|premortem)(?:_|$)/i;

export class PredictionGovernanceError extends Error {}

/** Realized-outcome features that are non-zero in a feature map (a leak at inference). */
export function findLeakedOutcomeFeatures(features: FeatureMap): string[] {
  return REALIZED_OUTCOME_FEATURES.filter((name) => {
    const v = features[name];
    return v != null && Number(v) !== 0;
  });
}

/** Feature names that look like a direct regulatory-evidence signal (forbidden at inference). */
export function findRegulatoryEvidenceFeatures(featureNames: readonly string[]): string[] {
  return featureNames.filter((n) => REGULATORY_EVIDENCE_FEATURE_PATTERN.test(n));
}

/**
 * Assert a serving feature vector honors the honest-path invariant: no realized
 * post-submission outcome is non-zero, and no feature name is a regulatory-evidence
 * back-door. Throws PredictionGovernanceError describing the leak. Use at the
 * serving boundary if you want the invariant enforced at runtime (fail-safe: the
 * caller should fall back to the network prior / cold start, never surface a
 * leaked score).
 */
export function assertInferenceFeaturesClean(features: FeatureMap): void {
  const leakedOutcomes = findLeakedOutcomeFeatures(features);
  const evidenceFeatures = findRegulatoryEvidenceFeatures(Object.keys(features));
  const problems: string[] = [];
  if (leakedOutcomes.length) {
    problems.push(`realized post-submission outcome feature(s) non-zero at inference: ${leakedOutcomes.join(', ')}`);
  }
  if (evidenceFeatures.length) {
    problems.push(`regulatory-evidence feature(s) must not feed inference directly: ${evidenceFeatures.join(', ')}`);
  }
  if (problems.length) {
    throw new PredictionGovernanceError(
      'Prediction-governance violation — regulatory evidence must reach the risk model only as a ' +
        `training outcome, never an inference-time shortcut. ${problems.join('; ')}.`,
    );
  }
}
