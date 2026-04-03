/**
 * Governed Decision Lifecycle Service
 *
 * Bridges the governed document decision fabric into the platform's
 * real decision lifecycle — review, approve, reject, escalate, execute,
 * supersede. Uses the existing decisionRecordService.transition() for
 * durable state changes with downstream propagation.
 *
 * This is NOT a second decision system. It extends the existing one
 * with governed-decision-specific transition logic and validation.
 */

import { createScopedLogger } from '../utils/logger';

const log = createScopedLogger('governed-decision-lifecycle');

// ═══════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════

export type GovernedLifecycleState =
  | 'recommended_only'
  | 'under_review'
  | 'approved'
  | 'rejected'
  | 'executed'
  | 'deferred'
  | 'escalated'
  | 'superseded';

export interface GovernedLifecycleTransition {
  decisionId: string;
  organizationId: number;
  projectId: number;
  targetState: GovernedLifecycleState;
  performedBy: string;
  performedByRole?: string;
  reason?: string;
  notes?: string;
  /** Artifact or package linked to execution */
  executedArtifactId?: number;
  executedArtifactVersion?: number;
  executedWorkflowRunId?: string;
  /** For escalation: who to escalate to */
  escalatedTo?: string;
  /** For supersession: the replacing decision ID */
  supersededByDecisionId?: string;
}

export interface GovernedLifecycleResult {
  success: boolean;
  decisionId: string;
  previousState: string;
  newState: string;
  transitionedAt: string;
  error?: string;
}

export interface GovernedLifecycleHistoryEntry {
  decisionId: string;
  state: string;
  performedBy: string;
  reason?: string;
  timestamp: string;
  artifactRef?: string;
}

// ═══════════════════════════════════════════════════════════════════════
// Valid Transitions
// ═══════════════════════════════════════════════════════════════════════

const VALID_TRANSITIONS: Record<string, GovernedLifecycleState[]> = {
  recommended_only: ['under_review', 'deferred', 'superseded'],
  under_review: ['approved', 'rejected', 'escalated', 'deferred', 'superseded'],
  approved: ['executed', 'superseded'],
  rejected: ['under_review', 'superseded'],
  executed: ['superseded'],
  deferred: ['under_review', 'superseded'],
  escalated: ['under_review', 'approved', 'rejected', 'superseded'],
  superseded: [], // terminal
};

/**
 * Check if a lifecycle transition is valid.
 */
export function isValidTransition(from: string, to: GovernedLifecycleState): boolean {
  const allowed = VALID_TRANSITIONS[from];
  return Array.isArray(allowed) && allowed.includes(to);
}

// ═══════════════════════════════════════════════════════════════════════
// Lifecycle Service
// ═══════════════════════════════════════════════════════════════════════

/**
 * Transition a governed decision through its lifecycle.
 * Validates the transition, executes it durably via decisionRecordService,
 * and returns the result.
 */
