/**
 * useMdxSearch — live cross-record search for the ⌘K palette.
 *
 * `/api/mdx/search` fans out over programs, artifacts, Q-Subs, audit
 * logs, AnA threads and labeling documents — 30 AnA handlers' worth of
 * capability — and had no client consumer (docs/MDX_SURFACE_COVERAGE_
 * FINDING.md). The command palette, meanwhile, could only match a static
 * list of ten surface names: it could not find "the BX-204 risk file".
 *
 * This hook debounces the query and returns flat, ranked hits so the
 * palette can offer real records alongside its navigate / run-tool /
 * ask-AnA actions.
 *
 * It is honest about its own latency: an in-flight search does not blank
 * the previous results, and a query shorter than the floor returns
 * nothing rather than fetching on every keystroke.
 */

import { useEffect, useRef, useState } from 'react';
import { getAuthToken, getOrgId } from '@/utils/authToken';

export type SearchHitType =
  | 'program'
  | 'artifact'
  | 'q_sub'
  | 'audit'
  | 'thread'
  | 'labeling';

export interface SearchHit {
  type: SearchHitType;
  id: string | number;
  title: string;
  snippet: string | null;
  url: string;
}

interface Payload {
  data: Partial<Record<SearchHitType, SearchHit[]>>;
  meta?: { total?: number };
}

/** Below this the palette stays in its normal ask/nav mode. */
const MIN_QUERY = 2;
const DEBOUNCE_MS = 200;

export interface UseMdxSearchResult {
  hits: SearchHit[];
  /** True while a fetch for the current query is outstanding. */
  searching: boolean;
  /** True once at least one query has been attempted for this term. */
  ran: boolean;
}

/**
 * @param query Raw palette text (already stripped of any `/` or `>`
 *              prefix by the caller). Queries under MIN_QUERY chars are
 *              ignored.
 */
export function useMdxSearch(query: string): UseMdxSearchResult {
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [ran, setRan] = useState(false);
  /* Guards against an older response overwriting a newer one when the
     user types faster than the network answers. */
  const seq = useRef(0);

  const term = query.trim();

  useEffect(() => {
    if (term.length < MIN_QUERY) {
      setHits([]);
      setSearching(false);
      setRan(false);
      return;
    }

    const mySeq = ++seq.current;
    setSearching(true);
    const handle = setTimeout(async () => {
      const headers: Record<string, string> = {};
      const token = getAuthToken();
      const orgId = getOrgId();
      if (token) headers.Authorization = `Bearer ${token}`;
      if (orgId) headers['x-organization-id'] = orgId;

      try {
        const res = await fetch(`/api/mdx/search?q=${encodeURIComponent(term)}`, {
          credentials: 'include',
          headers,
        });
        if (mySeq !== seq.current) return; // superseded by a newer keystroke
        if (!res.ok) {
          setHits([]);
          setRan(true);
          setSearching(false);
          return;
        }
        const body = (await res.json()) as Payload;
        if (mySeq !== seq.current) return;
        const flat = Object.values(body.data ?? {})
          .filter((v): v is SearchHit[] => Array.isArray(v))
          .flat();
        setHits(flat);
        setRan(true);
        setSearching(false);
      } catch {
        if (mySeq !== seq.current) return;
        /* A failed search is empty, not an error banner over the
           palette — the next keystroke retries. */
        setHits([]);
        setRan(true);
        setSearching(false);
      }
    }, DEBOUNCE_MS);

    return () => clearTimeout(handle);
  }, [term]);

  return { hits, searching, ran };
}
