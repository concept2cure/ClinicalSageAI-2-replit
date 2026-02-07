/**
 * Phase 6.6 — Predicate Intelligence React Query Hooks
 *
 * Custom hooks for interacting with the Predicate Intelligence BFF endpoints.
 * Follows the same pattern as use-docx-factory.ts.
 *
 * @phase 6.6 — Predicate Intelligence
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  PredicateCandidate,
  PredicateCandidateCreate,
  SEMatrixRow,
  SEMatrixRowCreate,
  DefensePreview,
  RadarPoint,
  Generate510kPreviewRequest,
  Generate510kPreviewResponse,
} from '../../shared/types/predicate-intelligence';

// ═══════════════════════════════════════════════════════════════════════════════
// Config
// ═══════════════════════════════════════════════════════════════════════════════

const BASE = '/api/predicate-intelligence';

// ═══════════════════════════════════════════════════════════════════════════════
// Fetch helper (mirrors docxFetch pattern)
// ═══════════════════════════════════════════════════════════════════════════════

async function predicateFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const orgId = localStorage.getItem('organizationId') || '1';
  const headers: Record<string, string> = {
    'x-organization-id': orgId,
    ...((options.headers as Record<string, string>) || {}),
  };
  if (options.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers,
    credentials: 'include',
  });

  if (!res.ok) {
    let detail = '';
    try {
      const errBody = await res.json();
      detail = errBody?.detail || errBody?.error || res.statusText;
    } catch {
      detail = res.statusText;
    }
    throw new Error(`Predicate Intelligence API error ${res.status}: ${detail}`);
  }

  if (res.status === 204) return {} as T;
  return res.json();
}

// ═══════════════════════════════════════════════════════════════════════════════
// Query Keys
// ═══════════════════════════════════════════════════════════════════════════════

export const predicateKeys = {
  all: ['predicate-intelligence'] as const,
  candidates: (programId: string) => [...predicateKeys.all, 'candidates', programId] as const,
  candidate: (programId: string, id: string) =>
    [...predicateKeys.all, 'candidate', programId, id] as const,
  seMatrix: (programId: string, candidateId?: string) =>
    [...predicateKeys.all, 'se-matrix', programId, candidateId || 'all'] as const,
  defensePreview: (programId: string, candidateId?: string) =>
    [...predicateKeys.all, 'defense', programId, candidateId || 'all'] as const,
  radar: (programId: string) => [...predicateKeys.all, 'radar', programId] as const,
};

// ═══════════════════════════════════════════════════════════════════════════════
// Candidates
// ═══════════════════════════════════════════════════════════════════════════════

export function useCandidates(programId: string) {
  return useQuery<PredicateCandidate[]>({
    queryKey: predicateKeys.candidates(programId),
    queryFn: () => predicateFetch(`/candidates?program_id=${programId}`),
    enabled: !!programId,
    staleTime: 30_000,
  });
}

export function useCandidate(programId: string, candidateId: string) {
  return useQuery<PredicateCandidate>({
    queryKey: predicateKeys.candidate(programId, candidateId),
    queryFn: () => predicateFetch(`/candidates/${candidateId}?program_id=${programId}`),
    enabled: !!programId && !!candidateId,
    staleTime: 30_000,
  });
}

export function useCreateCandidate(programId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: Omit<PredicateCandidateCreate, 'program_id'>) =>
      predicateFetch<PredicateCandidate>('/candidates', {
        method: 'POST',
        body: JSON.stringify({ program_id: programId, ...params }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: predicateKeys.candidates(programId) });
      qc.invalidateQueries({ queryKey: predicateKeys.radar(programId) });
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// Analyze (full candidate scoring pipeline)
// ═══════════════════════════════════════════════════════════════════════════════

export function useAnalyze(programId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: { device_name: string; product_code: string; manufacturer?: string }) =>
      predicateFetch<PredicateCandidate[]>('/analyze', {
        method: 'POST',
        body: JSON.stringify({ program_id: programId, ...params }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: predicateKeys.candidates(programId) });
      qc.invalidateQueries({ queryKey: predicateKeys.radar(programId) });
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// SE Matrix
// ═══════════════════════════════════════════════════════════════════════════════

export function useSEMatrix(programId: string, candidateId?: string) {
  const qs = candidateId
    ? `?program_id=${programId}&candidate_id=${candidateId}`
    : `?program_id=${programId}`;
  return useQuery<SEMatrixRow[]>({
    queryKey: predicateKeys.seMatrix(programId, candidateId),
    queryFn: () => predicateFetch(qs.startsWith('/') ? qs : `/se-matrix${qs}`),
    enabled: !!programId,
    staleTime: 30_000,
  });
}

export function useCreateSEMatrixRow(programId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: Omit<SEMatrixRowCreate, 'program_id'>) =>
      predicateFetch<SEMatrixRow>('/se-matrix', {
        method: 'POST',
        body: JSON.stringify({ program_id: programId, ...params }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: predicateKeys.seMatrix(programId) });
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// Defense Preview (Shadow 510(k) Reviewer)
// ═══════════════════════════════════════════════════════════════════════════════

export function useDefensePreview(programId: string, candidateId?: string) {
  const qs = candidateId
    ? `?program_id=${programId}&candidate_id=${candidateId}`
    : `?program_id=${programId}`;
  return useQuery<DefensePreview>({
    queryKey: predicateKeys.defensePreview(programId, candidateId),
    queryFn: () => predicateFetch(`/defense-preview${qs}`),
    enabled: !!programId && !!candidateId,
    staleTime: 60_000,
  });
}

export function useGenerateDefensePreview(programId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: { candidate_id: string; subject_device: Record<string, unknown> }) =>
      predicateFetch<DefensePreview>('/defense-preview', {
        method: 'POST',
        body: JSON.stringify({ program_id: programId, ...params }),
      }),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({
        queryKey: predicateKeys.defensePreview(programId, vars.candidate_id),
      });
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// Radar Plot Data
// ═══════════════════════════════════════════════════════════════════════════════

export function useRadarData(programId: string) {
  return useQuery<RadarPoint[]>({
    queryKey: predicateKeys.radar(programId),
    queryFn: () => predicateFetch(`/radar?program_id=${programId}`),
    enabled: !!programId,
    staleTime: 30_000,
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// Full Pipeline — Generate 510(k) Preview
// ═══════════════════════════════════════════════════════════════════════════════

export function useGenerate510kPreview(programId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: Omit<Generate510kPreviewRequest, 'program_id'>) =>
      predicateFetch<Generate510kPreviewResponse>('/generate-510k-preview', {
        method: 'POST',
        body: JSON.stringify({ program_id: programId, ...params }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: predicateKeys.all });
    },
  });
}
