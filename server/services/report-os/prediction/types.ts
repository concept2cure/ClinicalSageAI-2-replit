/**
 * Normalized input model for the Report-OS prediction assembler.
 *
 * These interfaces decouple the pure assembler from the heavy prediction
 * services. Callers are expected to project the outputs of the platform's
 * three honest prediction models onto these shapes; the assembler never
 * imports or invokes the model services, so this module stays pure and
 * unit-testable.
 */

/**
 * The statistical method that produced a prediction. Surfaced verbatim in the
 * mandatory disclosure block so readers understand what is (and is not) behind
 * a number.
 */
export type PredictionMethod =
  | 'logistic_regression'
  | 'monte_carlo_simulation'
  | 'heuristic_gap_score';

/**
 * The mandatory disclosure attached to every prediction report.
 */
export interface PredictionDisclosure {
  method: PredictionMethod;
  validated: boolean;
  sampleRegime?: 'cold_start' | 'warm_up' | 'mature';
  confidence?: number;
  note: string;
}

/**
 * Normalized projection of the risk model (RTF / CRL / first-cycle approval),
 * a logistic regression with a cross-tenant network prior for cold-start.
 */
export interface DeficiencyRiskInput {
  kind: 'deficiency_risk';
  rtfProbability: number;
  crlProbability: number;
  firstCycleApprovalProbability: number;
  sampleSize: number;
  usingNetworkPrior: boolean;
  modelConfidence?: number;
}

/**
 * Normalized projection of the submission-readiness twin: a gap-based heuristic
 * that scores readiness against a criteria set.
 *
 * ── 2026-09-10: it no longer carries a predicted approval probability ────────
 * It used to, and the twin computed it as `(overallScore / 100) * 0.8 -
 * criticalGaps * 0.05`. No approval outcome is consulted anywhere in that
 * service, so the figure was the readiness score rescaled. The field is kept
 * only so the assembler can state that no such model exists, and it is null in
 * every code path today.
 */
export interface ReadinessTrajectoryInput {
  kind: 'readiness_trajectory';
  overallScore: number;
  /** Null whenever no approval-probability model backs the number. Always, today. */
  predictedApprovalProbability: number | null;
  /**
   * The AGENCY's statutory / user-fee review clock for the submission type —
   * reference data about the pathway, not a forecast about this program.
   * Null when the submission type is not one of the recognised pathways.
   */
  reviewClockDays: number | null;
  reviewClockBasis: string | null;
  /** Criteria this assessment scored not_met or partially_met. A present-state count. */
  unmetCriteriaCount: number;
  trend?: Array<{ asOf: string; score: number }>;
}

/**
 * Normalized projection of the trial simulator: a Monte Carlo integration over
 * an evidence prior. Refuses to produce a probability without effect evidence.
 */
export interface TrialPosInput {
  kind: 'trial_pos';
  probabilityOfSuccess: number;
  powerAtPriorMean: number;
  typeIError?: number;
  effectivePerArm?: number;
  nRuns: number;
  hasEvidence: boolean;
  assumptions: string[];
}

/**
 * The discriminated union of all supported prediction inputs.
 */
export type PredictionInput =
  | DeficiencyRiskInput
  | ReadinessTrajectoryInput
  | TrialPosInput;
