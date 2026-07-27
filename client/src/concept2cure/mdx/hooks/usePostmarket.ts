/**
 * usePostmarket — live adapter for the Post-market vigilance surface.
 *
 * Calls `GET /api/mdx/postmarket` (cross-program), which reads real
 * vigilance_events and capa_records for the caller's tenant.
 *
 * Each panel is a `DataState`, so the surface must declare whether it is
 * loading, idle, errored, empty or showing real records. Vigilance is
 * the surface where a fixture fallback is least acceptable: an example
 * complaint feed showing "0 critical signals" reads as an all-clear on
 * a workspace whose real feed simply failed to load.
 *
 * `pmsPlan` and `trends` have no backing store yet — the route returns
 * empty arrays for them, which surfaces as an honest empty state rather
 * than a fabricated surveillance plan.
 */

import { useFetchJson } from './useFetchJson';
import { toDataState, type DataState } from '../lib/dataState';
import type {
  PV_CAPAS,
  PV_METRICS,
  PV_PMS_PLAN,
  PV_SIGNALS,
  PV_TRENDS,
} from '../data/postmarket';

export type MetricsRow = (typeof PV_METRICS)[number];
export type SignalRow = (typeof PV_SIGNALS)[number];
export type CapaRow = (typeof PV_CAPAS)[number];
export type PmsRow = (typeof PV_PMS_PLAN)[number];
export type TrendRow = (typeof PV_TRENDS)[number];

interface PostmarketPayload {
  data: {
    metrics: MetricsRow[];
    signals: SignalRow[];
    capas: CapaRow[];
    pmsPlan: PmsRow[];
    trends: TrendRow[];
  };
}

export interface UsePostmarketResult {
  metrics: DataState<MetricsRow[]>;
  signals: DataState<SignalRow[]>;
  capas: DataState<CapaRow[]>;
  pmsPlan: DataState<PmsRow[]>;
  trends: DataState<TrendRow[]>;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function usePostmarket(): UsePostmarketResult {
  const { data, loading, error, refresh } =
    useFetchJson<PostmarketPayload>('/api/mdx/postmarket');

  const state = <T,>(rows: T | undefined): DataState<T> =>
    toDataState(rows ?? null, loading, error);

  return {
    metrics: state(data?.data.metrics),
    signals: state(data?.data.signals),
    capas: state(data?.data.capas),
    pmsPlan: state(data?.data.pmsPlan),
    trends: state(data?.data.trends),
    loading,
    error,
    refresh,
  };
}
