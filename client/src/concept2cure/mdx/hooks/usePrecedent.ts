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

import { useCallback, useEffect, useState } from 'react';

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

export function useSavedPrecedentQueries(): UseSavedPrecedentQueriesResult {
  const [state, setState] = useState<{
    queries: SavedPrecedentQuery[] | null;
    loading: boolean;
    error: string | null;
  }>({ queries: null, loading: false, error: null });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));
    fetch('/api/saved-precedent-queries', { credentials: 'include' })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return (await res.json()) as ListPayload<SavedPrecedentQuery>;
      })
      .then((p) => {
        if (cancelled) return;
        setState({ queries: p.data, loading: false, error: null });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setState({ queries: null, loading: false, error: err instanceof Error ? err.message : 'Failed' });
      });
    return () => { cancelled = true; };
  }, [tick]);

  const create = useCallback(async (q: { label: string; query: string; scope?: SavedPrecedentQuery['scope'] }) => {
    try {
      const res = await fetch('/api/saved-precedent-queries', {
        method:  'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(q),
      });
      if (!res.ok) return null;
      const j = (await res.json()) as SinglePayload<SavedPrecedentQuery>;
      setTick((t) => t + 1);
      return j.data;
    } catch {
      return null;
    }
  }, []);

  const remove = useCallback(async (id: number) => {
    try {
      const res = await fetch(`/api/saved-precedent-queries/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (res.status !== 204) return false;
      setTick((t) => t + 1);
      return true;
    } catch {
      return false;
    }
  }, []);

  const refreshHits = useCallback(async (id: number, hits: number) => {
    try {
      const res = await fetch(`/api/saved-precedent-queries/${id}`, {
        method:  'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ hits, refresh: true }),
      });
      if (!res.ok) return null;
      const j = (await res.json()) as SinglePayload<SavedPrecedentQuery>;
      setTick((t) => t + 1);
      return j.data;
    } catch {
      return null;
    }
  }, []);

  return { ...state, create, remove, refreshHits };
}

export interface PortfolioInsight {
  kind: string;
  body: string;
}

export function usePortfolioInsights(): {
  insights: PortfolioInsight[] | null;
  loading: boolean;
  error: string | null;
} {
  const [state, setState] = useState<{
    insights: PortfolioInsight[] | null;
    loading: boolean;
    error: string | null;
  }>({ insights: null, loading: false, error: null });
  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));
    fetch('/api/regulatory-programs/portfolio-insights', { credentials: 'include' })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return (await res.json()) as ListPayload<PortfolioInsight>;
      })
      .then((p) => {
        if (cancelled) return;
        setState({ insights: p.data, loading: false, error: null });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setState({ insights: null, loading: false, error: err instanceof Error ? err.message : 'Failed' });
      });
    return () => { cancelled = true; };
  }, []);
  return state;
}
