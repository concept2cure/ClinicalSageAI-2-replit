/**
 * @fileoverview Snow Globe React Query Hooks
 * @module concept2cure/hooks/useSnowGlobe
 * @version 1.0.0
 *
 * Hooks for Snow Globe — cross-platform prediction service: scenarios,
 * prediction runs, scores, and remediation.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

const BASE = '/api/snowglobe';

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
// SCENARIOS
// ═══════════════════════════════════════════════════════════════════════════════

export function useScenarios(programId: number | null) {
  return useQuery({
    queryKey: ['sg-scenarios', programId],
    queryFn: () => api<any[]>(`/scenarios?programId=${programId}`),
    enabled: !!programId,
    staleTime: 30_000,
  });
}

export function useScenario(scenarioId: number | null) {
  return useQuery({
    queryKey: ['sg-scenario', scenarioId],
    queryFn: () => api<any>(`/scenarios/${scenarioId}`),
    enabled: !!scenarioId,
  });
}

export function useCreateScenario() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) =>
      api<any>('/scenarios', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['sg-scenarios', vars.programId] });
    },
  });
}

export function useUpdateScenario() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: any) =>
      api<any>(`/scenarios/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['sg-scenarios'] });
      qc.invalidateQueries({ queryKey: ['sg-scenario', vars.id] });
    },
  });
}

export function useCloneScenario() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: any) =>
      api<any>(`/scenarios/${id}/clone`, { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sg-scenarios'] });
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// PREDICTION RUNS
// ═══════════════════════════════════════════════════════════════════════════════

export function useRunFullStressTest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ programId, ...data }: any) =>
      api<any>(`/programs/${programId}/full-stress-test`, { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['sg-scores', vars.programId] });
      qc.invalidateQueries({ queryKey: ['sg-remediation', vars.programId] });
      qc.invalidateQueries({ queryKey: ['sg-top-findings', vars.programId] });
    },
  });
}

export function useRunPreAgencyScan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ programId, ...data }: any) =>
      api<any>(`/programs/${programId}/pre-agency-scan`, { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['sg-scores', vars.programId] });
      qc.invalidateQueries({ queryKey: ['sg-remediation', vars.programId] });
      qc.invalidateQueries({ queryKey: ['sg-top-findings', vars.programId] });
    },
  });
}

export function useRunReviewerAttack() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ programId, ...data }: any) =>
      api<any>(`/programs/${programId}/reviewer-attack-scan`, { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['sg-scores', vars.programId] });
      qc.invalidateQueries({ queryKey: ['sg-remediation', vars.programId] });
      qc.invalidateQueries({ queryKey: ['sg-top-findings', vars.programId] });
    },
  });
}

export function useRunAuditExposure() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ programId, ...data }: any) =>
      api<any>(`/programs/${programId}/audit-exposure-scan`, { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['sg-scores', vars.programId] });
      qc.invalidateQueries({ queryKey: ['sg-remediation', vars.programId] });
      qc.invalidateQueries({ queryKey: ['sg-top-findings', vars.programId] });
    },
  });
}

export function useRun(runId: number | null) {
  return useQuery({
    queryKey: ['sg-run', runId],
    queryFn: () => api<any>(`/runs/${runId}`),
    enabled: !!runId,
    staleTime: 10_000,
  });
}

export function useRunResults(runId: number | null) {
  return useQuery({
    queryKey: ['sg-run-results', runId],
    queryFn: () => api<any>(`/runs/${runId}/results`),
    enabled: !!runId,
    staleTime: 15_000,
  });
}

export function useRunDelta(runId: number | null) {
  return useQuery({
    queryKey: ['sg-run-delta', runId],
    queryFn: () => api<any>(`/runs/${runId}/delta-vs-baseline`),
    enabled: !!runId,
    staleTime: 30_000,
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// SCORES
// ═══════════════════════════════════════════════════════════════════════════════

export function useProgramScores(programId: number | null) {
  return useQuery({
    queryKey: ['sg-scores', programId],
    queryFn: () => api<any>(`/programs/${programId}/scores`),
    enabled: !!programId,
    staleTime: 30_000,
  });
}

export function useArtifactScores(artifactId: number | null) {
  return useQuery({
    queryKey: ['sg-artifact-scores', artifactId],
    queryFn: () => api<any>(`/artifacts/${artifactId}/scores`),
    enabled: !!artifactId,
    staleTime: 30_000,
  });
}

export function useDossierNodeScores(nodeId: number | null) {
  return useQuery({
    queryKey: ['sg-dossier-scores', nodeId],
    queryFn: () => api<any>(`/dossier-nodes/${nodeId}/scores`),
    enabled: !!nodeId,
    staleTime: 30_000,
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// REMEDIATION
// ═══════════════════════════════════════════════════════════════════════════════

export function useRemediationPlan(programId: number | null) {
  return useQuery({
    queryKey: ['sg-remediation', programId],
    queryFn: () => api<any>(`/programs/${programId}/remediation-plan`),
    enabled: !!programId,
    staleTime: 30_000,
  });
}

export function useTopFindings(programId: number | null) {
  return useQuery({
    queryKey: ['sg-top-findings', programId],
    queryFn: () => api<any>(`/programs/${programId}/top-findings`),
    enabled: !!programId,
    staleTime: 30_000,
  });
}

export function useCreateFindingsMemo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ runId, ...data }: any) =>
      api<any>(`/runs/${runId}/create-findings-memo`, { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['sg-run-results', vars.runId] });
    },
  });
}
