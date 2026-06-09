/**
 * Drugs@FDA approvals client (openFDA /drug/drugsfda).
 *
 * Backs AnA's `search_drug_approvals` tool — FDA approval status and regulatory
 * history for a drug: application number (NDA/BLA/ANDA), sponsor, approval
 * submissions/dates, marketing status, and products. Use for "is X approved /
 * when / under what application", and reference-product / 505(b)(2) strategy.
 *
 * Base URL overridable via OPENFDA_API_BASE_URL; optional OPENFDA_API_KEY raises
 * the rate limit. Network/HTTP failures throw so the caller degrades.
 *
 * @module server/services/integrations/drug-approvals-client
 */

const DEFAULT_BASE_URL = 'https://api.fda.gov';
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_LIMIT = 10;
const DEFAULT_LIMIT = 5;
const USER_AGENT =
  process.env.INTEGRATION_USER_AGENT || 'Concept2Cure-AnA/1.0 (regulatory intelligence)';

export interface DrugApprovalSearchParams {
  brandName?: string;
  genericName?: string;
  applicationNumber?: string;
  query?: string;
  limit?: number;
}

export interface DrugApproval {
  applicationNumber: string;
  sponsor: string;
  brandNames: string[];
  genericNames: string[];
  marketingStatus: string;
  approvalCount: number;
  latestApprovalDate: string | null;
}

export interface DrugApprovalSearchResult {
  source: 'Drugs@FDA (openFDA)';
  searchExpression: string;
  total: number;
  approvals: DrugApproval[];
}

function baseUrl(): string {
  return (process.env.OPENFDA_API_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '');
}

function uniqStrings(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return Array.from(new Set(values.map(v => String(v)).filter(Boolean)));
}

/** Single-clause openFDA query (robust under encodeURIComponent). */
export function buildDrugApprovalSearch(params: DrugApprovalSearchParams): string {
  const appNum = (params.applicationNumber || '').trim();
  if (appNum) return `application_number:"${appNum}"`;
  const brand = (params.brandName || params.query || '').trim();
  if (brand) return `products.brand_name:"${brand}"`;
  const generic = (params.genericName || '').trim();
  if (generic) return `openfda.generic_name:"${generic}"`;
  return '';
}

/** Format an openFDA YYYYMMDD date to YYYY-MM-DD; pass through anything else. */
function fmtDate(d: string): string {
  return /^\d{8}$/.test(d) ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}` : d;
}

export function normalizeApproval(raw: any): DrugApproval {
  const r = raw ?? {};
  const openfda = r.openfda ?? {};
  const products = Array.isArray(r.products) ? r.products : [];
  const submissions = Array.isArray(r.submissions) ? r.submissions : [];

  const approved = submissions.filter((s: any) => s?.submission_status === 'AP');
  const approvalDates = approved
    .map((s: any) => (s?.submission_status_date ? fmtDate(String(s.submission_status_date)) : ''))
    .filter(Boolean)
    .sort();

  const brandNames = uniqStrings(openfda.brand_name).length
    ? uniqStrings(openfda.brand_name)
    : uniqStrings(products.map((p: any) => p?.brand_name));

  return {
    applicationNumber: String(r.application_number ?? ''),
    sponsor: String(r.sponsor_name ?? ''),
    brandNames,
    genericNames: uniqStrings(openfda.generic_name),
    marketingStatus: String(products[0]?.marketing_status ?? ''),
    approvalCount: approved.length,
    latestApprovalDate: approvalDates.length ? approvalDates[approvalDates.length - 1] : null,
  };
}

/**
 * Search Drugs@FDA. Empty result when no usable term; throws on non-404 HTTP
 * error (404 = zero matches → empty).
 */
export async function searchDrugApprovals(
  params: DrugApprovalSearchParams
): Promise<DrugApprovalSearchResult> {
  const limit = Math.min(Math.max(Math.trunc(params.limit ?? DEFAULT_LIMIT), 1), MAX_LIMIT);
  const search = buildDrugApprovalSearch(params);
  if (!search) {
    return { source: 'Drugs@FDA (openFDA)', searchExpression: '', total: 0, approvals: [] };
  }

  const qs = new URLSearchParams({ search, limit: String(limit) });
  if (process.env.OPENFDA_API_KEY) qs.set('api_key', process.env.OPENFDA_API_KEY);

  const res = await fetch(`${baseUrl()}/drug/drugsfda.json?${qs.toString()}`, {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: { 'User-Agent': USER_AGENT },
  });
  if (!res.ok) {
    if (res.status === 404) {
      return { source: 'Drugs@FDA (openFDA)', searchExpression: search, total: 0, approvals: [] };
    }
    throw new Error(`openFDA drug/drugsfda returned HTTP ${res.status}`);
  }

  const data: any = await res.json();
  const results = Array.isArray(data?.results) ? data.results : [];
  const total = Number(data?.meta?.results?.total ?? results.length) || results.length;
  return {
    source: 'Drugs@FDA (openFDA)',
    searchExpression: search,
    total,
    approvals: results.slice(0, limit).map(normalizeApproval),
  };
}
