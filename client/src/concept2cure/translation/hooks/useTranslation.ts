/**
 * @fileoverview Translation React Hooks
 * @module concept2cure/translation/hooks/useTranslation
 * @version 1.0.0
 *
 * @description
 * React-query hooks for the translation workstream. Mirrors useLabeling:
 * structured query keys, query hooks for reads, mutation hooks that invalidate
 * every dependent cache. Binds to translationService, which calls the live
 * /api/translation routes and unwraps the { data, meta } envelope. No mocks.
 *
 * The pure `*Options()` builders are exported separately from the `use*()`
 * hooks so the query-key + URL layer is unit-testable without rendering React
 * (mirrors client/src/lib/api/__tests__/query-options.test.ts).
 *
 * Cross-entity invalidation: a segment mutation (post-edit / back-translation /
 * approve) changes the segment list AND the parent project's server-computed
 * `segmentCounts`, so both caches are invalidated on success.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import translationService, {
  type TranslationProjectDetail,
  type UpsertGlossaryTermRequest,
} from '../services/translationService';
import type {
  ApproveSegmentRequest,
  ApproveSegmentResponse,
  CreateProjectRequest,
  CreateProjectResponse,
  GlossaryListResponse,
  GlossaryTerm,
  ProjectListResponse,
  RunBackTranslationRequest,
  RunBackTranslationResponse,
  SubmitPostEditRequest,
  SubmitPostEditResponse,
  TranslateDraftRequest,
  TranslateDraftResponse,
} from '@shared/types/translation';

// ═══════════════════════════════════════════════════════════════════════════════
// QUERY KEYS
// ═══════════════════════════════════════════════════════════════════════════════

export const translationQueryKeys = {
  all: ['translation'] as const,
  projects: () => [...translationQueryKeys.all, 'projects'] as const,
  project: (id: number) => [...translationQueryKeys.projects(), id] as const,
  segments: (projectId: number) => [...translationQueryKeys.project(projectId), 'segments'] as const,
  glossary: () => [...translationQueryKeys.all, 'glossary'] as const,
};

// ═══════════════════════════════════════════════════════════════════════════════
// QUERY OPTIONS (pure — no React, unit-testable)
// ═══════════════════════════════════════════════════════════════════════════════

/** Pure options for the project list. */
export function translationProjectsOptions() {
  return {
    queryKey: translationQueryKeys.projects(),
    queryFn: (): Promise<ProjectListResponse> => translationService.listProjects(),
    staleTime: 60 * 1000,
  };
}

/** Pure options for a single project (status + nested segments). Gated on id. */
export function translationProjectOptions(id: number | null) {
  return {
    queryKey: translationQueryKeys.project(id ?? -1),
    queryFn: (): Promise<TranslationProjectDetail | null> =>
      id != null ? translationService.getProject(id) : Promise.resolve(null),
    enabled: id != null,
    staleTime: 60 * 1000,
  };
}

/** Pure options for the tenant glossary. */
export function translationGlossaryOptions() {
  return {
    queryKey: translationQueryKeys.glossary(),
    queryFn: (): Promise<GlossaryListResponse> => translationService.listGlossary(),
    staleTime: 5 * 60 * 1000,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// QUERIES
// ═══════════════════════════════════════════════════════════════════════════════

/** List translation projects. */
export function useTranslationProjects() {
  return useQuery(translationProjectsOptions());
}

/** Single project with status + ordered segments. */
export function useTranslationProject(id: number | null) {
  return useQuery(translationProjectOptions(id));
}

/** Tenant glossary (DNT identifiers + preferred translations). */
export function useGlossary() {
  return useQuery(translationGlossaryOptions());
}

// ═══════════════════════════════════════════════════════════════════════════════
// MUTATIONS
// ═══════════════════════════════════════════════════════════════════════════════

/** Create a project. Invalidates the project list. */
export function useCreateProject() {
  const queryClient = useQueryClient();
  return useMutation<CreateProjectResponse, Error, CreateProjectRequest>({
    mutationFn: (data) => translationService.createProject(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: translationQueryKeys.projects() });
    },
  });
}

/**
 * Machine-draft pending segments. Invalidates the project's segments and the
 * project itself (segmentCounts shift from 'pending' to 'mt_draft').
 */
export function useDraftSegment() {
  const queryClient = useQueryClient();
  return useMutation<TranslateDraftResponse, Error, { projectId: number; body: TranslateDraftRequest }>({
    mutationFn: ({ body }) => translationService.draftSegments(body.projectId, body),
    onSuccess: (_data, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: translationQueryKeys.segments(projectId) });
      queryClient.invalidateQueries({ queryKey: translationQueryKeys.project(projectId) });
    },
  });
}

/**
 * Submit a human post-edit. Invalidates the segment list and project counts
 * for the segment's owning project.
 */
export function useSubmitPostEdit() {
  const queryClient = useQueryClient();
  return useMutation<SubmitPostEditResponse, Error, { projectId: number; body: SubmitPostEditRequest }>({
    mutationFn: ({ body }) => translationService.submitPostEdit(body),
    onSuccess: (_data, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: translationQueryKeys.segments(projectId) });
      queryClient.invalidateQueries({ queryKey: translationQueryKeys.project(projectId) });
    },
  });
}

/**
 * Run back-translation, producing the evidence required before approval.
 * Invalidates the segment list and project counts.
 */
export function useRunBackTranslation() {
  const queryClient = useQueryClient();
  return useMutation<RunBackTranslationResponse, Error, { projectId: number; body: RunBackTranslationRequest }>({
    mutationFn: ({ body }) => translationService.runBackTranslation(body),
    onSuccess: (_data, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: translationQueryKeys.segments(projectId) });
      queryClient.invalidateQueries({ queryKey: translationQueryKeys.project(projectId) });
    },
  });
}

/**
 * Approve a segment (terminal). Invalidates the segment list and project counts.
 * Server enforces method/back-translation guardrails (method_not_approvable /
 * back_translation_required), surfaced as Error.message.
 */
export function useApproveSegment() {
  const queryClient = useQueryClient();
  return useMutation<ApproveSegmentResponse, Error, { projectId: number; body: ApproveSegmentRequest }>({
    mutationFn: ({ body }) => translationService.approveSegment(body),
    onSuccess: (_data, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: translationQueryKeys.segments(projectId) });
      queryClient.invalidateQueries({ queryKey: translationQueryKeys.project(projectId) });
    },
  });
}

/** Create or update a glossary term. Invalidates the glossary list. */
export function useUpsertGlossaryTerm() {
  const queryClient = useQueryClient();
  return useMutation<GlossaryTerm, Error, UpsertGlossaryTermRequest>({
    mutationFn: (data) => translationService.upsertGlossaryTerm(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: translationQueryKeys.glossary() });
    },
  });
}
