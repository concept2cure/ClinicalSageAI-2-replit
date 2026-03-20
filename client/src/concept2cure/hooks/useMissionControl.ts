/**
 * @fileoverview Mission Control React Query Hooks
 * @module concept2cure/hooks/useMissionControl
 * @version 1.0.0
 *
 * Hooks for Program OS: programs, destinations, artifacts, evidence,
 * reviews, risks, collaboration, readiness, and scaffold.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

const BASE = '/api/mission-control';

function getAuthHeaders(): Record<string, string> {
  const token =
    sessionStorage.getItem('trialsage_access_token') ||
    localStorage.getItem('trialsage_access_token') ||
    sessionStorage.getItem('concept2cure_token') ||
    localStorage.getItem('concept2cure_token');
  return token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };
}

async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: { ...getAuthHeaders(), ...(options?.headers || {}) },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error?.message || json?.error || 'Request failed');
  return json.data;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PROGRAMS
// ═══════════════════════════════════════════════════════════════════════════════

export function usePrograms() {
  return useQuery({
    queryKey: ['mc-programs'],
    queryFn: () => api<any[]>('/programs'),
    staleTime: 30_000,
  });
}

export function useProgram(id: number | null) {
  return useQuery({
    queryKey: ['mc-program', id],
    queryFn: () => api<any>(`/programs/${id}`),
    enabled: !!id,
  });
}

export function useCreateProgram() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => api<any>('/programs', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mc-programs'] }),
  });
}

export function useUpdateProgram() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: any) => api<any>(`/programs/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['mc-programs'] });
      qc.invalidateQueries({ queryKey: ['mc-program', vars.id] });
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// DESTINATIONS
// ═══════════════════════════════════════════════════════════════════════════════

export function useDestinations(programId: number | null) {
  return useQuery({
    queryKey: ['mc-destinations', programId],
    queryFn: () => api<any[]>(`/programs/${programId}/destinations`),
    enabled: !!programId,
  });
}

export function useCreateDestination() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ programId, ...data }: any) =>
      api<any>(`/programs/${programId}/destinations`, { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ['mc-destinations', vars.programId] }),
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// ROUTE PLANS
// ═══════════════════════════════════════════════════════════════════════════════

export function useRoutePlans(destinationId: number | null) {
  return useQuery({
    queryKey: ['mc-routes', destinationId],
    queryFn: () => api<any[]>(`/destinations/${destinationId}/routes`),
    enabled: !!destinationId,
  });
}

export function useCreateRoutePlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ destinationId, ...data }: any) =>
      api<any>(`/destinations/${destinationId}/routes`, { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ['mc-routes', vars.destinationId] }),
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// ARTIFACTS
// ═══════════════════════════════════════════════════════════════════════════════

export function useArtifacts(programId: number | null, filters?: { type?: string; lifecycle?: string; dossierModule?: string }) {
  const params = new URLSearchParams();
  if (filters?.type) params.set('type', filters.type);
  if (filters?.lifecycle) params.set('lifecycle', filters.lifecycle);
  if (filters?.dossierModule) params.set('dossierModule', filters.dossierModule);
  const query = params.toString() ? `?${params}` : '';

  return useQuery({
    queryKey: ['mc-artifacts', programId, filters],
    queryFn: () => api<any[]>(`/programs/${programId}/artifacts${query}`),
    enabled: !!programId,
    staleTime: 15_000,
  });
}

export function useArtifact(id: number | null) {
  return useQuery({
    queryKey: ['mc-artifact', id],
    queryFn: () => api<any>(`/artifacts/${id}`),
    enabled: !!id,
  });
}

export function useCreateArtifact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ programId, ...data }: any) =>
      api<any>(`/programs/${programId}/artifacts`, { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ['mc-artifacts', vars.programId] }),
  });
}

export function useUpdateArtifact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: any) =>
      api<any>(`/artifacts/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['mc-artifacts'] });
      qc.invalidateQueries({ queryKey: ['mc-artifact', vars.id] });
    },
  });
}

export function useTransitionArtifact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, newState, note }: { id: number; newState: string; note?: string }) =>
      api<any>(`/artifacts/${id}/transition`, { method: 'POST', body: JSON.stringify({ newState, note }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mc-artifacts'] });
      qc.invalidateQueries({ queryKey: ['mc-artifact'] });
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// EVIDENCE
// ═══════════════════════════════════════════════════════════════════════════════

export function useEvidence(programId: number | null) {
  return useQuery({
    queryKey: ['mc-evidence', programId],
    queryFn: () => api<any[]>(`/programs/${programId}/evidence`),
    enabled: !!programId,
  });
}

export function useCreateEvidence() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ programId, ...data }: any) =>
      api<any>(`/programs/${programId}/evidence`, { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ['mc-evidence', vars.programId] }),
  });
}

export function useLinkEvidence() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ artifactId, ...data }: any) =>
      api<any>(`/artifacts/${artifactId}/evidence`, { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mc-artifact'] }),
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// DEPENDENCIES
// ═══════════════════════════════════════════════════════════════════════════════

export function useDependencies(programId: number | null) {
  return useQuery({
    queryKey: ['mc-dependencies', programId],
    queryFn: () => api<any[]>(`/programs/${programId}/dependencies`),
    enabled: !!programId,
  });
}

export function useStaleDependencies(programId: number | null) {
  return useQuery({
    queryKey: ['mc-stale-deps', programId],
    queryFn: () => api<any[]>(`/programs/${programId}/dependencies/stale`),
    enabled: !!programId,
    refetchInterval: 60_000,
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// DECISIONS
// ═══════════════════════════════════════════════════════════════════════════════

export function useDecisions(programId: number | null) {
  return useQuery({
    queryKey: ['mc-decisions', programId],
    queryFn: () => api<any[]>(`/programs/${programId}/decisions`),
    enabled: !!programId,
  });
}

export function useCreateDecision() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ programId, ...data }: any) =>
      api<any>(`/programs/${programId}/decisions`, { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ['mc-decisions', vars.programId] }),
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// REVIEWS
// ═══════════════════════════════════════════════════════════════════════════════

export function useReviews(artifactId: number | null) {
  return useQuery({
    queryKey: ['mc-reviews', artifactId],
    queryFn: () => api<any[]>(`/artifacts/${artifactId}/reviews`),
    enabled: !!artifactId,
  });
}

export function useCreateReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ artifactId, ...data }: any) =>
      api<any>(`/artifacts/${artifactId}/reviews`, { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['mc-reviews', vars.artifactId] });
      qc.invalidateQueries({ queryKey: ['mc-artifacts'] });
    },
  });
}

export function useUpdateReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: any) =>
      api<any>(`/reviews/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mc-reviews'] });
      qc.invalidateQueries({ queryKey: ['mc-artifacts'] });
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// RISKS
// ═══════════════════════════════════════════════════════════════════════════════

export function useRisks(programId: number | null, filters?: { status?: string; severity?: string }) {
  const params = new URLSearchParams();
  if (filters?.status) params.set('status', filters.status);
  if (filters?.severity) params.set('severity', filters.severity);
  const query = params.toString() ? `?${params}` : '';

  return useQuery({
    queryKey: ['mc-risks', programId, filters],
    queryFn: () => api<any[]>(`/programs/${programId}/risks${query}`),
    enabled: !!programId,
  });
}

export function useCreateRisk() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ programId, ...data }: any) =>
      api<any>(`/programs/${programId}/risks`, { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ['mc-risks', vars.programId] }),
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// COLLABORATION
// ═══════════════════════════════════════════════════════════════════════════════

export function useCollaboration(targetType: string, targetId: number | null) {
  return useQuery({
    queryKey: ['mc-collab', targetType, targetId],
    queryFn: () => api<any[]>(`/collaboration?targetType=${targetType}&targetId=${targetId}`),
    enabled: !!targetId,
  });
}

export function useCreateCollaboration() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) =>
      api<any>('/collaboration', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['mc-collab', vars.targetType, vars.targetId] });
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// APPROVAL REQUESTS
// ═══════════════════════════════════════════════════════════════════════════════

export function useApprovalRequests(programId: number | null, status?: string) {
  const params = new URLSearchParams();
  if (programId) params.set('programId', String(programId));
  if (status) params.set('status', status);
  const query = params.toString() ? `?${params}` : '';

  return useQuery({
    queryKey: ['mc-approvals', programId, status],
    queryFn: () => api<any[]>(`/approval-requests${query}`),
  });
}

export function useDecideApproval() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, decision, comment, decisionBy }: { id: number; decision: 'approved' | 'rejected'; comment?: string; decisionBy?: string }) =>
      api<any>(`/approval-requests/${id}/decide`, {
        method: 'POST',
        body: JSON.stringify({ decision, comment, decisionBy }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mc-approvals'] });
      qc.invalidateQueries({ queryKey: ['mc-collab'] });
    },
  });
}

export function useDelegateApproval() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, delegateTo, delegateToRole, reason }: { id: number; delegateTo: string; delegateToRole?: string; reason?: string }) =>
      api<any>(`/approval-requests/${id}/delegate`, {
        method: 'POST',
        body: JSON.stringify({ delegateTo, delegateToRole, reason }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mc-approvals'] });
    },
  });
}

export function useCreateApprovalRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) =>
      api<any>('/approval-requests', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mc-approvals'] });
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// READINESS
// ═══════════════════════════════════════════════════════════════════════════════

export function useReadiness(programId: number | null) {
  return useQuery({
    queryKey: ['mc-readiness', programId],
    queryFn: () => api<any>(`/programs/${programId}/readiness`),
    enabled: !!programId,
    staleTime: 30_000,
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// PROVENANCE
// ═══════════════════════════════════════════════════════════════════════════════

export function useProvenance(programId: number | null, options?: { entityType?: string; entityId?: number; limit?: number }) {
  const params = new URLSearchParams();
  if (options?.entityType) params.set('entityType', options.entityType);
  if (options?.entityId) params.set('entityId', String(options.entityId));
  if (options?.limit) params.set('limit', String(options.limit));
  const query = params.toString() ? `?${params}` : '';

  return useQuery({
    queryKey: ['mc-provenance', programId, options],
    queryFn: () => api<any[]>(`/programs/${programId}/provenance${query}`),
    enabled: !!programId,
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// SCAFFOLD
// ═══════════════════════════════════════════════════════════════════════════════

export function useScaffoldProgram() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ programId, ...data }: { programId: number; destinationType: string; customerTrack?: string }) =>
      api<any>(`/programs/${programId}/scaffold`, { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['mc-artifacts', vars.programId] });
      qc.invalidateQueries({ queryKey: ['mc-readiness', vars.programId] });
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// AUTHORITY INTERACTIONS
// ═══════════════════════════════════════════════════════════════════════════════

export function useAuthorityInteractions(programId: number | null) {
  return useQuery({
    queryKey: ['mc-authority', programId],
    queryFn: () => api<any[]>(`/programs/${programId}/authority-interactions`),
    enabled: !!programId,
  });
}

export function useCreateAuthorityInteraction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ programId, ...data }: any) =>
      api<any>(`/programs/${programId}/authority-interactions`, { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ['mc-authority', vars.programId] }),
  });
}
