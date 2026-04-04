/**
 * @deprecated Re-export shim — use governed-decision-repository.ts directly.
 */
export {
  type GovernedDecisionTransitionEvent,
  recordTransitionEvent,
  getDecisionTimeline,
  getProjectReviewQueue,
  hasUnresolvedGovernedDecisions,
} from './governed-decision-repository';

// Backward compat aliases
export {
  getDecisionTimeline as getDecisionTimelineDurable,
  getProjectReviewQueue as getProjectReviewQueueDurable,
  hasUnresolvedGovernedDecisions as hasUnresolvedGovernedDecisionsDurable,
} from './governed-decision-repository';

// No-op — in-memory log no longer exists
export function clearTransitionLog(): void {}
