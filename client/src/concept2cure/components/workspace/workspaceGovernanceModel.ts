/**
 * Workspace Governance Operating Model
 *
 * Replaces the loose boolean toggles (showGovernedPanel, reviewQueueVisible,
 * proposalActionState) with a unified state machine that models governance
 * as a first-class workspace operating surface.
 *
 * States:
 *   idle       — no governance surface active
 *   queue      — review queue visible (pending/escalated/deferred/rejected)
 *   inspecting — viewing a specific decision's history/timeline
 *   acting     — lifecycle action in progress on a decision
 *   result     — action completed (success or error), awaiting dismissal
 *
 * This model owns:
 *   - queue visibility (replaces reviewQueueVisible)
 *   - selected decision context (replaces ad-hoc state)
 *   - history/timeline state
 *   - action-in-progress tracking (replaces proposalActionState scatter)
 *   - error/success result state
 *   - governed panel visibility (replaces showGovernedPanel)
 *
 * @module concept2cure/components/workspace/workspaceGovernanceModel
 */

import { useState, useCallback, useMemo } from 'react';
import type { FabricDecisionEntry } from '../../hooks/useFabricState';

// ── Types ───────────────────────────────────────────────────────────────────

export type GovernanceSurfaceState =
  | 'idle'
  | 'queue'
  | 'inspecting'
  | 'acting'
  | 'result';

export interface GovernanceActionResult {
  success: boolean;
  decisionId: string;
  action: string;
  previousState: string;
  newState: string;
  error?: string;
  completedAt: string;
}

export interface WorkspaceGovernanceViewModel {
  // Current surface state
  surface: GovernanceSurfaceState;

  // Selected decision context
  selectedDecisionId: string | null;
  selectedDecisionState: string | null;

  // Action tracking
  actionInProgress: { decisionId: string; action: string } | null;
  lastResult: GovernanceActionResult | null;

  // Governed artifact panel
  governedPanelOpen: boolean;

  // Queue counts (derived from hook data, set externally)
  queueCounts: { pending: number; escalated: number; deferred: number; rejected: number };
  unresolvedCount: number;

  // Detail truth — fabric decision entries shared across all consumers
  fabricEntries: FabricDecisionEntry[];
  fabricLoading: boolean;
  setFabricDetail: (entries: FabricDecisionEntry[], loading: boolean) => void;

  // Actions
  openQueue: () => void;
  closeQueue: () => void;
  inspectDecision: (decisionId: string, currentState: string) => void;
  startAction: (decisionId: string, action: string) => void;
  completeAction: (result: GovernanceActionResult) => void;
  dismissResult: () => void;
  openGovernedPanel: () => void;
  closeGovernedPanel: () => void;
  setQueueCounts: (counts: { pending: number; escalated: number; deferred: number; rejected: number }) => void;
  setUnresolvedCount: (count: number) => void;
  reset: () => void;

  // Derived
  isActive: boolean;
  hasUnresolved: boolean;
  totalQueueItems: number;
}

// ── Hook ────────────────────────────────────────────────────────────────────

