/**
 * useAnalytics — live data adapter for the Analytics surface.
 *
 * Calls `GET /api/mdx/analytics?pathway=:p` (server/routes/mdx-analytics.ts).
 * A field the payload does not carry is null — not read — never example rows.
 */

import { useFetchJson } from './useFetchJson';
import type {
  AnalyticsBlockerRow as BlockerRow,
  AnalyticsKpiRow as KpiRow,
  AnalyticsPhaseRow as PhaseRow,
  AnalyticsReviewerRow as ReviewerRow,
  AnalyticsUsageRow as UsageRow,
} from '../data/analytics';

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
    kpis: d?.kpis ?? null,
    phases: d?.phases ?? null,
    blockers: d?.blockers ?? null,
    reviewers: d?.reviewers ?? null,
    anaUsage: d?.anaUsage ?? null,
    pace24m: d?.pace24m ?? null,
  };
}

export function useAnalytics(pathway: AnalyticsPathway = 'all'): UseAnalyticsResult {
  const url = `/api/mdx/analytics?pathway=${encodeURIComponent(pathway)}`;
  const { data, loading, error, refresh } = useFetchJson<AnalyticsPayload>(url);
  return {
    ...selectAnalytics(data),
    loading,
    error,
    refresh,
  };
}
