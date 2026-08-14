/**
 * useCerLiterature — PubMed search + corpus recording for the CER workbench's
 * literature tab, consuming
 *
 *   GET  /api/cerv2/literature/search      (canonical pubmed-client)
 *   POST /api/cerv2/literature/record      (literature_entries write path)
 *   POST /api/cerv2/literature/screen      (screening decision write path)
 *   GET  /api/cerv2/literature/screening   (screening decision read path)
 *
 * Honest by construction, mirroring lookupClassification: the server's
 * { available: false, unavailableReason } degradation passes through
 * untouched; a request that never reaches the server returns null; a query
 * too short to search refuses without issuing a request. A search hit only
 * becomes part of the org corpus through the explicit record action — the
 * recorder tracks per-PMID outcomes and surfaces the server's failure text
 * verbatim, never an optimistic "recorded".
 */

import { useCallback, useEffect, useState } from 'react';
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

/* ─── Screening / appraisal (MEDDEV 2.7/1 Rev 4) ─────────────────────── */

/**
 * The two MEDDEV/PRISMA screening passes — the same vocabulary the server and
 * the CER intelligence flow use (`articles_after_title_abstract_screening`,
 * `articles_after_full_text_screening`). Not re-invented client-side.
 */
export const SCREENING_STAGES = ['title_abstract', 'full_text'] as const;
export type CerScreeningStage = (typeof SCREENING_STAGES)[number];

export const SCREENING_DECISIONS = ['included', 'excluded', 'pending'] as const;
export type CerScreeningDecisionValue = (typeof SCREENING_DECISIONS)[number];

/**
 * Byte-identical to SCREENING_STAGE_LABELS in
 * server/services/literature-screening.service.ts, which is what lands in the
 * audit payload as `stageLabel`. A stage that is called one thing on screen and
 * another in the trail is a traceability wart an auditor will find; the client
 * and server halves of the enum are restated the same way the study-type enum
 * already is across this boundary.
 */
export const SCREENING_STAGE_LABELS: Record<CerScreeningStage, string> = {
  title_abstract: 'Title/abstract screening',
  full_text: 'Full-text screening',
};

export const SCREENING_DECISION_LABELS: Record<CerScreeningDecisionValue, string> = {
  included: 'Included',
  excluded: 'Excluded',
  pending: 'Pending',
};

export interface CerScreeningDecision {
  id: string;
  pmid: string;
  title: string;
  literatureEntryId: string;
  programId: string | null;
  stage: CerScreeningStage;
  decision: CerScreeningDecisionValue;
  exclusionReason: string | null;
  decidedBy: number;
  decidedAt: string;
}

export interface CerScreeningReadResult {
  /** False only when the screening store is not provisioned — see the server
   *  route comment. Distinct from "no decisions yet", which is available:true
   *  with an empty list. */
  available: boolean;
  unavailableReason?: string;
  decisions: CerScreeningDecision[];
  /** Set when the request itself failed (network / non-2xx). */
  error?: string;
}

export interface ScreenLiteraturePayload {
  pmid: string;
  stage: CerScreeningStage;
  decision: CerScreeningDecisionValue;
  /** Required iff decision === 'excluded'. */
  exclusionReason?: string | null;
}

export interface ScreenLiteratureOutcome {
  screened: boolean;
  outcome?: 'created' | 'updated';
  decision?: CerScreeningDecision;
  /** Server refusal code on a 422 (e.g. ENTRY_NOT_IN_CORPUS). */
  code?: string;
  /** Set when screened=false — the server's own text where it sent any. */
  error?: string;
}

/** Map key for one decision: a PMID carries one decision PER STAGE. */
export function screeningKey(pmid: string, stage: CerScreeningStage): string {
  return `${pmid}::${stage}`;
}

/**
 * Build the screening read URL. Pure + exported so the query contract is
 * unit-testable without a DOM. `pmids` narrows the read to the hits currently
 * on screen; omitting it returns the whole stored trail for the scope.
 */
export function screeningReadUrl(programId?: string | null, pmids?: string[]): string {
  const params = new URLSearchParams();
  if (programId) params.set('programId', programId);
  const list = (pmids ?? []).map((p) => p.trim()).filter((p) => p.length > 0);
  if (list.length > 0) params.set('pmids', list.join(','));
  const qs = params.toString();
  return `/api/cerv2/literature/screening${qs ? `?${qs}` : ''}`;
}

/**
 * Read the stored screening trail. A request failure returns
 * { available: false, error } — never a fabricated empty trail presented as
 * "nothing has been screened", which is a different and materially misleading
 * claim.
 */
export async function fetchCerScreening(
  programId?: string | null,
  pmids?: string[],
): Promise<CerScreeningReadResult> {
  try {
    const res = await fetch(screeningReadUrl(programId, pmids), {
      credentials: 'include',
      headers: buildAuthHeaders(),
    });
    const body = (await res.json().catch(() => null)) as CerScreeningReadResult | null;
    if (!res.ok || !body) {
      return {
        available: false,
        decisions: [],
        error:
          (body as { error?: string } | null)?.error ??
          `Screening trail unavailable — the server answered ${res.status}`,
      };
    }
    return { ...body, decisions: Array.isArray(body.decisions) ? body.decisions : [] };
  } catch {
    return {
      available: false,
      decisions: [],
      error: 'Screening trail unavailable — the server could not be reached',
    };
  }
}

