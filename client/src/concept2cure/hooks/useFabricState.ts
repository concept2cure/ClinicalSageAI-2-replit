/**
 * useFabricState — Canonical fabric governance state hooks.
 *
 * Queries client-safe project-scoped governance endpoints backed by
 * durable storage (decision_records table).
 *
 * Endpoints consumed:
 *   GET /api/concept2cure/projects/:projectId/governance/decisions
 *   GET /api/concept2cure/projects/:projectId/governance/summary
 *
 * @module concept2cure/hooks/useFabricState
 */

import { useQuery, useMutation } from '@tanstack/react-query';
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
      if (options?.limit) params.set('limit', String(options.limit));
      const res = await apiRequest(
        'GET',
        `/api/concept2cure/projects/${projectId}/governance/decisions?${params}`
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
      const res = await apiRequest(
        'GET',
        `/api/concept2cure/projects/${projectId}/governance/summary`
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

// ── Governed Review Queue Hooks ────────────────────────────────────────────

/**
 * Fetch the governed decision review queue for a project.
 */
export function useGovernedReviewQueue(projectId: string | undefined) {
  return useQuery({
    queryKey: ['concept2cure', 'governance', 'review-queue', projectId],
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/concept2cure/projects/${projectId}/governance/review-queue`);
      return (await res.json()) as { data: { queue: { pending: string[]; escalated: string[]; deferred: string[]; rejected: string[] }; unresolved: { hasUnresolved: boolean; unresolvedCount: number; escalatedCount: number } } };
    },
    enabled: !!projectId,
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
}

/**
 * Fetch lifecycle transition history for a specific decision.
 */
export function useGovernedDecisionHistory(projectId: string | undefined, decisionId: string | undefined) {
  return useQuery({
    queryKey: ['concept2cure', 'governance', 'decision-history', projectId, decisionId],
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/concept2cure/projects/${projectId}/governance/decisions/${decisionId}/history`);
      return (await res.json()) as { data: { history: Array<{ decisionId: string; state: string; performedBy: string; reason?: string; timestamp: string }> } };
    },
    enabled: !!projectId && !!decisionId,
    staleTime: 10_000,
  });
}

/**
 * Perform a lifecycle transition on a governed decision.
 */
export function useGovernedDecisionTransition(projectId: string | undefined) {
  return useMutation({
    mutationFn: async (input: { decisionId: string; action: string; reason?: string; escalatedTo?: string }) => {
      const res = await apiRequest('POST', `/api/concept2cure/projects/${projectId}/governance/decisions/${input.decisionId}/transition`, input);
      return (await res.json()) as { data: { success: boolean; previousState: string; newState: string; error?: string } };
    },
  });
}
