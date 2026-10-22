/**
 * Harvester — fetch recent items from a horizon source.
 *
 * This is the ONLY network-touching part of the learning loop, and it is
 * deliberately defensive: every fetch is time-boxed and wrapped, and any
 * failure (blocked egress, timeout, HTTP error, a feed URL answering with
 * something that is not a feed) resolves to a result carrying the error rather
 * than throwing. The scan names that source in its digest. Until 2026-10-15 a
 * failure resolved to an empty list, so a locked-down network read as
 * "0 new items this week".
 *
 * Two modes:
 *   - feed (rss/atom/api): if a verified feed URL is configured via the
 *     source's `feedEnvVar`, parse items from it.
 *   - page (html): fetch the landing page and hand its text to the distiller,
 *     which extracts structured changes. No brittle site-specific scraping here.
 */

import type { HorizonSource } from './regulatory-horizon-sources.js';
import { createScopedLogger } from '../../utils/logger.js';

const logger = createScopedLogger('horizon-harvester');

/** A raw, undistilled item pulled from a source. */
export interface RawHarvestItem {
  sourceId: string;
  title: string;
  url: string;
  publishedAt?: string;
  /** Best-available text content for the distiller to work from. */
  content: string;
}

/** What one harvest produced: the items read, or why the source could not be read. */
export interface HarvestResult {
  items: RawHarvestItem[];
  /** Null when the source was read. Otherwise the reason, and `items` is empty. */
  error: string | null;
}

const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_CONTENT_CHARS = 20_000;
/** The root element of an RSS 2.0, RSS 1.0 (RDF) or Atom document. */
const FEED_ROOT = /<(rss|feed|rdf:RDF)\b/i;

type FetchOutcome = { ok: true; text: string } | { ok: false; error: string };

async function fetchText(url: string, timeoutMs: number): Promise<FetchOutcome> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'user-agent': 'ClinicalSageAI-Horizon/1.0 (regulatory learning scan)' },
    });
    if (!res.ok) {
      logger.warn(`Fetch ${url} returned HTTP ${res.status}`);
      return { ok: false, error: `HTTP ${res.status}` };
    }
    const text = await res.text();
    return { ok: true, text: text.slice(0, MAX_CONTENT_CHARS) };
  } catch (err: any) {
    const timedOut = err?.name === 'AbortError';
    logger.warn(`Fetch ${url} failed: ${timedOut ? 'timeout' : err?.message}`);
    // The error code only (ENOTFOUND, ECONNREFUSED…): the digest that carries
    // this is served to users, and a driver message can name hosts and ports.
    return {
      ok: false,
      error: timedOut
        ? `timed out after ${timeoutMs} ms`
        : `request failed (${err?.cause?.code ?? err?.code ?? err?.name ?? 'unknown error'})`,
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Minimal RSS/Atom item extraction — title, link, date. Tolerant of either dialect. */
export function parseFeedItems(xml: string, sourceId: string, limit: number): RawHarvestItem[] {
  const items: RawHarvestItem[] = [];
  // Match <item>…</item> (RSS) or <entry>…</entry> (Atom).
  const blocks = xml.match(/<(item|entry)\b[\s\S]*?<\/\1>/gi) ?? [];
  for (const block of blocks.slice(0, limit)) {
    const title = pick(block, 'title') ?? '(untitled)';
    const link = pickLink(block);
    const date = pick(block, 'pubDate') ?? pick(block, 'updated') ?? pick(block, 'published');
    const desc = pick(block, 'description') ?? pick(block, 'summary') ?? pick(block, 'content') ?? '';
    items.push({
      sourceId,
      title: stripTags(title),
      url: link ?? '',
      publishedAt: normalizeDate(date),
      content: stripTags(`${title}. ${desc}`).slice(0, MAX_CONTENT_CHARS),
    });
  }
  return items;
}

function pick(block: string, tag: string): string | undefined {
  const m = block.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return m ? decodeEntities(m[1].trim()) : undefined;
}

function pickLink(block: string): string | undefined {
  // RSS: <link>url</link>. Atom: <link href="url" />.
  const rss = block.match(/<link\b[^>]*>([\s\S]*?)<\/link>/i);
  if (rss && rss[1].trim()) return rss[1].trim();
  const atom = block.match(/<link\b[^>]*href="([^"]+)"/i);
  return atom ? atom[1] : undefined;
}

function stripTags(s: string): string {
  return decodeEntities(s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function normalizeDate(d?: string): string | undefined {
  if (!d) return undefined;
  const t = Date.parse(d);
  return Number.isNaN(t) ? undefined : new Date(t).toISOString();
}

export interface HarvestOptions {
  /** Per-source cap on items returned. */
  limit?: number;
  timeoutMs?: number;
  /** Only return items published on/after this ISO date (when a date is known). */
  since?: string;
}

/**
 * Harvest a source. Never throws. Returns at most `limit` items, newest-first
 * where dates are available. A source that could not be read comes back with
 * `error` set, never as an empty list.
 */
export async function harvest(source: HorizonSource, opts: HarvestOptions = {}): Promise<HarvestResult> {
  const limit = opts.limit && opts.limit > 0 ? opts.limit : 25;
  const timeoutMs = opts.timeoutMs && opts.timeoutMs > 0 ? opts.timeoutMs : DEFAULT_TIMEOUT_MS;

  const feedUrl = source.feedEnvVar ? process.env[source.feedEnvVar]?.trim() : undefined;

  let items: RawHarvestItem[];
  if (feedUrl) {
    const fetched = await fetchText(feedUrl, timeoutMs);
    if (!fetched.ok) return { items: [], error: fetched.error };
    // A login or error page answered with HTTP 200 parses to no items. That is
    // a failed read, not an empty feed.
    if (!FEED_ROOT.test(fetched.text)) return { items: [], error: 'response is not an RSS or Atom feed' };
    items = parseFeedItems(fetched.text, source.id, limit);
  } else {
    const fetched = await fetchText(source.url, timeoutMs);
    if (!fetched.ok) return { items: [], error: fetched.error };
    items = [
      {
        sourceId: source.id,
        title: source.title,
        url: source.url,
        content: stripTags(fetched.text).slice(0, MAX_CONTENT_CHARS),
      },
    ];
  }

  if (opts.since) {
    const cutoff = Date.parse(opts.since);
    if (!Number.isNaN(cutoff)) {
      items = items.filter(i => !i.publishedAt || Date.parse(i.publishedAt) >= cutoff);
    }
  }

  return { items: items.slice(0, limit), error: null };
}
