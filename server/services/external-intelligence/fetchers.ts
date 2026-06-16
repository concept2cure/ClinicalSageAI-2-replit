/**
 * External Intelligence — fetchers.
 *
 * One normalized output shape (FetchedItem) across four source kinds:
 *   rss              — generic RSS 2.0 / Atom feeds (minimal built-in parser,
 *                      no new dependencies)
 *   federal_register — Federal Register JSON API (FDA documents)
 *   pubmed           — NCBI E-utilities (esearch + esummary, JSON)
 *   medrxiv          — bioRxiv/medRxiv details API (JSON)
 *
 * Every fetcher is bounded (timeout + item cap) and throws on failure —
 * the sweep catches per-source and continues.
 *
 * @module server/services/external-intelligence/fetchers
 */

import type { ExternalIntelSource } from './sources.js';

export interface FetchedItem {
  externalId: string;
  title: string;
  summary: string | null;
  url: string | null;
  publishedAt: Date | null;
}

const FETCH_TIMEOUT_MS = parseInt(process.env.EXTERNAL_INTEL_FETCH_TIMEOUT_MS ?? '20000', 10);
const MAX_ITEMS_PER_SOURCE = parseInt(process.env.EXTERNAL_INTEL_MAX_ITEMS ?? '25', 10);
const USER_AGENT = 'Concept2Cure-AnA-ExternalIntelligence/1.0';

async function boundedFetch(url: string, accept: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': USER_AGENT, Accept: accept },
      redirect: 'follow',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
    return res;
  } finally {
    clearTimeout(timer);
  }
}

// ── Minimal RSS / Atom parsing ────────────────────────────────────────────

function decodeEntities(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(parseInt(code, 10)))
    .replace(/&amp;/g, '&');
}

