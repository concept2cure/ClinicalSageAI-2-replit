/**
 * useGovernance — Hooks for governance escalation visibility.
 *
 * Delegates to fabric state hooks internally. The old direct API calls
 * to /api/authoring-actions/... have been replaced by fabric selectors
 * from useFabricState, making the control-plane governed decisions
 * endpoint the single source of truth.
 *
 * @module concept2cure/hooks/useGovernance
 */

import {
  useFabricDecisions,
  useFabricSummary,
  selectPromotionBlockersFromFabric,
  selectGovernanceDecisionBadge,
} from './useFabricState';

// ── Types (kept for backward compatibility) ────────────────────────────────

/** @deprecated Use FabricDecisionEntry from useFabricState instead */
export interface PromotionBlocker {
  type: string;
  severity: 'critical' | 'major' | 'minor';
  message: string;
  source: string;
}

/** @deprecated Use fabric decisions response shape instead */
export interface PromotionBlockersResponse {
  projectId: string;
  artifactId: string | null;
  sectionCode: string | null;
  blocked: boolean;
  blockerCount: number;
  blockers: PromotionBlocker[];
}

/** @deprecated Use FabricDecisionEntry from useFabricState instead */
export interface GovernanceDecision {
  id: string;
  kind: string;
  status: string;
  summary: string;
  rationale: string;
  authority: string;
  sectionCode?: string;
  moduleCode?: string;
  artifactId?: string;
  createdByType: string;
  createdAt: string;
  sourceSignalCount: number;
  hasReceipt: boolean;
}

/** @deprecated Use fabric decisions response shape instead */
export interface GovernanceDecisionsResponse {
  projectId: string;
  count: number;
  decisions: GovernanceDecision[];
}

// ── Hooks (now delegate to fabric state) ───────────────────────────────────

/**
 * Fetches promotion blockers for a project.
 * Delegates to useFabricDecisions + selectPromotionBlockersFromFabric.
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
 * Fetches governance decision history for a project.
 * Delegates to useFabricDecisions with limit 20.
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

// === Canonical fabric state hooks (Build Order #2) ===
export {
  useFabricDecisions,
  useFabricSummary,
  selectPromotionBlockersFromFabric,
  selectGovernanceDecisionBadge,
};

export type { FabricDecisionEntry, FabricSummary } from './useFabricState';
