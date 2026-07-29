/**
 * PubMed E-utilities client.
 *
 * A small, governed wrapper over NCBI E-utilities (esearch + esummary) for
 * AnA's `search_literature` tool. Provides citeable literature evidence
 * (PMID + canonical PubMed URL + DOI) for CER / clinical-evaluation grounding.
 *
 * Base URL is configurable via PUBMED_EUTILS_BASE_URL (egress proxy / tests).
 * An optional NCBI_API_KEY raises the E-utilities rate limit. Network failures
 * throw so callers can degrade gracefully.
 *
 * @module server/services/integrations/pubmed-client
 */

import { z } from 'zod';
import { fetchWithRetry } from './http.js';
// @ts-ignore -- JS module without type declarations (existing TTL cache).
import { createCache } from '../../cache_manager.js';

const DEFAULT_BASE_URL = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_RESULTS = 20;
const DEFAULT_RESULTS = 5;

/** Cache the raw (pre-staleness) result payload for 12h; recompute freshness on read. */
const CACHE_TTL_SECONDS = 12 * 60 * 60;
/**
 * Staleness threshold: a cached PubMed result older than this (seconds) is
 * flagged `stale: true`. Literature moves slowly, so 6 hours is comfortable.
 */
export const STALE_AFTER_SECONDS = 6 * 60 * 60;

const cache = createCache('pubmed');

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

/** Permissive shape guards — assert only the fields we read; never throw. */
const EsearchSchema = z
  .object({
    esearchresult: z
      .object({ idlist: z.array(z.any()).optional(), count: z.any().optional() })
      .passthrough()
      .optional(),
  })
  .passthrough();
const EsummarySchema = z
  .object({ result: z.record(z.string(), z.any()).optional() })
  .passthrough();

function warnShapeMismatch(stage: string, err: z.ZodError): void {
  console.warn(
    JSON.stringify({
      event: 'integration.response_shape_mismatch',
      source: 'PubMed',
      stage,
      issues: err.issues.slice(0, 3),
    })
  );
}

export type PubmedStudyType =
  | 'rct'
  | 'observational'
  | 'systematic_review'
  | 'case_report'
  | 'any';

export interface PubmedSearchParams {
  query: string;
  /** Max articles (1–20, default 5). */
  maxResults?: number;
  /** Year or range, e.g. "2020-2025" or "2023". */
  dateRange?: string;
  /** Restrict to a publication type. */
  studyType?: PubmedStudyType | string;
}

export interface PubmedArticle {
  pmid: string;
  title: string;
  authors: string;
  journal: string;
  pubDate: string;
  doi: string | null;
  /** Canonical public URL — use for citation. */
  url: string;
}

export interface PubmedSearchResult extends Partial<StalenessFields> {
  source: 'PubMed';
  /** Total articles matching the query (not just this page). */
  totalCount: number;
  articles: PubmedArticle[];
}

function baseUrl(): string {
  return (process.env.PUBMED_EUTILS_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '');
}

/**
 * Apply NCBI E-utilities usage-policy params. NCBI asks every caller to identify
 * itself with `tool` and `email`; requests omitting them are throttled/blocked
 * once usage is non-trivial. `api_key` (when set) raises the rate limit.
 */
function applyEtiquette(qs: URLSearchParams): URLSearchParams {
  qs.set('tool', process.env.NCBI_TOOL_NAME || 'concept2cure');
  if (process.env.NCBI_TOOL_EMAIL) qs.set('email', process.env.NCBI_TOOL_EMAIL);
  if (process.env.NCBI_API_KEY) qs.set('api_key', process.env.NCBI_API_KEY);
  return qs;
}

/** Map a study type to a PubMed publication-type term fragment, or '' for any. */
export function studyTypeFilter(studyType?: string): string {
  switch ((studyType || 'any').toLowerCase()) {
    case 'rct':
      return 'randomized controlled trial[pt]';
    case 'systematic_review':
      return '(systematic review[pt] OR meta-analysis[pt])';
    case 'observational':
      return 'observational study[pt]';
    case 'case_report':
      return 'case reports[pt]';
    default:
      return '';
  }
}

