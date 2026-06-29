/**
 * Translation Memory (TM) — pluggable, deterministic, unit-testable.
 *
 * A TM accrues *approved* human / post-edited translations and surfaces them for
 * reuse on later segments, so identical (exact) and near-identical (fuzzy) source
 * text is never re-paid for. The default implementation here is in-memory; it sits
 * behind the {@link TranslationMemory} interface so it can later be backed by the
 * DB (e.g. a `translation_memory` table) without touching callers.
 *
 * REGULATED-PLATFORM GUARDRAILS honored here:
 *  - The TM is a *reuse* surface for human-verified content only. A segment whose
 *    method is 'machine' is a DRAFT and can NEVER be stored as a TM entry — only
 *    'human' or 'mt_postedited' methods are accepted by store(). This mirrors the
 *    contract in shared/types/translation.ts (machine drafts are never approvable)
 *    and the TmMatch.method type in ./types (machine is never a TM source).
 *  - DNT identifiers (21 CFR, ICH E6(R2), M1..M5, FDA/EMA/PMDA, INN/drug names,
 *    MedDRA terms, codes, JSON keys, slash commands) are NOT touched here:
 *    normalization is meaning-preserving and identifier-preserving — it only folds
 *    whitespace/case for *match keying* and never mutates stored target text.
 *    "translate meaning, not identifiers" (see ../ana-ri/locale-overlays.ts).
 *  - Every stored entry carries full Part-11 provenance (source hash, engine,
 *    post-editor, reviewer, back-translation, timestamps) and is tenant-isolated
 *    via organizationId. Lookups never cross tenant or language-pair boundaries.
 *
 * The module is pure/deterministic: no clock, no I/O, no randomness. Fuzzy scoring
 * is a normalized Levenshtein similarity, stable for identical inputs.
 *
 * @module server/services/translation/translation-memory
 */

import { createHash } from 'node:crypto';

import type {
  SegmentProvenance,
  SourceLanguage,
  TargetLanguage,
  TmLookupQuery,
  TmMatch,
  TranslationMethod,
  TranslationSegment,
} from './types';

// ── Public surface ───────────────────────────────────────────────────────────

/** Methods eligible to be stored in / returned from the TM (machine excluded). */
export type TmMethod = Extract<TranslationMethod, 'human' | 'mt_postedited'>;

/** Options for a fuzzy lookup. */
export interface TmLookupOptions {
  /**
   * Minimum normalized similarity (0..1) for a fuzzy match to be returned.
   * An exact (hash) hit always scores 1.0 and is returned regardless of this.
   * Defaults to {@link DEFAULT_FUZZY_THRESHOLD}.
   */
  threshold?: number;
  /** Cap on the number of fuzzy candidates returned, best-first. Default 1. */
  limit?: number;
}

/** Default fuzzy threshold — conservative, favouring precision over recall. */
export const DEFAULT_FUZZY_THRESHOLD = 0.82;

/**
 * One accrued, approved translation pair plus its provenance. This is the unit
 * store() persists and lookup() returns matches against. Kept structurally close
 * to TranslationSegment so a segment can be stored directly via {@link fromSegment}.
 */
export interface TmEntry {
  organizationId: number;
  sourceLang: SourceLanguage;
  targetLang: TargetLanguage;
  /** Canonical (verbatim) source text — identifiers intact. */
  sourceText: string;
  /** Approved target text — identifiers intact; never normalized on store. */
  targetText: string;
  /** SHA-256 (hex) of the verbatim sourceText (exact-match index key). */
  sourceHash: string;
  /** How the stored translation was produced; never 'machine'. */
  method: TmMethod;
  /** Full Part-11 provenance carried over from the approved segment. */
  provenance: SegmentProvenance;
}

/**
 * Pluggable Translation Memory. The default {@link InMemoryTranslationMemory}
 * implements this; a DB-backed implementation can later satisfy the same surface.
 * All methods are tenant- and language-pair-scoped via the query/entry fields.
 */
export interface TranslationMemory {
  /**
   * Look up reuse candidates for a source segment. Returns an exact (hash) match
   * first when present (score 1.0, matchKind 'exact'); otherwise up to
   * `options.limit` fuzzy matches at/above the threshold, best-first. Empty array
   * when nothing qualifies.
   */
  lookup(query: TmLookupQuery, options?: TmLookupOptions): TmMatch[];
  /**
   * Accrue an approved post-edit / human translation. Rejects 'machine' method.
   * Storing an entry whose (org, langpair, normalized source) collides with an
   * existing one overwrites it (latest approved wins) — deterministic upsert.
   */
  store(entry: TmEntry): void;
  /** Current entry count (for the active tenant scope is the caller's concern). */
  size(): number;
}

