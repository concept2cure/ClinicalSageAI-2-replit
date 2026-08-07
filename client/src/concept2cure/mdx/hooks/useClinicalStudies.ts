/**
 * useClinicalStudies — live adapter for the Clinical studies surface.
 *
 * `/api/mdx/clinical-studies` manages device clinical studies (IDE
 * pivotal, feasibility, PMS/PMCF) with nested sites, deviations, adverse
 * events and endpoints, plus a `/:id/summary` that aggregates the
 * enrollment and safety KPIs. It had three AnA tool handlers and **no
 * client consumer** (docs/MDX_SURFACE_COVERAGE_FINDING.md): the data was
 * reachable only by asking AnA, never by clicking.
 *
 * Two hooks live here:
 *   - useClinicalStudies(programId?) — the portfolio list.
 *   - useStudySummary(studyId)       — one study's KPI roll-up + nested
 *                                      detail, fetched only on drill-in.
 *
 * Every panel is a `DataState`, so the surface must say which of
 * loading / idle / error / empty / ready it is showing — a study list is
 * exactly the kind of screen a user reads to judge trial readiness, so a
 * fabricated one would be a filing hazard.
 */

import { useFetchJson } from './useFetchJson';
import { firstArray } from '../lib/payloadShape';
import { toDataState, type DataState } from '../lib/dataState';

/* ─── Server row shapes (snake_case, as SELECT * returns them) ────── */

interface RawStudy {
  id: number;
  study_id: string;
  nct_id: string | null;
  title: string;
  phase: string | null;
  study_type: string | null;
  status: string;
  sample_size_planned: number | null;
  sample_size_enrolled: number | null;
  sample_size_analyzed: number | null;
  ide_number: string | null;
  irb_approved: boolean | null;
  bimo_ready: boolean | null;
  primary_endpoint_met: boolean | null;
  start_date: string | null;
  program_id: string | null;
  [k: string]: unknown;
}

export interface StudyRow {
  id: number;
  studyId: string;
  nctId: string | null;
  title: string;
  phase: string | null;
  studyType: string | null;
  status: string;
  samplePlanned: number | null;
  sampleEnrolled: number | null;
  sampleAnalyzed: number | null;
  ideNumber: string | null;
  irbApproved: boolean;
  bimoReady: boolean;
  primaryEndpointMet: boolean | null;
  startDate: string | null;
  programId: string | null;
}

/**
 * Map one server row to the surface's camelCase shape. Reads the
 * snake_case columns the route returns; a null count stays null (the
 * study has not recorded a planned/enrolled size) rather than becoming a
 * misleading zero.
 */
export function adaptStudy(r: RawStudy): StudyRow {
  const numOrNull = (v: unknown): number | null =>
    v === null || v === undefined ? null : Number(v);
  return {
    id: Number(r.id),
    studyId: String(r.study_id ?? ''),
    nctId: r.nct_id ?? null,
    title: String(r.title ?? ''),
    phase: r.phase ?? null,
    studyType: r.study_type ?? null,
    status: String(r.status ?? 'planning'),
    samplePlanned: numOrNull(r.sample_size_planned),
    sampleEnrolled: numOrNull(r.sample_size_enrolled),
    sampleAnalyzed: numOrNull(r.sample_size_analyzed),
    ideNumber: r.ide_number ?? null,
    irbApproved: r.irb_approved === true,
    bimoReady: r.bimo_ready === true,
    primaryEndpointMet: r.primary_endpoint_met ?? null,
    startDate: r.start_date ?? null,
    programId: r.program_id ?? null,
  };
}

export interface StudyKpis {
  total: number;
  enrolling: number;
  planned: number;
  enrolled: number;
  /** Enrolled ÷ planned across the portfolio, 0 when nothing is planned. */
  enrollmentPercent: number;
  bimoReady: number;
  irbApproved: number;
}

const ENROLLING = new Set(['enrolling', 'follow_up']);

/**
 * Portfolio counters derived from the study list. Kept pure and exported
 * so the arithmetic is unit-tested without a DOM. Studies with a null
 * planned/enrolled size contribute 0 to the sums but are still counted
 * in `total` — a study exists whether or not its sizes are recorded.
 */
export function deriveStudyKpis(rows: StudyRow[]): StudyKpis {
  let planned = 0;
  let enrolled = 0;
  let enrolling = 0;
  let bimoReady = 0;
  let irbApproved = 0;
  for (const s of rows) {
    planned += s.samplePlanned ?? 0;
    enrolled += s.sampleEnrolled ?? 0;
    if (ENROLLING.has(s.status)) enrolling += 1;
    if (s.bimoReady) bimoReady += 1;
    if (s.irbApproved) irbApproved += 1;
  }
  return {
    total: rows.length,
    enrolling,
    planned,
    enrolled,
    enrollmentPercent: planned === 0 ? 0 : Math.round((enrolled / planned) * 100),
    bimoReady,
    irbApproved,
  };
}

interface ListPayload {
  data: RawStudy[];
  meta?: { count?: number };
}

export interface UseClinicalStudiesResult {
  studies: DataState<StudyRow[]>;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

/**
 * @param programId Narrows the list to one program. Omit for the
 *                  portfolio-wide view — clinical studies commonly span
 *                  several programs, so org-wide is the default.
 */
export function useClinicalStudies(programId?: string | null): UseClinicalStudiesResult {
  const url = programId
    ? `/api/mdx/clinical-studies?program_id=${encodeURIComponent(programId)}`
    : '/api/mdx/clinical-studies';
  const { data, loading, error, refresh } = useFetchJson<ListPayload>(url);

  // See useCdxClia: the truthiness test admits any non-null value, including
  // the `{}` that a version-skewed route sends where a list belongs.
  const rows = firstArray<RawStudy>(data?.data)?.map(adaptStudy) ?? null;

  return {
    studies: toDataState(rows, loading, error),
    loading,
    error,
    refresh,
  };
}

/* ─── Per-study drill-in ─────────────────────────────────────────── */

export interface StudySummary {
  enrollment: {
    planned: number;
    enrolled: number;
    percent: number;
    sites: { total: number; activated: number; enrolled_total: number };
  };
  deviations: { total: number; major: number; open: number };
  safety: { total: number; serious: number; uade: number; device_related: number };
  endpoints: { total: number; met: number; not_met: number; primary_met: number };
}

interface SummaryPayload {
  data: StudySummary;
}

export interface UseStudySummaryResult {
  summary: DataState<StudySummary>;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

/**
 * One study's aggregated enrollment/safety roll-up. Pass `null` before a
 * study is selected — useFetchJson then issues no request and the state
 * is `idle`, so the detail panel reads "select a study" rather than a
 * spurious empty.
 *
 * @param studyId Numeric study id, or null when nothing is selected.
 */
export function useStudySummary(studyId: number | null): UseStudySummaryResult {
  const url = studyId != null ? `/api/mdx/clinical-studies/${studyId}/summary` : null;
  const { data, loading, error, refresh } = useFetchJson<SummaryPayload>(url);

  return {
    summary: toDataState(data?.data ?? null, loading, error, {
      idleReason: 'Select a study to see its enrollment and safety roll-up.',
    }),
    loading,
    error,
    refresh,
  };
}
