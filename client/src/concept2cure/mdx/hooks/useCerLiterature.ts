/**
 * useCerLiterature — on-demand PubMed search for the CER workbench's
 * literature tab, consuming GET /api/cerv2/literature/search
 * (server/routes/cerv2-document-routes.ts → the canonical pubmed-client).
 *
 * Honest by construction, mirroring lookupClassification: the server's
 * { available: false, unavailableReason } degradation passes through
 * untouched; a request that never reaches the server returns null; a query
 * too short to search refuses without issuing a request. Results are
 * READ-ONLY — there is no persistence route for literature_entries, so a
 * search is never presented as "recorded to the project corpus".
 */

import { useCallback, useState } from 'react';
import { buildAuthHeaders } from './useFetchJson';

export type CerLiteratureStudyType =
  | 'rct'
  | 'observational'
  | 'systematic_review'
  | 'case_report'
  | 'any';

export interface CerLiteratureArticle {
  pmid: string;
  title: string;
  authors: string;
  journal: string;
  pubDate: string;
  doi: string | null;
  /** Canonical public PubMed URL — use for citation. */
  url: string;
}

export interface CerLiteratureResult {
  available: boolean;
  unavailableReason?: string;
  /** Always false — no literature_entries write path exists yet. */
  recorded: boolean;
  source: string;
  totalCount: number;
  articles: CerLiteratureArticle[];
  retrievedAt?: string;
  stale?: boolean;
}

export interface CerLiteratureQuery {
  q: string;
  max?: number;
  /** Year or range, e.g. "2023" or "2020-2026". */
  years?: string;
  studyType?: CerLiteratureStudyType;
}

/**
 * Build the search URL. Pure + exported so the query contract is
 * unit-testable without a DOM. Null when the query is under 2 characters
 * (the server 400s those) — callers show the refusal locally instead.
 */
export function literatureSearchUrl(query: CerLiteratureQuery): string | null {
  const q = query.q.trim();
  if (q.length < 2) return null;
  const params = new URLSearchParams({ q });
  if (query.max !== undefined) params.set('max', String(query.max));
  if (query.years?.trim()) params.set('years', query.years.trim());
  if (query.studyType && query.studyType !== 'any') params.set('studyType', query.studyType);
  return `/api/cerv2/literature/search?${params.toString()}`;
}

/**
 * Run one search. Passes the server's honest degradation payload through
 * untouched; returns null only when the request itself failed (network /
 * non-2xx) — never a fabricated article list.
 */
export async function searchCerLiterature(
  query: CerLiteratureQuery,
): Promise<CerLiteratureResult | null> {
  const url = literatureSearchUrl(query);
  if (!url) {
    return {
      available: false,
      unavailableReason: 'Enter a search of at least 2 characters first',
      recorded: false,
      source: 'PubMed',
      totalCount: 0,
      articles: [],
    };
  }
  try {
    const res = await fetch(url, {
      credentials: 'include',
      headers: buildAuthHeaders(),
    });
    if (!res.ok) return null;
    return (await res.json()) as CerLiteratureResult;
  } catch {
    return null;
  }
}

export interface UseCerLiteratureSearchResult {
  /** True while a search request is in flight. */
  searching: boolean;
  /** Most recent search result; null before the first search. */
  result: CerLiteratureResult | null;
  /** Set when the request itself failed (network / non-2xx). */
  requestError: string | null;
  search: (query: CerLiteratureQuery) => Promise<CerLiteratureResult | null>;
}

export function useCerLiteratureSearch(): UseCerLiteratureSearchResult {
  const [searching, setSearching] = useState(false);
  const [result, setResult] = useState<CerLiteratureResult | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);

  const search = useCallback(async (query: CerLiteratureQuery) => {
    setSearching(true);
    setRequestError(null);
    try {
      const r = await searchCerLiterature(query);
      if (r === null) {
        setRequestError('Search request failed — the server could not be reached');
        setResult(null);
        return null;
      }
      setResult(r);
      return r;
    } finally {
      setSearching(false);
    }
  }, []);

  return { searching, result, requestError, search };
}
