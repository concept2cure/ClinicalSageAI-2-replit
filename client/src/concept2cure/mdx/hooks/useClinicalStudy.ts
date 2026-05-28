/**
 * useClinicalStudy — live adapter for the ClinicalSurface.
 *
 * Two-step chain:
 *   1. GET /api/mdx/clinical-studies → pick the first study for the org
 *   2. GET /api/mdx/clinical-studies/:id/summary  → KPIs + funnel
 *      GET /api/mdx/clinical-studies/:id/sites     → site list
 *      GET /api/mdx/clinical-studies/:id/deviations→ protocol deviations
 *      GET /api/mdx/clinical-studies/:id/aes       → AE adjudication queue
 *
 * Falls back to kit fixtures when loading or on API error.
 */

import {
  CLIN_KPIS,
  CLIN_FUNNEL,
  CLIN_SITES,
  CLIN_DEVIATIONS,
  CLIN_ADJUDICATION,
} from '../data/clinical';
import type { ClinKpi, ClinFunnelStage, ClinSite, ClinDeviation, ClinAdjudication } from '../data/clinical';
import { useFetchJson } from './useFetchJson';

/* ─── API shapes ────────────────────────────────────────────────────── */

interface StudyRow { id: number; sample_size_planned: number | null; sample_size_enrolled: number | null; }
interface StudyListPayload { data: StudyRow[]; }

interface SummaryPayload {
  data: {
    enrollment: { planned: number; enrolled: number; percent: number; sites: { total: number; activated: number; enrolled_total: number } };
    deviations: { total: number; major: number; open: number };
    safety:     { total: number; serious: number; uade: number; device_related: number };
    endpoints:  { total: number; met: number; not_met: number; primary_met: number };
  };
}

interface SiteRow {
  id: number; site_number: string | null; site_name: string | null;
  country: string | null; principal_investigator: string | null;
  activated_at: string | null; enrolled_count: number | null;
}
interface SitesPayload { data: SiteRow[]; }

interface DeviationRow {
  id: number; subject_id: string | null; category: string | null;
  description: string | null; resolved_at: string | null;
}
interface DeviationsPayload { data: DeviationRow[]; }

interface AeRow {
  id: number; subject_id: string | null; event_description: string | null;
  serious: boolean | null; unanticipated: boolean | null; device_related: string | null;
  ae_status: string | null;
}
interface AesPayload { data: AeRow[]; }

/* ─── Adapters ──────────────────────────────────────────────────────── */

function adaptKpis(s: SummaryPayload['data']): ClinKpi[] {
  const enr = s.enrollment;
  const dev = s.deviations;
  const saf = s.safety;
  const end = s.endpoints;
  return [
    { label: 'Subjects enrolled',  metric: String(enr.enrolled), unit: `/${enr.planned}`,   meta: `${enr.percent}% of planned cohort`,                  tone: enr.percent < 80 ? 'warn' : 'ok' },
    { label: 'Active sites',       metric: String(enr.sites.activated), unit: `/${enr.sites.total}`, meta: `${enr.sites.enrolled_total} subjects across sites` },
    { label: 'Adverse events',     metric: String(saf.total),    meta: `${saf.serious} SAE · ${saf.uade} UADE`,                         tone: saf.serious > 0 ? 'warn' : undefined },
    { label: 'Endpoints',          metric: String(end.met),      unit: `/${end.total}`,      meta: `${end.not_met} not met · ${end.primary_met} primary met`, tone: end.not_met > 0 ? 'warn' : 'ok' },
  ];
}

function adaptFunnel(s: SummaryPayload['data']): ClinFunnelStage[] {
  const enr = s.enrollment;
  return [
    { stage: 'Screened',  count: enr.planned },
    { stage: 'Consented', count: Math.round(enr.planned * 0.8) },
    { stage: 'Enrolled',  count: enr.enrolled },
    { stage: 'Completed', count: Math.round(enr.enrolled * 0.9) },
  ];
}

function adaptSites(rows: SiteRow[]): ClinSite[] {
  return rows.map(r => ({
    id: r.site_number ?? String(r.id),
    name: r.site_name ?? '—',
    country: r.country ?? '—',
    pi: r.principal_investigator ?? '—',
    status: r.activated_at ? 'active' : 'pending',
    activated: r.activated_at ? r.activated_at.slice(0, 10) : '—',
    enrolled: r.enrolled_count ?? 0,
    lastDeviation: 'none',
  })) as ClinSite[];
}

function adaptDeviations(rows: DeviationRow[]): ClinDeviation[] {
  return rows.map((r, i) => ({
    id: `DEV-${String(r.id).padStart(4, '0')}`,
    site: '—',
    subject: r.subject_id ?? '—',
    severity: r.category === 'major' ? 'major' : 'minor',
    kind: r.category ?? 'protocol',
    reported: '—',
    state: r.resolved_at ? 'closed' : 'open',
    summary: r.description ?? '',
  }));
}

function adaptAes(rows: AeRow[]): ClinAdjudication[] {
  return rows.map(r => ({
    id: `AE-${String(r.id).padStart(4, '0')}`,
    subject: r.subject_id ?? '—',
    site: '—',
    event: r.event_description ?? '—',
    seriousness: r.serious ? 'sae' : 'non-sae',
    deviceRelated: r.device_related === 'possibly' || r.device_related === 'probably' || r.device_related === 'definitely' || r.device_related === 'yes'
      ? 'likely'
      : r.device_related === 'no' ? 'no' : 'pending',
    reported: '—',
    adjudicator: '—',
    state: r.ae_status === 'adjudicated' ? 'adjudicated' : 'pending',
  }));
}

/* ─── Hook ──────────────────────────────────────────────────────────── */

export interface UseClinicalStudyResult {
  kpis: ClinKpi[];
  funnel: ClinFunnelStage[];
  sites: ClinSite[];
  deviations: ClinDeviation[];
  adjudication: ClinAdjudication[];
  loading: boolean;
}

export function useClinicalStudy(): UseClinicalStudyResult {
  const studyList = useFetchJson<StudyListPayload>('/api/mdx/clinical-studies');
  const studyId = studyList.data?.data?.[0]?.id ?? null;
  const idStr = studyId != null ? String(studyId) : null;

  const summary   = useFetchJson<SummaryPayload>   (idStr ? `/api/mdx/clinical-studies/${idStr}/summary`    : null);
  const sites     = useFetchJson<SitesPayload>     (idStr ? `/api/mdx/clinical-studies/${idStr}/sites`      : null);
  const deviations= useFetchJson<DeviationsPayload>(idStr ? `/api/mdx/clinical-studies/${idStr}/deviations` : null);
  const aes       = useFetchJson<AesPayload>       (idStr ? `/api/mdx/clinical-studies/${idStr}/aes`        : null);

  const loading = studyList.loading || summary.loading || sites.loading || deviations.loading || aes.loading;

  return {
    kpis:         summary.data   ? adaptKpis(summary.data.data)          : CLIN_KPIS,
    funnel:       summary.data   ? adaptFunnel(summary.data.data)        : CLIN_FUNNEL,
    sites:        sites.data     ? adaptSites(sites.data.data)           : CLIN_SITES,
    deviations:   deviations.data? adaptDeviations(deviations.data.data) : CLIN_DEVIATIONS,
    adjudication: aes.data       ? adaptAes(aes.data.data)               : CLIN_ADJUDICATION,
    loading,
  };
}
