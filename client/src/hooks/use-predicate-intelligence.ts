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
  ProofPack,
  ReplayDeterminismRequest,
  ReplayDeterminismResult,
  ProofPackPersistResult,
  ProofPackVerifyResult,
  PredicateToxicityProfile,
  SafetySignalIngestResult,
  LineageGraph,
} from '../../../shared/types/predicate-intelligence';

// ═══════════════════════════════════════════════════════════════════════════════
// Config
// ═══════════════════════════════════════════════════════════════════════════════

const BASE = '/api/predicate-intelligence';

// ═══════════════════════════════════════════════════════════════════════════════
// Fetch helper (mirrors docxFetch pattern)
// ═══════════════════════════════════════════════════════════════════════════════

async function predicateFetch<T>(path: string, options: Record<string, unknown> = {}): Promise<T> {
  const orgId = localStorage.getItem('organizationId') ?? '';
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

// ═══════════════════════════════════════════════════════════════════════════════
// Phase 6.6.C-V2 — Evidence-Linked SE Matrix Hooks
// ═══════════════════════════════════════════════════════════════════════════════

import type {
  GenerateSEMatrixV2Request,
  GenerateSEMatrixV2Response,
  BuildDefensePacketRequest,
  BuildDefensePacketResponse,
  DefensePacketFull,
  SubmissionGateResult,
  WaiveTaskRequest,
  WaiveTaskResponse,
} from '../../../shared/types/predicate-intelligence';

// ═══════════════════════════════════════════════════════════════════════════════
// Phase 6.6.D1 — Defense Packet Builder Hooks (Evidence Ops)
// ═══════════════════════════════════════════════════════════════════════════════

const DEFENSE_PACKET_BASE = '/api/programs';

async function defensePacketFetch<T>(
  path: string,
  options: Record<string, unknown> = {}
): Promise<T> {
  const orgId = localStorage.getItem('organizationId') ?? '';
  const headers: Record<string, string> = {
    'x-organization-id': orgId,
    ...((options.headers as Record<string, string>) || {}),
  };
  if (options.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(`${DEFENSE_PACKET_BASE}${path}`, {
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
    throw new Error(`Defense Packet API error ${res.status}: ${detail}`);
  }

  if (res.status === 204) return {} as T;
  return res.json();
}

export const defensePacketKeys = {
  all: ['defense-packet'] as const,
  build: (programId: string) => [...defensePacketKeys.all, 'build', programId] as const,
  packet: (programId: string, hash: string) =>
    [...defensePacketKeys.all, 'packet', programId, hash] as const,
  gate: (programId: string, hash: string) =>
    [...defensePacketKeys.all, 'gate', programId, hash] as const,
  list: (programId: string) => [...defensePacketKeys.all, 'list', programId] as const,
};

/**
 * Build a deterministic Defense Packet (6.6.D1).
 * POST /api/programs/:programId/predicate-intel/defense-packet/build
 */
export function useBuildDefensePacket(programId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: BuildDefensePacketRequest) =>
      defensePacketFetch<BuildDefensePacketResponse>(
        `/${programId}/predicate-intel/defense-packet/build`,
        { method: 'POST', body: JSON.stringify(params) }
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: defensePacketKeys.all });
    },
  });
}

/**
 * Export defense packet as JSON (6.6.D1).
 * GET /api/programs/:programId/predicate-intel/defense-packet/:hash/export.json
 */
export function useExportDefensePacketJSON(programId: string, manifestHash: string) {
  return useQuery<DefensePacketFull>({
    queryKey: defensePacketKeys.packet(programId, manifestHash),
    queryFn: () =>
      defensePacketFetch(
        `/${programId}/predicate-intel/defense-packet/${manifestHash}/export.json`
      ),
    enabled: !!programId && !!manifestHash,
    staleTime: 120_000,
  });
}

/**
 * Export defense packet as CSV (6.6.D1 — binary download).
 */