// ── Normalization ────────────────────────────────────────────────────────────

/**
 * Meaning-preserving normalization used ONLY to build the fuzzy match key. It
 * folds case and collapses Unicode whitespace so cosmetically-different source
 * renders the same TM hit, without ever mutating the stored verbatim text (which
 * keeps DNT identifiers intact). Deterministic and idempotent.
 */
export function normalizeForMatch(text: string): string {
  return text
    .normalize('NFC')
    // Collapse all Unicode whitespace runs (incl. NBSP, tabs, newlines) to one space.
    .replace(/\s+/gu, ' ')
    .trim()
    .toLowerCase();
}

/** SHA-256 (hex) of the verbatim source text — the exact-match index key. */
export function hashSource(sourceText: string): string {
  return createHash('sha256').update(sourceText, 'utf8').digest('hex');
}

// ── Fuzzy similarity (normalized Levenshtein) ────────────────────────────────

/**
 * Levenshtein edit distance between two strings. Iterative two-row DP — O(m*n)
 * time, O(min(m,n)) space. Pure and deterministic.
 */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  // Keep the shorter string as the inner (column) dimension to bound memory.
  let s = a;
  let t = b;
  if (s.length > t.length) {
    const tmp = s;
    s = t;
    t = tmp;
  }

  const n = s.length;
  let prev = new Array<number>(n + 1);
  let curr = new Array<number>(n + 1);
  for (let i = 0; i <= n; i += 1) prev[i] = i;

  for (let j = 1; j <= t.length; j += 1) {
    curr[0] = j;
    const tj = t.charCodeAt(j - 1);
    for (let i = 1; i <= n; i += 1) {
      const cost = s.charCodeAt(i - 1) === tj ? 0 : 1;
      const del = prev[i] + 1;
      const ins = curr[i - 1] + 1;
      const sub = prev[i - 1] + cost;
      curr[i] = del < ins ? (del < sub ? del : sub) : ins < sub ? ins : sub;
    }
    const swap = prev;
    prev = curr;
    curr = swap;
  }
  return prev[n];
}

/**
 * Normalized similarity in [0, 1]: 1 - editDistance/maxLen on the match-normalized
 * forms. Identical (post-normalization) strings score exactly 1.0; fully disjoint
 * strings score 0.0.
 */
