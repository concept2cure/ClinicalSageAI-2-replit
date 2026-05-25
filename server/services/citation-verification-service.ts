/**
 * @fileoverview Citation Verification Service
 *
 * Verifies that a cited reference actually exists, against real external
 * sources — PubMed (NCBI E-utilities) and CrossRef — rather than asserting
 * existence heuristically. Resolution order per citation:
 *   1. PMID  → NCBI ESummary (exact identifier lookup)
 *   2. DOI   → CrossRef /works/{doi} (exact identifier lookup)
 *   3. Title → PubMed ESearch then CrossRef bibliographic query, with a
 *              deterministic title-similarity match
 *
 * When a citation carries no resolvable identifying information the result is
 * `unverifiable` (exists = null). When an upstream API errors the result is
 * `error` (exists = null). The service never fabricates an existence verdict.
 */

import { createScopedLogger } from '../utils/logger.js';

const log = createScopedLogger('citation-verification');

const NCBI_BASE = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';
const CROSSREF_BASE = 'https://api.crossref.org/works';
const REQUEST_TIMEOUT_MS = 12000;
const TITLE_MATCH_THRESHOLD = 0.8;
const MAX_CONCURRENCY = 3;

export interface CitationInput {
  /** Caller-supplied identifier to correlate the result back to a reference. */
  id?: string;
  /** Full raw reference string (DOI/PMID are extracted from it when present). */
  raw?: string;
  title?: string;
  authors?: string;
  journal?: string;
  year?: number;
  doi?: string;
  pmid?: string;
}

export interface CitationMatch {
  source: 'pubmed' | 'crossref';
  title?: string;
  authors?: string;
  journal?: string;
  year?: number;
  doi?: string;
  pmid?: string;
  url?: string;
  /** Publication types from the source (e.g. PubMed pubtype). */
  publicationTypes?: string[];
  /** True when the source marks the work as retracted. undefined = unknown. */
  retracted?: boolean;
}

export type CitationVerificationStatus = 'verified' | 'not_found' | 'unverifiable' | 'error';

export interface CitationVerificationResult {
  id?: string;
  input: CitationInput;
  status: CitationVerificationStatus;
  /** true = verified to exist, false = searched and not found, null = could not check. */
  exists: boolean | null;
  /** 0..1 match confidence when verified, else null. */
  confidence: number | null;
  match: CitationMatch | null;
  /**
   * True when the matched publication is marked as retracted (citing it is a
   * scientific-integrity defect). undefined when existence wasn't verified or
   * retraction status is unknown.
   */
  retracted?: boolean;
  /**
   * Field-level mismatches between the cited reference and the resolved record
   * (e.g. wrong year, or a DOI that points to a different article than cited).
   * Present only when a verified match has discrepancies.
   */
  discrepancies?: string[];
  detail: string;
  checkedAt: string;
}

const DOI_RE = /10\.\d{4,9}\/[-._;()/:A-Z0-9]+/i;
const PMID_RE = /pmid:?\s*(\d{1,9})/i;

function normalizeTitle(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Deterministic Jaccard similarity over title word tokens (0..1). */
function titleSimilarity(a: string, b: string): number {
  const ta = new Set(normalizeTitle(a).split(' ').filter(Boolean));
  const tb = new Set(normalizeTitle(b).split(' ').filter(Boolean));
  if (ta.size === 0 || tb.size === 0) return 0;
  let intersection = 0;
  for (const token of ta) if (tb.has(token)) intersection++;
  const union = ta.size + tb.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

async function fetchJson(url: string, headers?: Record<string, string>): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal, headers });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

function ncbiApiKeyParam(): string {
  const key = process.env.PUBMED_API_KEY;
  return key ? `&api_key=${encodeURIComponent(key)}` : '';
}

function crossrefHeaders(): Record<string, string> {
  // CrossRef asks callers to identify themselves for the "polite" pool.
  const contact = process.env.CROSSREF_CONTACT_EMAIL;
  return { 'User-Agent': `Concept2Cure-CitationVerifier/1.0${contact ? ` (mailto:${contact})` : ''}` };
}

function extractDoi(input: CitationInput): string | undefined {
  if (input.doi) return input.doi.replace(/^doi:\s*/i, '').trim();
  const match = input.raw?.match(DOI_RE);
  return match ? match[0] : undefined;
}

function extractPmid(input: CitationInput): string | undefined {
  if (input.pmid) return String(input.pmid).trim();
  const match = input.raw?.match(PMID_RE);
  return match ? match[1] : undefined;
}

