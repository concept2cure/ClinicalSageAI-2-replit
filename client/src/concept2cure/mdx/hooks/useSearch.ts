/**
 * useSearch — live data adapter for the Global search surface.
 *
 * Calls `GET /api/mdx/search?q=...` with optional filters. Endpoint
 * not yet wired; falls back to fixture.
 */

import { useFetchJson } from './useFetchJson';
import {
  SEARCH_KINDS,
  SEARCH_KPIS,
  SEARCH_RESULTS,
  SEARCH_SAVED,
} from '../data/search';

type KindRow = (typeof SEARCH_KINDS)[number];
type ResultRow = (typeof SEARCH_RESULTS)[number];
type KpiRow = (typeof SEARCH_KPIS)[number];
type SavedRow = (typeof SEARCH_SAVED)[number];

export interface SearchFilters {
  q?: string;
  kind?: string;
  surface?: string;
  program?: string;
  actor?: string;
  from?: string;
  to?: string;
}

interface SearchPayload {
  data: {
    results: ResultRow[];
    kinds: KindRow[];
    kpis: KpiRow[];
    saved: SavedRow[];
  };
}

export interface UseSearchResult {
  results: ResultRow[] | null;
  kinds: KindRow[] | null;
  kpis: KpiRow[] | null;
  saved: SavedRow[] | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useSearch(filters: SearchFilters = {}): UseSearchResult {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) {
    if (v) params.set(k, v);
  }
  const qs = params.toString();
  const url = `/api/mdx/search${qs ? `?${qs}` : ''}`;
  const { data, loading, error, refresh } = useFetchJson<SearchPayload>(url);
  return {
    results: data?.data.results ?? null,
    kinds: data?.data.kinds ?? null,
    kpis: data?.data.kpis ?? null,
    saved: data?.data.saved ?? null,
    loading,
    error,
    refresh,
  };
}
