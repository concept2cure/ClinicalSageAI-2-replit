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
  fetchProgramGroups,
  fetchRenderedReport,
  fetchReportTypes,
  fetchRunDependencies,
  fetchRuns,
} from '../data/api';
import type {
  CreateReportRunInput,
  CreateReportRunResult,
  FetchRunsParams,
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