export function useExportDefensePacketCSV() {
  return useMutation({
    mutationFn: async ({
      programId,
      manifestHash,
    }: {
      programId: string;
      manifestHash: string;
    }) => {
      const orgId = localStorage.getItem('organizationId') || '1';
      const res = await fetch(
        `${DEFENSE_PACKET_BASE}/${programId}/predicate-intel/defense-packet/${manifestHash}/export.csv`,
        {
          headers: { 'x-organization-id': orgId },
          credentials: 'include',
        }
      );
      if (!res.ok) throw new Error(`CSV export failed: ${res.statusText}`);
      const blob = await res.blob();
      const cd = res.headers.get('Content-Disposition');
      const filename = cd?.match(/filename="?([^"]+)"?/)?.[1] ?? 'defense_packet.csv';
      return { blob, filename };
    },
  });
}

/**
 * Run submission gate check (6.6.D1).
 * POST /api/programs/:programId/predicate-intel/defense-packet/:hash/submission-gate
 */
export function useSubmissionGate(programId: string) {
  return useMutation({
    mutationFn: (manifestHash: string) =>
      defensePacketFetch<SubmissionGateResult>(
        `/${programId}/predicate-intel/defense-packet/${manifestHash}/submission-gate`,
        { method: 'POST' }
      ),
  });
}

/**
 * Waive a task with audit trail (6.6.D1 — Part 11).
 * POST /api/programs/:programId/predicate-intel/defense-packet/:packetId/waive-task
 */
export function useWaiveTask(programId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ packetId, ...params }: WaiveTaskRequest & { packetId: string }) =>
      defensePacketFetch<WaiveTaskResponse>(
        `/${programId}/predicate-intel/defense-packet/${packetId}/waive-task`,
        { method: 'POST', body: JSON.stringify(params) }
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: defensePacketKeys.all });
    },
  });
}

/**
 * Generate V2 Evidence-Linked SE Matrix with risk_code → evidence_task_ids.
 *
 * Returns the full payload including comparison_rows, evidence_tasks,
 * defense_readiness_score, and risk_code_map_version.
 */
export function useGenerateSEMatrixV2() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: GenerateSEMatrixV2Request) => {
      return predicateFetch<GenerateSEMatrixV2Response>('/generate-se-matrix-v2', {
        method: 'POST',
        body: JSON.stringify(params),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: predicateKeys.all });
    },
  });
}

/**
 * Render V2 SE Matrix as downloadable DOCX with evidence footnotes,
 * risk_code badges, and yellow-highlighted missing evidence cells.
 */
