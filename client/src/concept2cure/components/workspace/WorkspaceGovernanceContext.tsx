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
