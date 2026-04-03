/**
 * useGovernance — Hooks for governance escalation visibility.
 *
 * Wires the backend authoring-actions governance endpoints:
 *   GET /api/authoring-actions/promotion-blockers/:projectId
 *   GET /api/authoring-actions/decisions/:projectId
 *
 * @module concept2cure/hooks/useGovernance
 */

import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { queryKeys } from './queryKeys';

// ── Types ───────────────────────────────────────────────────────────────────

export interface PromotionBlocker {
  type: string;
  severity: 'critical' | 'major' | 'minor';
  message: string;
  source: string;
}

export interface PromotionBlockersResponse {
  projectId: string;
  artifactId: string | null;
  sectionCode: string | null;
  blocked: boolean;
  blockerCount: number;
  blockers: PromotionBlocker[];
}

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

export interface GovernanceDecisionsResponse {
  projectId: string;
  count: number;
  decisions: GovernanceDecision[];
}

// ── Hooks ───────────────────────────────────────────────────────────────────

/**
 * Fetches promotion blockers for a project.
 * Polls every 60s to stay fresh without being noisy.
 */
export function usePromotionBlockers(projectId: string | number | undefined) {
  return useQuery<PromotionBlockersResponse>({
    queryKey: queryKeys.governance.promotionBlockers(projectId ?? ''),
    queryFn: async () => {
      const res = await apiRequest(
        'GET',
        `/api/authoring-actions/promotion-blockers/${projectId}`
      );
      return res.json();
    },
    enabled: !!projectId,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

/**
 * Fetches governance decision history for a project.
 * Light polling — decisions don't change frequently.
 */
export function useGovernanceDecisions(projectId: string | number | undefined) {
  return useQuery<GovernanceDecisionsResponse>({
    queryKey: queryKeys.governance.decisions(projectId ?? ''),
    queryFn: async () => {
      const res = await apiRequest(
        'GET',
        `/api/authoring-actions/decisions/${projectId}`
      );
      return res.json();
    },
    enabled: !!projectId,
    staleTime: 30_000,
    refetchInterval: 120_000,
  });
}

// === Canonical fabric state hooks (Build Order #2) ===
export {
  useFabricDecisions,
  useFabricSummary,
  selectPromotionBlockersFromFabric,
  selectGovernanceDecisionBadge,
} from './useFabricState';

export type { FabricDecisionEntry, FabricSummary } from './useFabricState';
