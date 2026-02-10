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
  PredicateSuggestRequest,
  PredicateSuggestResponse,
  GenerateSEMatrixRequest,
  GenerateSEMatrixResponse,
  PredicateUniverseHealth,
  ReviewerQuestionsResponse,
  ToxicPredicateDetail,
  RenderSEDocxRequest,
  DownloadDefensePacketRequest,
} from '../../shared/types/predicate-intelligence';

// ═══════════════════════════════════════════════════════════════════════════════
// Config
// ═══════════════════════════════════════════════════════════════════════════════

const BASE = '/api/predicate-intelligence';

// ═══════════════════════════════════════════════════════════════════════════════
// Fetch helper (mirrors docxFetch pattern)
// ═══════════════════════════════════════════════════════════════════════════════

async function predicateFetch<T>(path: string, options: Record<string, unknown> = {}): Promise<T> {
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
  predicateSuggest: (programId: string) =>
    [...predicateKeys.all, 'predicate-suggest', programId] as const,
  generatedSEMatrix: (programId: string) =>
    [...predicateKeys.all, 'generated-se-matrix', programId] as const,
  health: () => [...predicateKeys.all, 'health'] as const,
  reviewerQuestions: (programId: string) =>
    [...predicateKeys.all, 'reviewer-questions', programId] as const,
  toxicDetail: (programId: string, kNumber: string) =>
    [...predicateKeys.all, 'toxic-detail', programId, kNumber] as const,
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
    mutationFn: (params: {
      device_description: string;
      product_code?: string;
      similarity_threshold?: number;
      max_candidates?: number;
    }) =>
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
    mutationFn: (params: { predicate_k_number: string; subject_device: Record<string, unknown> }) =>
      predicateFetch<DefensePreview>('/defense-preview', {
        method: 'POST',
        body: JSON.stringify({ program_id: programId, ...params }),
      }),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({
        queryKey: predicateKeys.defensePreview(programId, vars.predicate_k_number),
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

// ═══════════════════════════════════════════════════════════════════════════════
// Phase 6.6.B — Predicate Suggestion (Strategy Engine)
// ═══════════════════════════════════════════════════════════════════════════════

export function useSuggestPredicates(programId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: Omit<PredicateSuggestRequest, 'program_id'>) =>
      predicateFetch<PredicateSuggestResponse>('/suggest', {
        method: 'POST',
        body: JSON.stringify({ program_id: programId, ...params }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: predicateKeys.predicateSuggest(programId) });
      qc.invalidateQueries({ queryKey: predicateKeys.candidates(programId) });
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// Phase 6.6.C — Generate SE Matrix (Auto-populated)
// ═══════════════════════════════════════════════════════════════════════════════

export function useGenerateSEMatrix(programId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: Omit<GenerateSEMatrixRequest, 'program_id'>) =>
      predicateFetch<GenerateSEMatrixResponse>('/generate-se-matrix', {
        method: 'POST',
        body: JSON.stringify({ program_id: programId, ...params }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: predicateKeys.generatedSEMatrix(programId) });
      qc.invalidateQueries({ queryKey: predicateKeys.seMatrix(programId) });
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// Phase 6.6.A — Predicate Universe Health
// ═══════════════════════════════════════════════════════════════════════════════

export function usePredicateHealth() {
  return useQuery<PredicateUniverseHealth>({
    queryKey: predicateKeys.health(),
    queryFn: () => predicateFetch('/health'),
    staleTime: 60_000,
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// Phase 6.6.B — Deterministic Reviewer Questions
// ═══════════════════════════════════════════════════════════════════════════════

export function useReviewerQuestions(programId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: {
      subject_device: Record<string, string>;
      predicate_device: Record<string, string>;
    }) =>
      predicateFetch<ReviewerQuestionsResponse>('/reviewer-questions', {
        method: 'POST',
        body: JSON.stringify({ program_id: programId, ...params }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: predicateKeys.reviewerQuestions(programId) });
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// Phase 6.6.A — Toxic Predicate Detail
// ═══════════════════════════════════════════════════════════════════════════════

export function useToxicDetail(programId: string, kNumber: string) {
  return useQuery<ToxicPredicateDetail>({
    queryKey: predicateKeys.toxicDetail(programId, kNumber),
    queryFn: () => predicateFetch(`/toxic-detail/${kNumber}?program_id=${programId}`),
    enabled: !!programId && !!kNumber,
    staleTime: 30_000,
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// Phase 6.6.C — Render SE Matrix DOCX (binary download)
// ═══════════════════════════════════════════════════════════════════════════════

export function useRenderSEDocx() {
  return useMutation({
    mutationFn: async (params: RenderSEDocxRequest) => {
      const orgId = localStorage.getItem('organizationId') || '1';
      const res = await fetch(`${BASE}/render-se-docx`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-organization-id': orgId },
        credentials: 'include',
        body: JSON.stringify(params),
      });
      if (!res.ok) throw new Error(`DOCX render failed: ${res.statusText}`);
      const blob = await res.blob();
      const cd = res.headers.get('Content-Disposition');
      const filename = cd?.match(/filename="?([^"]+)"?/)?.[1] ?? 'SE_Matrix.docx';
      return { blob, filename };
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// Phase 6.6.D — Download Defense Packet (ZIP)
// ═══════════════════════════════════════════════════════════════════════════════

export function useDownloadDefensePacket() {
  return useMutation({
    mutationFn: async (params: DownloadDefensePacketRequest) => {
      const orgId = localStorage.getItem('organizationId') || '1';
      const res = await fetch(`${BASE}/download-defense-packet`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-organization-id': orgId },
        credentials: 'include',
        body: JSON.stringify(params),
      });
      if (!res.ok) throw new Error(`Defense packet download failed: ${res.statusText}`);
      const blob = await res.blob();
      const cd = res.headers.get('Content-Disposition');
      const filename = cd?.match(/filename="?([^"]+)"?/)?.[1] ?? 'defense_packet.zip';
      return { blob, filename };
    },
  });
}
