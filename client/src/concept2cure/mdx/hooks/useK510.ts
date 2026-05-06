/**
 * useK510 — three live data hooks for the K510Surface, all keyed on the
 * active program identifier.
 *
 *  useK510EstarSections(ident)  — eSTAR sections from
 *      /api/510k/projects/:ident/document-preview (LOCAL endpoint, real DB).
 *      Adapts {sections[]} → kit EstarRow[].
 *
 *  useK510Predicates(programId) — predicate candidates from
 *      /api/predicate-intelligence/candidates?program_id=X (proxies to the
 *      shadow service). Defensive adapter — the shadow response isn't typed
 *      locally, so we map common field aliases (k_number/kNumber,
 *      device_name/deviceName, etc.) and degrade to fixture on 502.
 *
 *  useK510SeMatrix(programId)   — SE matrix from
 *      /api/predicate-intelligence/se-matrix?program_id=X (also shadow).
 *      Adapts {rows[]} → kit SeRow[].
 *
 * All three handle:
 *   - cancelled fetches on unmount / id change
 *   - non-OK responses (including 502 from a down shadow service) → null
 *     payload + error string; the surface falls back to fixtures so
 *     nothing renders empty.
 */

import { useEffect, useState } from 'react';
import type { EstarRow, EstarStatus, Predicate, PredicateStatus, SeRow } from '../data/k510';
import {
  ESTAR_STATUS_MAP,
  PREDICATE_STATUS_MAP,
  VERDICT_MAP,
} from '../../../../../shared/constants/mdx';

/* ─── Shared types ──────────────────────────────────────────────────── */

interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

function useFetchJson<T>(url: string | null): AsyncState<T> {
  const [state, setState] = useState<AsyncState<T>>({
    data: null,
    loading: false,
    error: null,
  });
  useEffect(() => {
    if (!url) {
      setState({ data: null, loading: false, error: null });
      return;
    }
    let cancelled = false;
    setState({ data: null, loading: true, error: null });
    fetch(url, { credentials: 'include' })
      .then(async (res) => {
        if (!res.ok) {
          const detail = await res.text().catch(() => '');
          throw new Error(`HTTP ${res.status}${detail ? `: ${detail.slice(0, 160)}` : ''}`);
        }
        return (await res.json()) as T;
      })
      .then((data) => {
        if (cancelled) return;
        setState({ data, loading: false, error: null });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setState({
          data: null,
          loading: false,
          error: err instanceof Error ? err.message : 'Fetch failed',
        });
      });
    return () => {
      cancelled = true;
    };
  }, [url]);
  return state;
}

/* ─── eSTAR sections (LOCAL endpoint, real DB) ──────────────────────── */

interface ServerSection {
  id: number;
  sectionNumber: number | string;
  sectionTitle: string | null;
  sectionKey: string | null;
  category: string | null;
  status: string | null;
  completionPercentage: number;
  contentLength: number;
  isRequired: boolean;
  level: number;
  displayOrder: number;
}

interface DocumentPreviewPayload {
  projectId: string;
  totalSections: number;
  approvedCount: number;
  draftingCount: number;
  todoCount: number;
  completionPercentage: number;
  sections: ServerSection[];
}

function adaptSection(s: ServerSection): EstarRow {
  const raw = (s.status ?? 'todo').toLowerCase();
  const mapped = ESTAR_STATUS_MAP[raw] as EstarStatus | undefined;
  let status: EstarStatus;
  if (mapped !== undefined) {
    status = mapped;
  } else if (s.contentLength > 0) {
    status = 'draft';
  } else {
    status = s.isRequired ? 'empty' : 'na';
  }
  /* Required + empty + not-yet-drafted = blocker. The kit's UI surfaces
     blockers via a side accent and pre-flight validation; this matches. */
  const blocker = s.isRequired && (status === 'empty' || status === 'draft') && s.contentLength === 0;
  const id = typeof s.sectionNumber === 'number'
    ? s.sectionNumber
    : Number.parseInt(String(s.sectionNumber), 10) || s.id;
  return {
    id,
    label: s.sectionTitle ?? s.sectionKey ?? `Section ${id}`,
    status,
    blocker,
  } as EstarRow;
}

export interface UseK510EstarResult {
  rows: EstarRow[] | null;
  blockerCount: number;
  loading: boolean;
  error: string | null;
}

export function useK510EstarSections(projectIdent: string | null): UseK510EstarResult {
  const url = projectIdent
    ? `/api/510k/projects/${encodeURIComponent(projectIdent)}/document-preview`
    : null;
  const { data, loading, error } = useFetchJson<DocumentPreviewPayload>(url);
  if (!data) return { rows: null, blockerCount: 0, loading, error };
  const rows = data.sections.map(adaptSection).sort((a, b) => a.id - b.id);
  return {
    rows,
    blockerCount: rows.filter((r) => r.blocker).length,
    loading,
    error,
  };
}

