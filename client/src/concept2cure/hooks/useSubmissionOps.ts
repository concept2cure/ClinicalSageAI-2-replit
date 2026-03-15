/**
 * Phase 15 — Submission Operations Command Center hooks
 *
 * React hooks wrapping /api/submission-ops endpoints.
 * Uses @tanstack/react-query for caching and refetching.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

const API = '/api/submission-ops';

async function apiFetch<T>(path: string, init?: Parameters<typeof fetch>[1]): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(init?.headers as Record<string, string>) },
    ...init,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || res.statusText);
  }
  const json = await res.json();
  return json.data as T;
}

// ═══════════════════════════════════════════════════════════
// PACKAGES
// ═══════════════════════════════════════════════════════════

export function usePackages(projectId?: number) {
  return useQuery({
    queryKey: ['submission-ops', 'packages', projectId],
    queryFn: () => apiFetch<any[]>(`/packages${projectId ? `?projectId=${projectId}` : ''}`),
    enabled: !!projectId,
  });
}

export function usePackage(packageId?: string) {
  return useQuery({
    queryKey: ['submission-ops', 'package', packageId],
    queryFn: () => apiFetch<any>(`/packages/${packageId}`),
    enabled: !!packageId,
  });
}

export function useCreatePackage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: any) =>
      apiFetch<any>('/packages', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['submission-ops', 'packages'] }),
  });
}

// ═══════════════════════════════════════════════════════════
// READINESS
// ═══════════════════════════════════════════════════════════

export function useReadiness(packageId?: string) {
  return useQuery({
    queryKey: ['submission-ops', 'readiness', packageId],
    queryFn: () => apiFetch<any>(`/packages/${packageId}/readiness`),
    enabled: !!packageId,
    refetchInterval: 30_000,
  });
}

export function useReadinessHistory(packageId?: string) {
  return useQuery({
    queryKey: ['submission-ops', 'readiness-history', packageId],
    queryFn: () => apiFetch<any[]>(`/packages/${packageId}/readiness-history?limit=30`),
    enabled: !!packageId,
  });
}

// ═══════════════════════════════════════════════════════════
// BLOCKERS
// ═══════════════════════════════════════════════════════════

export function useBlockers(filters?: Record<string, string | number>) {
  const params = new URLSearchParams();
  if (filters) {
    Object.entries(filters).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') params.set(k, String(v));
    });
  }
  return useQuery({
    queryKey: ['submission-ops', 'blockers', filters],
    queryFn: () => apiFetch<any[]>(`/blockers?${params.toString()}`),
  });
}

export function useResolveBlocker() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      blockerId,
      ...body
    }: {
      blockerId: string;
      status: string;
      nextAction?: string;
    }) => apiFetch<any>(`/blockers/${blockerId}`, { method: 'PATCH', body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['submission-ops', 'blockers'] });
      qc.invalidateQueries({ queryKey: ['submission-ops', 'readiness'] });
    },
  });
}

// ═══════════════════════════════════════════════════════════
// APPROVAL BOTTLENECKS
// ═══════════════════════════════════════════════════════════

export function useApprovalBottlenecks(projectId?: number) {
  return useQuery({
    queryKey: ['submission-ops', 'bottlenecks', projectId],
    queryFn: () =>
      apiFetch<any[]>(`/approval-bottlenecks${projectId ? `?projectId=${projectId}` : ''}`),
    enabled: !!projectId,
  });
}

// ═══════════════════════════════════════════════════════════
// WORKLOAD
// ═══════════════════════════════════════════════════════════

export function useWorkload(projectId?: number) {
  return useQuery({
    queryKey: ['submission-ops', 'workload', projectId],
    queryFn: () => apiFetch<any[]>(`/workload${projectId ? `?projectId=${projectId}` : ''}`),
    enabled: !!projectId,
  });
}

// ═══════════════════════════════════════════════════════════
// HOTSPOTS
// ═══════════════════════════════════════════════════════════

export function useHotspots(packageId?: string) {
  return useQuery({
    queryKey: ['submission-ops', 'hotspots', packageId],
    queryFn: () => apiFetch<any[]>(`/hotspots?packageId=${packageId}`),
    enabled: !!packageId,
  });
}

// ═══════════════════════════════════════════════════════════
// AUTOMATION
// ═══════════════════════════════════════════════════════════

export function useAutomationRuns(projectId?: number) {
  return useQuery({
    queryKey: ['submission-ops', 'automation-runs', projectId],
    queryFn: () => apiFetch<any[]>(`/automation/runs${projectId ? `?projectId=${projectId}` : ''}`),
    enabled: !!projectId,
  });
}

export function useTriggerAutomation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { projectId: number; packageDbId: number }) =>
      apiFetch<any>('/automation/run', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['submission-ops'] });
    },
  });
}

// ═══════════════════════════════════════════════════════════
// DUE SOON / TIMELINE
// ═══════════════════════════════════════════════════════════

export function useDueSoon(projectId?: number) {
  return useQuery({
    queryKey: ['submission-ops', 'due-soon', projectId],
    queryFn: () => apiFetch<any>(`/due-soon${projectId ? `?projectId=${projectId}` : ''}`),
    enabled: !!projectId,
  });
}

// ═══════════════════════════════════════════════════════════
// DIGESTS
// ═══════════════════════════════════════════════════════════

export function useDigests(projectId?: number, digestType?: string) {
  const params = new URLSearchParams();
  if (projectId) params.set('projectId', String(projectId));
  if (digestType) params.set('digestType', digestType);
  return useQuery({
    queryKey: ['submission-ops', 'digests', projectId, digestType],
    queryFn: () => apiFetch<any[]>(`/digests?${params.toString()}`),
    enabled: !!projectId,
  });
}

export function useMarkDigestRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (digestId: string) =>
      apiFetch<any>(`/digests/${digestId}/read`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['submission-ops', 'digests'] }),
  });
}

// ═══════════════════════════════════════════════════════════
// COMMAND CENTER AGGREGATE
// ═══════════════════════════════════════════════════════════

export function useCommandCenter(projectId?: number) {
  return useQuery({
    queryKey: ['submission-ops', 'command-center', projectId],
    queryFn: () => apiFetch<any>(`/command-center?projectId=${projectId}`),
    enabled: !!projectId,
    refetchInterval: 30_000,
  });
}

// ═══════════════════════════════════════════════════════════
// POLICIES
// ═══════════════════════════════════════════════════════════

export function usePolicies() {
  return useQuery({
    queryKey: ['submission-ops', 'policies'],
    queryFn: () => apiFetch<any[]>('/policies'),
  });
}

export function useCreatePolicy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: any) =>
      apiFetch<any>('/policies', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['submission-ops', 'policies'] }),
  });
}

export function useUpdatePolicy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ policyId, ...body }: any) =>
      apiFetch<any>(`/policies/${policyId}`, { method: 'PUT', body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['submission-ops', 'policies'] }),
  });
}

export function useDeletePolicy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (policyId: string) => apiFetch<any>(`/policies/${policyId}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['submission-ops', 'policies'] }),
  });
}

export function useResolvePolicy() {
  return useMutation({
    mutationFn: (ctx: any) =>
      apiFetch<any>('/policies/resolve', { method: 'POST', body: JSON.stringify(ctx) }),
  });
}

// ═══════════════════════════════════════════════════════════
// MILESTONES
// ═══════════════════════════════════════════════════════════

export function useMilestones(packageId?: string) {
  return useQuery({
    queryKey: ['submission-ops', 'milestones', packageId],
    queryFn: () => apiFetch<any[]>(`/packages/${packageId}/milestones`),
    enabled: !!packageId,
  });
}

export function useCreateMilestone() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ packageId, ...body }: any) =>
      apiFetch<any>(`/packages/${packageId}/milestones`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['submission-ops', 'milestones'] }),
  });
}
