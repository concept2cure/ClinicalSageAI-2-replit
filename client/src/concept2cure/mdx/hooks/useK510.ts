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
 *  useK510PredicateFallback(deviceName, productCode) — REDUCED predicate
 *      fallback from /api/510k/device/predicates (openFDA clearances,
 *      LOCAL endpoint). Only queried once the shadow-backed predicate
 *      fetch has errored; rows carry no match scoring and must render
 *      under an explicit "Reduced results" label.
 *
 * All three handle:
 *   - cancelled fetches on unmount / id change
 *   - non-OK responses (including 502 from a down shadow service) → null
 *     payload + error string; the surface falls back to fixtures so
 *     nothing renders empty.
 */

import type { EstarRow, EstarStatus, Predicate, PredicateStatus, SeRow } from '../data/k510';
import type { OfficialEstarType, OfficialEstarVariant } from './useEstarOfficialFields';
import { useFetchJson } from './useFetchJson';
import {
  ESTAR_STATUS_MAP,
  PREDICATE_STATUS_MAP,
  VERDICT_MAP,
} from '../../../../../shared/constants/mdx';

/* ─── Shared types ──────────────────────────────────────────────────── */

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
  /* Draft provenance (added 20260506) — set when AnA drafted the section
     via write_kit_section and the user hasn't accepted. */
  draftSource?: string | null;
  draftedAt?: string | null;
  acceptedAt?: string | null;
  draftedSummary?: string | null;
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
  /* Surface AnA's draft when present + not yet accepted. Acceptance stamps
     acceptedAt and KEEPS draftSource — the origin is a fact about the text,
     not a pending flag (ledger L155). */
  const draft =
    s.draftSource === 'ana' && s.draftedAt && !s.acceptedAt
      ? {
          source: 'ana' as const,
          at: s.draftedAt,
          summary: s.draftedSummary ?? undefined,
          rowId: s.id,
        }
      : null;
  return {
    id,
    label: s.sectionTitle ?? s.sectionKey ?? `Section ${id}`,
    status,
    blocker,
    draft,
  } as EstarRow;
}

export interface UseK510EstarResult {
  rows: EstarRow[] | null;
  blockerCount: number;
  loading: boolean;
  error: string | null;
  /** Re-fetch the section list. Called by the AnA draft banner after a
   *  successful accept so the affordance disappears from the list. */
  refresh: () => void;
}

/**
 * Fetch the eSTAR section list for a 510(k) program from
 * /api/510k/projects/:ident/document-preview and adapt to the kit's
 * EstarRow shape. The same endpoint backs PMA + CER section panels —
 * the cerv2_510k_sections table is misnamed but spans all pathways.
 *
 * Status mapping: validated/approved → complete, in_review → review,
 * drafting → draft, todo → empty, not_applicable → na. Required
 * sections that are empty + zero-content are flagged as blockers
 * (kit's pre-flight gate).
 *
 * @param projectIdent  numeric fda510kProjects id, regulatoryPrograms
 *   UUID, or programmer-friendly code (e.g. 'BX-204'). Resolution
 *   priority is on the server.
 * @returns `{ rows, blockerCount, loading, error }`.
 */
export function useK510EstarSections(projectIdent: string | null): UseK510EstarResult {
  const url = projectIdent
    ? `/api/510k/projects/${encodeURIComponent(projectIdent)}/document-preview`
    : null;
  const { data, loading, error, refresh } = useFetchJson<DocumentPreviewPayload>(url);
  if (!data) return { rows: null, blockerCount: 0, loading, error, refresh };
  /* A 200 whose body is not `{ sections: [...] }` used to throw here — inside
     render — and take the whole 510(k) surface down with it. That is the same
     class of failure useMdxPrograms closed for the portfolio: an unreadable
     body is a load failure to report, never a crash and never an empty list. */
  if (!Array.isArray(data.sections)) {
    return {
      rows: null,
      blockerCount: 0,
      loading,
      error: error ?? 'The eSTAR section list returned a response this screen could not read.',
      refresh,
    };
  }
  const rows = data.sections.map(adaptSection).sort((a, b) => a.id - b.id);
  return {
    rows,
    blockerCount: rows.filter((r) => r.blocker).length,
    loading,
    error,
    refresh,
  };
}

/* ─── Official eSTAR readiness probe (drives the gated "Generate" button) ── */

export interface EstarReadiness {
  descriptorId: string | null;
  ready: boolean;
  templateAvailable: boolean;
  fieldMapPopulated: boolean;
  blockers: string[];
}