export async function transitionGovernedDecision(
  input: GovernedLifecycleTransition
): Promise<GovernedLifecycleResult> {
  const timestamp = new Date().toISOString();

  try {
    const { decisionRecordService } = await import('./decision-record-service.js');

    // 1. Fetch current decision
    const current = await decisionRecordService.getById(input.decisionId, input.organizationId);
    if (!current) {
      return {
        success: false,
        decisionId: input.decisionId,
        previousState: 'unknown',
        newState: input.targetState,
        transitionedAt: timestamp,
        error: 'Decision not found',
      };
    }

    // 2. Validate transition
    const currentState = current.actionState || 'recommended_only';
    if (!isValidTransition(currentState, input.targetState)) {
      return {
        success: false,
        decisionId: input.decisionId,
        previousState: currentState,
        newState: input.targetState,
        transitionedAt: timestamp,
        error: `Invalid transition: ${currentState} → ${input.targetState}`,
      };
    }

    // 3. Execute transition via existing service
    const transitioned = await decisionRecordService.transition(input.decisionId, {
      organizationId: input.organizationId,
      actionState: input.targetState as string,
      performedBy: input.performedBy,
      reason: input.reason,
      escalatedTo: input.escalatedTo,
      executedArtifactId: input.executedArtifactId,
      executedArtifactVersion: input.executedArtifactVersion,
      executedWorkflowRunId: input.executedWorkflowRunId,
    });

    if (!transitioned) {
      return {
        success: false,
        decisionId: input.decisionId,
        previousState: currentState,
        newState: input.targetState,
        transitionedAt: timestamp,
        error: 'Transition failed — record not updated',
      };
    }

    log.info('Governed decision transitioned', {
      decisionId: input.decisionId,
      from: currentState,
      to: input.targetState,
      by: input.performedBy,
    });

    // Record durable transition event
    try {
      const { recordTransitionEvent } = await import('./governed-decision-transition-log-service.js');
      recordTransitionEvent({
        decisionId: input.decisionId,
        organizationId: input.organizationId,
        projectId: input.projectId,
        fromState: currentState,
        toState: input.targetState,
        action: input.targetState,
        actorId: input.performedBy,
        actorRole: input.performedByRole,
        reason: input.reason,
        notes: input.notes,
        linkedArtifactId: input.executedArtifactId ? String(input.executedArtifactId) : undefined,
        linkedWorkflowRunId: input.executedWorkflowRunId,
        supersededByDecisionId: input.supersededByDecisionId,
      });
    } catch {
      // Transition log write failed — transition itself succeeded
    }

    return {
      success: true,
      decisionId: input.decisionId,
      previousState: currentState,
      newState: input.targetState,
      transitionedAt: timestamp,
    };
  } catch (err) {
    log.error('Governed decision transition failed', {
      decisionId: input.decisionId,
      error: err instanceof Error ? err.message : String(err),
    });
    return {
      success: false,
      decisionId: input.decisionId,
      previousState: 'unknown',
      newState: input.targetState,
      transitionedAt: timestamp,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Submit a governed decision for review.
 */
export async function submitForReview(
  decisionId: string,
  organizationId: number,
  projectId: number,
  performedBy: string,
  reason?: string
): Promise<GovernedLifecycleResult> {
  return transitionGovernedDecision({
    decisionId,
    organizationId,
    projectId,
    targetState: 'under_review',
    performedBy,
    reason: reason || 'Submitted for review',
  });
}

/**
 * Approve a governed decision.
 */
export async function approveDecision(
  decisionId: string,
  organizationId: number,
  projectId: number,
  performedBy: string,
  reason?: string
): Promise<GovernedLifecycleResult> {
  return transitionGovernedDecision({
    decisionId,
    organizationId,
    projectId,
    targetState: 'approved',
    performedBy,
    reason: reason || 'Approved',
  });
}

/**
 * Reject a governed decision.
 */
export async function rejectDecision(
  decisionId: string,
  organizationId: number,
  projectId: number,
  performedBy: string,
  reason: string
): Promise<GovernedLifecycleResult> {
  return transitionGovernedDecision({
    decisionId,
    organizationId,
    projectId,
    targetState: 'rejected',
    performedBy,
    reason,
  });
}

/**
 * Escalate a governed decision.
 */
export async function escalateDecision(
  decisionId: string,
  organizationId: number,
  projectId: number,
  performedBy: string,
  escalatedTo: string,
  reason: string
): Promise<GovernedLifecycleResult> {
  return transitionGovernedDecision({
    decisionId,
    organizationId,
    projectId,
    targetState: 'escalated',
    performedBy,
    escalatedTo,
    reason,
  });
}

/**
 * Defer a governed decision.
 */
export async function deferDecision(
  decisionId: string,
  organizationId: number,
  projectId: number,
  performedBy: string,
  reason: string
): Promise<GovernedLifecycleResult> {
  return transitionGovernedDecision({
    decisionId,
    organizationId,
    projectId,
    targetState: 'deferred',
    performedBy,
    reason,
  });
}

/**
 * Mark a governed decision as executed.
 */
export async function executeDecision(
  decisionId: string,
  organizationId: number,
  projectId: number,
  performedBy: string,
  execution: {
    artifactId?: number;
    artifactVersion?: number;
    workflowRunId?: string;
  }
): Promise<GovernedLifecycleResult> {
  return transitionGovernedDecision({
    decisionId,
    organizationId,
    projectId,
    targetState: 'executed',
    performedBy,
    reason: 'Decision executed',
    executedArtifactId: execution.artifactId,
    executedArtifactVersion: execution.artifactVersion,
    executedWorkflowRunId: execution.workflowRunId,
  });
}

/**
 * Supersede a governed decision with a new one.
 */
export async function supersedeDecision(
  decisionId: string,
  organizationId: number,
  projectId: number,
  performedBy: string,
  supersededByDecisionId: string,
  reason: string
): Promise<GovernedLifecycleResult> {
  return transitionGovernedDecision({
    decisionId,
    organizationId,
    projectId,
    targetState: 'superseded',
    performedBy,
    supersededByDecisionId,
    reason,
  });
}

/**
 * Get lifecycle history for a decision (all transitions).
 * Returns real durable transition events, not reconstructed pseudo-history.
 */
export async function getDecisionLifecycleHistory(
  decisionId: string,
  organizationId: number
): Promise<GovernedLifecycleHistoryEntry[]> {
  try {
    const { getDecisionTimelineDurable } = await import('./governed-decision-transition-log-service.js');
    const events = await getDecisionTimelineDurable(decisionId, organizationId);
    return events.map(e => ({
      decisionId: e.decisionId,
      state: e.toState,
      performedBy: e.actorId,
      reason: e.reason,
      timestamp: e.createdAt,
      artifactRef: e.linkedArtifactId,
    }));
  } catch {
    return [];
  }
}
