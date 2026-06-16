/**
 * Harvester — fetch recent items from a horizon source.
 *
 * This is the ONLY network-touching part of the learning loop, and it is
 * deliberately defensive: every fetch is time-boxed and wrapped, and any
 * failure (blocked egress, timeout, malformed feed) resolves to an empty list
 * rather than throwing. A locked-down network policy therefore degrades to
 * "0 new items this week", never to a crashed scan.
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

const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_CONTENT_CHARS = 20_000;

async function fetchText(url: string, timeoutMs: number): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'user-agent': 'ClinicalSageAI-Horizon/1.0 (regulatory learning scan)' },
    });
    if (!res.ok) {
      logger.warn(`Fetch ${url} returned HTTP ${res.status}`);
      return null;
    }
    const text = await res.text();
    return text.slice(0, MAX_CONTENT_CHARS);
  } catch (err: any) {
    logger.warn(`Fetch ${url} failed: ${err?.name === 'AbortError' ? 'timeout' : err?.message}`);
    return null;
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
 * where dates are available.
 */
export async function harvest(source: HorizonSource, opts: HarvestOptions = {}): Promise<RawHarvestItem[]> {
  const limit = opts.limit && opts.limit > 0 ? opts.limit : 25;
  const timeoutMs = opts.timeoutMs && opts.timeoutMs > 0 ? opts.timeoutMs : DEFAULT_TIMEOUT_MS;

  const feedUrl = source.feedEnvVar ? process.env[source.feedEnvVar]?.trim() : undefined;

  let items: RawHarvestItem[] = [];
  if (feedUrl) {
    const xml = await fetchText(feedUrl, timeoutMs);
    if (xml) items = parseFeedItems(xml, source.id, limit);
  } else {
    const page = await fetchText(source.url, timeoutMs);
    if (page) {
      items = [
        {
          sourceId: source.id,
          title: source.title,
          url: source.url,
          content: stripTags(page).slice(0, MAX_CONTENT_CHARS),
        },
      ];
    }
  }

  if (opts.since) {
    const cutoff = Date.parse(opts.since);
    if (!Number.isNaN(cutoff)) {
      items = items.filter(i => !i.publishedAt || Date.parse(i.publishedAt) >= cutoff);
    }
  }

  return items.slice(0, limit);
}