export interface UseEstarReadinessResult {
  readiness: EstarReadiness | null;
  loading: boolean;
  error: string | null;
}

/**
 * Probe whether the OFFICIAL FDA eSTAR PDF can be produced for a descriptor.
 * Read-only — hits GET /api/510k/estar/readiness, which produces nothing. The
 * surface uses `ready` to enable/disable the "Generate official eSTAR" action
 * and `blockers` to show the reason when it's gated. `ready` is true only once
 * the official template is vendored AND its field map is populated.
 */
export function useEstarReadiness(
  type: OfficialEstarType = '510k',
  variant: OfficialEstarVariant = 'device',
): UseEstarReadinessResult {
  const url = `/api/510k/estar/readiness?type=${encodeURIComponent(type)}&variant=${encodeURIComponent(variant)}`;
  const { data, loading, error } = useFetchJson<EstarReadiness>(url);
  return { readiness: data ?? null, loading, error };
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

/**
 * Fetch predicate candidates for a 510(k) program from
 * /api/predicate-intelligence/candidates (proxies to the python shadow
 * service). Adapter handles snake_case + camelCase responses and
 * normalizes match scores from 0..1 to 0..100 when needed.
 *
 * Returns null on shadow-service unavailability so the surface can
 * render its "Predicate intelligence is configuring" banner instead
 * of falling back to fixture data silently.
 */
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

/* ─── Reduced predicate fallback (openFDA clearances, LOCAL endpoint) ── */

/** One openFDA 510(k) clearance record — real FDA data, but NOT the
 *  predicate-intelligence engine (no SE scoring, no evidence cells).
 *  Surfaces must label these rows as reduced results. */
export interface PredicateFallbackRow {
  kNumber: string;
  deviceName: string;
  applicant: string;
  productCode: string;
  decisionDate: string;
  decisionCode: string;
  clearanceType: string;
}

interface PredicateFallbackPayload {
  available: boolean;
  unavailableReason?: string;
  results: PredicateFallbackRow[];
  source: 'openfda';
  reduced: boolean;
}

/**
 * Build the /api/510k/device/predicates query string. Pure + exported so
 * the fallback contract is unit-testable without a DOM. Null when no
 * usable term remains (the server 400s an empty query; deviceName needs
 * 2+ characters) — which also keeps useFetchJson idle while the primary
 * predicate source is healthy (callers pass nulls until it errors).
 */
export function predicateFallbackUrl(
  deviceName: string | null,
  productCode: string | null,
): string | null {
  const params = new URLSearchParams();
  if ((deviceName?.trim().length ?? 0) >= 2) params.set('deviceName', deviceName!.trim());
  if (productCode?.trim()) params.set('productCode', productCode.trim());
  const qs = params.toString();
  return qs ? `/api/510k/device/predicates?${qs}` : null;
}

export interface UseK510PredicateFallbackResult {
  /** Clearance records, or null while idle / loading / unavailable. */
  rows: PredicateFallbackRow[] | null;
  /** Server's honest availability verdict; null until a response lands. */
  available: boolean | null;
  /** Set when available=false — why openFDA could not be queried. */
  unavailableReason: string | null;
  loading: boolean;
  error: string | null;
}

/**
 * Fetch the REDUCED predicate fallback from /api/510k/device/predicates
 * (openFDA device/510k.json, in-repo — no shadow service). Only call with
 * non-null terms once useK510Predicates has errored; pass nulls otherwise
 * so no request is issued. Rows are real FDA clearance records with no
 * match scoring — the surface renders them under an explicit
 * "Reduced results" label, never as predicate-intelligence output.
 */
export function useK510PredicateFallback(
  deviceName: string | null,
  productCode: string | null,
): UseK510PredicateFallbackResult {
  const url = predicateFallbackUrl(deviceName, productCode);
  const { data, loading, error } = useFetchJson<PredicateFallbackPayload>(url);
  if (!data) return { rows: null, available: null, unavailableReason: null, loading, error };
  if (!data.available) {
    return {
      rows: null,
      available: false,
      unavailableReason: data.unavailableReason ?? 'openFDA unavailable',
      loading,
      error,
    };
  }
  return {
    rows: Array.isArray(data.results) ? data.results : [],
    available: true,
    unavailableReason: null,
    loading,
    error,
  };
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

/**
 * Fetch the Substantial Equivalence matrix for a 510(k) program from
 * /api/predicate-intelligence/se-matrix (proxies to the python shadow
 * service). Verdict normalizes to same / equivalent / different.
 */
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
