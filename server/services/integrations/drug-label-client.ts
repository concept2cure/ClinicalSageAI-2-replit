/**
 * openFDA drug label client.
 *
 * Backs AnA's `search_drug_labels` tool — pulls the FDA Structured Product
 * Labeling (SPL) for a drug (indications, warnings/boxed warning, dosage) for
 * label-claim grounding, comparison against a reference/predicate label, and
 * safety-section drafting.
 *
 * Base URL overridable via OPENFDA_API_BASE_URL (egress proxy / tests); optional
 * OPENFDA_API_KEY raises the rate limit. Network/HTTP failures throw so the
 * caller degrades gracefully.
 *
 * @module server/services/integrations/drug-label-client
 */

import { fetchWithRetry } from './http.js';

const DEFAULT_BASE_URL = 'https://api.fda.gov';
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_LIMIT = 10;
const DEFAULT_LIMIT = 3;
const SECTION_CAP = 1500; // keep long SPL sections compact for the model
const USER_AGENT =
  process.env.INTEGRATION_USER_AGENT || 'Concept2Cure-AnA/1.0 (regulatory intelligence)';

export interface DrugLabelSearchParams {
  brandName?: string;
  genericName?: string;
  /** Free-text fallback (matched against brand name). */
  query?: string;
  limit?: number;
}

export interface DrugLabel {
  id: string;
  brandName: string;
  genericName: string;
  manufacturer: string;
  indications: string;
  warnings: string;
  dosage: string;
}

export interface DrugLabelSearchResult {
  source: 'FDA Drug Labels (openFDA SPL)';
  searchExpression: string;
  total: number;
  labels: DrugLabel[];
}

function baseUrl(): string {
  return (process.env.OPENFDA_API_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '');
}

function firstStr(v: unknown): string {
  if (Array.isArray(v)) return v.length ? String(v[0]) : '';
  return v == null ? '' : String(v);
}

function cap(s: string): string {
  return s.length > SECTION_CAP ? `${s.slice(0, SECTION_CAP)}…` : s;
}

/** Single-clause openFDA query (robust under encodeURIComponent). */
export function buildDrugLabelSearch(params: DrugLabelSearchParams): string {
  const brand = (params.brandName || params.query || '').trim();
  if (brand) return `openfda.brand_name:"${brand}"`;
  const generic = (params.genericName || '').trim();
  if (generic) return `openfda.generic_name:"${generic}"`;
  return '';
}

export function normalizeLabel(raw: any): DrugLabel {
  const r = raw ?? {};
  const openfda = r.openfda ?? {};
  return {
    id: firstStr(r.id) || firstStr(openfda.spl_id) || firstStr(openfda.application_number),
    brandName: firstStr(openfda.brand_name),
    genericName: firstStr(openfda.generic_name),
    manufacturer: firstStr(openfda.manufacturer_name),
    indications: cap(firstStr(r.indications_and_usage)),
    warnings: cap(firstStr(r.boxed_warning) || firstStr(r.warnings) || firstStr(r.warnings_and_cautions)),
    dosage: cap(firstStr(r.dosage_and_administration)),
  };
}

/**
 * Search FDA drug labels. Returns an empty result when no usable term is given;
 * throws on network/HTTP error so the caller can fall back.
 */
export async function searchDrugLabels(params: DrugLabelSearchParams): Promise<DrugLabelSearchResult> {
  const limit = Math.min(Math.max(Math.trunc(params.limit ?? DEFAULT_LIMIT), 1), MAX_LIMIT);
  const search = buildDrugLabelSearch(params);
  if (!search) {
    return { source: 'FDA Drug Labels (openFDA SPL)', searchExpression: '', total: 0, labels: [] };
  }

  const qs = new URLSearchParams({ search, limit: String(limit) });
  if (process.env.OPENFDA_API_KEY) qs.set('api_key', process.env.OPENFDA_API_KEY);

  const res = await fetchWithRetry(
    `${baseUrl()}/drug/label.json?${qs.toString()}`,
    { headers: { 'User-Agent': USER_AGENT } },
    { timeoutMs: REQUEST_TIMEOUT_MS }
  );
  if (!res.ok) {
    // openFDA returns 404 when a search has zero matches — treat as empty, not error.
    if (res.status === 404) {
      return { source: 'FDA Drug Labels (openFDA SPL)', searchExpression: search, total: 0, labels: [] };
    }
    throw new Error(`openFDA drug/label returned HTTP ${res.status}`);
  }

  const data: any = await res.json();
  const results = Array.isArray(data?.results) ? data.results : [];
  const total = Number(data?.meta?.results?.total ?? results.length) || results.length;
  return {
    source: 'FDA Drug Labels (openFDA SPL)',
    searchExpression: search,
    total,
    labels: results.slice(0, limit).map(normalizeLabel),
  };
}