export function similarity(a: string, b: string): number {
  const na = normalizeForMatch(a);
  const nb = normalizeForMatch(b);
  if (na === nb) return 1;
  const maxLen = Math.max(na.length, nb.length);
  if (maxLen === 0) return 1;
  const dist = levenshtein(na, nb);
  return 1 - dist / maxLen;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Build a TmEntry from an approved/post-edited segment. Throws if the segment's
 * method is not eligible for the TM (machine drafts and method-less segments are
 * rejected — they are not human-verified reuse candidates).
 */
export function fromSegment(segment: TranslationSegment): TmEntry {
  if (segment.method !== 'human' && segment.method !== 'mt_postedited') {
    throw new Error(
      `translation-memory: refusing to store segment ${segment.id} with non-approvable method ` +
        `'${String(segment.method)}' (only 'human' | 'mt_postedited' are TM-eligible)`,
    );
  }
  return {
    organizationId: segment.organizationId,
    sourceLang: segment.sourceLang,
    targetLang: segment.targetLang,
    sourceText: segment.sourceText,
    targetText: segment.targetText,
    sourceHash: segment.sourceHash || hashSource(segment.sourceText),
    method: segment.method,
    provenance: segment.provenance,
  };
}

/** Composite scope key: entries never match across tenant or language pair. */
function scopeKey(organizationId: number, sourceLang: SourceLanguage, targetLang: TargetLanguage): string {
  return `${organizationId} ${sourceLang} ${targetLang}`;
}

/** Within-scope dedupe key: the match-normalized source text. */
function entryKey(entry: TmEntry): string {
  return `${scopeKey(entry.organizationId, entry.sourceLang, entry.targetLang)} ${normalizeForMatch(
    entry.sourceText,
  )}`;
}

// ── Default in-memory implementation ─────────────────────────────────────────

/**
 * Deterministic, dependency-free TM. Maintains two indices per scope:
 *  - exact: verbatim sourceHash → entry (O(1) exact reuse)
 *  - normalized: dedupe key → entry (drives upsert + the fuzzy candidate set)
 *
 * Lookup returns the exact hit when the verbatim hash matches; otherwise scans the
 * scope's entries for fuzzy candidates. Scan is O(entries-in-scope) — adequate for
 * the in-memory default and trivially replaceable by an indexed DB query later.
 */
export class InMemoryTranslationMemory implements TranslationMemory {
  /** scopeKey → (sourceHash → entry). */
  private readonly byHash = new Map<string, Map<string, TmEntry>>();
  /** scopeKey → (normalizedSource → entry). */
  private readonly byNorm = new Map<string, Map<string, TmEntry>>();
  private count = 0;

  constructor(seed?: Iterable<TmEntry>) {
    if (seed) for (const e of seed) this.store(e);
  }

  store(entry: TmEntry): void {
    if (entry.method !== 'human' && entry.method !== 'mt_postedited') {
      throw new Error(
        `translation-memory: refusing to store non-approvable method '${String(entry.method)}' ` +
          `(only 'human' | 'mt_postedited' are TM-eligible)`,
      );
    }

    const scope = scopeKey(entry.organizationId, entry.sourceLang, entry.targetLang);
    // Recompute the hash from verbatim text so an empty/forged hash can't poison
    // the exact index. Provenance keeps the original sourceHash for audit.
    const hash = hashSource(entry.sourceText);
    const normKey = entryKey(entry);

    let hashMap = this.byHash.get(scope);
    if (!hashMap) {
      hashMap = new Map();
      this.byHash.set(scope, hashMap);
    }
    let normMap = this.byNorm.get(scope);
    if (!normMap) {
      normMap = new Map();
      this.byNorm.set(scope, normMap);
    }

    // Deterministic upsert: latest approved translation for a given normalized
    // source within a scope wins. Account for the size delta on the norm index and
    // purge the prior entry's verbatim-hash slot so it can't shadow the new one.
    const existing = normMap.get(normKey);
    if (!existing) this.count += 1;
    else hashMap.delete(hashSource(existing.sourceText));

    const stored: TmEntry = { ...entry, sourceHash: entry.sourceHash || hash };
    hashMap.set(hash, stored);
    normMap.set(normKey, stored);
  }

  lookup(query: TmLookupQuery, options?: TmLookupOptions): TmMatch[] {
    const scope = scopeKey(query.organizationId, query.sourceLang, query.targetLang);

    // 1) Exact reuse: prefer the supplied hash, but fall back to a recomputed one
    //    so callers that didn't pre-hash still get exact hits.
    const hashMap = this.byHash.get(scope);
    if (hashMap) {
      const exact = hashMap.get(query.sourceHash) ?? hashMap.get(hashSource(query.sourceText));
      if (exact) return [toMatch(exact, 1, 'exact')];
    }

    // 2) Fuzzy reuse over the scope's distinct normalized entries.
    const normMap = this.byNorm.get(scope);
    if (!normMap || normMap.size === 0) return [];

    const threshold = options?.threshold ?? DEFAULT_FUZZY_THRESHOLD;
    const limit = Math.max(1, options?.limit ?? 1);

    const scored: TmMatch[] = [];
    for (const entry of normMap.values()) {
      const score = similarity(query.sourceText, entry.sourceText);
      // A score of 1.0 here means it normalized-equal but the verbatim hash
      // differed (e.g. whitespace/case) — still an exact-meaning reuse; mark it
      // 'exact' so callers can treat it as a 100% match.
      if (score >= threshold) scored.push(toMatch(entry, score, score >= 1 ? 'exact' : 'fuzzy'));
    }

    // Best-first; tie-break deterministically on target text so ordering is stable.
    scored.sort((a, b) => b.score - a.score || a.targetText.localeCompare(b.targetText));
    return scored.slice(0, limit);
  }

  size(): number {
    return this.count;
  }
}

/** Project a stored entry into the shared TmMatch wire shape. */
function toMatch(entry: TmEntry, score: number, matchKind: TmMatch['matchKind']): TmMatch {
  return {
    targetText: entry.targetText,
    score,
    matchKind,
    method: entry.method,
    provenance: entry.provenance,
  };
}

/** Factory mirroring the rest of the service layer's construction style. */
export function createInMemoryTranslationMemory(seed?: Iterable<TmEntry>): TranslationMemory {
  return new InMemoryTranslationMemory(seed);
}