async function verifyByPmid(pmid: string): Promise<CitationMatch | null> {
  const url = `${NCBI_BASE}/esummary.fcgi?db=pubmed&id=${encodeURIComponent(pmid)}&retmode=json${ncbiApiKeyParam()}`;
  const data = await fetchJson(url);
  const record = data?.result?.[pmid];
  if (!record || record.error || !record.uid) return null;
  return pubmedMatch(pmid, record);
}

/** Build a CitationMatch from a PubMed ESummary record, incl. retraction status. */
function pubmedMatch(pmid: string, record: any): CitationMatch {
  const publicationTypes: string[] = Array.isArray(record.pubtype) ? record.pubtype : [];
  return {
    source: 'pubmed',
    title: record.title,
    authors: (record.authors || []).map((a: any) => a.name).join(', ') || undefined,
    journal: record.fulljournalname || record.source,
    year: record.pubdate ? parseInt(String(record.pubdate).slice(0, 4), 10) || undefined : undefined,
    doi: (record.elocationid || '').replace(/^doi:\s*/i, '') || undefined,
    pmid,
    url: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
    publicationTypes: publicationTypes.length ? publicationTypes : undefined,
    retracted: publicationTypes.some(t => /retracted publication/i.test(t)),
  };
}

async function verifyByDoi(doi: string): Promise<CitationMatch | null> {
  const data = await fetchJson(`${CROSSREF_BASE}/${encodeURIComponent(doi)}`, crossrefHeaders());
  const item = data?.message;
  if (!item || !item.DOI) return null;
  return {
    source: 'crossref',
    title: Array.isArray(item.title) ? item.title[0] : item.title,
    authors: (item.author || []).map((a: any) => [a.given, a.family].filter(Boolean).join(' ')).join(', ') || undefined,
    journal: Array.isArray(item['container-title']) ? item['container-title'][0] : item['container-title'],
    year: item.issued?.['date-parts']?.[0]?.[0],
    doi: item.DOI,
    url: item.URL || `https://doi.org/${item.DOI}`,
  };
}

async function searchPubMedByTitle(title: string): Promise<{ match: CitationMatch; similarity: number } | null> {
  const term = `${encodeURIComponent(`${title}[Title]`)}`;
  const searchUrl = `${NCBI_BASE}/esearch.fcgi?db=pubmed&term=${term}&retmax=5&retmode=json${ncbiApiKeyParam()}`;
  const searchData = await fetchJson(searchUrl);
  const ids: string[] = searchData?.esearchresult?.idlist || [];
  if (ids.length === 0) return null;

  const summaryUrl = `${NCBI_BASE}/esummary.fcgi?db=pubmed&id=${ids.join(',')}&retmode=json${ncbiApiKeyParam()}`;
  const summaryData = await fetchJson(summaryUrl);
  const result = summaryData?.result || {};

  let best: { match: CitationMatch; similarity: number } | null = null;
  for (const id of ids) {
    const record = result[id];
    if (!record?.title) continue;
    const similarity = titleSimilarity(title, record.title);
    if (!best || similarity > best.similarity) {
      best = { similarity, match: pubmedMatch(id, record) };
    }
  }
  return best;
}

async function searchCrossRefByTitle(
  query: string,
  title: string
): Promise<{ match: CitationMatch; similarity: number } | null> {
  const url = `${CROSSREF_BASE}?query.bibliographic=${encodeURIComponent(query)}&rows=5`;
  const data = await fetchJson(url, crossrefHeaders());
  const items: any[] = data?.message?.items || [];
  let best: { match: CitationMatch; similarity: number } | null = null;
  for (const item of items) {
    const itemTitle = Array.isArray(item.title) ? item.title[0] : item.title;
    if (!itemTitle) continue;
    const similarity = titleSimilarity(title, itemTitle);
    if (!best || similarity > best.similarity) {
      best = {
        similarity,
        match: {
          source: 'crossref',
          title: itemTitle,
          authors: (item.author || []).map((a: any) => [a.given, a.family].filter(Boolean).join(' ')).join(', ') || undefined,
          journal: Array.isArray(item['container-title']) ? item['container-title'][0] : item['container-title'],
          year: item.issued?.['date-parts']?.[0]?.[0],
          doi: item.DOI,
          url: item.URL || (item.DOI ? `https://doi.org/${item.DOI}` : undefined),
        },
      };
    }
  }
  return best;
}

function result(
  input: CitationInput,
  status: CitationVerificationStatus,
  exists: boolean | null,
  confidence: number | null,
  match: CitationMatch | null,
  detail: string
): CitationVerificationResult {
  return { id: input.id, input, status, exists, confidence, match, detail, checkedAt: new Date().toISOString() };
}

