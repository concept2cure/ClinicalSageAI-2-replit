/**
 * useStudyDetail — the nested records behind a clinical study.
 *
 * `GET /api/mdx/clinical-studies/:id` returns the study plus its sites,
 * deviations, adverse events and endpoints. The Clinical studies surface
 * showed only the aggregated `/:id/summary` KPI roll-up; this hook fetches
 * the records themselves so a drill-in can show what the numbers are made
 * of — the actual sites, the open deviations, the serious AEs.
 *
 * One fetch feeds four `DataState`s, so each table declares its own
 * loading / empty / error honestly. Fetched only on drill-in: pass null
 * before a study is selected and no request is issued.
 */

import { useFetchJson } from './useFetchJson';
import { toDataState, type DataState } from '../lib/dataState';

/* ─── Row shapes (camelCase projections of the raw columns) ───────── */

export interface SiteRow {
  id: number;
  siteNumber: string;
  siteName: string;
  country: string | null;
  principalInvestigator: string | null;
  irbStatus: string | null;
  enrolledCount: number;
  activated: boolean;
}

export interface DeviationRow {
  id: number;
  deviationDate: string | null;
  category: string;
  description: string;
  subjectId: string | null;
  resolved: boolean;
  capaRequired: boolean;
}

export interface AeRow {
  id: number;
  aeId: string;
  aeDate: string | null;
  preferredTerm: string | null;
  serious: boolean;
  unanticipated: boolean;
  deviceRelated: string | null;
  severity: string | null;
  outcome: string | null;
  reportedToFda: boolean;
}

export interface EndpointRow {
  id: number;
  kind: string;
  name: string;
  met: boolean | null;
  targetValue: string | null;
  observedValue: string | null;
  pValue: string | null;
}

/* ─── Adapters — pure, exported for unit tests ───────────────────── */

const bool = (v: unknown): boolean => v === true;

export function adaptSite(r: Record<string, unknown>): SiteRow {
  return {
    id: Number(r.id),
    siteNumber: String(r.site_number ?? ''),
    siteName: String(r.site_name ?? ''),
    country: (r.country as string) ?? null,
    principalInvestigator: (r.principal_investigator as string) ?? null,
    irbStatus: (r.irb_status as string) ?? null,
    enrolledCount: Number(r.enrolled_count ?? 0),
    // A site is activated only when it has an activation date — an absent
    // date is "not activated", not a guessed yes.
    activated: r.activated_at != null,
  };
}

export function adaptDeviation(r: Record<string, unknown>): DeviationRow {
  return {
    id: Number(r.id),
    deviationDate: (r.deviation_date as string) ?? null,
    category: String(r.category ?? 'other'),
    description: String(r.description ?? ''),
    subjectId: (r.subject_id as string) ?? null,
    resolved: r.resolved_at != null,
    capaRequired: bool(r.capa_required),
  };
}

export function adaptAe(r: Record<string, unknown>): AeRow {
  return {
    id: Number(r.id),
    aeId: String(r.ae_id ?? ''),
    aeDate: (r.ae_date as string) ?? null,
    preferredTerm: (r.preferred_term as string) ?? null,
    serious: bool(r.serious),
    unanticipated: bool(r.unanticipated),
    deviceRelated: (r.device_related as string) ?? null,
    severity: (r.severity as string) ?? null,
    outcome: (r.outcome as string) ?? null,
    reportedToFda: r.reported_to_fda_at != null,
  };
}

export function adaptEndpoint(r: Record<string, unknown>): EndpointRow {
  return {
    id: Number(r.id),
    kind: String(r.endpoint_kind ?? 'secondary'),
    name: String(r.name ?? ''),
    // met is a genuine tri-state: true / false / not-yet-analysed (null).
    met: r.met === true ? true : r.met === false ? false : null,
    targetValue: (r.target_value as string) ?? null,
    observedValue: (r.observed_value as string) ?? null,
    pValue: r.p_value != null ? String(r.p_value) : null,
  };
}

interface DetailPayload {
  data: {
    sites?: Record<string, unknown>[];
    deviations?: Record<string, unknown>[];
    aes?: Record<string, unknown>[];
    endpoints?: Record<string, unknown>[];
  };
}

export interface UseStudyDetailResult {
  sites: DataState<SiteRow[]>;
  deviations: DataState<DeviationRow[]>;
  aes: DataState<AeRow[]>;
  endpoints: DataState<EndpointRow[]>;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

/**
 * @param studyId Numeric study id, or null when nothing is selected — the
 *                hook then issues no request and every panel is idle.
 */
export function useStudyDetail(studyId: number | null): UseStudyDetailResult {
  const url = studyId != null ? `/api/mdx/clinical-studies/${studyId}` : null;
  const { data, loading, error, refresh } = useFetchJson<DetailPayload>(url);
  const d = data?.data;

  const panel = <T,>(rows: Record<string, unknown>[] | undefined, adapt: (r: Record<string, unknown>) => T): DataState<T[]> =>
    toDataState(rows ? rows.map(adapt) : null, loading, error, {
      idleReason: 'Select a study to see its records.',
    });

  return {
    sites: panel(d?.sites, adaptSite),
    deviations: panel(d?.deviations, adaptDeviation),
    aes: panel(d?.aes, adaptAe),
    endpoints: panel(d?.endpoints, adaptEndpoint),
    loading,
    error,
    refresh,
  };
}
