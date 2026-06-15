/**
 * Truthfulness gate for Report-OS run statuses.
 *
 * Pure, deterministic evaluation of whether a report run may be marked
 * `draft`, `partial`, or `final` based on the per-report-type
 * `truthfulnessRules`. No DB access, no IO.
 */

export type ReportRunStatus = 'draft' | 'partial' | 'final';

/**
 * Per-report-type truthfulness rules.
 *
 * These originate from JSON (`ReportTypeDefinition.truthfulnessRules`), so
 * unknown extra keys are tolerated via the index signature.
 */
export interface TruthfulnessRules {
  allowPartial?: boolean;
  requireBlockers?: boolean;
  requireConfidence?: boolean;
  forbidFinalIfMissingCritical?: boolean;
  requireExplicitGaps?: boolean;
  [key: string]: unknown;
}

/**
 * Snapshot of a single report run, evaluated against the rules.
 */
export interface RunTruthfulnessState {
  requestedStatus: ReportRunStatus;
  confidence: number;
  blockers: string[];
  criticalBlockers: string[];
  /** Whether the rendered report includes an explicit gaps section. */
  gapsSection: boolean;
}

export interface TruthfulnessEvaluation {
  allowedStatus: ReportRunStatus;
  downgradedFrom?: ReportRunStatus;
  reasons: string[];
}

/** Minimum confidence required to keep a `final` status when `requireConfidence` is set. */
export const DEFAULT_FINAL_CONFIDENCE_THRESHOLD = 70;

/**
 * Evaluate the truthfulness gate for a report run.
 *
 * Starts from `state.requestedStatus` and applies each rule in turn,
 * downgrading the allowed status and collecting human-readable reasons.
 */
export function evaluateTruthfulness(
  state: RunTruthfulnessState,
  rules: TruthfulnessRules,
): TruthfulnessEvaluation {
  const { requestedStatus } = state;
  let status: ReportRunStatus = requestedStatus;
  const reasons: string[] = [];

  // Critical blockers forbid a final report. Downgrade to partial when partial
  // is allowed, otherwise straight to draft.
  if (
    rules.forbidFinalIfMissingCritical &&
    status === 'final' &&
    state.criticalBlockers.length > 0
  ) {
    const next: ReportRunStatus = rules.allowPartial === true ? 'partial' : 'draft';
    status = next;
    reasons.push(
      `Cannot mark final: ${state.criticalBlockers.length} critical blocker(s) present.`,
    );
  }

  // Insufficient confidence forbids a final report.
  if (
    rules.requireConfidence &&
    status === 'final' &&
    state.confidence < DEFAULT_FINAL_CONFIDENCE_THRESHOLD
  ) {
    status = 'partial';
    reasons.push(
      `Cannot mark final: confidence ${state.confidence} is below the required threshold of ${DEFAULT_FINAL_CONFIDENCE_THRESHOLD}.`,
    );
  }

  // A final report of this type must include an explicit gaps section.
  if (rules.requireExplicitGaps && status === 'final' && state.gapsSection === false) {
    status = 'partial';
    reasons.push('A final report of this type must include an explicit gaps section.');
  }

  // Outstanding blockers forbid a final report.
  if (rules.requireBlockers && status === 'final' && state.blockers.length > 0) {
    status = 'partial';
    reasons.push(
      `Cannot mark final: ${state.blockers.length} outstanding blocker(s) present.`,
    );
  }

  // If we landed on partial but partial is not permitted, fall back to draft.
  if (status === 'partial' && rules.allowPartial !== true) {
    status = 'draft';
    reasons.push('This report type does not allow a partial status.');
  }

  const evaluation: TruthfulnessEvaluation = {
    allowedStatus: status,
    reasons,
  };

  if (status !== requestedStatus) {
    evaluation.downgradedFrom = requestedStatus;
  }

  return evaluation;
}
