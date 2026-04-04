/**
 * Workspace Governance Context
 *
 * Shares the WorkspaceGovernanceViewModel across the workspace subtree
 * without prop drilling. The shell creates the model via useWorkspaceGovernanceModel()
 * and provides it here. Child components consume it via useWorkspaceGovernance().
 *
 * This is NOT a global store. It is a local workspace-level React context.
 * The model is created once in ProjectWorkspaceShell and shared with:
 *   - GovernedDecisionReviewPanel
 *   - GovernanceStatusBar
 *   - Consequence surfaces
 *   - Any workspace component that needs governance awareness
 *
 * @module concept2cure/components/workspace/WorkspaceGovernanceContext
 */

import React, { createContext, useContext } from 'react';
import type { WorkspaceGovernanceViewModel } from './workspaceGovernanceModel';

const WorkspaceGovernanceCtx = createContext<WorkspaceGovernanceViewModel | null>(null);

/**
 * Provider — wrap the workspace subtree with this.
 * The shell passes the model instance from useWorkspaceGovernanceModel().
 */
export function WorkspaceGovernanceProvider({
  value,
  children,
}: {
  value: WorkspaceGovernanceViewModel;
  children: React.ReactNode;
}) {
  return (
    <WorkspaceGovernanceCtx.Provider value={value}>
      {children}
    </WorkspaceGovernanceCtx.Provider>
  );
}

/**
 * Consumer hook — use in any workspace component that needs governance awareness.
 * Returns null if used outside the provider (graceful degradation).
 */
export function useWorkspaceGovernance(): WorkspaceGovernanceViewModel | null {
  return useContext(WorkspaceGovernanceCtx);
}

/**
 * Strict consumer hook — throws if used outside provider.
 * Use in components that MUST have governance context.
 */
export function useWorkspaceGovernanceStrict(): WorkspaceGovernanceViewModel {
  const ctx = useContext(WorkspaceGovernanceCtx);
  if (!ctx) {
    throw new Error('useWorkspaceGovernanceStrict must be used within WorkspaceGovernanceProvider');
  }
  return ctx;
}

// ── Centralized Selectors ───────────────────────────────────────────────────

/**
 * Derive a compact governance summary suitable for badges, status bars, and headers.
 */
export function selectGovernanceBadge(model: WorkspaceGovernanceViewModel): {
  label: string;
  tone: 'green' | 'amber' | 'red' | 'stone';
  count: number;
  actionNeeded: boolean;
} {
  if (model.queueCounts.escalated > 0) {
    return { label: 'Escalated', tone: 'red', count: model.queueCounts.escalated, actionNeeded: true };
  }
  if (model.unresolvedCount > 0) {
    return { label: 'Review needed', tone: 'amber', count: model.unresolvedCount, actionNeeded: true };
  }
  if (model.totalQueueItems > 0) {
    return { label: 'In queue', tone: 'stone', count: model.totalQueueItems, actionNeeded: false };
  }
  return { label: 'Clear', tone: 'green', count: 0, actionNeeded: false };
}

/**
 * Derive which lifecycle actions are available for a given decision state.
 */
export function selectAvailableActions(decisionState: string | null): string[] {
  switch (decisionState) {
    case 'under_review': return ['approve', 'reject', 'escalate', 'defer'];
    case 'escalated': return ['approve', 'reject', 'review'];
    case 'deferred': return ['review'];
    case 'rejected': return ['review'];
    case 'recommended_only': return ['review'];
    default: return [];
  }
}

/**
 * Check if the current governance state indicates the user should pay attention.
 */
export function selectNeedsAttention(model: WorkspaceGovernanceViewModel): boolean {
  return model.hasUnresolved || model.queueCounts.escalated > 0 || model.surface === 'result';
}

/**
 * Derive the selected decision's detail from the shared fabric entries.
 * Returns the matching FabricDecisionEntry if found, or null.
 */
export function selectSelectedGovernanceDetail(model: WorkspaceGovernanceViewModel) {
  if (!model.selectedDecisionId) return null;
  return model.fabricEntries.find(e => e.decisionId === model.selectedDecisionId) ?? null;
}

/**
 * Derive blocker summary from shared fabric entries.
 * Replaces scattered selectPromotionBlockersFromFabric calls.
 */
export function selectBlockerSummary(model: WorkspaceGovernanceViewModel): {
  blocked: boolean;
  blockerCount: number;
} {
  let count = 0;
  for (const e of model.fabricEntries) {
    if (e.outcome === 'block') count++;
  }
  return { blocked: count > 0, blockerCount: count };
}

// ── Workflow Gating Selectors ───────────────────────────────────────────────

export type WorkflowGateStatus = 'allowed' | 'blocked' | 'review_required';

export interface WorkflowGateResult {
  status: WorkflowGateStatus;
  reasons: string[];
  blockerCount: number;
  unresolvedCount: number;
}

/**
 * Determine if the verify workflow stage is allowed based on governance truth.
 * Verify requires: no unresolved escalated decisions + no critical blockers.
 */
export function selectVerifyGate(model: WorkspaceGovernanceViewModel): WorkflowGateResult {
  const reasons: string[] = [];
  let status: WorkflowGateStatus = 'allowed';

  if (model.queueCounts.escalated > 0) {
    status = 'blocked';
    reasons.push(`${model.queueCounts.escalated} escalated decision(s) require resolution`);
  }

  const blockerCount = model.fabricEntries.filter(e => e.outcome === 'block').length;
  if (blockerCount > 0) {
    status = 'blocked';
    reasons.push(`${blockerCount} document(s) blocked by governance`);
  }

  if (status === 'allowed' && model.unresolvedCount > 0) {
    status = 'review_required';
    reasons.push(`${model.unresolvedCount} decision(s) pending review`);
  }

  return { status, reasons, blockerCount, unresolvedCount: model.unresolvedCount };
}

