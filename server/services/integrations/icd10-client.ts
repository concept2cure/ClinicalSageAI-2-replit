/**
 * ICD-10-CM coding client (NLM Clinical Tables API).
 *
 * Backs AnA's `lookup_icd10_code` tool — maps an indication / diagnosis term to
 * billable ICD-10-CM codes for labeling, claims, coverage, and case reporting.
 * Uses the public, no-auth NLM Clinical Tables API:
 *   GET /api/icd10cm/v3/search?terms=...&sf=code,name&df=code,name
 * which returns the array shape [total, [codes], null, [[code,name],...]].
 *
 * Base URL configurable via ICD10_API_BASE_URL (egress proxy / tests). On the
 * resilient fetch seam; network/HTTP failures throw so the caller degrades.
 *
 * @module server/services/integrations/icd10-client
 */

import { fetchWithRetry } from './http.js';

const DEFAULT_BASE_URL = 'https://clinicaltables.nlm.nih.gov/api/icd10cm/v3';
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_RESULTS = 25;
const DEFAULT_RESULTS = 10;
const USER_AGENT =
  process.env.INTEGRATION_USER_AGENT || 'Concept2Cure-AnA/1.0 (regulatory intelligence)';

export interface Icd10Code {
  code: string;
  description: string;
}

export interface Icd10SearchResult {
  source: 'NLM ICD-10-CM (Clinical Tables)';
  query: string;
  total: number;
  codes: Icd10Code[];
}

function baseUrl(): string {
  return (process.env.ICD10_API_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '');
}

/** Defensively parse the Clinical Tables [total, codes, _, display] array. */
export function parseClinicalTables(data: any): { total: number; codes: Icd10Code[] } {
  if (!Array.isArray(data)) return { total: 0, codes: [] };
  const total = typeof data[0] === 'number' ? data[0] : 0;
  const display = Array.isArray(data[3]) ? data[3] : [];
  const codeList = Array.isArray(data[1]) ? data[1] : [];
  const codes: Icd10Code[] = [];

  if (display.length) {
    for (const row of display) {
      if (Array.isArray(row) && row.length >= 2) {
        codes.push({ code: String(row[0]), description: String(row[1]) });
      } else if (Array.isArray(row) && row.length === 1) {
        codes.push({ code: String(row[0]), description: '' });
      }
    }
  } else {
    // Fallback: only the code list is populated.
    for (const c of codeList) codes.push({ code: String(c), description: '' });
  }
  return { total, codes };
}

/**
 * Look up ICD-10-CM codes for a diagnosis/indication term. Throws on network/
 * HTTP error so the caller can fall back to manual search.
 */
export async function lookupIcd10(term: string, maxResults = DEFAULT_RESULTS): Promise<Icd10SearchResult> {
  const limit = Math.min(Math.max(Math.trunc(maxResults), 1), MAX_RESULTS);
  const qs = new URLSearchParams({
    terms: term,
    maxList: String(limit),
    sf: 'code,name',
    df: 'code,name',
  });
  const res = await fetchWithRetry(
    `${baseUrl()}/search?${qs.toString()}`,
    { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' } },
    { timeoutMs: REQUEST_TIMEOUT_MS }
  );
  if (!res.ok) {
    throw new Error(`NLM ICD-10-CM API returned HTTP ${res.status}`);
  }
  const data = await res.json();
  const { total, codes } = parseClinicalTables(data);
  return {
    source: 'NLM ICD-10-CM (Clinical Tables)',
    query: term,
    total,
    codes: codes.slice(0, limit),
  };
}
