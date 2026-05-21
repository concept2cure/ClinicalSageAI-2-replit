/**
 * useAnalytics — live data adapter for the Analytics surface.
 *
 * Calls `GET /api/mdx/analytics?pathway=:p`. Endpoint not yet
 * implemented; surface stays in `defaultMode: 'fixture'` until
 * 2026-10-15 per the dataMode registry.
 */

import { useFetchJson } from './useFetchJson';
import {
  ANL_ANA_USAGE,
  ANL_BLOCKERS,
  ANL_CYCLE_PHASES,
  ANL_KPIS,
  ANL_PACE_24M,
  ANL_REVIEWERS,
} from '../data/analytics';

type KpiRow = (typeof ANL_KPIS)[number];
type PhaseRow = (typeof ANL_CYCLE_PHASES)[number];
type BlockerRow = (typeof ANL_BLOCKERS)[number];
type ReviewerRow = (typeof ANL_REVIEWERS)[number];
type UsageRow = (typeof ANL_ANA_USAGE)[number];

interface AnalyticsPayload {
  data: {
    kpis: KpiRow[];
    phases: PhaseRow[];
    blockers: BlockerRow[];
    reviewers: ReviewerRow[];
    anaUsage: UsageRow[];
    pace24m: (typeof ANL_PACE_24M)[number][];
  };
}

export type AnalyticsPathway = 'all' | 'k510' | 'pma' | 'cer';

export interface UseAnalyticsResult {
  kpis: KpiRow[] | null;
  phases: PhaseRow[] | null;
  blockers: BlockerRow[] | null;
  reviewers: ReviewerRow[] | null;
  anaUsage: UsageRow[] | null;
  pace24m: (typeof ANL_PACE_24M)[number][] | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useAnalytics(pathway: AnalyticsPathway = 'all'): UseAnalyticsResult {
  const url = `/api/mdx/analytics?pathway=${encodeURIComponent(pathway)}`;
  const { data, loading, error, refresh } = useFetchJson<AnalyticsPayload>(url);
  return {
    kpis: data?.data.kpis ?? null,
    phases: data?.data.phases ?? null,
    blockers: data?.data.blockers ?? null,
    reviewers: data?.data.reviewers ?? null,
    anaUsage: data?.data.anaUsage ?? null,
    pace24m: data?.data.pace24m ?? null,
    loading,
    error,
    refresh,
  };
}
