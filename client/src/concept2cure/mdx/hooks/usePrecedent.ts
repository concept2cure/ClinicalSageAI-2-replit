/**
 * usePrecedent — saved queries + portfolio insights for PrecedentSurface.
 *
 *  useSavedPrecedentQueries() — CRUD over /api/saved-precedent-queries.
 *    Returns the list and three mutators (create, update, remove).
 *    Mutators auto-refresh the list after a successful round-trip.
 *
 *  usePortfolioInsights()     — GET /api/regulatory-programs/portfolio-insights
 *    Returns up to 3 data-derived insight strings (clearance mix,
 *    most-common predicate K-numbers, literature density). The kit
 *    panel renders them as bullet points; an empty list means the
 *    portfolio doesn't have enough state to compute insights yet
 *    (returned as a single "getting started" hint).
 */

import { useCallback } from 'react';
import { useFetchJson } from './useFetchJson';

export interface SavedPrecedentQuery {
  id: number;
  label: string;
  query: string;
  scope: {
    deviceClass?: string;
    productCode?: string;
    pathway?: '510k' | 'pma' | 'cer' | 'de_novo';
    dateFrom?: string;
    dateTo?: string;
    sources?: string[];
  } | null;
  hits: number;            /* -1 means not yet run */
  lastRunAt: string | null;
  userId: number | null;
  createdAt: string;
  updatedAt: string;
}

interface ListPayload<T> { data: T[] }
interface SinglePayload<T> { data: T }

export interface UseSavedPrecedentQueriesResult {
  queries: SavedPrecedentQuery[] | null;
  loading: boolean;
  error: string | null;
  create: (q: { label: string; query: string; scope?: SavedPrecedentQuery['scope'] }) => Promise<SavedPrecedentQuery | null>;
  remove: (id: number) => Promise<boolean>;
  refreshHits: (id: number, hits: number) => Promise<SavedPrecedentQuery | null>;
}

/**
 * CRUD hook for the org's saved precedent searches. List comes from
 * /api/saved-precedent-queries; create / remove / refreshHits POST /
 * DELETE / PATCH back to the same endpoint and auto-refresh the list
 * on success.
 *
 * @returns `{ queries, loading, error, create, remove, refreshHits }`.
 *   Mutators return the new row (or null on failure) for optimistic
 *   handling at the call site.
 */
export function useSavedPrecedentQueries(): UseSavedPrecedentQueriesResult {
  const { data, loading, error, refresh } =
    useFetchJson<ListPayload<SavedPrecedentQuery>>('/api/saved-precedent-queries');

  const create = useCallback(async (q: { label: string; query: string; scope?: SavedPrecedentQuery['scope'] }) => {
    try {
      const res = await fetch('/api/saved-precedent-queries', {
        method:      'POST',
        credentials: 'include',
        headers:     { 'Content-Type': 'application/json' },
        body:        JSON.stringify(q),
      });
      if (!res.ok) return null;
      const j = (await res.json()) as SinglePayload<SavedPrecedentQuery>;
      refresh();
      return j.data;
    } catch {
      return null;
    }
  }, [refresh]);

  const remove = useCallback(async (id: number) => {
    try {
      const res = await fetch(`/api/saved-precedent-queries/${id}`, {
        method:      'DELETE',
        credentials: 'include',
      });
      if (res.status !== 204) return false;
      refresh();
      return true;
    } catch {
      return false;
    }
  }, [refresh]);

  const refreshHits = useCallback(async (id: number, hits: number) => {
    try {
      const res = await fetch(`/api/saved-precedent-queries/${id}`, {
        method:      'PATCH',
        credentials: 'include',
        headers:     { 'Content-Type': 'application/json' },
        body:        JSON.stringify({ hits, refresh: true }),
      });
      if (!res.ok) return null;
      const j = (await res.json()) as SinglePayload<SavedPrecedentQuery>;
      refresh();
      return j.data;
    } catch {
      return null;
    }
  }, [refresh]);

  return { queries: data?.data ?? null, loading, error, create, remove, refreshHits };
}

export interface PortfolioInsight {
  kind: string;
  body: string;
}

/**
 * Fetch up to 3 cross-portfolio insights derived from the org's
 * actual data (clearance ratio, common predicate K-numbers, literature
 * density). When the portfolio has insufficient state to compute, the
 * server returns a single "getting started" hint.
 */
export function usePortfolioInsights(): {
  insights: PortfolioInsight[] | null;
  loading: boolean;
  error: string | null;
} {
  const { data, loading, error } =
    useFetchJson<ListPayload<PortfolioInsight>>('/api/regulatory-programs/portfolio-insights');
  return { insights: data?.data ?? null, loading, error };
}