/* ─── Predicate candidates (proxies to shadow service) ──────────────── */

/** Defensive shape — handles snake_case + camelCase from shadow service. */
interface ServerPredicateCandidate {
  id?: string;
  k_number?: string; kNumber?: string;
  device_name?: string; deviceName?: string;
  applicant?: string; applicant_name?: string; applicantName?: string; holder?: string;
  decision_date?: string; decisionDate?: string; cleared?: string; cleared_date?: string;
  device_class?: string; deviceClass?: string; class?: string;
  product_code?: string; productCode?: string;
  match_score?: number; matchScore?: number; match?: number;
  difference_count?: number; differenceCount?: number; diffs?: number;
  status?: string;
}

interface CandidatesPayload {
  candidates?: ServerPredicateCandidate[];
  rows?: ServerPredicateCandidate[];
  data?: ServerPredicateCandidate[];
}

function adaptPredicate(c: ServerPredicateCandidate): Predicate | null {
  const k = c.k_number ?? c.kNumber;
  const name = c.device_name ?? c.deviceName;
  if (!k || !name) return null;
  const matchRaw = c.match_score ?? c.matchScore ?? c.match ?? 0;
  /* Shadow may return 0..1 or 0..100; normalize to integer percent. */
  const match = matchRaw > 0 && matchRaw <= 1 ? Math.round(matchRaw * 100) : Math.round(matchRaw);
  const cleared = c.decision_date ?? c.decisionDate ?? c.cleared ?? c.cleared_date ?? '';
  const status: PredicateStatus = (PREDICATE_STATUS_MAP[(c.status ?? '').toLowerCase()] ?? 'candidate') as PredicateStatus;
  return {
    k,
    name,
    holder:  c.applicantName ?? c.applicant_name ?? c.applicant ?? c.holder ?? '',
    cleared: cleared.length > 10 ? cleared.slice(0, 10) : cleared,
    class:   (c.device_class ?? c.deviceClass ?? c.class ?? 'II') as Predicate['class'],
    code:    c.product_code ?? c.productCode ?? '',
    match,
    status,
    diffs:   c.difference_count ?? c.differenceCount ?? c.diffs ?? 0,
  };
}

export interface UseK510PredicatesResult {
  rows: Predicate[] | null;
  loading: boolean;
  error: string | null;
}

export function useK510Predicates(programId: string | null): UseK510PredicatesResult {
  const url = programId
    ? `/api/predicate-intelligence/candidates?program_id=${encodeURIComponent(programId)}`
    : null;
  const { data, loading, error } = useFetchJson<CandidatesPayload>(url);
  if (!data) return { rows: null, loading, error };
  const list = data.candidates ?? data.rows ?? data.data ?? [];
  const rows = list.map(adaptPredicate).filter((p): p is Predicate => p !== null);
  return { rows: rows.length > 0 ? rows : null, loading, error };
}

/* ─── SE matrix (proxies to shadow service) ─────────────────────────── */

interface ServerSeRow {
  attribute?: string; attr?: string;
  subject?: string; subject_value?: string; subjectValue?: string;
  predicate?: string; predicate_value?: string; predicateValue?: string;
  verdict?: string;
  note?: string;
}

interface SeMatrixPayload {
  rows?: ServerSeRow[];
  matrix?: ServerSeRow[];
  data?: ServerSeRow[];
}

function adaptSeRow(r: ServerSeRow): SeRow | null {
  const attr = r.attribute ?? r.attr;
  if (!attr) return null;
  return {
    attr,
    subject:   r.subject ?? r.subject_value ?? r.subjectValue ?? '',
    predicate: r.predicate ?? r.predicate_value ?? r.predicateValue ?? '',
    verdict:   (VERDICT_MAP[(r.verdict ?? 'equivalent').toLowerCase()] ?? 'equivalent') as SeRow['verdict'],
    note:      r.note,
  };
}

export interface UseK510SeMatrixResult {
  rows: SeRow[] | null;
  loading: boolean;
  error: string | null;
}

export function useK510SeMatrix(programId: string | null): UseK510SeMatrixResult {
  const url = programId
    ? `/api/predicate-intelligence/se-matrix?program_id=${encodeURIComponent(programId)}`
    : null;
  const { data, loading, error } = useFetchJson<SeMatrixPayload>(url);
  if (!data) return { rows: null, loading, error };
  const list = data.rows ?? data.matrix ?? data.data ?? [];
  const rows = list.map(adaptSeRow).filter((r): r is SeRow => r !== null);
  return { rows: rows.length > 0 ? rows : null, loading, error };
}
