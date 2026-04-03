/**
 * useFabricState — Canonical fabric governance state hooks.
 *
 * Queries the control-plane governed decision endpoints and provides
 * canonical governance state for the document system.
 *
 * Endpoints consumed:
 *   GET /api/control-plane/governed/decisions
 *   GET /api/control-plane/governed/decisions/summary
 *
 * @module concept2cure/hooks/useFabricState
 */

import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { queryKeys } from './queryKeys';

// ── Types ───────────────────────────────────────────────────────────────────

export interface FabricDecisionEntry {
  decisionId: string;
  projectId: string;
  artifactId?: string;
  intent: string;
  outcome: 'allow' | 'block' | 'review' | 'degraded';
  readinessLevel: string;
  readinessScore: number;
  placementOutcome: string;
  exportGateOutcome: string;
  publishGateOutcome: string;
  blockerCount: number;
  warningCount: number;
  consequenceCount: number;
  timestamp: string;
}

export interface FabricSummary {
  total: number;
  byOutcome: Record<string, number>;
  byIntent: Record<string, number>;
  averageReadinessScore: number;
  blockedCount: number;
  exportBlockedCount: number;
  publishBlockedCount: number;
}

// ── Hooks ───────────────────────────────────────────────────────────────────

/**
 * Fetch recent fabric decisions for a project.
 * Canonical source of governed document decision state.
 */
export function useFabricDecisions(
  projectId: string | undefined,
  options?: { limit?: number }
) {
  return useQuery({
    queryKey: queryKeys.governance.fabricDecisions(projectId),
    queryFn: async () => {
      const params = new URLSearchParams();
      if (projectId) params.set('projectId', projectId);
      if (options?.limit) params.set('limit', String(options.limit));
      const res = await apiRequest(
        'GET',
        `/api/control-plane/governed/decisions?${params}`
      );
      return (await res.json()) as { entries: FabricDecisionEntry[]; count: number };
    },
    enabled: !!projectId,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

/**
 * Fetch fabric decision summary for a project.
 */
export function useFabricSummary(projectId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.governance.fabricSummary(projectId),
    queryFn: async () => {
      const params = new URLSearchParams();
      if (projectId) params.set('projectId', projectId);
      const res = await apiRequest(
        'GET',
        `/api/control-plane/governed/decisions/summary?${params}`
      );
      return ((await res.json()) as { summary: FabricSummary }).summary;
    },
    enabled: !!projectId,
    staleTime: 30_000,
    refetchInterval: 120_000,
  });
}

// ── Selectors ───────────────────────────────────────────────────────────────

/**
 * Derive promotion blockers from fabric decisions.
 * Replaces direct promotion-blocker endpoint with canonical fabric state.
 */
export function selectPromotionBlockersFromFabric(
  decisions: FabricDecisionEntry[]
): {
  blockers: Array<{ type: string; severity: string; message: string }>;
  blocked: boolean;
} {
  const latestBlockedDecisions = decisions
    .filter((d) => d.outcome === 'block')
    .slice(0, 5);

  const blockers = latestBlockedDecisions.map((d) => ({
    type: d.intent,
    severity: d.blockerCount > 0 ? 'critical' : 'minor',
    message: `${d.intent ?? 'unknown'} blocked: readiness ${d.readinessLevel ?? 'unknown'} (score ${d.readinessScore ?? 0}/100), ${d.blockerCount ?? 0} blocker(s)`,
  }));

  return {
    blockers,
    blocked: blockers.length > 0,
  };
}

/**
 * Derive governance decision badge from fabric summary.
 */
export function selectGovernanceDecisionBadge(
  summary: FabricSummary
): {
  label: string;
  tone: 'green' | 'amber' | 'red' | 'stone';
  count: number;
} {
  if (summary.blockedCount > 0) {
    return { label: 'Blocked', tone: 'red', count: summary.blockedCount };
  }
  if (summary.exportBlockedCount > 0 || summary.publishBlockedCount > 0) {
    return {
      label: 'Warnings',
      tone: 'amber',
      count: summary.exportBlockedCount + summary.publishBlockedCount,
    };
  }
  if (summary.total > 0) {
    return { label: 'Governed', tone: 'green', count: summary.total };
  }
  return { label: 'No decisions', tone: 'stone', count: 0 };
}
