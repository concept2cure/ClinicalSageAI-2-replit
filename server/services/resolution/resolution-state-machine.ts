/**
 * Resolution State Machine — Sprint 4
 *
 * Manages explicit resolution lifecycle states for resolution plans.
 * States: unresolved → proposed_resolution → in_resolution →
 *         resolved_pending_review → resolved_approved → superseded
 *
 * @module server/services/resolution/resolution-state-machine
 */

import { db } from '../../db';
import { eq, and } from 'drizzle-orm';
import {
  resolutionPlans,
  type ResolutionPlan,
} from '../../../shared/schema/resolution';
import {
  VALID_RESOLUTION_STATE_TRANSITIONS,
  type ResolutionState,
} from '../../../shared/types/resolution';

// ═══════════════════════════════════════════════════════════════════════════════
// STATE TRANSITIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Transition a resolution plan to a new state.
 * Enforces the state machine — only valid transitions are allowed.
 */
export async function transitionResolutionState(
  organizationId: number,
  userId: number,
  planId: string,
  targetState: ResolutionState,
  reason?: string
): Promise<ResolutionPlan> {
  const [plan] = await db
    .select()
    .from(resolutionPlans)
    .where(and(
      eq(resolutionPlans.id, planId),
      eq(resolutionPlans.organizationId, organizationId)
    ))
    .limit(1);

  if (!plan) {
    throw new Error(`Resolution plan ${planId} not found`);
  }

  const currentState = plan.state as ResolutionState;
  validateTransition(currentState, targetState);

  const updateData: Record<string, unknown> = {
    state: targetState,
    updatedAt: new Date(),
  };

  // Handle terminal states
  if (targetState === 'resolved_approved' || targetState === 'resolved_pending_review') {
    updateData.resolvedAt = new Date();
    updateData.resolvedById = userId;
    if (reason) {
      updateData.resolutionSummary = reason;
    }
  }

  // Append to resolution summary for audit trail
  if (reason && targetState !== 'resolved_approved' && targetState !== 'resolved_pending_review') {
    const existingSummary = plan.resolutionSummary || '';
    updateData.resolutionSummary = existingSummary +
      (existingSummary ? '\n\n' : '') +
      `[${new Date().toISOString()}] ${currentState} → ${targetState}: ${reason}`;
  }

  const [updated] = await db
    .update(resolutionPlans)
    .set(updateData)
    .where(eq(resolutionPlans.id, planId))
    .returning();

  return updated;
}

/**
 * Validate a state transition.
 * Throws if the transition is invalid.
 */
export function validateTransition(
  currentState: ResolutionState,
  targetState: ResolutionState
): void {
  const validTargets = VALID_RESOLUTION_STATE_TRANSITIONS[currentState];

  if (!validTargets) {
    throw new Error(`Unknown resolution state: ${currentState}`);
  }

  if (!validTargets.includes(targetState)) {
    throw new Error(
      `Invalid state transition: ${currentState} → ${targetState}. ` +
      `Valid transitions from "${currentState}": ${validTargets.length > 0 ? validTargets.join(', ') : 'none (terminal state)'}`
    );
  }
}

/**
 * Get all valid transitions from the current state.
 */
export function getValidTransitions(currentState: ResolutionState): ResolutionState[] {
  return VALID_RESOLUTION_STATE_TRANSITIONS[currentState] ?? [];
}

/**
 * Check if a resolution plan is in a terminal state (no further transitions possible).
 */
export function isTerminalState(state: ResolutionState): boolean {
  const transitions = VALID_RESOLUTION_STATE_TRANSITIONS[state];
  return !transitions || transitions.length === 0;
}

/**
 * Check if a resolution plan is considered "resolved" (pending review or approved).
 */
export function isResolved(state: ResolutionState): boolean {
  return state === 'resolved_pending_review' || state === 'resolved_approved';
}

/**
 * Check if a resolution plan is active (not resolved, not cancelled, not superseded).
 */
export function isActive(state: ResolutionState): boolean {
  return ['unresolved', 'proposed_resolution', 'in_resolution'].includes(state);
}
