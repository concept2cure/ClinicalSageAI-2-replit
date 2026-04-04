/**
 * @deprecated Re-export shim — use governed-decision-repository.ts directly.
 *
 * This file previously contained the in-memory governed decision log.
 * All functionality is now consolidated in governed-decision-repository.ts
 * with DB-first reads and no in-memory arrays.
 */

export {
  type GovernedDecisionRecord,
  type GovernedDecisionSummaryReport,
  recordGovernedDecision,
  recordGovernedDecisionSync,
  getRecentGovernedDecisions,
  getGovernedDecisionSummary,
  getArtifactDecisionTrace,
  getGovernedDecision,
  GOVERNED_DECISION_REPOSITORY_VERSION as GOVERNED_DECISION_SERVICE_VERSION,
} from '../../services/governed-decision-repository';

// Backward compat: clearGovernedDecisionLog is no longer needed (no in-memory log)
export function clearGovernedDecisionLog(): void {
  // No-op — in-memory log no longer exists. DB state is authoritative.
}
