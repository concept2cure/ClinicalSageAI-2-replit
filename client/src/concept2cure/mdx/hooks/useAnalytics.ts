/**
 * useAnalytics — live data adapter for the Analytics surface.
 *
 * Metrics and saved reports have independent authorized sources. A failed
 * source stays unavailable rather than becoming a successful empty register.
 */

import { useFetchJson } from './useFetchJson';
import type {
  AnalyticsBlockerRow as AnalyticsSourceBlockerRow,
  AnalyticsKpiRow as KpiRow,
  AnalyticsPhaseRow as PhaseRow,
  AnalyticsReviewerRow as ReviewerRow,
  AnalyticsUsageRow as UsageRow,
} from '../data/analytics';

type BlockerRow = Omit<AnalyticsSourceBlockerRow, 'median' | 'owner' | 'trend'> & {
  median: number | null; owner: string | null; trend: string | null;
};

interface AnalyticsPayload {
  data: {
    kpis: KpiRow[];
    phases: PhaseRow[];
    blockers: BlockerRow[];
    reviewers: ReviewerRow[];
    anaUsage: UsageRow[];
    pace24m: number[];
  };
}

export type AnalyticsPathway = 'all' | 'k510' | 'pma' | 'cer';

export interface UseAnalyticsResult {
  kpis: KpiRow[] | null;
  phases: PhaseRow[] | null;
  blockers: BlockerRow[] | null;
  reviewers: ReviewerRow[] | null;
  anaUsage: UsageRow[] | null;
  pace24m: number[] | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
  reports: AnalyticsSavedReport[] | null;
  reportsTotal: number | null;
  reportsHasMore: boolean;
  reportsLoading: boolean;
  reportsError: string | null;
  refreshReports: () => void;
}

/** Recorded report-run metadata only; no inferred authoring or signature state. */
export interface AnalyticsSavedReport {
  id: number;
  reportTypeId: string;
  reportTypeLabel?: string;
  status: string;
  scopeType: string;
  scopeId?: string;
  scopeLabel?: string | null;
  computedScope?: string;
  createdAt?: string;
  updatedAt?: string;
}

export function selectAnalyticsReports(payload: unknown): {
  reports: AnalyticsSavedReport[]; total: number; hasMore: boolean;
} | null {
  const value = payload as { data?: unknown; meta?: { total?: unknown; hasMore?: unknown } } | null;
  if (!Array.isArray(value?.data) || typeof value?.meta?.total !== 'number' ||
      !Number.isSafeInteger(value.meta.total) || value.meta.total < value.data.length ||
      typeof value.meta.hasMore !== 'boolean') return null;
  if (!value.data.every((row) => row && typeof row === 'object' &&
      Number.isSafeInteger(row.id) && row.id > 0 && typeof row.reportTypeId === 'string' &&
      typeof row.status === 'string' && typeof row.scopeType === 'string')) return null;
  return { reports: value.data, total: value.meta.total, hasMore: value.meta.hasMore };
}

/**
 * Map the analytics payload to the surface fields. Pure + null-safe: a payload
 * shaped `{ data: null }` or `{}` (or undefined) yields all-null rather than
 * throwing on the second-level property access.
 */
export function selectAnalytics(
  payload: AnalyticsPayload | null | undefined
): Pick<UseAnalyticsResult, 'kpis' | 'phases' | 'blockers' | 'reviewers' | 'anaUsage' | 'pace24m'> {
  const d = payload?.data ?? null;
  return {
    kpis: Array.isArray(d?.kpis) ? d.kpis : null,
    phases: Array.isArray(d?.phases) ? d.phases : null,
    blockers: Array.isArray(d?.blockers) ? d.blockers : null,
    reviewers: Array.isArray(d?.reviewers) ? d.reviewers : null,
    anaUsage: Array.isArray(d?.anaUsage) ? d.anaUsage : null,
    pace24m: Array.isArray(d?.pace24m) ? d.pace24m : null,
  };
}

export function useAnalytics(pathway: AnalyticsPathway = 'all'): UseAnalyticsResult {
  const url = `/api/mdx/analytics?pathway=${encodeURIComponent(pathway)}`;
  const { data, loading, error, refresh } = useFetchJson<AnalyticsPayload>(url);
  const selected = selectAnalytics(data);
  const library = useFetchJson<unknown>('/api/report-os/runs?limit=100&sortBy=createdAt&sortOrder=desc');
  const selectedReports = selectAnalyticsReports(library.data);
  return {
    ...selected,
    loading: loading || (data === null && error === null),
    error: error ?? (data !== null && (!selected.kpis || !selected.blockers || !selected.pace24m)
      ? 'Invalid analytics response' : null),
    refresh,
    reports: selectedReports?.reports ?? null,
    reportsTotal: selectedReports?.total ?? null,
    reportsHasMore: selectedReports?.hasMore ?? false,
    reportsLoading: library.loading || (library.data === null && library.error === null),
    reportsError: library.error ?? (library.data !== null && !selectedReports ? 'Invalid report register response' : null),
    refreshReports: library.refresh,
  };
}