/** Parse "YYYY" or "YYYY-YYYY" into PubMed mindate/maxdate, or null. */
export function parseDateRange(dateRange?: string): { mindate: string; maxdate: string } | null {
  if (!dateRange) return null;
  const years = dateRange.match(/\d{4}/g);
  if (!years || years.length === 0) return null;
  const mindate = years[0];
  const maxdate = years[years.length - 1];
  return { mindate, maxdate };
}

/** Build the esearch query string (exported for testability). */
export function buildEsearchParams(params: PubmedSearchParams): URLSearchParams {
  const retmax = Math.min(Math.max(Math.trunc(params.maxResults ?? DEFAULT_RESULTS), 1), MAX_RESULTS);
  const ptFilter = studyTypeFilter(params.studyType);
  const term = ptFilter ? `(${params.query}) AND ${ptFilter}` : params.query;

  const qs = new URLSearchParams({
    db: 'pubmed',
    term,
    retmax: String(retmax),
    retmode: 'json',
    sort: 'relevance',
  });

  const dates = parseDateRange(params.dateRange);
  if (dates) {
    qs.set('datetype', 'pdat');
    qs.set('mindate', dates.mindate);
    qs.set('maxdate', dates.maxdate);
  }
  return applyEtiquette(qs);
}

function normalizeArticle(pmid: string, raw: any): PubmedArticle {
  const a = raw ?? {};
  const authors = Array.isArray(a.authors)
    ? a.authors.slice(0, 3).map((x: any) => x?.name).filter(Boolean).join(', ')
    : '';
  return {
    pmid,
    title: a.title || '',
    authors,
    journal: a.fulljournalname || a.source || '',
    pubDate: a.pubdate || '',
    doi: a.elocationid || null,
    url: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
  };
}

const USER_AGENT =
  process.env.INTEGRATION_USER_AGENT || 'Concept2Cure-AnA/1.0 (regulatory intelligence)';

async function getJson(url: string): Promise<any> {
  const res = await fetchWithRetry(url, { headers: { 'User-Agent': USER_AGENT } }, { timeoutMs: REQUEST_TIMEOUT_MS });
  if (!res.ok) throw new Error(`PubMed E-utilities returned HTTP ${res.status}`);
  return res.json();
}

/**
 * Search PubMed (esearch → esummary). Throws on network/HTTP error so the
 * caller can fall back to manual-search guidance.
 */
export async function searchPubmed(params: PubmedSearchParams): Promise<PubmedSearchResult> {
  const esearchParams = buildEsearchParams(params);
  const cacheKey = esearchParams.toString();

  if (!isTestEnv()) {
    const cached = await cache.getCachedData(cacheKey);
    if (cached?.data) {
      return { ...cached.data, ...computeStaleness(cached.timestamp) };
    }
  }

  const esearch = await getJson(`${baseUrl()}/esearch.fcgi?${esearchParams.toString()}`);
  const esearchParsed = EsearchSchema.safeParse(esearch);
  if (!esearchParsed.success) warnShapeMismatch('esearch', esearchParsed.error);
  const esearchResult = (esearchParsed.success ? esearchParsed.data : {})?.esearchresult ?? {};
  const ids: string[] = Array.isArray(esearchResult.idlist) ? esearchResult.idlist : [];
  const totalCount = Number(esearchResult.count ?? ids.length) || ids.length;

  if (ids.length === 0) {
    const emptyPayload = { source: 'PubMed' as const, totalCount: 0, articles: [] };
    return { ...emptyPayload, ...computeStaleness(Date.now()) };
  }

  const summaryQs = applyEtiquette(
    new URLSearchParams({ db: 'pubmed', id: ids.join(','), retmode: 'json' })
  );
  const summary = await getJson(`${baseUrl()}/esummary.fcgi?${summaryQs.toString()}`);
  const summaryParsed = EsummarySchema.safeParse(summary);
  if (!summaryParsed.success) warnShapeMismatch('esummary', summaryParsed.error);
  const resultMap = (summaryParsed.success ? summaryParsed.data : {})?.result ?? {};

  const articles = ids.map(id => normalizeArticle(id, resultMap[id]));
  const payload = { source: 'PubMed' as const, totalCount, articles };

  if (!isTestEnv()) {
    await cache.saveToCacheWithExpiry(cacheKey, payload, CACHE_TTL_SECONDS).catch(() => {});
  }
  return { ...payload, ...computeStaleness(Date.now()) };
}
