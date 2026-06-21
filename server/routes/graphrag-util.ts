/**
 * Pure helpers for the GraphRAG route (kept dependency-free so they can be
 * unit-tested without importing the heavy router module).
 */

/**
 * Clamp client-supplied GraphRAG traversal bounds to safe ranges to prevent
 * resource exhaustion (each hop fetches up to 200 edges): maxHops 1–5, topK
 * 1–100. Non-finite values fall back to defaults (2 / 10).
 */
export function clampGraphRagBounds(
  maxHops?: number,
  topK?: number
): { maxHops: number; topK: number } {
  const mh = Number.isFinite(Number(maxHops)) ? Number(maxHops) : 2;
  const tk = Number.isFinite(Number(topK)) ? Number(topK) : 10;
  return {
    maxHops: Math.min(Math.max(Math.trunc(mh), 1), 5),
    topK: Math.min(Math.max(Math.trunc(tk), 1), 100),
  };
}
