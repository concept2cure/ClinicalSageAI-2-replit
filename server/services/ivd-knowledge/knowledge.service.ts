/**
 * IVD knowledge base — query service.
 *
 * Pure, deterministic search/retrieval over the in-code corpus. No DB, no I/O:
 * the corpus is static TypeScript, so the service is a relevance-ranked filter.
 * Consumed by server/routes/ivd-knowledge.ts and the AnA citation tool.
 */

import {
  IVD_KNOWLEDGE_BASE,
  type KnowledgeEntry,
  type KnowledgeDomain,
  type Jurisdiction,
} from './index';

export interface SearchOptions {
  domain?: KnowledgeDomain;
  jurisdiction?: Jurisdiction;
  topic?: string;
  tag?: string;
  /** Max results (default 10). */
  limit?: number;
  /** Number of results to skip (pagination). Default 0. */
  offset?: number;
}

/** A paginated envelope for list/search responses. */
export interface Paginated<T> {
  rows: T[];
  total: number;
  limit: number;
  offset: number;
}

export interface ScoredEntry {
  entry: KnowledgeEntry;
  score: number;
  /** Which fields matched, for transparency. */
  matchedIn: string[];
}

const byId = new Map<string, KnowledgeEntry>(
  IVD_KNOWLEDGE_BASE.map(e => [e.id, e])
);

/** Total entry count (useful for health/diagnostics). */
export function corpusSize(): number {
  return IVD_KNOWLEDGE_BASE.length;
}

/**
 * Deterministic version stamp for the knowledge corpus. Stamped onto every
 * saved assessment so a regulated computation is reproducible against the exact
 * knowledge snapshot that informed it. Changes whenever an entry id or its
 * lastReviewed date changes. FNV-1a over sorted "id@lastReviewed" pairs.
 */
let cachedVersion: string | null = null;
export function corpusVersion(): string {
  if (cachedVersion) return cachedVersion;
  const basis = IVD_KNOWLEDGE_BASE.map(e => `${e.id}@${e.lastReviewed}`)
    .sort()
    .join('|');
  let h = 0x811c9dc5;
  for (let i = 0; i < basis.length; i++) {
    h ^= basis.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  cachedVersion = `v${IVD_KNOWLEDGE_BASE.length}-${(h >>> 0).toString(16).padStart(8, '0')}`;
  return cachedVersion;
}

/** Fetch a single entry by its stable id. */
export function getEntry(id: string): KnowledgeEntry | null {
  return byId.get(id) ?? null;
}

/** List entries with optional structured filters (no text query). */
export function listEntries(opts: SearchOptions = {}): KnowledgeEntry[] {
  return IVD_KNOWLEDGE_BASE.filter(e => matchesFilters(e, opts)).slice(
    0,
    opts.limit ?? IVD_KNOWLEDGE_BASE.length
  );
}

/** Distinct domains present in the corpus. */
export function listDomains(): KnowledgeDomain[] {
  return [...new Set(IVD_KNOWLEDGE_BASE.map(e => e.domain))];
}

/** Distinct topics, optionally scoped to a domain. */
export function listTopics(domain?: KnowledgeDomain): string[] {
  return [
    ...new Set(
      IVD_KNOWLEDGE_BASE.filter(e => !domain || e.domain === domain).map(e => e.topic)
    ),
  ].sort();
}

/** Resolve an entry's related ids into entries (dropping any dangling refs). */
export function getRelated(id: string): KnowledgeEntry[] {
  const entry = byId.get(id);
  if (!entry?.related) return [];
  return entry.related.map(r => byId.get(r)).filter((e): e is KnowledgeEntry => !!e);
}

function matchesFilters(e: KnowledgeEntry, opts: SearchOptions): boolean {
  if (opts.domain && e.domain !== opts.domain) return false;
  if (opts.jurisdiction && !e.jurisdictions.includes(opts.jurisdiction)) return false;
  if (opts.topic && e.topic !== opts.topic) return false;
  if (opts.tag && !e.tags.includes(opts.tag)) return false;
  return true;
}

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(t => t.length > 1);
}

/**
 * Relevance-ranked full-text search across the corpus. Title and key points are
 * weighted above summary, which is weighted above detail/tags. Structured
 * filters in `opts` are applied first.
 */
export function search(query: string, opts: SearchOptions = {}): ScoredEntry[] {
  const terms = tokenize(query);
  const pool = IVD_KNOWLEDGE_BASE.filter(e => matchesFilters(e, opts));

  if (terms.length === 0) {
    // No query text: return filtered entries with a neutral score.
    return pool
      .slice(0, opts.limit ?? 10)
      .map(entry => ({ entry, score: 0, matchedIn: [] }));
  }

  const scored: ScoredEntry[] = [];
  for (const entry of pool) {
    const fields: Array<{ name: string; text: string; weight: number }> = [
      { name: 'title', text: entry.title, weight: 5 },
      { name: 'tags', text: entry.tags.join(' '), weight: 4 },
      { name: 'keyPoints', text: entry.keyPoints.join(' '), weight: 3 },
      { name: 'summary', text: entry.summary, weight: 3 },
      { name: 'topic', text: entry.topic, weight: 2 },
      { name: 'detail', text: entry.detail, weight: 1 },
      { name: 'id', text: entry.id, weight: 2 },
    ];

    let score = 0;
    const matchedIn = new Set<string>();
    for (const field of fields) {
      const haystack = field.text.toLowerCase();
      for (const term of terms) {
        if (haystack.includes(term)) {
          score += field.weight;
          matchedIn.add(field.name);
        }
      }
    }
    // Bonus: all terms present somewhere (phrase-ish relevance).
    const blob = fields.map(f => f.text).join(' ').toLowerCase();
    if (terms.every(t => blob.includes(t))) score += 3;

    if (score > 0) scored.push({ entry, score, matchedIn: [...matchedIn] });
  }

  scored.sort((a, b) => b.score - a.score || a.entry.id.localeCompare(b.entry.id));
  return scored.slice(0, opts.limit ?? 10);
}

// ─────────────────────────────────────────────────────────────────────────────
// Paginated variants (for UI list virtualization — return total + window)
// ─────────────────────────────────────────────────────────────────────────────

/** Structured list with a total count and an explicit page window. */
export function listEntriesPaged(opts: SearchOptions = {}): Paginated<KnowledgeEntry> {
  const all = IVD_KNOWLEDGE_BASE.filter(e => matchesFilters(e, opts));
  const limit = Math.min(200, Math.max(1, opts.limit ?? 50));
  const offset = Math.max(0, opts.offset ?? 0);
  return { rows: all.slice(offset, offset + limit), total: all.length, limit, offset };
}

/** Relevance-ranked search with a total count and an explicit page window. */
export function searchPaged(query: string, opts: SearchOptions = {}): Paginated<ScoredEntry> {
  // Score the whole filtered pool, then window — so `total` reflects all matches.
  const all = search(query, { ...opts, limit: IVD_KNOWLEDGE_BASE.length, offset: 0 });
  const limit = Math.min(200, Math.max(1, opts.limit ?? 10));
  const offset = Math.max(0, opts.offset ?? 0);
  return { rows: all.slice(offset, offset + limit), total: all.length, limit, offset };
}
