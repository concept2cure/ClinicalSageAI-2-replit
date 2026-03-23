/**
 * Resolution Orchestration Hooks — Sprint 4
 *
 * React Query hooks for the Resolution Orchestration Layer.
 * Provides typed access to resolution plans, bundles, supersessions,
 * and orchestration actions.
 *
 * @module client/hooks/useResolution
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

const RESOLUTION_BASE = '/api/resolution';

// ═══════════════════════════════════════════════════════════════════════════════
// QUERY KEYS
// ═══════════════════════════════════════════════════════════════════════════════

export const resolutionKeys = {
  all: ['resolution'] as const,
  plans: (projectId: number) => ['resolution', 'plans', projectId] as const,
  plan: (projectId: number, planId: string) => ['resolution', 'plans', projectId, planId] as const,
  bundles: (projectId: number) => ['resolution', 'bundles', projectId] as const,
  bundle: (projectId: number, bundleId: string) => ['resolution', 'bundles', projectId, bundleId] as const,
  supersessions: (projectId: number) => ['resolution', 'supersessions', projectId] as const,
};

// ═══════════════════════════════════════════════════════════════════════════════
// FETCH HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

async function fetchJson(url: string, options?: RequestInit) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }
  return res.json();
}

// ═══════════════════════════════════════════════════════════════════════════════
// RESOLUTION PLANS
// ═══════════════════════════════════════════════════════════════════════════════

export function useResolutionPlans(projectId: number, state?: string) {
  return useQuery({
    queryKey: [...resolutionKeys.plans(projectId), state],
    queryFn: () => {
      const params = state ? `?state=${state}` : '';
      return fetchJson(`${RESOLUTION_BASE}/plans/${projectId}${params}`);
    },
    enabled: !!projectId,
  });
}

export function useResolutionPlan(projectId: number, planId: string) {
  return useQuery({
    queryKey: resolutionKeys.plan(projectId, planId),
    queryFn: () => fetchJson(`${RESOLUTION_BASE}/plans/${projectId}/${planId}`),
    enabled: !!projectId && !!planId,
  });
}

export function useCreateResolutionPlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      fetchJson(`${RESOLUTION_BASE}/plans`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: resolutionKeys.plans(variables.projectId as number),
      });
    },
  });
}

export function useTransitionPlanState() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ planId, targetState, reason }: { planId: string; targetState: string; reason?: string }) =>
      fetchJson(`${RESOLUTION_BASE}/plans/${planId}/transition`, {
        method: 'POST',
        body: JSON.stringify({ targetState, reason }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: resolutionKeys.all });
    },
  });
}

export function useExplainPlan(planId: string) {
  return useQuery({
    queryKey: ['resolution', 'explain', planId],
    queryFn: () => fetchJson(`${RESOLUTION_BASE}/plans/${planId}/explain`, { method: 'POST' }),
    enabled: !!planId,
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// RESOLUTION BUNDLES
// ═══════════════════════════════════════════════════════════════════════════════

export function useResolutionBundles(projectId: number, state?: string) {
  return useQuery({
    queryKey: [...resolutionKeys.bundles(projectId), state],
    queryFn: () => {
      const params = state ? `?state=${state}` : '';
      return fetchJson(`${RESOLUTION_BASE}/bundles/${projectId}${params}`);
    },
    enabled: !!projectId,
  });
}

export function useResolutionBundle(projectId: number, bundleId: string) {
  return useQuery({
    queryKey: resolutionKeys.bundle(projectId, bundleId),
    queryFn: () => fetchJson(`${RESOLUTION_BASE}/bundles/${projectId}/${bundleId}`),
    enabled: !!projectId && !!bundleId,
  });
}

export function useCreateResolutionBundle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      fetchJson(`${RESOLUTION_BASE}/bundles`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: resolutionKeys.bundles(variables.projectId as number),
      });
    },
  });
}

export function useCreateBundleFromPlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { planId: string }) =>
      fetchJson(`${RESOLUTION_BASE}/bundles/from-plan`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: resolutionKeys.all });
    },
  });
}

export function useTransitionBundleState() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ bundleId, targetState, reason }: { bundleId: string; targetState: string; reason?: string }) =>
      fetchJson(`${RESOLUTION_BASE}/bundles/${bundleId}/transition`, {
        method: 'POST',
        body: JSON.stringify({ targetState, reason }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: resolutionKeys.all });
    },
  });
}

export function useUpdateBundleItemStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ bundleId, itemId, status }: { bundleId: string; itemId: string; status: string }) =>
      fetchJson(`${RESOLUTION_BASE}/bundles/${bundleId}/items/${itemId}`, {
        method: 'PUT',
        body: JSON.stringify({ status }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: resolutionKeys.all });
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// SUPERSESSIONS
// ═══════════════════════════════════════════════════════════════════════════════

export function useProjectSupersessions(projectId: number) {
  return useQuery({
    queryKey: resolutionKeys.supersessions(projectId),
    queryFn: () => fetchJson(`${RESOLUTION_BASE}/supersessions/${projectId}`),
    enabled: !!projectId,
  });
}

export function useRecordSupersession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      fetchJson(`${RESOLUTION_BASE}/supersessions`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: resolutionKeys.all });
    },
  });
}

export function useConfirmSupersession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (supersessionId: string) =>
      fetchJson(`${RESOLUTION_BASE}/supersessions/${supersessionId}/confirm`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: resolutionKeys.all });
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// REAPPROVAL & PROMOTION CHECKS
// ═══════════════════════════════════════════════════════════════════════════════

export function useCheckReapproval() {
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      fetchJson(`${RESOLUTION_BASE}/reapproval/check`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
  });
}

export function useCheckPromotionBlock() {
  return useMutation({
    mutationFn: (body: { objectType: string; objectId: string }) =>
      fetchJson(`${RESOLUTION_BASE}/promotion-block/check`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
  });
}