export function useRenderSEDocxV2() {
  return useMutation({
    mutationFn: async (params: GenerateSEMatrixV2Request) => {
      const orgId = localStorage.getItem('organizationId') || '1';
      const res = await fetch(`${BASE}/render-se-docx-v2`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-organization-id': orgId },
        credentials: 'include',
        body: JSON.stringify(params),
      });
      if (!res.ok) throw new Error(`DOCX V2 render failed: ${res.statusText}`);
      const blob = await res.blob();
      const cd = res.headers.get('Content-Disposition');
      const filename = cd?.match(/filename="?([^"]+)"?/)?.[1] ?? 'SE_Matrix_V2.docx';
      return { blob, filename };
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// Phase 6.6.E1 — Proof Pack (Zero-Drift Evidence)
// ═══════════════════════════════════════════════════════════════════════════════

export const proofPackKeys = {
  all: ['proof-pack'] as const,
  pack: (programId: string, subjectHash: string) =>
    [...proofPackKeys.all, programId, subjectHash] as const,
};

/**
 * Fetch the Defense Proof Pack — zero-drift attestation.
 * GET /api/programs/:programId/predicate-intel/proof-pack?subject_hash=...
 */
export function useProofPack(programId: string, subjectHash: string) {
  return useQuery<ProofPack>({
    queryKey: proofPackKeys.pack(programId, subjectHash),
    queryFn: () =>
      defensePacketFetch(
        `/${programId}/predicate-intel/proof-pack?subject_hash=${encodeURIComponent(subjectHash)}`
      ),
    enabled: !!programId && !!subjectHash,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// Phase 6.6.E2 — Replay Determinism
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Replay a defense packet build and verify determinism.
 * POST /api/programs/:programId/predicate-intel/replay-determinism
 */
export function useReplayDeterminism(programId: string) {
  return useMutation<ReplayDeterminismResult, Error, ReplayDeterminismRequest>({
    mutationFn: (params: ReplayDeterminismRequest) =>
      defensePacketFetch<ReplayDeterminismResult>(
        `/${programId}/predicate-intel/replay-determinism`,
        { method: 'POST', body: JSON.stringify(params) }
      ),
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// Phase 6.6.G — Proof Pack Trust Chain
// ═══════════════════════════════════════════════════════════════════════════════

export const proofPackExportKeys = {
  all: ['proof-pack-export'] as const,
  verify: (programId: string, proofPackId: string) =>
    [...proofPackExportKeys.all, 'verify', programId, proofPackId] as const,
};

/**
 * Persist a proof pack record (freeze manifest + payload + contract snapshot).
 * POST /api/programs/:programId/predicate-intel/proof-pack/persist
 * Returns proof_pack_id + contract snapshot (G).
 */
export function usePersistProofPack(programId: string) {
  return useMutation<ProofPackPersistResult, Error, { manifestHash: string; requestId?: string }>({
    mutationFn: params =>
      defensePacketFetch<ProofPackPersistResult>(
        `/${programId}/predicate-intel/proof-pack/persist`,
        { method: 'POST', body: JSON.stringify(params) }
      ),
  });
}

/**
 * Verify a proof pack's hash integrity + contract consistency (G — structured failures).
 * GET /api/programs/:programId/predicate-intel/proof-pack/:proofPackId/verify
 */
export function useVerifyProofPack(programId: string, proofPackId: string) {
  return useQuery<ProofPackVerifyResult>({
    queryKey: proofPackExportKeys.verify(programId, proofPackId),
    queryFn: () =>
      defensePacketFetch<ProofPackVerifyResult>(
        `/${programId}/predicate-intel/proof-pack/${encodeURIComponent(proofPackId)}/verify`
      ),
    enabled: !!programId && !!proofPackId,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}

/**
 * Download a proof pack ZIP by proof_pack_id (G — proof_pack_id only, not manifest_hash).
 * Returns a Blob + filename + contract version header.
 * Throws structured error for 409 (BLOCKED / CONTRACT_MISMATCH) or 410 (GONE).
 */
export function useDownloadProofPack(programId: string) {
  return useMutation<
    { blob: Blob; filename: string; contractVersion?: string; proofPackHash?: string },
    Error,
    { proofPackId: string }
  >({
    mutationFn: async ({ proofPackId }) => {
      const orgId = localStorage.getItem('organizationId') ?? '';
      const resp = await fetch(
        `/api/programs/${programId}/predicate-intel/proof-pack/${encodeURIComponent(proofPackId)}/download`,
        {
          credentials: 'include',
          headers: { 'x-organization-id': orgId },
        }
      );
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: 'Download failed' }));
        throw new Error(JSON.stringify(err) || `HTTP ${resp.status}`);
      }
      const blob = await resp.blob();
      const filename =
        resp.headers.get('Content-Disposition')?.match(/filename="(.+)"/)?.[1] ||
        `proof-pack-${proofPackId.slice(0, 12)}.zip`;
      const contractVersion = resp.headers.get('X-Contract-Version') || undefined;
      const proofPackHash = resp.headers.get('X-Proof-Pack-Hash') || undefined;
      return { blob, filename, contractVersion, proofPackHash };
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// Phase 6.6.F — Safety Signals & Lineage Hooks
// ═══════════════════════════════════════════════════════════════════════════════

export const safetySignalKeys = {
  profile: (programId: string, kNumber: string) =>
    ['safety-signal', 'profile', programId, kNumber] as const,
  ingest: (programId: string) => ['safety-signal', 'ingest', programId] as const,
};

export const lineageKeys = {
  graph: (programId: string, kNumber: string) => ['lineage', 'graph', programId, kNumber] as const,
};

/**
 * Ingest safety signals for a predicate k-number (idempotent).
 * POST /api/programs/:programId/predicate-intel/safety-signals/ingest
 */
export function useIngestSafetySignals(programId: string) {
  return useMutation<SafetySignalIngestResult, Error, { kNumber: string; signals: unknown[] }>({
    mutationFn: params =>
      defensePacketFetch<SafetySignalIngestResult>(
        `/${programId}/predicate-intel/safety-signals/ingest`,
        { method: 'POST', body: JSON.stringify(params) }
      ),
  });
}

/**
 * Get toxicity profile for a predicate.
 * GET /api/programs/:programId/predicate-intel/safety-signals/:kNumber/profile
 */
export function useToxicityProfile(programId: string, kNumber: string) {
  return useQuery<PredicateToxicityProfile>({
    queryKey: safetySignalKeys.profile(programId, kNumber),
    queryFn: () =>
      defensePacketFetch<PredicateToxicityProfile>(
        `/${programId}/predicate-intel/safety-signals/${encodeURIComponent(kNumber)}/profile`
      ),
    enabled: !!programId && !!kNumber,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });
}

/**
 * Get lineage graph for a predicate.
 * GET /api/programs/:programId/predicate-intel/lineage/:kNumber/graph
 */
export function useLineageGraph(programId: string, kNumber: string, maxDepth = 2) {
  return useQuery<LineageGraph>({
    queryKey: lineageKeys.graph(programId, kNumber),
    queryFn: () =>
      defensePacketFetch<LineageGraph>(
        `/${programId}/predicate-intel/lineage/${encodeURIComponent(kNumber)}/graph?maxDepth=${maxDepth}`
      ),
    enabled: !!programId && !!kNumber,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// Phase 7.0 — Document Renderers
// ═══════════════════════════════════════════════════════════════════════════════

export const renderKeys = {
  all: ['render'] as const,
  jobs: (programId: string, proofPackId: string) =>
    [...renderKeys.all, 'jobs', programId, proofPackId] as const,
};

interface RenderJobResult {
  render_job_id: string;
  proof_pack_id: string;
  artifact_type: string;
  status: string;
  inputs_hash: string;
  artifact_hash?: string;
  artifact_size_bytes?: number;
  artifact_path?: string;
  created_at: string;
  completed_at: string;
}

/**
 * Render a Defense Packet PDF.
 * Two-step: auto-persist proof pack (idempotent) → create render job → download binary.
 * POST /api/programs/:programId/predicate-intel/render
 * GET  /api/programs/:programId/predicate-intel/render/:renderJobId/download
 */
export function useRenderProofPackPDF(programId: string) {
  return useMutation<
    { blob: Blob; filename: string; artifactHash?: string },
    Error,
    { manifestHash: string }
  >({
    mutationFn: async ({ manifestHash }) => {
      const orgId = localStorage.getItem('organizationId') ?? '';
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'x-organization-id': orgId,
      };

      // Step 1: Persist proof pack (idempotent — returns existing if already persisted)
      const persistRes = await fetch(
        `/api/programs/${programId}/predicate-intel/proof-pack/persist`,
        {
          method: 'POST',
          headers,
          credentials: 'include',
          body: JSON.stringify({ manifestHash }),
        }
      );
      if (!persistRes.ok) {
        const errBody = await persistRes.json().catch(() => ({}));
        throw new Error(
          errBody.error || errBody.detail || `Persist failed: ${persistRes.statusText}`
        );
      }
      const persistData = await persistRes.json();
      const proofPackId = persistData.proof_pack_id || persistData.id;
      if (!proofPackId) {
        throw new Error('Persist succeeded but no proof_pack_id returned');
      }

      // Step 2: Create + execute render job
      const renderRes = await fetch(
        `/api/programs/${programId}/predicate-intel/render`,
        {
          method: 'POST',
          headers,
          credentials: 'include',
          body: JSON.stringify({
            proofPackId,
            artifactType: 'defense_packet_pdf',
          }),
        }
      );
      if (!renderRes.ok) {
        const errBody = await renderRes.json().catch(() => ({}));
        throw new Error(
          errBody.error || errBody.detail?.message || `Render failed: ${renderRes.statusText}`
        );
      }
      const renderData: RenderJobResult = await renderRes.json();
      const renderJobId = renderData.render_job_id;

      // Step 3: Download the rendered PDF
      const dlRes = await fetch(
        `/api/programs/${programId}/predicate-intel/render/${encodeURIComponent(renderJobId)}/download`,
        {
          headers: { 'x-organization-id': orgId },
          credentials: 'include',
        }
      );
      if (!dlRes.ok) {
        throw new Error(`Download failed: ${dlRes.statusText}`);
      }

      const blob = await dlRes.blob();
      const cd = dlRes.headers.get('Content-Disposition');
      const filename =
        cd?.match(/filename="?([^"]+)"?/)?.[1] ??
        `DefensePacketReport_${manifestHash.slice(0, 8)}.pdf`;
      const artifactHash = dlRes.headers.get('X-Artifact-Hash') ?? undefined;

      return { blob, filename, artifactHash };
    },
  });
}
