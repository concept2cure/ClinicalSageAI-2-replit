/**
 * EU CTIS (Clinical Trials Information System) client.
 *
 * Backs AnA's `search_eu_ctis` tool — live EU clinical-trial intelligence under
 * Regulation (EU) No 536/2014, the EU analogue of the US ClinicalTrials.gov
 * connector. Queries the public CTIS search surface for authorised/ongoing EU
 * trials and their EU trial number, sponsor, condition, phase, and overall status.
 *
 * Base URL is configurable via EU_CTIS_API_BASE_URL (egress proxy / tests).
 * UNLIKE the throw-on-failure US integration clients, this connector NEVER throws
 * on a network/HTTP error: it returns a typed `status: 'unavailable'` result so
 * the governed AnA handler degrades cleanly to manual-search guidance.
 *
 * @module server/services/integrations/eu-ctis-client
 */

import { fetchWithRetry } from './http.js';

const DEFAULT_BASE_URL = 'https://euclinicaltrials.eu/ctis-public-api';
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_PAGE_SIZE = 50;
const DEFAULT_PAGE_SIZE = 10;
const USER_AGENT =
  process.env.INTEGRATION_USER_AGENT || 'Concept2Cure-AnA/1.0 (regulatory intelligence)';

export const EU_CTIS_SOURCE = 'EU CTIS (Clinical Trials Information System)' as const;

export interface EuCtisSearchParams {
  /** Free-text term (condition, sponsor, medicinal product). */
  query?: string;
  /** Medical condition / therapeutic indication filter. */
  condition?: string;
  /** Sponsor name filter. */
  sponsor?: string;
  /** Trial phase filter, e.g. "Phase III" / "3". */
  phase?: string;
  /** Overall trial status filter, e.g. "Ongoing", "Authorised". */
  status?: string;
  /** Max trials to return (1–50, default 10). */
  pageSize?: number;
}

export interface EuCtisTrial {
  /** EU trial number (e.g. 2022-500001-30-00) — use for citation. */
  euTrialNumber: string;
  title: string;
  sponsor: string;
  conditions: string[];
  phase: string;
  status: string;
  /** Canonical public CTIS URL — use for citation. */
  url: string;
}

export interface EuCtisSearchResult {
  source: typeof EU_CTIS_SOURCE;
  /** 'ok' on a successful query (incl. zero matches); 'unavailable' on failure. */
  status: 'ok' | 'unavailable';
  /** Total trials matching the query across all pages (not just this page). */
  totalCount: number;
  trials: EuCtisTrial[];
  /** Human-readable reason when status is 'unavailable'. */
  message?: string;
}

function baseUrl(): string {
  return (process.env.EU_CTIS_API_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '');
}

function clampPageSize(pageSize?: number): number {
  return Math.min(Math.max(Math.trunc(pageSize ?? DEFAULT_PAGE_SIZE), 1), MAX_PAGE_SIZE);
}

function str(v: unknown): string {
  return v == null ? '' : String(v);
}

function strList(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(str).filter(Boolean);
  const s = str(v);
  return s ? [s] : [];
}

/** Build the CTIS search request body (exported for testability). */
export function buildEuCtisBody(params: EuCtisSearchParams): Record<string, unknown> {
  const pagination = { size: clampPageSize(params.pageSize), offset: 0 };
  const searchCriteria: Record<string, unknown> = {};
  const term = (params.query || params.condition || params.sponsor || '').trim();
  if (term) searchCriteria.containAll = term;
  if (params.condition?.trim()) searchCriteria.medicalCondition = params.condition.trim();
  if (params.sponsor?.trim()) searchCriteria.sponsor = params.sponsor.trim();
  if (params.phase?.trim()) searchCriteria.trialPhase = params.phase.trim();
  if (params.status?.trim()) searchCriteria.status = params.status.trim();
  return { pagination, sort: { property: 'decisionDate', direction: 'DESC' }, searchCriteria };
}

/** Defensively map a CTIS trial record to our flat, citeable shape. */
export function normalizeTrial(raw: any): EuCtisTrial {
  const r = raw ?? {};
  const euTrialNumber = str(r.ctNumber || r.euCtNumber || r.eudraCtInfo?.euCtNumber || r.id);
  return {
    euTrialNumber,
    title: str(r.ctTitle || r.title || r.publicTitle),
    sponsor: str(r.sponsor || r.primarySponsor || r.sponsorName),
    conditions: strList(r.conditions || r.medicalConditions || r.therapeuticArea),
    phase: str(r.trialPhase || r.phase),
    status: str(r.ctStatus || r.status || r.overallStatus),
    url: euTrialNumber
      ? `https://euclinicaltrials.eu/ctis-public/view/${encodeURIComponent(euTrialNumber)}`
      : 'https://euclinicaltrials.eu/ctis-public/search',
  };
}

/**
 * Search EU CTIS for clinical trials. Returns a typed result with
 * `status: 'unavailable'` (never throws) on any network/HTTP error so the AnA
 * handler can degrade to manual-search guidance.
 */
export async function searchEuCtis(params: EuCtisSearchParams): Promise<EuCtisSearchResult> {
  const pageSize = clampPageSize(params.pageSize);
  try {
    const url = `${baseUrl()}/search`;
    const res = await fetchWithRetry(
      url,
      {
        method: 'POST',
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(buildEuCtisBody(params)),
      },
      { timeoutMs: REQUEST_TIMEOUT_MS }
    );
    if (!res.ok) {
      if (res.status === 404) {
        return { source: EU_CTIS_SOURCE, status: 'ok', totalCount: 0, trials: [] };
      }
      return {
        source: EU_CTIS_SOURCE,
        status: 'unavailable',
        totalCount: 0,
        trials: [],
        message: `EU CTIS API returned HTTP ${res.status}`,
      };
    }

    const data: any = await res.json();
    const content = Array.isArray(data?.data)
      ? data.data
      : Array.isArray(data?.content)
        ? data.content
        : Array.isArray(data?.results)
          ? data.results
          : [];
    const totalCount =
      Number(data?.pagination?.totalRecords ?? data?.totalElements ?? data?.total ?? content.length) ||
      content.length;
    return {
      source: EU_CTIS_SOURCE,
      status: 'ok',
      totalCount,
      trials: content.slice(0, pageSize).map(normalizeTrial),
    };
  } catch (err) {
    return {
      source: EU_CTIS_SOURCE,
      status: 'unavailable',
      totalCount: 0,
      trials: [],
      message: err instanceof Error ? err.message : 'EU CTIS request failed',
    };
  }
}
