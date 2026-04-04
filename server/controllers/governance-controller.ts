/**
 * Governance Controller
 *
 * Thin business-logic layer for governed decision routes.
 * Routes delegate here instead of doing inline try-catch + mapping.
 */

import {
  getRecentGovernedDecisions,
  getGovernedDecisionSummary,
  getArtifactDecisionTrace,
  getProjectReviewQueue,
  hasUnresolvedGovernedDecisions,
  getDecisionTimeline,
  transitionGovernedDecision,
  type GovernedLifecycleState,
} from '../services/governed-decision-repository';

export async function handleGetDecisions(organizationId: number, projectId: string, limit: number) {
  const entries = await getRecentGovernedDecisions({
    organizationId: String(organizationId),
    projectId,
    limit,
  });
  return { entries, count: entries.length };
}

export async function handleGetSummary(organizationId: number, projectId: string, since?: string) {
  return getGovernedDecisionSummary({
    organizationId: String(organizationId),
    projectId,
  });
}

export async function handleGetArtifactTrace(projectId: string, artifactId: string) {
  return getArtifactDecisionTrace(projectId, artifactId);
}

export async function handleGetReviewQueue(organizationId: number, projectId: number) {
  const queue = await getProjectReviewQueue(projectId, organizationId);
  const unresolved = await hasUnresolvedGovernedDecisions(projectId, organizationId);
  return { queue, unresolved };
}

export async function handleGetHistory(decisionId: string, organizationId: number) {
  const timeline = await getDecisionTimeline(decisionId, organizationId);
  return { history: timeline };
}

export async function handleTransition(input: {
  decisionId: string;
  organizationId: number;
  projectId: number;
  actorId: string;
  action: string;
  reason?: string;
  escalatedTo?: string;
  executedArtifactId?: number;
  supersededByDecisionId?: string;
}) {
  const ACTION_MAP: Record<string, GovernedLifecycleState> = {
    review: 'under_review',
    approve: 'approved',
    reject: 'rejected',
    escalate: 'escalated',
    defer: 'deferred',
    execute: 'executed',
    supersede: 'superseded',
  };

  const targetState = ACTION_MAP[input.action];
  if (!targetState) {
    return { success: false, error: `Unknown action: ${input.action}` };
  }

  // Validate required fields per action
  if (input.action === 'reject' && !input.reason) {
    return { success: false, error: 'Rejection requires a reason' };
  }
  if (input.action === 'escalate' && !input.escalatedTo) {
    return { success: false, error: 'Escalation requires an escalatedTo target' };
  }
  if (input.action === 'supersede' && !input.supersededByDecisionId) {
    return { success: false, error: 'Supersession requires a supersededByDecisionId' };
  }

  return transitionGovernedDecision({
    decisionId: input.decisionId,
    organizationId: input.organizationId,
    projectId: input.projectId,
    targetState,
    performedBy: input.actorId,
    reason: input.reason,
    escalatedTo: input.escalatedTo,
    executedArtifactId: input.executedArtifactId,
    supersededByDecisionId: input.supersededByDecisionId,
  });
}