/** Compare the cited reference against the resolved record to surface inaccuracies. */
function computeDiscrepancies(input: CitationInput, match: CitationMatch): string[] {
  const discrepancies: string[] = [];
  if (input.year && match.year && input.year !== match.year) {
    discrepancies.push(`Cited year ${input.year} does not match the record's year ${match.year}.`);
  }
  // When the citation carried an explicit identifier but also a title, a low
  // title similarity means the DOI/PMID resolves to a *different* article.
  if (input.title && match.title && (input.doi || input.pmid)) {
    const sim = titleSimilarity(input.title, match.title);
    if (sim < 0.6) {
      discrepancies.push(
        `The supplied identifier resolves to a different article than the cited title (similarity ${sim.toFixed(2)}).`
      );
    }
  }
  return discrepancies;
}

/** Finalize a verified result: attach retraction status and field-level discrepancies. */
function verifiedResult(
  input: CitationInput,
  match: CitationMatch,
  confidence: number,
  detail: string
): CitationVerificationResult {
  const discrepancies = computeDiscrepancies(input, match);
  const retracted = match.retracted === true;
  let finalDetail = detail;
  if (retracted) finalDetail += ' WARNING: this publication is marked as RETRACTED.';
  if (discrepancies.length) finalDetail += ` ${discrepancies.join(' ')}`;
  return {
    id: input.id,
    input,
    status: 'verified',
    exists: true,
    confidence,
    match,
    retracted,
    discrepancies: discrepancies.length ? discrepancies : undefined,
    detail: finalDetail,
    checkedAt: new Date().toISOString(),
  };
}

export async function verifyCitation(input: CitationInput): Promise<CitationVerificationResult> {
  const doi = extractDoi(input);
  const pmid = extractPmid(input);
  const title = input.title || input.raw;

  try {
    // 1. Exact identifier: PMID
    if (pmid) {
      const match = await verifyByPmid(pmid);
      if (match) return verifiedResult(input, match, 1, `Verified by PMID ${pmid} in PubMed.`);
    }

    // 2. Exact identifier: DOI
    if (doi) {
      const match = await verifyByDoi(doi);
      if (match) return verifiedResult(input, match, 1, `Verified by DOI ${doi} in CrossRef.`);
    }

    // If an identifier was supplied but did not resolve, it is genuinely missing.
    if (pmid || doi) {
      return result(input, 'not_found', false, null, null, `Identifier(s) did not resolve in PubMed/CrossRef.`);
    }

    // 3. Title-based search across PubMed then CrossRef.
    if (title && title.trim().length >= 8) {
      const pubmed = await searchPubMedByTitle(title);
      if (pubmed && pubmed.similarity >= TITLE_MATCH_THRESHOLD) {
        return verifiedResult(input, pubmed.match, pubmed.similarity, `Matched a PubMed record by title (similarity ${pubmed.similarity.toFixed(2)}).`);
      }
      const crossref = await searchCrossRefByTitle(input.raw || title, title);
      if (crossref && crossref.similarity >= TITLE_MATCH_THRESHOLD) {
        return verifiedResult(input, crossref.match, crossref.similarity, `Matched a CrossRef record by title (similarity ${crossref.similarity.toFixed(2)}).`);
      }
      const best = [pubmed, crossref].filter(Boolean).sort((a, b) => b!.similarity - a!.similarity)[0];
      return result(
        input,
        'not_found',
        false,
        best ? best.similarity : null,
        best ? best.match : null,
        best
          ? `No confident match; closest title similarity ${best.similarity.toFixed(2)} (below ${TITLE_MATCH_THRESHOLD}).`
          : 'No matching record found in PubMed or CrossRef.'
      );
    }

    // 4. Nothing resolvable to check against.
    return result(input, 'unverifiable', null, null, null, 'No DOI, PMID, or sufficient title to verify against.');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error('Citation verification error', { id: input.id, error: message });
    return result(input, 'error', null, null, null, `Verification could not be completed: ${message}`);
  }
}

/** Verify a batch of citations with bounded concurrency (NCBI rate limits). */
export async function verifyCitations(inputs: CitationInput[]): Promise<CitationVerificationResult[]> {
  const results: CitationVerificationResult[] = new Array(inputs.length);
  let cursor = 0;

  async function worker(): Promise<void> {
    while (cursor < inputs.length) {
      const index = cursor++;
      results[index] = await verifyCitation(inputs[index]);
    }
  }

  const workers = Array.from({ length: Math.min(MAX_CONCURRENCY, inputs.length) }, () => worker());
  await Promise.all(workers);
  return results;
}
