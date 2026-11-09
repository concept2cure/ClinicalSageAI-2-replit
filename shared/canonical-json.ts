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
 * SHA-256 of a string, lowercase hex.
 *
 * ── Why this refuses instead of hashing (2026-11-09) ─────────────────────────
 * It reached `node:crypto` through a dynamic `require`, so that this module —
 * which five client files import for `stableStringify` — would not pull crypto
 * into the browser bundle. But `require` does not exist in an ESM runtime, so
 * the function could not run on the server either: calling it from the batch
 * release path answered `500 ReferenceError: require is not defined` from
 * inside a hash, on the one path that reaches a §11.50 signature
 * (`docs/evidence/F1/2026-11-09-batch-release-fingerprint/`). One lane had
 * already worked around it by hand and written down why
 * (`server/services/ana/skills/library/index.ts`).
 *
 * A function that cannot run anywhere is worse than no function: its callers
 * type-check, and they fail at the moment they are used. So it says so, at the
 * call site, naming what to do instead. Hashing is server work; `import
 * { createHash } from 'node:crypto'` in the server module and hash
 * `stableStringify(value)` — which is what this module is for.
 */
export function sha256Hex(_input: string): never {
  throw new Error(
    'shared/canonical-json: sha256Hex cannot run here. It reached node:crypto through `require`, which does not ' +
      'exist in an ESM runtime, and a static import would put crypto in the client bundle (five client files ' +
      "import stableStringify from this module). In a server module: import { createHash } from 'node:crypto' " +
      "and hash stableStringify(value) — createHash('sha256').update(stableStringify(value), 'utf8').digest('hex').",
  );
}

/**
 * Compute deterministic hash of any JSON-serializable object.
 * stableStringify → SHA-256 → hex
 */
export function stableHash(value: unknown): never {
  return sha256Hex(stableStringify(value));
}
