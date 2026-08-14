/**
 * Canonical JSON — the one deterministic serializer for hashing.
 *
 * Produces identical output for objects with the same key–value pairs regardless
 * of insertion order, so that a hash means "this content" rather than "this
 * content, serialized by this code path". Used for manifest hashing, snapshot
 * hashing, and audit-chain links.
 *
 * ── Why this module exists in one place ─────────────────────────────────────
 * This function was written nine times across the codebase (ledger L46), and
 * the copies do not agree. `routes/chat/provenance.ts` maps `null` to the empty
 * string and therefore emits output that is not valid JSON; `services/stats/rng.ts`
 * writes an explicit `null` for a key whose value is `undefined` where others drop
 * the key. Each write/verify pair happens to use the same copy, so nothing is
 * mismatched today — the defect is that nine functions agree only by having been
 * copied, with nothing detecting the moment one is edited. `ci:canonicalizers`
 * holds the count and refuses a tenth.
 *
 * ── Migrating an existing call site ─────────────────────────────────────────
 * A hash is only comparable to another hash produced by the same serializer.
 * Re-pointing a call site at this module changes the digests it produces from
 * that moment on, so any stored hash written by the old copy will no longer
 * reproduce. That is a data decision, not a refactor: either the stored hashes
 * are re-derived, or the component records which serializer version sealed them.
 * Do not re-point a persisted-hash call site without deciding which.
 *
 * ── The contract ────────────────────────────────────────────────────────────
 * Output is valid JSON, matching `JSON.stringify` exactly except that object
 * keys are sorted. Specifically: `undefined` and non-finite numbers become
 * `null` at the top level, an `undefined` object value drops its key entirely,
 * `toJSON` is honoured (so a Date serializes as its ISO string), and strings are
 * escaped by `JSON.stringify` rather than by hand. Golden vectors in
 * `__tests__/canonical-json.test.ts` pin every one of those.
 *
 * @module shared/canonical-json
 */

export function stableStringify(value: unknown): string {
  if (value === null || value === undefined) {
    return 'null';
  }

  if (typeof value === 'boolean' || typeof value === 'number') {
    // NaN and Infinity become null per JSON spec
    if (typeof value === 'number' && !isFinite(value)) {
      return 'null';
    }
    return String(value);
  }

  if (typeof value === 'string') {
    return JSON.stringify(value); // handles escaping correctly
  }

  if (Array.isArray(value)) {
    const items = value.map(item => stableStringify(item));
    return '[' + items.join(',') + ']';
  }

  if (typeof value === 'object') {
    // toJSON support (e.g., Date objects)
    if (typeof (value as any).toJSON === 'function') {
      return stableStringify((value as any).toJSON());
    }

    const keys = Object.keys(value as Record<string, unknown>).sort();
    const pairs: string[] = [];

    for (const key of keys) {
      const v = (value as Record<string, unknown>)[key];
      // Skip undefined values (matches JSON.stringify behavior)
      if (v === undefined) continue;
      pairs.push(JSON.stringify(key) + ':' + stableStringify(v));
    }

    return '{' + pairs.join(',') + '}';
  }

  // Functions, symbols, etc. → null (matches JSON.stringify behavior)
  return 'null';
}

/**
 * Compute SHA-256 hash of a string (server-side only).
 * Returns lowercase hex string.
 */
export function sha256Hex(input: string): string {
  // Dynamic require to avoid bundling crypto in client
   
  const { createHash } = require('crypto');
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

/**
 * Compute deterministic hash of any JSON-serializable object.
 * stableStringify → SHA-256 → hex
 */
export function stableHash(value: unknown): string {
  return sha256Hex(stableStringify(value));
}
