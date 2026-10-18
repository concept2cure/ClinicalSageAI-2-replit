/**
 * @fileoverview Model → prediction-input adapters (the prediction seam).
 * @module server/services/report-os/prediction/model-adapters
 *
 * The prediction assembler (assembler.ts) is pure: it accepts the normalized
 * {@link PredictionInput} shapes and never imports a heavy model service. This
 * module is the missing seam between the real, honest prediction models and
 * those normalized shapes:
 *
 *   - Submission-readiness twin  → ReadinessTrajectoryInput (Regulatory Forecast)
 *   - CRL/RTF risk model         → DeficiencyRiskInput       (CRL/RTF Pre-Mortem)
 *
 * Two invariants are preserved from the models' own contracts:
 *   1. NEVER fabricate. The readiness twin returns an empty dashboard when no
 *      assessment exists; this adapter returns `null` in that case rather than
 *      projecting a fake 0-score prediction. The endpoint turns `null` into an
 *      honest "no assessment yet" response — never a rendered 0%.
 *   2. Surface cold-start honestly. `usingNetworkPrior` is set whenever the
 *      risk model leaned on a cross-tenant prior rather than a purely local
 *      trained model, so the assembler's disclosure block can say so. A target
 *      with neither a model nor a prior is null (not assessed), and a draft
 *      with no assessed target projects to `null`: nothing to report.
 *
 * The DB-touching functions are thin; the projection logic (`scoreDraftTo*`)
 * is PURE and unit-tested without a database.
 */

import { getPool } from '../../../db';
import { SubmissionReadinessTwinService } from '../../innovation/submission-readiness-twin-service';
import {
  scoreSubmissionDraft,
  type ScoreDraftInput,
  type ScoreDraftResult,
} from '../../intelligence/regulatory-intelligence';
import type { DeficiencyRiskInput, ReadinessTrajectoryInput } from './types';

export interface ReadinessAdapterParams {
  programId: string;
  /** Canonical submission type (e.g. 'NDA', 'MAA'); resolved by the twin. */
  submissionType: string;
  agency: string;
}

/**
 * Adapt the submission-readiness twin into a normalized
 * {@link ReadinessTrajectoryInput}. Does real model IO (reads the latest
 * assessment + trend history for the program).
 *
 * Returns `null` when NO assessment exists for the program — the twin's
 * `getDashboard` returns an all-zero "empty dashboard" in that case, and
 * projecting it would fabricate a 0% approval prediction. Callers MUST treat
 * `null` as "no readiness assessment yet", not "0% ready".
 */
export async function readinessTwinToTrajectoryInput(
  params: ReadinessAdapterParams,
): Promise<ReadinessTrajectoryInput | null> {
  const pool = getPool();
  const twin = new SubmissionReadinessTwinService(pool);

  const dashboard = await twin.getDashboard(
    params.programId,
    params.submissionType,
    params.agency,
  );

  // An empty dashboard (no assessment on record) has zero evaluated criteria.
  // Refuse rather than fabricate a zero-score trajectory.
  if (dashboard.criteriaProgress.total === 0) return null;

  const trendRows = await twin.getTrendData(params.programId, 90);
  const trend = trendRows.map((t) => ({
    asOf: t.trendDate.toISOString().slice(0, 10),
    score: Math.round(t.overallScore),
  }));

  return {
    kind: 'readiness_trajectory',
    overallScore: Math.round(dashboard.overallScore),
    // Null today in every path: the twin no longer derives an approval
    // probability from the readiness score, and no model replaces it. The
    // assembler states that rather than printing a number.
    predictedApprovalProbability: dashboard.assessmentOutlook.approvalProbability,
    reviewClockDays: dashboard.assessmentOutlook.reviewTimeDays,
    reviewClockBasis: dashboard.assessmentOutlook.reviewClockBasis,
    unmetCriteriaCount: dashboard.assessmentOutlook.unmetCriteriaCount,
    trend: trend.length > 0 ? trend : undefined,
  };
}

/**
 * PURE: project a {@link ScoreDraftResult} from the regulatory-intelligence
 * orchestrator onto a normalized {@link DeficiencyRiskInput}. Exported for unit
 * testing without a database.
 *
 * Returns `null` when no target was assessed (no trained model and no network
 * prior for any of them): there is nothing to report, and the caller refuses.
 *
 * `usingNetworkPrior` is true when a network prior contributed to any target
 * (network prior or a blend). 2026-10-15: it was true for a cold start too, so
 * the disclosure named a network prior that did not exist.
 */
export function scoreDraftToDeficiencyRiskInput(
  result: ScoreDraftResult,
): DeficiencyRiskInput | null {
  const targets = [result.rtf, result.crl, result.firstCycleApproval];
  if (targets.every((t) => t.probability === null)) return null;

  return {
    kind: 'deficiency_risk',
    rtfProbability: result.rtf.probability,
    crlProbability: result.crl.probability,
    firstCycleApprovalProbability: result.firstCycleApproval.probability,
    sampleSize: result.rtf.sampleSize,
    usingNetworkPrior: targets.some((t) => t.priorWeight > 0),
    // No modelConfidence: it was blendedReadiness / 100, the rule-based
    // completeness score relabelled (2026-10-15).
  };
}

/**
 * Run the CRL/RTF risk model over a submission draft and project the result
 * into a normalized {@link DeficiencyRiskInput}. Does real model IO via the
 * regulatory-intelligence orchestrator (rule-based completeness + logistic
 * risk model + cross-tenant priors), then the pure projection above.
 *
 * Null when no target was assessed. Callers MUST refuse rather than render it.
 */
export async function runDeficiencyRiskForDraft(
  input: ScoreDraftInput,
): Promise<DeficiencyRiskInput | null> {
  const result = await scoreSubmissionDraft(input);
  return scoreDraftToDeficiencyRiskInput(result);
}
