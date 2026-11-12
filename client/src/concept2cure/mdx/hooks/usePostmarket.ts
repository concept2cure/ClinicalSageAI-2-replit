/**
 * usePostmarket — live adapter for the Post-market vigilance surface.
 *
 * Calls `GET /api/mdx/postmarket?program_id=<the open project>`, which reads
 * real vigilance_events and capa_records for that project, after the caller's
 * current access to it (P-122, 2026-11-10; until then the read took no project
 * and returned the whole organisation's). `scope` is the server's own word for
 * whose rows these are (`meta.scope`): the screen draws its surveillance panels
 * only when it is 'program'. With no project nothing is read.
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
import type { PvCapaRow, PvMetricRow, PvPmsRow, PvSignalRow, PvTrendRow } from '../data/postmarket';

export type MetricsRow = PvMetricRow;
export type SignalRow = PvSignalRow;
export type CapaRow = PvCapaRow;
export type PmsRow = PvPmsRow;
export type TrendRow = PvTrendRow;

interface PostmarketPayload {
  data: {
    metrics: MetricsRow[];
    signals: SignalRow[];
    capas: CapaRow[];
    pmsPlan: PmsRow[];
    trends: TrendRow[];
  };
  meta?: { scope?: unknown };
}

/** Whose rows the read returned, as the server says; null while unread, after a failure, or when unsaid. */
export type PostmarketScope = 'program' | 'organization' | null;

export interface UsePostmarketResult {
  metrics: DataState<MetricsRow[]>;
  signals: DataState<SignalRow[]>;
  capas: DataState<CapaRow[]>;
  pmsPlan: DataState<PmsRow[]>;
  trends: DataState<TrendRow[]>;
  scope: PostmarketScope;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

const PATH = '/api/mdx/postmarket';

export function usePostmarket(programId: string | null): UsePostmarketResult {
  const path = programId ? `${PATH}?program_id=${encodeURIComponent(programId)}` : null;
  const { data, loading, error, refresh } = useFetchJson<PostmarketPayload>(path);

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
  const said = panels && isRecord(data) && isRecord(data.meta) ? data.meta.scope : null;
  const scope: PostmarketScope = !failed && (said === 'program' || said === 'organization') ? said : null;

  const state = <T,>(rows: unknown): DataState<T[]> =>
    toRowsState<T>(rows, loading, failed, { source: PATH });

  return {
    metrics: state<MetricsRow>(panels?.metrics),
    signals: state<SignalRow>(panels?.signals),
    capas: state<CapaRow>(panels?.capas),
    pmsPlan: state<PmsRow>(panels?.pmsPlan),
    trends: state<TrendRow>(panels?.trends),
    scope,
    loading,
    error: failed,
    refresh,
  };
}
