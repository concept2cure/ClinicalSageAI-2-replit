/**
 * Provenance helpers for chat routes.
 * Pure functions — no side effects, no external deps.
 *
 * @module server/routes/chat/provenance
 */

import { createHash } from 'crypto';

/** SHA-256 hex digest of a UTF-8 string */
export function sha256(data: string): string {
  return createHash('sha256').update(data, 'utf8').digest('hex');
}

/**
 * SHA-256 hex digest of raw bytes.
 *
 * Distinct from {@link sha256} on purpose: that one declares a UTF-8 encoding,
 * so handing it a binary buffer (a PDF, a DOCX, an image) would hash a lossy
 * re-encoding rather than the file. Content identity for an uploaded document
 * must be taken over the bytes themselves.
 */
export function sha256Bytes(data: Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

/**
 * Deterministic JSON serialization — re-exported from the one canonicalizer.
 *
 * This module used to carry its own copy, which mapped `null` to the empty
 * string and therefore produced output that was not valid JSON: `{a:1,b:null}`
 * serialized as `{"a":1,"b":}`. It feeds `snapshot_hash_sha256` on
 * `ai_retrieval_runs`, which is written on INSERT and never recomputed for
 * comparison — so re-pointing it changes the digests written from here on and
 * breaks no verification. See docs/CANONICALIZATION_MIGRATION_2026-08.md.
 */
export { stableStringify } from '../../../shared/canonical-json.js';
