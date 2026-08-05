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
import { type DataState } from '../lib/dataState';
import { isRecord, shapeMismatch, toRowsState } from '../lib/payloadShape';
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

const PATH = '/api/mdx/postmarket';

export function usePostmarket(): UsePostmarketResult {
  const { data, loading, error, refresh } = useFetchJson<PostmarketPayload>(PATH);

  /*
   * `data?.data.metrics` — the `?.` stopped at the envelope, so a 200 that isn't
   * `{ data: { … } }` made `.metrics` a read off `undefined` and threw during
   * render. On the vigilance surface that is the worst place to lose the
   * distinction: the user needs "we couldn't load your signals" and got "this
   * surface is broken", which reads as a bug in the page rather than a gap in
   * the safety feed.
   */
  const panels = isRecord(data) && isRecord(data.data) ? data.data : null;
  const failed = error ?? (data != null && panels === null ? shapeMismatch(PATH) : null);

  const state = <T,>(rows: unknown): DataState<T[]> =>
    toRowsState<T>(rows, loading, failed, { source: PATH });

  return {
    metrics: state<MetricsRow>(panels?.metrics),
    signals: state<SignalRow>(panels?.signals),
    capas: state<CapaRow>(panels?.capas),
    pmsPlan: state<PmsRow>(panels?.pmsPlan),
    trends: state<TrendRow>(panels?.trends),
    loading,
    error: failed,
    refresh,
  };
}
