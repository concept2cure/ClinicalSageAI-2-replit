/**
 * Stable JSON Stringify — Deterministic serialization for hash consistency.
 *
 * Produces identical output for objects with the same key-value pairs regardless
 * of insertion order. This is critical for:
 *   - Manifest hashing (same data → same hash)
 *   - Snapshot hashing (same inputs → same hash)
 *   - Audit chain integrity
 *
 * No external dependencies (no json-stable-stringify needed).
 *
 * @module shared/ivdr/stableStringify
 * @version 1.0.0
 */

/**
 * Recursively serializes a value with sorted object keys.
 * Handles: null, booleans, numbers, strings, arrays, nested objects.
 * Produces valid JSON identical to JSON.stringify output except keys are sorted.
 *
 * @param value - Any JSON-serializable value
 * @returns Deterministic JSON string
 *
 * @example
 * ```ts
 * stableStringify({ b: 1, a: 2 })         // '{"a":2,"b":1}'
 * stableStringify({ a: { z: 1, y: 2 } })  // '{"a":{"y":2,"z":1}}'
 * stableStringify([3, { b: 1, a: 2 }])    // '[3,{"a":2,"b":1}]'
 * ```
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
