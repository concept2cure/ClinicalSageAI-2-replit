/**
 * Submission Center data hooks (React Query)
 *
 * One hook per endpoint, on top of submissionClient. A dropped-in UI kit calls
 * these — e.g. `const { data } = useSubmissions()` — and gets typed data,
 * loading/error state, and cache invalidation for free. The QueryClientProvider
 * is already mounted in main.tsx. See _install/README.md.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { submissionClient } from './submissionClient';
import type {
  CreateSubmissionRequest,
  CreateSequenceRequest,
  TransitionSequenceRequest,
  UpsertLeafRequest,
  PlanRequest,
  ValidationExplainRequest,
  CrossRegionRequest,
  DispatchQcRequest,
  ConsistencyCheckRequest,
  ShadowReviewRequest,
} from '@shared/types/submission-api';

// Stable query keys (export so kits can invalidate/prefetch consistently).
export const submissionKeys = {
  all: ['submissions'] as const,
  list: () => [...submissionKeys.all, 'list'] as const,
  detail: (id: number) => [...submissionKeys.all, 'detail', id] as const,
  sequences: (id: number) => [...submissionKeys.all, id, 'sequences'] as const,
  leaves: (seqId: number) => [...submissionKeys.all, 'seq', seqId, 'leaves'] as const,
  consistency: (id: number) => [...submissionKeys.all, id, 'consistency'] as const,
  shadow: (seqId: number) => [...submissionKeys.all, 'seq', seqId, 'shadow'] as const,
  shadowFindings: (runId: number) => [...submissionKeys.all, 'shadow', runId, 'findings'] as const,
  provenance: (id: number, section: string) => [...submissionKeys.all, id, 'provenance', section] as const,
  regionProfiles: ['region-profiles'] as const,
};

// ── Queries ──────────────────────────────────────────────────────────────────
export const useSubmissions = () => useQuery({ queryKey: submissionKeys.list(), queryFn: submissionClient.listSubmissions });
export const useSubmission = (id: number) =>
  useQuery({ queryKey: submissionKeys.detail(id), queryFn: () => submissionClient.getSubmission(id), enabled: Number.isFinite(id) });
export const useSequences = (id: number) =>
  useQuery({ queryKey: submissionKeys.sequences(id), queryFn: () => submissionClient.listSequences(id), enabled: Number.isFinite(id) });
export const useLeaves = (seqId: number) =>
  useQuery({ queryKey: submissionKeys.leaves(seqId), queryFn: () => submissionClient.listLeaves(seqId), enabled: Number.isFinite(seqId) });
export const useConsistencyFindings = (id: number) =>
  useQuery({ queryKey: submissionKeys.consistency(id), queryFn: () => submissionClient.listConsistency(id), enabled: Number.isFinite(id) });
export const useProvenance = (id: number, section: string) =>
  useQuery({ queryKey: submissionKeys.provenance(id, section), queryFn: () => submissionClient.provenance(id, section), enabled: Number.isFinite(id) && !!section });
export const useShadowReviews = (seqId: number) =>
  useQuery({ queryKey: submissionKeys.shadow(seqId), queryFn: () => submissionClient.listShadowReviews(seqId), enabled: Number.isFinite(seqId) });
export const useShadowFindings = (runId: number) =>
  useQuery({ queryKey: submissionKeys.shadowFindings(runId), queryFn: () => submissionClient.shadowFindings(runId), enabled: Number.isFinite(runId) });
export const useRegionProfiles = () => useQuery({ queryKey: submissionKeys.regionProfiles, queryFn: submissionClient.regionProfiles, staleTime: 1000 * 60 * 60 });

// ── Mutations (invalidate the relevant cache on success) ──────────────────────
export function useCreateSubmission() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (b: CreateSubmissionRequest) => submissionClient.createSubmission(b),
    onSuccess: () => qc.invalidateQueries({ queryKey: submissionKeys.list() }),
  });
}
export function useCreateSequence(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (b: CreateSequenceRequest) => submissionClient.createSequence(id, b),
    onSuccess: () => qc.invalidateQueries({ queryKey: submissionKeys.sequences(id) }),
  });
}
export function useTransitionSequence(submissionId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { seqId: number; body: TransitionSequenceRequest }) => submissionClient.transitionSequence(vars.seqId, vars.body),
    onSuccess: () => qc.invalidateQueries({ queryKey: submissionKeys.sequences(submissionId) }),
  });
}
export function useUpsertLeaf(seqId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (b: UpsertLeafRequest) => submissionClient.upsertLeaf(seqId, b),
    onSuccess: () => qc.invalidateQueries({ queryKey: submissionKeys.leaves(seqId) }),
  });
}
export const usePlan = (id: number) => useMutation({ mutationFn: (b: PlanRequest) => submissionClient.plan(id, b) });
export const useExplainValidation = (id: number) => useMutation({ mutationFn: (b: ValidationExplainRequest) => submissionClient.explainValidation(id, b) });
export const useCrossRegion = (id: number) => useMutation({ mutationFn: (b: CrossRegionRequest) => submissionClient.crossRegion(id, b) });
export const useDispatchQc = (id: number) => useMutation({ mutationFn: (b: DispatchQcRequest) => submissionClient.dispatchQc(id, b) });
export function useRunConsistency(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (b: ConsistencyCheckRequest) => submissionClient.runConsistency(id, b),
    onSuccess: () => qc.invalidateQueries({ queryKey: submissionKeys.consistency(id) }),
  });
}
export function useRunShadowReview(seqId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (b: ShadowReviewRequest = {}) => submissionClient.runShadowReview(seqId, b),
    onSuccess: () => qc.invalidateQueries({ queryKey: submissionKeys.shadow(seqId) }),
  });
}
