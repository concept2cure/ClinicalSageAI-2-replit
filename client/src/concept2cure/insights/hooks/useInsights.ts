/**
 * React Query hooks for the Insights (Report-OS) surface.
 *
 * These mirror the conventions in `concept2cure/hooks/useProjects.ts`: import
 * `useQuery` / `useMutation` / `useQueryClient` from `@tanstack/react-query`,
 * spread the centralized query keys, and invalidate on settle. The hooks are
 * thin adapters over the typed `data/api.ts` client — no fetch logic lives here.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createReportRun,
  createSubscription,
  fetchOrgPortfolio,
  fetchPortfolio,
  fetchProgramGroups,
  fetchQuality,
  fetchRenderedReport,
  fetchReportTypes,
  fetchRunDependencies,
  fetchRuns,
  fetchSubscriptions,
  runPrediction,
  setSubscriptionEnabled,
} from '../data/api';
import type {
  CreateReportRunInput,
  CreateReportRunResult,
  CreateSubscriptionInput,
  FetchRunsParams,
  RenderedReport,
  ReportSubscriptionSummary,
  RunPredictionInput,
} from '../data/types';
import { insightsKeys } from './queryKeys';

/** Enabled report types from the taxonomy registry. */
export function useReportTypes() {
  return useQuery({
    queryKey: [...insightsKeys.reportTypes()],
    queryFn: () => fetchReportTypes(),
    staleTime: 1000 * 60 * 5,
  });
}

/** Report runs for the given filter params. */
export function useReportRuns(params: FetchRunsParams) {
  return useQuery({
    queryKey: [...insightsKeys.runs(params)],
    queryFn: () => fetchRuns(params),
    staleTime: 1000 * 30,
  });
}

/** Rendered report document for a run. Disabled until a runId is provided. */
export function useRenderedReport(runId: number | string | null | undefined) {
  return useQuery({
    queryKey: [...insightsKeys.rendered(runId ?? 'none')],
    queryFn: () => fetchRenderedReport(runId!),
    enabled: runId !== null && runId !== undefined && runId !== '',
    staleTime: 1000 * 60,
  });
}

/** Dependency-provider records for a run. Disabled until a runId is provided. */
export function useRunDependencies(runId: number | string | null | undefined) {
  return useQuery({
    queryKey: [...insightsKeys.dependencies(runId ?? 'none')],
    queryFn: () => fetchRunDependencies(runId!),
    enabled: runId !== null && runId !== undefined && runId !== '',
    staleTime: 1000 * 30,
  });
}

/** Program groups for an organization. Disabled until an orgId is provided. */
export function useProgramGroups(orgId: number | string | null | undefined) {
  return useQuery({
    queryKey: [...insightsKeys.programGroups(orgId ?? 'none')],
    queryFn: () => fetchProgramGroups(orgId!),
    enabled: orgId !== null && orgId !== undefined && orgId !== '',
    staleTime: 1000 * 60,
  });
}

/**
 * Generate a new report run. Invalidates the runs cache on settle so a partial
 * server write is reconciled on the next fetch (mirrors useProjects' onSettled).
 */
export function useGenerateReport() {
  const queryClient = useQueryClient();
  return useMutation<CreateReportRunResult, Error, CreateReportRunInput>({
    mutationFn: (input: CreateReportRunInput) => createReportRun(input),
    onSettled: (_data, _error, input) => {
      queryClient.invalidateQueries({
        queryKey: [...insightsKeys.runs({
          organizationId: input.organizationId,
          scopeType: input.scopeType,
          scopeId: input.scopeId,
        })],
      });
      // Also invalidate the broad runs namespace so list views with other
      // filter params pick up the new run.
      queryClient.invalidateQueries({ queryKey: ['concept2cure', 'insights', 'runs'] });
    },
  });
}

/**
 * The board-pack rollup for a program group (enterprise). Disabled until a
 * programGroupId is provided. A 403 (below the enterprise tier) surfaces as the
 * query error so the caller can render an honest Locked state.
 */
export function usePortfolio(programGroupId: number | string | null | undefined) {
  return useQuery({
    queryKey: [...insightsKeys.portfolio(programGroupId ?? 'none')],
    queryFn: () => fetchPortfolio(programGroupId!),
    enabled: programGroupId !== null && programGroupId !== undefined && programGroupId !== '',
    staleTime: 1000 * 60,
    retry: false, // don't retry a 403/422 — it is a stable entitlement/data state
  });
}

/**
 * The org-wide portfolio rollup across all top-level programs (enterprise). A
 * 403 (below the enterprise tier) or 404 (no programs) surfaces as the query
 * error so the caller renders an honest Locked / empty state.
 */
export function useOrgPortfolio(enabled = true) {
  return useQuery({
    queryKey: [...insightsKeys.orgPortfolio()],
    queryFn: () => fetchOrgPortfolio(),
    enabled,
    staleTime: 1000 * 60,
    retry: false,
  });
}

/**
 * Run a LIVE, entitlement-gated prediction (readiness forecast or CRL/RTF
 * pre-mortem). A 403 (tier) or 422 (no assessment yet) surfaces as the mutation
 * error so the caller renders the honest Locked / no-data state — never a
 * fabricated report.
 */
export function useRunPrediction() {
  return useMutation<RenderedReport, Error, RunPredictionInput>({
    mutationFn: (input: RunPredictionInput) => runPrediction(input),
  });
}

/** The org's scheduled-report subscriptions. */
export function useSubscriptions() {
  return useQuery({
    queryKey: [...insightsKeys.subscriptions()],
    queryFn: () => fetchSubscriptions(),
    staleTime: 1000 * 30,
  });
}

/** Create a scheduled-report subscription; invalidates the subscriptions list. */
export function useCreateSubscription() {
  const queryClient = useQueryClient();
  return useMutation<ReportSubscriptionSummary, Error, CreateSubscriptionInput>({
    mutationFn: (input: CreateSubscriptionInput) => createSubscription(input),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: [...insightsKeys.subscriptions()] });
    },
  });
}

/** Enable/disable a subscription; invalidates the subscriptions list on settle. */
export function useSetSubscriptionEnabled() {
  const queryClient = useQueryClient();
  return useMutation<ReportSubscriptionSummary, Error, { id: number | string; enabled: boolean }>({
    mutationFn: ({ id, enabled }) => setSubscriptionEnabled(id, enabled),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: [...insightsKeys.subscriptions()] });
    },
  });
}

/**
 * Prediction calibration + provider freshness (ADMIN-only). A 403 (non-admin or
 * no tenant) surfaces as the query error. Disabled by default; pass
 * `enabled: true` from an admin-gated view.
 */
export function useQuality(enabled = false) {
  return useQuery({
    queryKey: [...insightsKeys.quality()],
    queryFn: () => fetchQuality(),
    enabled,
    staleTime: 1000 * 60,
    retry: false,
  });
}
