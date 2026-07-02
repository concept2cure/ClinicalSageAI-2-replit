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

import { z } from 'zod';
import { fetchWithRetry } from './http.js';
// @ts-ignore -- JS module without type declarations (existing TTL cache).
import { createCache } from '../../cache_manager.js';

const DEFAULT_BASE_URL = 'https://api.fda.gov';
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_LIMIT = 10;
const DEFAULT_LIMIT = 3;
const SECTION_CAP = 1500; // keep long SPL sections compact for the model
const USER_AGENT =
  process.env.INTEGRATION_USER_AGENT || 'Concept2Cure-AnA/1.0 (regulatory intelligence)';

/** Cache the raw (pre-staleness) payload for 24h; SPL labels update infrequently. */
const CACHE_TTL_SECONDS = 24 * 60 * 60;
/**
 * Staleness threshold: a cached label result older than this (seconds) is
 * flagged `stale: true`. 12 hours is comfortable for SPL data.
 */
export const STALE_AFTER_SECONDS = 12 * 60 * 60;

const cache = createCache('openfda_drug_label');

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

/** Permissive shape guard — assert only the fields we read; never throw. */
const LabelResponseSchema = z
  .object({
    results: z.array(z.any()).optional(),
    meta: z
      .object({ results: z.object({ total: z.any().optional() }).passthrough().optional() })
      .passthrough()
      .optional(),
  })
  .passthrough();

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

export interface DrugLabelSearchResult extends Partial<StalenessFields> {
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
    return {
      source: 'FDA Drug Labels (openFDA SPL)',
      searchExpression: '',
      total: 0,
      labels: [],
      ...computeStaleness(Date.now()),
    };
  }

  const qs = new URLSearchParams({ search, limit: String(limit) });
  if (process.env.OPENFDA_API_KEY) qs.set('api_key', process.env.OPENFDA_API_KEY);
  const cacheKey = `${search}|limit:${limit}`;

  if (!isTestEnv()) {
    const cached = await cache.getCachedData(cacheKey);
    if (cached?.data) {
      return { ...cached.data, ...computeStaleness(cached.timestamp) };
    }
  }

  const res = await fetchWithRetry(
    `${baseUrl()}/drug/label.json?${qs.toString()}`,
    { headers: { 'User-Agent': USER_AGENT } },
    { timeoutMs: REQUEST_TIMEOUT_MS }
  );
  if (!res.ok) {
    // openFDA returns 404 when a search has zero matches — treat as empty, not error.
    if (res.status === 404) {
      return {
        source: 'FDA Drug Labels (openFDA SPL)',
        searchExpression: search,
        total: 0,
        labels: [],
        ...computeStaleness(Date.now()),
      };
    }
    throw new Error(`openFDA drug/label returned HTTP ${res.status}`);
  }

  const data: any = await res.json();
  const parsed = LabelResponseSchema.safeParse(data);
  if (!parsed.success) {
    console.warn(
      JSON.stringify({
        event: 'integration.response_shape_mismatch',
        source: 'FDA Drug Labels (openFDA SPL)',
        issues: parsed.error.issues.slice(0, 3),
      })
    );
  }
  const safe = parsed.success ? parsed.data : {};
  const results = Array.isArray(safe.results) ? safe.results : [];
  const total = Number(safe.meta?.results?.total ?? results.length) || results.length;
  const payload = {
    source: 'FDA Drug Labels (openFDA SPL)' as const,
    searchExpression: search,
    total,
    labels: results.slice(0, limit).map(normalizeLabel),
  };

  if (!isTestEnv()) {
    await cache.saveToCacheWithExpiry(cacheKey, payload, CACHE_TTL_SECONDS).catch(() => {});
  }
  return { ...payload, ...computeStaleness(Date.now()) };
}
