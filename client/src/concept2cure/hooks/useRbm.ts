/**
 * @fileoverview Risk-Based Monitoring (RBM / RBQM) React hooks
 * @module concept2cure/hooks/useRbm
 *
 * React-query hooks for the ICH E6(R3)/E8(R1) conduct-layer monitoring
 * workstream. Mirrors useRisk: structured query keys, query hooks for reads,
 * mutation hooks that invalidate the right keys. Binds to rbmService, which
 * calls the live /api/mdx/rbm-* routes. No mocks.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import rbmService, {
  type RbmAssessment,
  type RbmAssessmentDetail,
  type RbmRiskItem,
  type RbmRiskItemCreate,
  type RbmRiskItemPatch,
  type RbmKri,
  type RbmKriValue,
  type RbmKriCreate,
  type RbmKriPatch,
  type RbmQtl,
  type RbmQtlCreate,
  type RbmQtlPatch,
  type RbmSignal,
  type RbmSignalCreate,
  type RbmSiteRisk,
  type RbmPlan,
  type RbmPlanCreate,
  type RbmAction,
  type RbmActionCreate,
  type RbmSummary,
} from '../services/rbmService';

export const rbmQueryKeys = {
  all: ['rbm'] as const,
  assessments: (programId?: string) => [...rbmQueryKeys.all, 'assessments', programId ?? ''] as const,
  assessment: (id: number) => [...rbmQueryKeys.all, 'assessment', id] as const,
  items: (programId?: string) => [...rbmQueryKeys.all, 'items', programId ?? ''] as const,
  kris: (programId?: string) => [...rbmQueryKeys.all, 'kris', programId ?? ''] as const,
  qtls: (programId?: string) => [...rbmQueryKeys.all, 'qtls', programId ?? ''] as const,
  signals: (programId?: string) => [...rbmQueryKeys.all, 'signals', programId ?? ''] as const,
  siteRisk: (programId: string) => [...rbmQueryKeys.all, 'siteRisk', programId] as const,
  plans: (programId?: string) => [...rbmQueryKeys.all, 'plans', programId ?? ''] as const,
  plan: (id: number) => [...rbmQueryKeys.all, 'plan', id] as const,
  summary: (programId: string) => [...rbmQueryKeys.all, 'summary', programId] as const,
};

const enabledUuid = (programId: string | null) => programId != null && programId.length > 0;

// ── Queries ──────────────────────────────────────────────────────────────────

export function useRbmSummary(programId: string | null) {
  return useQuery<RbmSummary | null>({
    queryKey: rbmQueryKeys.summary(programId ?? ''),
    queryFn: () => (programId ? rbmService.getSummary(programId) : null),
    enabled: enabledUuid(programId),
    staleTime: 60 * 1000,
  });
}

export function useRbmAssessments(programId: string | null) {
  return useQuery<RbmAssessment[]>({
    queryKey: rbmQueryKeys.assessments(programId ?? ''),
    queryFn: () => rbmService.listAssessments(programId ?? undefined),
    enabled: enabledUuid(programId),
    staleTime: 2 * 60 * 1000,
  });
}

export function useRbmAssessment(id: number | null) {
  return useQuery<RbmAssessmentDetail | null>({
    queryKey: rbmQueryKeys.assessment(id ?? -1),
    queryFn: () => (id ? rbmService.getAssessment(id) : null),
    enabled: id != null,
    staleTime: 60 * 1000,
  });
}

export function useRbmItems(programId: string | null) {
  return useQuery<RbmRiskItem[]>({
    queryKey: rbmQueryKeys.items(programId ?? ''),
    queryFn: () => rbmService.listItems(programId ?? undefined),
    enabled: enabledUuid(programId),
    staleTime: 2 * 60 * 1000,
  });
}

export function useRbmKris(programId: string | null) {
  return useQuery<RbmKri[]>({
    queryKey: rbmQueryKeys.kris(programId ?? ''),
    queryFn: () => rbmService.listKris(programId ?? undefined),
    enabled: enabledUuid(programId),
    staleTime: 2 * 60 * 1000,
  });
}

export function useRbmQtls(programId: string | null) {
  return useQuery<RbmQtl[]>({
    queryKey: rbmQueryKeys.qtls(programId ?? ''),
    queryFn: () => rbmService.listQtls(programId ?? undefined),
    enabled: enabledUuid(programId),
    staleTime: 2 * 60 * 1000,
  });
}

export function useRbmSignals(programId: string | null, status?: string) {
  return useQuery<RbmSignal[]>({
    queryKey: [...rbmQueryKeys.signals(programId ?? ''), status ?? ''],
    queryFn: () => rbmService.listSignals(programId ?? undefined, status),
    enabled: enabledUuid(programId),
    staleTime: 60 * 1000,
  });
}

export function useRbmSiteRisk(programId: string | null) {
  return useQuery<RbmSiteRisk[]>({
    queryKey: rbmQueryKeys.siteRisk(programId ?? ''),
    queryFn: () => (programId ? rbmService.listSiteRisk(programId) : Promise.resolve([])),
    enabled: enabledUuid(programId),
    staleTime: 60 * 1000,
  });
}

export function useRbmPlans(programId: string | null) {
  return useQuery<RbmPlan[]>({
    queryKey: rbmQueryKeys.plans(programId ?? ''),
    queryFn: () => rbmService.listPlans(programId ?? undefined),
    enabled: enabledUuid(programId),
    staleTime: 2 * 60 * 1000,
  });
}

export function useRbmActions(planId: number | null, programId: string | null) {
  return useQuery<RbmAction[]>({
    queryKey: [...rbmQueryKeys.all, 'actions', planId ?? -1, programId ?? ''] as const,
    queryFn: () => rbmService.listActions(planId ?? undefined, programId ?? undefined),
    enabled: planId != null || enabledUuid(programId),
    staleTime: 60 * 1000,
  });
}

// ── Mutations ─────────────────────────────────────────────────────────────────

function useInvalidateProgram(programId: string | null) {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: rbmQueryKeys.all });
    if (programId) qc.invalidateQueries({ queryKey: rbmQueryKeys.summary(programId) });
  };
}

export function useSeedRbmAssessment(programId: string | null) {
  const invalidate = useInvalidateProgram(programId);
  return useMutation<RbmAssessmentDetail, Error, { title?: string }>({
    mutationFn: ({ title }) => rbmService.seedAssessment(programId ?? '', title),
    onSuccess: invalidate,
  });
}

export function useCreateRbmItem(programId: string | null) {
  const invalidate = useInvalidateProgram(programId);
  return useMutation<RbmRiskItem, Error, RbmRiskItemCreate>({
    mutationFn: (data) => rbmService.createItem(data),
    onSuccess: invalidate,
  });
}

export function useUpdateRbmItem(programId: string | null) {
  const invalidate = useInvalidateProgram(programId);
  return useMutation<RbmRiskItem, Error, { id: number; patch: RbmRiskItemPatch }>({
    mutationFn: ({ id, patch }) => rbmService.updateItem(id, patch),
    onSuccess: invalidate,
  });
}

export function useRbmKriValues(kriId: number | null) {
  return useQuery<RbmKriValue[]>({
    queryKey: [...rbmQueryKeys.all, 'kriValues', kriId ?? -1] as const,
    queryFn: () => (kriId ? rbmService.listKriValues(kriId) : Promise.resolve([])),
    enabled: kriId != null,
    staleTime: 60 * 1000,
  });
}

export function useAppendRbmKriValue(programId: string | null) {
  const qc = useQueryClient();
  const invalidate = useInvalidateProgram(programId);
  return useMutation<RbmKriValue, Error, { kriId: number; value: number; observedAt?: string | null; note?: string | null }>({
    mutationFn: ({ kriId, value, observedAt, note }) => rbmService.appendKriValue(kriId, { value, observedAt, note }),
    onSuccess: (_data, { kriId }) => {
      invalidate();
      qc.invalidateQueries({ queryKey: [...rbmQueryKeys.all, 'kriValues', kriId] });
    },
  });
}

export function useSeedRbmKris(programId: string | null) {
  const invalidate = useInvalidateProgram(programId);
  return useMutation<RbmKri[], Error, void>({
    mutationFn: () => rbmService.seedKris(programId ?? ''),
    onSuccess: invalidate,
  });
}

export function useCreateRbmKri(programId: string | null) {
  const invalidate = useInvalidateProgram(programId);
  return useMutation<RbmKri, Error, RbmKriCreate>({
    mutationFn: (data) => rbmService.createKri(data),
    onSuccess: invalidate,
  });
}

export function useUpdateRbmKri(programId: string | null) {
  const invalidate = useInvalidateProgram(programId);
  return useMutation<RbmKri, Error, { id: number; patch: RbmKriPatch }>({
    mutationFn: ({ id, patch }) => rbmService.updateKri(id, patch),
    onSuccess: invalidate,
  });
}

export function useSeedRbmQtls(programId: string | null) {
  const invalidate = useInvalidateProgram(programId);
  return useMutation<RbmQtl[], Error, void>({
    mutationFn: () => rbmService.seedQtls(programId ?? ''),
    onSuccess: invalidate,
  });
}

export function useCreateRbmQtl(programId: string | null) {
  const invalidate = useInvalidateProgram(programId);
  return useMutation<RbmQtl, Error, RbmQtlCreate>({
    mutationFn: (data) => rbmService.createQtl(data),
    onSuccess: invalidate,
  });
}

export function useUpdateRbmQtl(programId: string | null) {
  const invalidate = useInvalidateProgram(programId);
  return useMutation<RbmQtl, Error, { id: number; patch: RbmQtlPatch }>({
    mutationFn: ({ id, patch }) => rbmService.updateQtl(id, patch),
    onSuccess: invalidate,
  });
}

export function useCreateRbmSignal(programId: string | null) {
  const invalidate = useInvalidateProgram(programId);
  return useMutation<RbmSignal, Error, RbmSignalCreate>({
    mutationFn: (data) => rbmService.createSignal(data),
    onSuccess: invalidate,
  });
}

export function useUpdateRbmSignal(programId: string | null) {
  const invalidate = useInvalidateProgram(programId);
  return useMutation<RbmSignal, Error, { id: number; patch: Parameters<typeof rbmService.updateSignal>[1] }>({
    mutationFn: ({ id, patch }) => rbmService.updateSignal(id, patch),
    onSuccess: invalidate,
  });
}

export function useRecomputeSiteRisk(programId: string | null) {
  const invalidate = useInvalidateProgram(programId);
  return useMutation<unknown[], Error, void>({
    mutationFn: () => rbmService.recomputeSiteRisk(programId ?? ''),
    onSuccess: invalidate,
  });
}

export function useCreateRbmPlan(programId: string | null) {
  const invalidate = useInvalidateProgram(programId);
  return useMutation<RbmPlan, Error, RbmPlanCreate>({
    mutationFn: (data) => rbmService.createPlan(data),
    onSuccess: invalidate,
  });
}

export function useCreateRbmAction(programId: string | null) {
  const invalidate = useInvalidateProgram(programId);
  return useMutation<RbmAction, Error, RbmActionCreate>({
    mutationFn: (data) => rbmService.createAction(data),
    onSuccess: invalidate,
  });
}