/**
 * Record one screening decision. Returns a typed outcome in every case; a
 * refusal (422) passes the server's `code` and text through untouched so the
 * reviewer is told exactly why the decision was not stored.
 */
export async function screenCerLiterature(
  payload: ScreenLiteraturePayload,
  programId?: string | null,
): Promise<ScreenLiteratureOutcome> {
  try {
    const res = await fetch('/api/cerv2/literature/screen', {
      method: 'POST',
      credentials: 'include',
      headers: jsonHeaders(),
      body: JSON.stringify({
        pmid: payload.pmid,
        stage: payload.stage,
        decision: payload.decision,
        // Only sent on an exclusion: the server rejects a rationale attached to
        // an inclusion, and so does the DB CHECK.
        ...(payload.decision === 'excluded'
          ? { exclusionReason: payload.exclusionReason ?? '' }
          : {}),
        ...(programId ? { programId } : {}),
      }),
    });
    const body = (await res.json().catch(() => null)) as ScreenLiteratureOutcome | null;
    if (!res.ok || !body?.screened) {
      return {
        screened: false,
        code: body?.code,
        error: body?.error ?? `Screening failed — the server answered ${res.status}`,
      };
    }
    return body;
  } catch {
    return { screened: false, error: 'Screening failed — the server could not be reached' };
  }
}

export interface UseCerLiteratureScreeningResult {
  /** Stored decisions keyed by `screeningKey(pmid, stage)`. */
  decisions: Record<string, CerScreeningDecision>;
  /** True while the stored trail is being (re)read. */
  loading: boolean;
  /** Set when the trail could not be read at all (store absent / request failed). */
  trailUnavailable: string | null;
  /** PMID::stage currently being written, so the row can disable itself. */
  savingKey: string | null;
  /** Last write failure text (server-provided when available). */
  screenError: string | null;
  /** Record a decision; resolves to the typed outcome. */
  screen: (payload: ScreenLiteraturePayload) => Promise<ScreenLiteratureOutcome>;
  /** Re-read the trail, optionally narrowed to the given PMIDs. */
  reload: (pmids?: string[]) => Promise<void>;
}

/**
 * Stateful screening for the LiteratureTab.
 *
 * Loads the stored trail on mount (and whenever the program scope changes) so a
 * decision recorded in an earlier session is present before the reviewer
 * searches for anything — that is what "survives a reload" means here, since
 * the PubMed search itself is transient by design.
 *
 * A PMID with no entry in `decisions` has NOT been screened at that stage. It is
 * never defaulted to 'pending': "nobody has looked at this" and "a reviewer
 * explicitly deferred it" are different facts, and the server keeps them apart
 * too.
 */
export function useCerLiteratureScreening(
  programId: string | null,
): UseCerLiteratureScreeningResult {
  const [decisions, setDecisions] = useState<Record<string, CerScreeningDecision>>({});
  const [loading, setLoading] = useState(false);
  const [trailUnavailable, setTrailUnavailable] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [screenError, setScreenError] = useState<string | null>(null);

  const reload = useCallback(
    async (pmids?: string[]) => {
      setLoading(true);
      try {
        const result = await fetchCerScreening(programId, pmids);
        if (!result.available) {
          setTrailUnavailable(result.unavailableReason ?? result.error ?? 'Screening trail unavailable');
          // Deliberately NOT clearing `decisions`: a failed refresh must not
          // silently redraw already-known decisions as unscreened.
          return;
        }
        setTrailUnavailable(null);
        setDecisions((prev) => {
          const next = { ...prev };
          for (const d of result.decisions) next[screeningKey(d.pmid, d.stage)] = d;
          return next;
        });
      } finally {
        setLoading(false);
      }
    },
    [programId],
  );

  useEffect(() => {
    // Scope change (or first mount) invalidates the map: decisions are
    // per-program, so carrying another program's over would be a cross-scope
    // claim about this device's evidence base.
    setDecisions({});
    setTrailUnavailable(null);
    void reload();
  }, [reload]);

  const screen = useCallback(
    async (payload: ScreenLiteraturePayload) => {
      const key = screeningKey(payload.pmid, payload.stage);
      setSavingKey(key);
      try {
        const outcome = await screenCerLiterature(payload, programId);
        if (outcome.screened && outcome.decision) {
          setDecisions((prev) => ({ ...prev, [key]: outcome.decision as CerScreeningDecision }));
          setScreenError(null);
        } else {
          // No optimistic write: the map keeps whatever the server last
          // confirmed, so the UI can never show a decision that is not stored.
          setScreenError(outcome.error ?? 'Screening failed');
        }
        return outcome;
      } finally {
        setSavingKey(null);
      }
    },
    [programId],
  );

  return { decisions, loading, trailUnavailable, savingKey, screenError, screen, reload };
}
