/**
 * useCerLiterature — PubMed search + corpus recording for the CER workbench's
 * literature tab, consuming
 *
 *   GET  /api/cerv2/literature/search   (canonical pubmed-client)
 *   POST /api/cerv2/literature/record   (literature_entries write path)
 *
 * Honest by construction, mirroring lookupClassification: the server's
 * { available: false, unavailableReason } degradation passes through
 * untouched; a request that never reaches the server returns null; a query
 * too short to search refuses without issuing a request. A search hit only
 * becomes part of the org corpus through the explicit record action — the
 * recorder tracks per-PMID outcomes and surfaces the server's failure text
 * verbatim, never an optimistic "recorded".
 */

import { useCallback, useState } from 'react';
import { buildAuthHeaders } from './useFetchJson';

/** Mutators need the same Bearer + x-organization-id headers as the read
 *  path — cookies alone 401 at the global /api gate (see buildAuthHeaders). */
const jsonHeaders = (): Record<string, string> => ({
  'Content-Type': 'application/json',
  ...buildAuthHeaders(),
});

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
  /** Always false on a search response — hits enter the corpus only through
   *  the explicit POST /literature/record action (useCerLiteratureRecorder). */
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

/* ─── Corpus recording (POST /api/cerv2/literature/record) ──────────── */

export interface RecordLiteratureEntryPayload {
  pmid: string;
  title: string;
  journal?: string | null;
  year?: number | null;
  authors?: string | string[] | null;
  doi?: string | null;
  url?: string | null;
}

export interface RecordLiteratureOutcome {
  recorded: boolean;
  created?: number;
  updated?: number;
  entries?: Array<{ pmid: string; id: string; outcome: 'created' | 'updated' }>;
  /** Server-side honesty notes (screening state / program binding limits). */
  notes?: string[];
  /** Set when recorded=false — the server's failure text, or a local one. */
  error?: string;
}

/**
 * Map a search hit onto the record payload. Year comes from the leading
 * 4 digits of the esummary pubDate ("2023 Mar 15" → 2023); when absent the
 * entry is recorded without a date rather than with an invented one.
 * Pure + exported for unit tests.
 */
export function articleToRecordEntry(a: CerLiteratureArticle): RecordLiteratureEntryPayload {
  const yearMatch = /^(\d{4})/.exec(a.pubDate?.trim() ?? '');
  return {
    pmid: a.pmid,
    title: a.title || `PubMed record ${a.pmid}`,
    journal: a.journal || null,
    year: yearMatch ? Number(yearMatch[1]) : null,
    authors: a.authors || null,
    doi: a.doi,
    url: a.url,
  };
}

/**
 * Record one-or-many search hits to the org corpus. Returns a typed outcome
 * in every case — a non-2xx or network failure yields { recorded: false,
 * error } with the server's own text when it sent any, never a thrown
 * exception or a fabricated success.
 */
export async function recordCerLiterature(
  entries: RecordLiteratureEntryPayload[],
  programId?: string | null,
): Promise<RecordLiteratureOutcome> {
  try {
    const res = await fetch('/api/cerv2/literature/record', {
      method: 'POST',
      credentials: 'include',
      headers: jsonHeaders(),
      body: JSON.stringify({ entries, ...(programId ? { programId } : {}) }),
    });
    const body = (await res.json().catch(() => null)) as RecordLiteratureOutcome | null;
    if (!res.ok || !body?.recorded) {
      return {
        recorded: false,
        error:
          body?.error ??
          `Recording failed — the server answered ${res.status}`,
      };
    }
    return body;
  } catch {
    return { recorded: false, error: 'Recording failed — the server could not be reached' };
  }
}

export type RecordRowState = 'recording' | 'recorded' | 'failed';

export interface UseCerLiteratureRecorderResult {
  /** Per-PMID recording state; absent key = not yet recorded this session. */
  rowState: Record<string, RecordRowState>;
  /** Last failure text (server-provided when available); null after success. */
  recordError: string | null;
  /** Server honesty notes from the last successful record call. */
  recordNotes: string[];
  /** Record the given search hits; resolves to the typed outcome. */
  record: (articles: CerLiteratureArticle[]) => Promise<RecordLiteratureOutcome>;
}

/**
 * Stateful wrapper for the LiteratureTab: tracks per-row recorded state so
 * the table can show exactly which hits made it into the corpus, and keeps
 * the honest failure text of the last attempt.
 */
export function useCerLiteratureRecorder(
  programId: string | null,
): UseCerLiteratureRecorderResult {
  const [rowState, setRowState] = useState<Record<string, RecordRowState>>({});
  const [recordError, setRecordError] = useState<string | null>(null);
  const [recordNotes, setRecordNotes] = useState<string[]>([]);

  const record = useCallback(
    async (articles: CerLiteratureArticle[]) => {
      const pmids = articles.map((a) => a.pmid);
      setRowState((s) => ({
        ...s,
        ...Object.fromEntries(pmids.map((p) => [p, 'recording' as const])),
      }));
      const outcome = await recordCerLiterature(
        articles.map(articleToRecordEntry),
        programId ?? undefined,
      );
      if (outcome.recorded) {
        setRowState((s) => ({
          ...s,
          ...Object.fromEntries(pmids.map((p) => [p, 'recorded' as const])),
        }));
        setRecordError(null);
        setRecordNotes(outcome.notes ?? []);
      } else {
        setRowState((s) => ({
          ...s,
          ...Object.fromEntries(pmids.map((p) => [p, 'failed' as const])),
        }));
        setRecordError(outcome.error ?? 'Recording failed');
      }
      return outcome;
    },
    [programId],
  );

  return { rowState, recordError, recordNotes, record };
}