export function useWorkspaceGovernanceModel(): WorkspaceGovernanceViewModel {
  const [surface, setSurface] = useState<GovernanceSurfaceState>('idle');
  const [selectedDecisionId, setSelectedDecisionId] = useState<string | null>(null);
  const [selectedDecisionState, setSelectedDecisionState] = useState<string | null>(null);
  const [actionInProgress, setActionInProgress] = useState<{ decisionId: string; action: string } | null>(null);
  const [lastResult, setLastResult] = useState<GovernanceActionResult | null>(null);
  const [governedPanelOpen, setGovernedPanelOpen] = useState(false);
  const [queueCounts, setQueueCounts] = useState({ pending: 0, escalated: 0, deferred: 0, rejected: 0 });
  const [unresolvedCount, setUnresolvedCount] = useState(0);
  const [fabricEntries, setFabricEntries] = useState<FabricDecisionEntry[]>([]);
  const [fabricLoading, setFabricLoading] = useState(false);

  const setFabricDetail = useCallback((entries: FabricDecisionEntry[], loading: boolean) => {
    setFabricEntries(entries);
    setFabricLoading(loading);
  }, []);

  const openQueue = useCallback(() => {
    setSurface('queue');
    setSelectedDecisionId(null);
    setSelectedDecisionState(null);
    setLastResult(null);
  }, []);

  const closeQueue = useCallback(() => {
    setSurface('idle');
    setSelectedDecisionId(null);
    setSelectedDecisionState(null);
    setActionInProgress(null);
    setLastResult(null);
  }, []);

  const inspectDecision = useCallback((decisionId: string, currentState: string) => {
    setSurface('inspecting');
    setSelectedDecisionId(decisionId);
    setSelectedDecisionState(currentState);
    setLastResult(null);
  }, []);

  const startAction = useCallback((decisionId: string, action: string) => {
    setSurface('acting');
    setActionInProgress({ decisionId, action });
  }, []);

  const completeAction = useCallback((result: GovernanceActionResult) => {
    setSurface('result');
    setActionInProgress(null);
    setLastResult(result);
    if (result.success) {
      setSelectedDecisionState(result.newState);
    }
  }, []);

  const dismissResult = useCallback(() => {
    setSurface(selectedDecisionId ? 'inspecting' : 'queue');
    setLastResult(null);
  }, [selectedDecisionId]);

  const openGovernedPanel = useCallback(() => setGovernedPanelOpen(true), []);
  const closeGovernedPanel = useCallback(() => setGovernedPanelOpen(false), []);

  const reset = useCallback(() => {
    setSurface('idle');
    setSelectedDecisionId(null);
    setSelectedDecisionState(null);
    setActionInProgress(null);
    setLastResult(null);
    setGovernedPanelOpen(false);
  }, []);

  const totalQueueItems = queueCounts.pending + queueCounts.escalated + queueCounts.deferred + queueCounts.rejected;

  return useMemo(() => ({
    surface,
    selectedDecisionId,
    selectedDecisionState,
    actionInProgress,
    lastResult,
    governedPanelOpen,
    queueCounts,
    unresolvedCount,
    openQueue,
    closeQueue,
    inspectDecision,
    startAction,
    completeAction,
    dismissResult,
    openGovernedPanel,
    closeGovernedPanel,
    setQueueCounts,
    setUnresolvedCount,
    fabricEntries,
    fabricLoading,
    setFabricDetail,
    reset,
    isActive: surface !== 'idle',
    hasUnresolved: unresolvedCount > 0,
    totalQueueItems,
  }), [
    surface, selectedDecisionId, selectedDecisionState, actionInProgress,
    lastResult, governedPanelOpen, queueCounts, unresolvedCount, totalQueueItems,
    fabricEntries, fabricLoading,
    openQueue, closeQueue, inspectDecision, startAction, completeAction,
    dismissResult, openGovernedPanel, closeGovernedPanel, setFabricDetail, reset,
  ]);
}

// ── Selectors for consequence integration ───────────────────────────────────

/**
 * Derive governance operating status from queue counts.
 * Replaces the scattered badge/tone logic.
 */
export function selectGovernanceOperatingStatus(
  queueCounts: { pending: number; escalated: number; deferred: number; rejected: number }
): {
  status: 'clear' | 'attention' | 'blocked';
  label: string;
  tone: 'green' | 'amber' | 'red' | 'stone';
  total: number;
} {
  const total = queueCounts.pending + queueCounts.escalated + queueCounts.deferred + queueCounts.rejected;
  if (queueCounts.escalated > 0) {
    return { status: 'blocked', label: `${queueCounts.escalated} escalated`, tone: 'red', total };
  }
  if (queueCounts.pending > 0 || queueCounts.rejected > 0) {
    return { status: 'attention', label: `${total} pending review`, tone: 'amber', total };
  }
  if (queueCounts.deferred > 0) {
    return { status: 'attention', label: `${queueCounts.deferred} deferred`, tone: 'stone', total };
  }
  return { status: 'clear', label: 'No pending decisions', tone: 'green', total: 0 };
}
