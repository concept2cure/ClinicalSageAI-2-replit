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
 * Normalized projection of the submission-readiness twin: a gap-based
 * heuristic that scores readiness and derives advisory trajectory figures.
 */
export interface ReadinessTrajectoryInput {
  kind: 'readiness_trajectory';
  overallScore: number;
  predictedApprovalProbability: number;
  predictedReviewTimeDays: number;
  predictedDeficiencyCount: number;
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
