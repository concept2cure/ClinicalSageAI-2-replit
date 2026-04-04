/**
 * @deprecated Re-export shim — use governed-decision-repository.ts directly.
 */
export {
  type GovernedLifecycleState,
  type GovernedLifecycleTransition,
  type GovernedLifecycleResult,
  isValidTransition,
  transitionGovernedDecision,
  submitForReview,
  approveDecision,
  rejectDecision,
  escalateDecision,
  deferDecision,
  executeDecision,
  supersedeDecision,
} from './governed-decision-repository';

// Re-export history entry type for backward compat
export interface GovernedLifecycleHistoryEntry {
  decisionId: string;
  state: string;
  performedBy: string;
  reason?: string;
  timestamp: string;
  artifactRef?: string;
}

// Delegate to consolidated timeline
export async function getDecisionLifecycleHistory(
  decisionId: string,
  organizationId: number
): Promise<GovernedLifecycleHistoryEntry[]> {
  const { getDecisionTimeline } = await import('./governed-decision-repository.js');
  const events = await getDecisionTimeline(decisionId, organizationId);
  return events.map(e => ({
    decisionId: e.decisionId,
    state: e.toState,
    performedBy: e.actorId,
    reason: e.reason,
    timestamp: e.createdAt,
    artifactRef: e.linkedArtifactId,
  }));
}
