/**
 * CMS Medicare Coverage Database (MCD) client.
 *
 * Wraps the public CMS Coverage API v1 report endpoints (no API key required
 * as of 2024-02-08) for AnA's `search_medicare_coverage` tool — surfacing
 * Medicare reimbursement/coverage intelligence (NCDs and final LCDs) alongside
 * regulatory readiness.
 *
 *   National Coverage Determinations: GET /v1/reports/national-coverage-ncd/
 *   Final Local Coverage Determinations: GET /v1/reports/local-coverage-final-lcds
 *
 * The report endpoints list documents; this client filters/paginates defensively
 * client-side so it is robust to server-side filter-param differences. The base
 * URL is configurable via CMS_COVERAGE_API_BASE_URL (egress proxy / tests).
 * Network/HTTP failures throw so the caller can degrade gracefully.
 *
 * NOTE: endpoint paths and response shape were verified against CMS API docs and
 * a live response sample; validate against the live API in a networked env.
 *
 * @module server/services/integrations/cms-coverage-client
 */

import { fetchWithRetry } from './http.js';

const DEFAULT_BASE_URL = 'https://api.coverage.cms.gov/v1';
const MCD_VIEWER_BASE = 'https://www.cms.gov/medicare-coverage-database/view';
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_RESULTS = 25;
const DEFAULT_RESULTS = 10;
const USER_AGENT =
  process.env.INTEGRATION_USER_AGENT || 'Concept2Cure-AnA/1.0 (regulatory intelligence)';

export type CmsCoverageType = 'ncd' | 'lcd';

export interface CmsCoverageSearchParams {
  /** Filter documents whose title contains this term (case-insensitive). */
  keyword?: string;
  /** 'ncd' (national) or 'lcd' (local). Default 'ncd'. */
  type?: CmsCoverageType;
  /** Max documents to return (1–25, default 10). */
  limit?: number;
}

export interface CmsCoverageDoc {
  /** Human-facing display id (e.g. NCD "20.31.3" or the LCD number). */
  documentId: string;
  title: string;
  type: string;
  lastUpdated: string;
  /** Canonical public MCD viewer URL — use for citation. */
  url: string;
}

export interface CmsCoverageResult {
  source: 'CMS Medicare Coverage Database';
  type: CmsCoverageType;
  /** Documents available from the endpoint before keyword filtering. */
  totalAvailable: number;
  /** Documents matching the keyword filter. */
  matched: number;
  documents: CmsCoverageDoc[];
}

function baseUrl(): string {
  return (process.env.CMS_COVERAGE_API_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '');
}

function endpointFor(type: CmsCoverageType): string {
  return type === 'lcd' ? 'reports/local-coverage-final-lcds' : 'reports/national-coverage-ncd/';
}

/** Defensively locate the items array regardless of envelope shape. */
export function extractItems(data: any): any[] {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.result?.items)) return data.result.items;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.data)) return data.data;
  return [];
}

/** Build a public MCD viewer URL for citation; falls back to the MCD search page. */
export function buildViewerUrl(type: CmsCoverageType, id: unknown, version: unknown): string {
  if (id === undefined || id === null || id === '') {
    return 'https://www.cms.gov/medicare-coverage-database/search.aspx';
  }
  const ver = version === undefined || version === null ? '' : String(version);
  if (type === 'lcd') {
    return `${MCD_VIEWER_BASE}/lcd.aspx?lcdid=${id}${ver ? `&ver=${ver}` : ''}`;
  }
  return `${MCD_VIEWER_BASE}/ncd.aspx?ncdid=${id}${ver ? `&ncdver=${ver}` : ''}`;
}

/** Defensively normalize a raw report item to our flat, citeable shape. */
export function normalizeDoc(item: any, type: CmsCoverageType): CmsCoverageDoc {
  const it = item ?? {};
  return {
    documentId: String(it.document_display_id ?? it.document_id ?? ''),
    title: it.title ?? '',
    type: it.document_type ?? (type === 'lcd' ? 'LCD' : 'NCD'),
    lastUpdated: it.last_updated ?? '',
    url: buildViewerUrl(type, it.document_id, it.document_version),
  };
}

/**
 * Search the Medicare Coverage Database for NCDs or final LCDs. Throws on
 * network/HTTP error. Keyword filtering and pagination are applied client-side
 * for robustness against server-side parameter differences.
 */
export async function searchMedicareCoverage(
  params: CmsCoverageSearchParams
): Promise<CmsCoverageResult> {
  const type: CmsCoverageType = params.type === 'lcd' ? 'lcd' : 'ncd';
  const limit = Math.min(Math.max(Math.trunc(params.limit ?? DEFAULT_RESULTS), 1), MAX_RESULTS);

  const qs = new URLSearchParams();
  // Best-effort server-side filter; results are also filtered client-side.
  if (params.keyword) qs.set('keyword', params.keyword);
  const query = qs.toString();
  const url = `${baseUrl()}/${endpointFor(type)}${query ? `?${query}` : ''}`;

  const res = await fetchWithRetry(
    url,
    { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' } },
    { timeoutMs: REQUEST_TIMEOUT_MS }
  );
  if (!res.ok) {
    throw new Error(`CMS Coverage API returned HTTP ${res.status}`);
  }

  const data = await res.json();
  const items = extractItems(data);
  const kw = params.keyword?.trim().toLowerCase();
  const filtered = kw
    ? items.filter(it => String(it?.title ?? '').toLowerCase().includes(kw))
    : items;

  return {
    source: 'CMS Medicare Coverage Database',
    type,
    totalAvailable: items.length,
    matched: filtered.length,
    documents: filtered.slice(0, limit).map(it => normalizeDoc(it, type)),
  };
}
