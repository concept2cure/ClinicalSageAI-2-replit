/**
 * Governance Controller
 *
 * Business-logic layer for governed decision routes with full observability.
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
import { governanceMetrics } from '../services/governance-observability';
import { createScopedLogger } from '../utils/logger';

const log = createScopedLogger('governance-controller');

export async function handleGetDecisions(organizationId: number, projectId: string, limit: number) {
  try {
    const entries = await getRecentGovernedDecisions({
      organizationId: String(organizationId),
      projectId,
      limit,
    });
    governanceMetrics.recordQueryExecuted();
    return { entries, count: entries.length };
  } catch (error) {
    governanceMetrics.recordQueryFailure('getDecisions', error);
    log.warn('Failed to get decisions', { organizationId, projectId, error });
    throw error;
  }
}

export async function handleGetSummary(organizationId: number, projectId: string, since?: string) {
  try {
    const result = await getGovernedDecisionSummary({
      organizationId: String(organizationId),
      projectId,
    });
    governanceMetrics.recordQueryExecuted();
    return result;
  } catch (error) {
    governanceMetrics.recordQueryFailure('getSummary', error);
    log.warn('Failed to get summary', { organizationId, projectId, error });
    throw error;
  }
}

export async function handleGetArtifactTrace(projectId: string, artifactId: string) {
  try {
    const result = await getArtifactDecisionTrace(projectId, artifactId);
    governanceMetrics.recordQueryExecuted();
    return result;
  } catch (error) {
    governanceMetrics.recordQueryFailure('getArtifactTrace', error);
    log.warn('Failed to get artifact trace', { projectId, artifactId, error });
    throw error;
  }
}

export async function handleGetReviewQueue(organizationId: number, projectId: number) {
  try {
    const queue = await getProjectReviewQueue(projectId, organizationId);
    const unresolved = await hasUnresolvedGovernedDecisions(projectId, organizationId);
    governanceMetrics.recordQueryExecuted();
    return { queue, unresolved };
  } catch (error) {
    governanceMetrics.recordQueryFailure('getReviewQueue', error);
    log.warn('Failed to get review queue', { organizationId, projectId, error });
    throw error;
  }
}

export async function handleGetHistory(decisionId: string, organizationId: number) {
  try {
    const timeline = await getDecisionTimeline(decisionId, organizationId);
    governanceMetrics.recordQueryExecuted();
    return { history: timeline };
  } catch (error) {
    governanceMetrics.recordQueryFailure('getHistory', error);
    log.warn('Failed to get decision history', { decisionId, organizationId, error });
    throw error;
  }
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

  try {
    const result = await transitionGovernedDecision({
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
    governanceMetrics.recordTransitionExecuted(input.action);
    return result;
  } catch (error) {
    governanceMetrics.recordQueryFailure('transition', error);
    log.warn('Failed to transition decision', { decisionId: input.decisionId, action: input.action, error });
    throw error;
  }
}
