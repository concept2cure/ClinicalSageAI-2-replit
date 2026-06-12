/**
 * Preprint search client — bioRxiv / medRxiv (and other preprint servers).
 *
 * A small, governed wrapper for AnA's `search_preprints` tool. Keyword discovery
 * is backed by the Europe PMC REST API, which indexes preprint servers including
 * bioRxiv and medRxiv and — unlike the native bioRxiv API (DOI / date-range only,
 * no full-text search) — supports real query search. Results are restricted to
 * preprints (Europe PMC source `PPR`) and returned with a citeable DOI/URL, the
 * preprint server when identifiable, and the posting date.
 *
 * This surfaces emerging mechanism/target/translational evidence BEFORE peer
 * review — explicitly flagged as non-peer-reviewed so AnA cites it with the
 * appropriate caveat.
 *
 * Base URL is configurable via EUROPEPMC_API_BASE_URL (egress proxy / tests).
 * Network/HTTP failures throw so callers can degrade gracefully.
 *
 * @module server/services/integrations/preprint-client
 */

import { fetchWithRetry } from './http.js';

const DEFAULT_BASE_URL = 'https://www.ebi.ac.uk/europepmc/webservices/rest';
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_RESULTS = 25;
const DEFAULT_RESULTS = 5;

const USER_AGENT =
  process.env.INTEGRATION_USER_AGENT || 'Concept2Cure-AnA/1.0 (regulatory intelligence)';

function baseUrl(): string {
  return (process.env.EUROPEPMC_API_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '');
}

export type PreprintServerFilter = 'biorxiv' | 'medrxiv' | 'any';

export interface PreprintSearchParams {
  query: string;
  /** Max results (1–25, default 5). */
  maxResults?: number;
  /** Restrict to a specific preprint server, or 'any'. */
  server?: PreprintServerFilter;
}

export interface PreprintRecord {
  /** Europe PMC id (source-qualified). */
  id: string;
  title: string;
  authors: string;
  /** Identified preprint server (bioRxiv / medRxiv) when derivable, else generic. */
  server: string;
  doi: string | null;
  postedDate: string;
  /** Canonical public URL — DOI link when present, else Europe PMC. */
  url: string;
  /** Always true — these are not peer-reviewed. */
  isPreprint: true;
}

export interface PreprintSearchResult {
  source: 'Europe PMC (preprints)';
  query: string;
  totalCount: number;
  preprints: PreprintRecord[];
  /** Standing caveat — preprints are not peer-reviewed. */
  caveat: string;
}

const CAVEAT =
  'Preprints are not peer-reviewed; treat findings as preliminary and cite with that caveat.';

/** Map a server filter to a Europe PMC query fragment, or '' for any preprint. */
export function serverFilterFragment(server?: PreprintServerFilter): string {
  switch ((server || 'any').toLowerCase()) {
    case 'biorxiv':
      return ' AND (PUBLISHER:"bioRxiv" OR JOURNAL:"bioRxiv")';
    case 'medrxiv':
      return ' AND (PUBLISHER:"medRxiv" OR JOURNAL:"medRxiv")';
    default:
      return '';
  }
}

/** Build the Europe PMC search URL (exported for testability). */
export function buildSearchUrl(params: PreprintSearchParams): string {
  const pageSize = Math.min(Math.max(Math.trunc(params.maxResults ?? DEFAULT_RESULTS), 1), MAX_RESULTS);
  // SRC:PPR restricts to preprints; the server fragment narrows to bioRxiv/medRxiv.
  const query = `(${params.query}) AND (SRC:PPR)${serverFilterFragment(params.server)}`;
  const qs = new URLSearchParams({
    query,
    format: 'json',
    pageSize: String(pageSize),
    resultType: 'lite',
    sort: 'P_PDATE_D desc',
  });
  return `${baseUrl()}/search?${qs.toString()}`;
}

/** Derive the preprint server from a Europe PMC result (journal/publisher or DOI). */
export function deriveServer(raw: any): string {
  const hay = `${raw?.journalTitle ?? ''} ${raw?.bookOrReportDetails?.publisher ?? ''} ${raw?.publisher ?? ''}`.toLowerCase();
  if (hay.includes('biorxiv')) return 'bioRxiv';
  if (hay.includes('medrxiv')) return 'medRxiv';
  // bioRxiv/medRxiv share DOI prefix 10.1101 (Cold Spring Harbor Laboratory).
  if (typeof raw?.doi === 'string' && raw.doi.startsWith('10.1101/')) return 'bioRxiv/medRxiv';
  return 'preprint';
}

/** Normalize a raw Europe PMC result into a preprint record. */
export function normalizePreprint(raw: any): PreprintRecord {
  const r = raw ?? {};
  const doi: string | null = r.doi ?? null;
  const id: string = r.id ? `${r.source ?? 'PPR'}/${r.id}` : '';
  const url = doi
    ? `https://doi.org/${doi}`
    : r.id
      ? `https://europepmc.org/article/${r.source ?? 'PPR'}/${r.id}`
      : 'https://europepmc.org/';
  return {
    id,
    title: r.title || '',
    authors: r.authorString || '',
    server: deriveServer(r),
    doi,
    postedDate: r.firstPublicationDate || r.pubYear || '',
    url,
    isPreprint: true,
  };
}

async function getJson(url: string): Promise<any> {
  const res = await fetchWithRetry(
    url,
    { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' } },
    { timeoutMs: REQUEST_TIMEOUT_MS }
  );
  if (!res.ok) throw new Error(`Europe PMC returned HTTP ${res.status}`);
  return res.json();
}

/**
 * Search preprints (bioRxiv / medRxiv via Europe PMC). Throws on network/HTTP
 * error so the caller can fall back to manual-search guidance.
 */
export async function searchPreprints(params: PreprintSearchParams): Promise<PreprintSearchResult> {
  const query = (params.query ?? '').trim();
  if (!query) {
    return { source: 'Europe PMC (preprints)', query: '', totalCount: 0, preprints: [], caveat: CAVEAT };
  }
  const data = await getJson(buildSearchUrl({ ...params, query }));
  const list: any[] = Array.isArray(data?.resultList?.result) ? data.resultList.result : [];
  const totalCount = Number(data?.hitCount ?? list.length) || list.length;
  return {
    source: 'Europe PMC (preprints)',
    query,
    totalCount,
    preprints: list.map(normalizePreprint),
    caveat: CAVEAT,
  };
}