function stripTags(s: string): string {
  return decodeEntities(s).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function firstTag(block: string, tag: string): string | null {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'));
  return m ? m[1].trim() : null;
}

/** Atom <link href="..."/> or RSS <link>...</link>. */
function extractLink(block: string): string | null {
  const atomAlternate = block.match(
    /<link[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["'][^>]*\/?>/i
  );
  if (atomAlternate) return decodeEntities(atomAlternate[1]);
  const atomHref = block.match(/<link[^>]*href=["']([^"']+)["'][^>]*\/?>/i);
  if (atomHref) return decodeEntities(atomHref[1]);
  const rssLink = firstTag(block, 'link');
  return rssLink ? decodeEntities(stripTags(rssLink)) : null;
}

function parseDate(value: string | null): Date | null {
  if (!value) return null;
  const d = new Date(stripTags(value));
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Parse RSS 2.0 <item> or Atom <entry> blocks out of a feed body.
 * Deliberately tolerant: a malformed entry is skipped, not fatal.
 */
export function parseRssOrAtom(xml: string): FetchedItem[] {
  const blocks =
    xml.match(/<item[\s>][\s\S]*?<\/item>/gi) ??
    xml.match(/<entry[\s>][\s\S]*?<\/entry>/gi) ??
    [];
  const items: FetchedItem[] = [];
  for (const block of blocks.slice(0, MAX_ITEMS_PER_SOURCE)) {
    const title = firstTag(block, 'title');
    if (!title) continue;
    const link = extractLink(block);
    const guid = firstTag(block, 'guid') ?? firstTag(block, 'id');
    const summarySrc =
      firstTag(block, 'description') ?? firstTag(block, 'summary') ?? firstTag(block, 'content');
    const published =
      firstTag(block, 'pubDate') ?? firstTag(block, 'published') ?? firstTag(block, 'updated') ?? firstTag(block, 'dc:date');
    items.push({
      externalId: stripTags(guid ?? link ?? title).slice(0, 500),
      title: stripTags(title).slice(0, 500),
      summary: summarySrc ? stripTags(summarySrc).slice(0, 1000) : null,
      url: link,
      publishedAt: parseDate(published),
    });
  }
  return items;
}

async function fetchRss(source: ExternalIntelSource): Promise<FetchedItem[]> {
  const res = await boundedFetch(source.url, 'application/rss+xml, application/atom+xml, application/xml, text/xml');
  return parseRssOrAtom(await res.text());
}

// ── Federal Register (FDA) ────────────────────────────────────────────────

async function fetchFederalRegister(source: ExternalIntelSource): Promise<FetchedItem[]> {
  const res = await boundedFetch(source.url, 'application/json');
  const data: any = await res.json();
  const docs: any[] = Array.isArray(data?.results) ? data.results : [];
  return docs.slice(0, MAX_ITEMS_PER_SOURCE).map(doc => ({
    externalId: String(doc.document_number ?? doc.html_url ?? doc.title).slice(0, 500),
    title: String(doc.title ?? 'Untitled').slice(0, 500),
    summary: doc.abstract ? String(doc.abstract).slice(0, 1000) : null,
    url: doc.html_url ?? null,
    publishedAt: doc.publication_date ? new Date(doc.publication_date) : null,
  }));
}

// ── PubMed E-utilities ────────────────────────────────────────────────────

const PUBMED_LOOKBACK_DAYS = parseInt(process.env.EXTERNAL_INTEL_PUBMED_RELDATE ?? '7', 10);

async function fetchPubmed(source: ExternalIntelSource): Promise<FetchedItem[]> {
  const term = encodeURIComponent(source.url);
  const searchUrl =
    `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&retmode=json` +
    `&retmax=${MAX_ITEMS_PER_SOURCE}&reldate=${PUBMED_LOOKBACK_DAYS}&datetype=edat&term=${term}`;
  const searchRes = await boundedFetch(searchUrl, 'application/json');
  const searchData: any = await searchRes.json();
  const ids: string[] = searchData?.esearchresult?.idlist ?? [];
  if (ids.length === 0) return [];

  const summaryUrl =
    `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&retmode=json&id=${ids.join(',')}`;
  const summaryRes = await boundedFetch(summaryUrl, 'application/json');
  const summaryData: any = await summaryRes.json();
  const result = summaryData?.result ?? {};

  return ids
    .map(id => result[id])
    .filter(Boolean)
    .map((doc: any) => ({
      externalId: `pmid:${doc.uid}`,
      title: String(doc.title ?? 'Untitled').slice(0, 500),
      summary: doc.source
        ? `${doc.source}${doc.pubdate ? ` (${doc.pubdate})` : ''}`.slice(0, 1000)
        : null,
      url: `https://pubmed.ncbi.nlm.nih.gov/${doc.uid}/`,
      publishedAt: doc.sortpubdate ? new Date(doc.sortpubdate.replace(/\//g, '-')) : null,
    }));
}

// ── medRxiv ───────────────────────────────────────────────────────────────

const MEDRXIV_LOOKBACK_DAYS = parseInt(process.env.EXTERNAL_INTEL_MEDRXIV_DAYS ?? '7', 10);
/** Only methods-flavored categories — the sweep is about study methodology. */
const MEDRXIV_CATEGORY_PATTERN = /method|epidemiolog|statistic|trial/i;

async function fetchMedrxiv(source: ExternalIntelSource): Promise<FetchedItem[]> {
  const to = new Date();
  const from = new Date(to.getTime() - MEDRXIV_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const url = `${source.url}/${fmt(from)}/${fmt(to)}/0/json`;
  const res = await boundedFetch(url, 'application/json');
  const data: any = await res.json();
  const docs: any[] = Array.isArray(data?.collection) ? data.collection : [];
  return docs
    .filter(doc => MEDRXIV_CATEGORY_PATTERN.test(String(doc.category ?? '')))
    .slice(0, MAX_ITEMS_PER_SOURCE)
    .map(doc => ({
      externalId: `doi:${doc.doi}`,
      title: String(doc.title ?? 'Untitled').slice(0, 500),
      summary: doc.abstract ? String(doc.abstract).slice(0, 1000) : null,
      url: doc.doi ? `https://doi.org/${doc.doi}` : null,
      publishedAt: doc.date ? new Date(doc.date) : null,
    }));
}

// ── Dispatcher ────────────────────────────────────────────────────────────

export async function fetchSource(source: ExternalIntelSource): Promise<FetchedItem[]> {
  switch (source.kind) {
    case 'rss':
      return fetchRss(source);
    case 'federal_register':
      return fetchFederalRegister(source);
    case 'pubmed':
      return fetchPubmed(source);
    case 'medrxiv':
      return fetchMedrxiv(source);
    default:
      return [];
  }
}
