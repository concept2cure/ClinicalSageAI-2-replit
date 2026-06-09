/**
 * ClinicalTrials.gov API v2 client.
 *
 * A small, governed wrapper over the public ClinicalTrials.gov v2 REST API
 * (https://clinicaltrials.gov/api/v2/studies). Backs AnA's
 * `search_clinical_evidence` tool for live competitive / precedent intelligence
 * and citeable trial evidence.
 *
 * The base URL is configurable via CTGOV_API_BASE_URL so deployments behind an
 * egress proxy / host allowlist (and unit tests) can redirect it without code
 * changes. Network failures throw — callers degrade gracefully.
 *
 * @module server/services/integrations/clinicaltrials-client
 */

const DEFAULT_BASE_URL = 'https://clinicaltrials.gov/api/v2';
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_PAGE_SIZE = 50;
const DEFAULT_PAGE_SIZE = 10;
const USER_AGENT =
  process.env.INTEGRATION_USER_AGENT || 'Concept2Cure-AnA/1.0 (regulatory intelligence)';

export interface CtgovSearchParams {
  /** Free-text term (maps to query.term). */
  query?: string;
  /** Condition / disease (query.cond). */
  condition?: string;
  /** Intervention / drug / device (query.intr). */
  intervention?: string;
  /** Lead sponsor / collaborator (query.spons). */
  sponsor?: string;
  /** Overall status filter(s), e.g. 'RECRUITING' or ['RECRUITING','COMPLETED']. */
  status?: string | string[];
  /** Phase filter, e.g. 'PHASE3' / '3' (mapped to aggFilters=phase:3). */
  phase?: string;
  /** Max studies to return (1–50, default 10). */
  pageSize?: number;
}

export interface CtgovTrial {
  nctId: string;
  title: string;
  status: string;
  phase: string;
  studyType: string;
  conditions: string[];
  interventions: string[];
  sponsor: string;
  enrollment: number | null;
  startDate: string | null;
  completionDate: string | null;
  /** Canonical public URL — use for citation. */
  url: string;
}

export interface CtgovSearchResult {
  source: 'ClinicalTrials.gov';
  /** Total studies matching the query across all pages (not just this page). */
  totalCount: number;
  trials: CtgovTrial[];
}

function baseUrl(): string {
  return (process.env.CTGOV_API_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '');
}

function toArray(v: string | string[] | undefined): string[] {
  if (!v) return [];
  return (Array.isArray(v) ? v : [v]).map(s => String(s).trim()).filter(Boolean);
}

/** Defensively map a v2 study object to our flat, citeable trial shape. */
export function normalizeStudy(study: any): CtgovTrial {
  const proto = study?.protocolSection ?? {};
  const idm = proto.identificationModule ?? {};
  const statusm = proto.statusModule ?? {};
  const design = proto.designModule ?? {};
  const conditionsm = proto.conditionsModule ?? {};
  const arms = proto.armsInterventionsModule ?? {};
  const sponsorm = proto.sponsorCollaboratorsModule ?? {};

  const nctId = typeof idm.nctId === 'string' ? idm.nctId : '';
  const enrollmentCount = design.enrollmentInfo?.count;

  return {
    nctId,
    title: idm.briefTitle || idm.officialTitle || '',
    status: statusm.overallStatus || '',
    phase: Array.isArray(design.phases) ? design.phases.join(', ') : '',
    studyType: design.studyType || '',
    conditions: Array.isArray(conditionsm.conditions) ? conditionsm.conditions : [],
    interventions: Array.isArray(arms.interventions)
      ? arms.interventions.map((i: any) => i?.name).filter((n: unknown): n is string => !!n)
      : [],
    sponsor: sponsorm.leadSponsor?.name || '',
    enrollment: typeof enrollmentCount === 'number' ? enrollmentCount : null,
    startDate: statusm.startDateStruct?.date ?? null,
    completionDate: statusm.completionDateStruct?.date ?? null,
    url: nctId ? `https://clinicaltrials.gov/study/${nctId}` : 'https://clinicaltrials.gov/',
  };
}

/** Build the v2 /studies query string from structured search params. */
export function buildStudiesQuery(params: CtgovSearchParams): URLSearchParams {
  const pageSize = Math.min(Math.max(Math.trunc(params.pageSize ?? DEFAULT_PAGE_SIZE), 1), MAX_PAGE_SIZE);
  const qs = new URLSearchParams();
  if (params.query) qs.set('query.term', params.query);
  if (params.condition) qs.set('query.cond', params.condition);
  if (params.intervention) qs.set('query.intr', params.intervention);
  if (params.sponsor) qs.set('query.spons', params.sponsor);

  const statuses = toArray(params.status).map(s => s.toUpperCase());
  if (statuses.length) qs.set('filter.overallStatus', statuses.join(','));

  if (params.phase) {
    const n = String(params.phase).replace(/[^0-9]/g, '');
    if (n) qs.set('aggFilters', `phase:${n}`);
  }

  qs.set('pageSize', String(pageSize));
  qs.set('countTotal', 'true');
  qs.set('format', 'json');
  return qs;
}

/**
 * Search ClinicalTrials.gov. Throws on network error or non-2xx response so the
 * caller can fall back. At least one of query/condition/intervention/sponsor
 * should be set; an empty search returns the registry's default (recent) page.
 */
export async function searchTrials(params: CtgovSearchParams): Promise<CtgovSearchResult> {
  const qs = buildStudiesQuery(params);
  const url = `${baseUrl()}/studies?${qs.toString()}`;

  const res = await fetch(url, {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: { 'User-Agent': USER_AGENT },
  });
  if (!res.ok) {
    throw new Error(`ClinicalTrials.gov API returned HTTP ${res.status}`);
  }

  const data: any = await res.json();
  const studies = Array.isArray(data?.studies) ? data.studies : [];
  const pageSize = Math.min(Math.max(Math.trunc(params.pageSize ?? DEFAULT_PAGE_SIZE), 1), MAX_PAGE_SIZE);

  return {
    source: 'ClinicalTrials.gov',
    totalCount: typeof data?.totalCount === 'number' ? data.totalCount : studies.length,
    trials: studies.slice(0, pageSize).map(normalizeStudy),
  };
}
