/**
 * useGovernance — Governance hooks (canonical re-exports).
 *
 * All governance state comes from useFabricState.ts.
 * This module provides convenience re-exports and two thin adapters
 * (usePromotionBlockers, useGovernanceDecisions) for backward compatibility.
 *
 * Deprecated types removed in Build Order #15 — use FabricDecisionEntry
 * and FabricSummary from useFabricState instead.
 *
 * @module concept2cure/hooks/useGovernance
 */

import {
  useFabricDecisions,
  useFabricSummary,
  useGovernedReviewQueue,
  useGovernedDecisionHistory,
  useGovernedDecisionTransition,
  selectPromotionBlockersFromFabric,
  selectGovernanceDecisionBadge,
  type FabricDecisionEntry,
  type FabricSummary,
} from './useFabricState';

// ── Thin adapters (backward compat) ──────────────────────────────────────

/**
 * Derive promotion blockers from fabric decisions.
 */
export function usePromotionBlockers(projectId: string | number | undefined) {
  const fabricQuery = useFabricDecisions(projectId != null ? String(projectId) : undefined);
  return {
    ...fabricQuery,
    data: fabricQuery.data
      ? selectPromotionBlockersFromFabric(fabricQuery.data.entries)
      : undefined,
  };
}

/**
 * Derive governance decisions in the legacy shape.
 */
export function useGovernanceDecisions(projectId: string | number | undefined) {
  const fabricQuery = useFabricDecisions(projectId != null ? String(projectId) : undefined, { limit: 20 });
  return {
    ...fabricQuery,
    data: fabricQuery.data
      ? {
          count: fabricQuery.data.count,
          decisions: fabricQuery.data.entries.map(e => ({
            id: e.decisionId,
            kind: e.intent,
            status: e.outcome,
            summary: `${e.intent}: ${e.outcome} (readiness: ${e.readinessLevel})`,
            authority: e.outcome === 'block' ? 'blocked' : 'allowed',
            createdAt: e.timestamp,
            sourceSignalCount: e.blockerCount + e.warningCount,
            hasReceipt: true,
          })),
        }
      : undefined,
  };
}

// ── Canonical re-exports ─────────────────────────────────────────────────

export {
  useFabricDecisions,
  useFabricSummary,
  useGovernedReviewQueue,
  useGovernedDecisionHistory,
  useGovernedDecisionTransition,
  selectPromotionBlockersFromFabric,
  selectGovernanceDecisionBadge,
};

export type { FabricDecisionEntry, FabricSummary };
