/**
 * useSearch — live data adapter for the Global search surface.
 *
 * Calls `GET /api/mdx/search?q=...`. The server (server/routes/mdx-search.ts)
 * returns hits grouped by source type ({ program: [...], qms_document: [...] })
 * via the ok() envelope; this hook flattens + maps them to the kit's flat
 * ResultRow shape. The fetch is skipped until a non-empty query is present
 * (the route 422s on a missing `q`), so the empty surface stays on fixtures.
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

/** A single hit from the server fan-out. */
interface ServerSearchHit {
  type: string;
  id: string;
  title: string;
  snippet: string | null;
  url?: string;
  metadata?: Record<string, unknown> | null;
}

/** Map server source-type → kit kind id (SEARCH_KINDS). */
const TYPE_TO_KIND: Record<string, ResultRow['kind']> = {
  program: 'artifact',
  artifact: 'artifact',
  section: 'section',
  qms_document: 'section',
  audit: 'audit',
  audit_event: 'audit',
  conversation: 'conversation',
  memory: 'memory',
  notification: 'notification',
};

function adaptHits(grouped: Record<string, ServerSearchHit[]> | null): ResultRow[] {
  if (!grouped) return [];
  const out: ResultRow[] = [];
  for (const hits of Object.values(grouped)) {
    for (const h of hits) {
      const meta = h.metadata ?? {};
      out.push({
        id: h.id,
        kind: TYPE_TO_KIND[h.type] ?? 'artifact',
        program: String(meta.program ?? meta.code ?? ''),
        surface: String(meta.surface ?? ''),
        title: h.title,
        snippet: h.snippet ?? '',
        author: String(meta.author ?? ''),
        when: String(meta.when ?? ''),
        refId: h.id,
      } as ResultRow);
    }
  }
  return out;
}

export interface SearchFilters {
  q?: string;
  kind?: string;
  surface?: string;
  program?: string;
  actor?: string;
  from?: string;
  to?: string;
}

/** Server envelope: ok(res, grouped, meta) → { data: grouped, ...meta }. */
interface SearchPayload {
  data: Record<string, ServerSearchHit[]>;
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
  // Skip the request until the user has typed a query — the route requires
  // `q` and 422s without it. Null url keeps the surface in fixture state.
  const url = filters.q && filters.q.trim() ? `/api/mdx/search?${qs}` : null;
  const { data, loading, error, refresh } = useFetchJson<SearchPayload>(url);
  const results = data ? adaptHits(data.data) : null;
  return {
    results,
    // kinds is the closed UI registry of source types; kpis/saved have no
    // backend yet, so they stay null (surface renders its own empty/fixture).
    kinds: results ? SEARCH_KINDS.slice() : null,
    kpis: null,
    saved: null,
    loading,
    error,
    refresh,
  };
}