/**
 * Determine if the publish workflow stage is allowed based on governance truth.
 * Publish requires: verify gate passed + all decisions approved/executed.
 */
export function selectPublishGate(model: WorkspaceGovernanceViewModel): WorkflowGateResult {
  const verifyGate = selectVerifyGate(model);
  if (verifyGate.status === 'blocked') {
    return { ...verifyGate, reasons: [...verifyGate.reasons, 'Verify gate not passed'] };
  }

  const reasons: string[] = [];
  let status: WorkflowGateStatus = 'allowed';

  const notPublishable = model.fabricEntries.filter(
    e => e.publishGateOutcome === 'blocked' || e.publishGateOutcome === 'insufficient_context',
  );
  if (notPublishable.length > 0) {
    status = 'blocked';
    reasons.push(`${notPublishable.length} document(s) not yet publish-eligible`);
  }

  if (verifyGate.status === 'review_required') {
    status = 'review_required';
    reasons.push(...verifyGate.reasons);
  }

  return { status, reasons, blockerCount: verifyGate.blockerCount, unresolvedCount: model.unresolvedCount };
}

/**
 * Derive the next recommended action(s) for the user based on current governance state.
 */
export interface NextActionRecommendation {
  action: string;
  label: string;
  priority: 'high' | 'medium' | 'low';
  reason: string;
}

export function selectNextActions(model: WorkspaceGovernanceViewModel): NextActionRecommendation[] {
  const actions: NextActionRecommendation[] = [];

  if (model.queueCounts.escalated > 0) {
    actions.push({
      action: 'resolve_escalated',
      label: 'Resolve escalated decisions',
      priority: 'high',
      reason: `${model.queueCounts.escalated} decision(s) escalated and blocking progress`,
    });
  }

  const blockerCount = model.fabricEntries.filter(e => e.outcome === 'block').length;
  if (blockerCount > 0) {
    actions.push({
      action: 'fix_blockers',
      label: 'Address governance blockers',
      priority: 'high',
      reason: `${blockerCount} document(s) blocked by governance evaluation`,
    });
  }

  if (model.queueCounts.pending > 0) {
    actions.push({
      action: 'review_pending',
      label: 'Review pending decisions',
      priority: 'medium',
      reason: `${model.queueCounts.pending} decision(s) awaiting review`,
    });
  }

  if (model.queueCounts.deferred > 0) {
    actions.push({
      action: 'revisit_deferred',
      label: 'Revisit deferred decisions',
      priority: 'low',
      reason: `${model.queueCounts.deferred} deferred decision(s)`,
    });
  }

  if (actions.length === 0 && model.fabricEntries.length > 0) {
    actions.push({
      action: 'proceed_to_verify',
      label: 'Ready to verify',
      priority: 'low',
      reason: 'No governance blockers — verification can proceed',
    });
  }

  return actions;
}

// ── Transition Preflight ────────────────────────────────────────────────────

export interface TransitionPreflightResult {
  target: string;
  allowed: boolean;
  status: WorkflowGateStatus;
  reasons: string[];
  nextActions: NextActionRecommendation[];
  blockingDecisionIds: string[];
  fallbackNav?: string;
  cta?: { label: string; action: 'open_queue' | 'inspect_decision' | 'refresh' | 'proceed' };
}

/**
 * Run a governance-aware preflight check for a workspace transition.
 * Returns whether the transition is allowed, and why/why not.
 */
/**
 * Check if a transition key has a governance gate and whether it's currently passable.
 * Useful for navigation sources to show disabled/enabled state declaratively.
 */
export function isTransitionGovernanceAllowed(
  model: WorkspaceGovernanceViewModel,
  transitionKey: string,
  transitionMap: Record<string, { governanceGate?: string }>,
): { allowed: boolean; gate: string | undefined } {
  const transition = transitionMap[transitionKey];
  if (!transition?.governanceGate) return { allowed: true, gate: undefined };
  const preflight = runTransitionPreflight(model, transition.governanceGate);
  return { allowed: preflight.allowed, gate: transition.governanceGate };
}

export function runTransitionPreflight(
  model: WorkspaceGovernanceViewModel,
  target: 'verify_review' | 'publish_package' | string,
): TransitionPreflightResult {
  // Non-gated transitions always pass
  if (target !== 'verify_review' && target !== 'publish_package') {
    return {
      target,
      allowed: true,
      status: 'allowed',
      reasons: [],
      nextActions: [],
      blockingDecisionIds: [],
    };
  }

  const gate = target === 'verify_review'
    ? selectVerifyGate(model)
    : selectPublishGate(model);

  const nextActions = gate.status !== 'allowed' ? selectNextActions(model) : [];

  // Collect blocking decision IDs
  const blockingDecisionIds = model.fabricEntries
    .filter(e => e.outcome === 'block')
    .map(e => e.decisionId);

  // Determine CTA
  let cta: TransitionPreflightResult['cta'];
  if (gate.status === 'blocked') {
    if (blockingDecisionIds.length > 0) {
      cta = { label: 'Review blocking decisions', action: 'open_queue' };
    } else {
      cta = { label: 'Refresh governance', action: 'refresh' };
    }
  } else if (gate.status === 'review_required') {
    cta = { label: 'Open review queue', action: 'open_queue' };
  }

  return {
    target,
    allowed: gate.status === 'allowed',
    status: gate.status,
    reasons: gate.reasons,
    nextActions,
    blockingDecisionIds,
    fallbackNav: gate.status === 'blocked' ? 'browse' : undefined,
    cta,
  };
}
