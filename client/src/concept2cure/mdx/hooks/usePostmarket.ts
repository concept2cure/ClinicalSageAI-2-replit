/**
 * usePostmarket — live data adapter for the Post-market vigilance surface.
 *
 * Calls `GET /api/mdx/postmarket` (cross-program). Endpoint not yet
 * implemented; surface stays in `defaultMode: 'fixture'` until
 * 2026-10-01 per the dataMode registry.
 */

import { useFetchJson } from './useFetchJson';
import {
  PV_CAPAS,
  PV_METRICS,
  PV_PMS_PLAN,
  PV_SIGNALS,
  PV_TRENDS,
} from '../data/postmarket';

type MetricsRow = (typeof PV_METRICS)[number];
type SignalRow = (typeof PV_SIGNALS)[number];
type CapaRow = (typeof PV_CAPAS)[number];
type PmsRow = (typeof PV_PMS_PLAN)[number];
type TrendRow = (typeof PV_TRENDS)[number];

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
  metrics: MetricsRow[] | null;
  signals: SignalRow[] | null;
  capas: CapaRow[] | null;
  pmsPlan: PmsRow[] | null;
  trends: TrendRow[] | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function usePostmarket(): UsePostmarketResult {
  const { data, loading, error, refresh } =
    useFetchJson<PostmarketPayload>('/api/mdx/postmarket');
  return {
    metrics: data?.data.metrics ?? null,
    signals: data?.data.signals ?? null,
    capas: data?.data.capas ?? null,
    pmsPlan: data?.data.pmsPlan ?? null,
    trends: data?.data.trends ?? null,
    loading,
    error,
    refresh,
  };
}
