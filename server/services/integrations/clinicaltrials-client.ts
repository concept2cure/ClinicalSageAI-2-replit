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

import { z } from 'zod';
import { fetchWithRetry } from './http.js';
// @ts-ignore -- JS module without type declarations (existing TTL cache).
import { createCache } from '../../cache_manager.js';

const DEFAULT_BASE_URL = 'https://clinicaltrials.gov/api/v2';
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_PAGE_SIZE = 50;
const DEFAULT_PAGE_SIZE = 10;
const USER_AGENT =
  process.env.INTEGRATION_USER_AGENT || 'Concept2Cure-AnA/1.0 (regulatory intelligence)';

/** Cache the raw (pre-staleness) result payload for 6h; recompute freshness on read. */
const CACHE_TTL_SECONDS = 6 * 60 * 60;
/**
 * Staleness threshold: a cached result older than this (in seconds) is flagged
 * `stale: true` so the model can down-weight it or trigger a refresh. Data
 * younger than this is considered acceptably fresh. 1 hour for CT.gov.
 */
export const STALE_AFTER_SECONDS = 60 * 60;

const cache = createCache('ctgov');

function isTestEnv(): boolean {
  return !!process.env.VITEST || process.env.NODE_ENV === 'test';
}

export interface StalenessFields {
  /** ISO timestamp of when the underlying data was fetched from the source. */
  retrievedAt: string;
  /** Age of the returned data in seconds (0 for a fresh fetch). */
  cacheAgeSeconds: number;
  /** True when `cacheAgeSeconds` exceeds {@link STALE_AFTER_SECONDS}. */
  stale: boolean;
}

/** Derive additive freshness fields from the epoch-ms the data was fetched. */
export function computeStaleness(fetchedAtMs: number): StalenessFields {
  const cacheAgeSeconds = Math.max(0, Math.round((Date.now() - fetchedAtMs) / 1000));
  return {
    retrievedAt: new Date(fetchedAtMs).toISOString(),
    cacheAgeSeconds,
    stale: cacheAgeSeconds > STALE_AFTER_SECONDS,
  };
}

/**
 * Permissive top-level shape guard. We only assert the fields we read exist and
 * are the right type; everything else passes through. On mismatch we log and
 * fall back to safe empties (never throw) to preserve graceful degradation.
 */
const CtgovResponseSchema = z
  .object({
    studies: z.array(z.any()).optional(),
    totalCount: z.number().optional(),
  })
  .passthrough();

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

export interface CtgovSearchResult extends Partial<StalenessFields> {
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
  const cacheKey = qs.toString();

  // Serve from TTL cache when available (skipped under the test runner so
  // fetch-based unit tests keep their deterministic call counts).
  if (!isTestEnv()) {
    const cached = await cache.getCachedData(cacheKey);
    if (cached?.data) {
      return { ...cached.data, ...computeStaleness(cached.timestamp) };
    }
  }

  const res = await fetchWithRetry(url, { headers: { 'User-Agent': USER_AGENT } }, { timeoutMs: REQUEST_TIMEOUT_MS });
  if (!res.ok) {
    throw new Error(`ClinicalTrials.gov API returned HTTP ${res.status}`);
  }

  const data: any = await res.json();
  const parsed = CtgovResponseSchema.safeParse(data);
  if (!parsed.success) {
    console.warn(
      JSON.stringify({
        event: 'integration.response_shape_mismatch',
        source: 'ClinicalTrials.gov',
        issues: parsed.error.issues.slice(0, 3),
      })
    );
  }
  const safe = parsed.success ? parsed.data : {};
  const studies = Array.isArray(safe.studies) ? safe.studies : [];
  const pageSize = Math.min(Math.max(Math.trunc(params.pageSize ?? DEFAULT_PAGE_SIZE), 1), MAX_PAGE_SIZE);

  const payload = {
    source: 'ClinicalTrials.gov' as const,
    totalCount: typeof safe.totalCount === 'number' ? safe.totalCount : studies.length,
    trials: studies.slice(0, pageSize).map(normalizeStudy),
  };

  if (!isTestEnv()) {
    await cache.saveToCacheWithExpiry(cacheKey, payload, CACHE_TTL_SECONDS).catch(() => {});
  }
  return { ...payload, ...computeStaleness(Date.now()) };
}
