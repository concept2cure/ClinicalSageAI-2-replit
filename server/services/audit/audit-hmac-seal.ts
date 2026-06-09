/**
 * audit/audit-hmac-seal — HMAC-SHA256 seal over the audit hash-chain.
 *
 * INTEGRATION NOTES
 * -----------------
 * This module adds a keyed HMAC-SHA256 *seal* on top of the existing SHA-256
 * audit hash-chain (server/services/audit/chain.ts → audit_logs.sha256_chain,
 * and the conceptual record_hash / previous_hash link it represents). The plain
 * SHA-256 chain in chain.ts makes tampering *detectable*, but because the hash
 * algorithm is public an attacker who can rewrite the whole table could also
 * recompute every chain value and forge a self-consistent ledger. Sealing each
 * link with a secret-keyed HMAC closes that gap and provides the stronger
 * "operational system checks" / record-authenticity guarantee expected for
 * 21 CFR Part 11 §11.70 (signature/record linking) and §11.10(e).
 *
 * Field-name mapping to the existing chain:
 *   - `recordHash`     ≙ chain.ts `sha256_chain` of the current row (a.k.a.
 *                        `record_hash`), i.e. the value computeAuditChain returns.
 *   - `previousHash`   ≙ the prior row's `sha256_chain` (a.k.a. `previous_hash`)
 *                        — the `previous` field folded into the canonical input.
 *   - `sequenceNumber` ≙ the append position of the row (monotonic). It is bound
 *                        into the seal so reordering rows is also detected.
 *
 * HOW auditLogger / the writer SHOULD use this (do NOT edit auditLogger.ts or
 * chain.ts here — this file is pure and standalone):
 *   1. After computeAuditChain() returns `record_hash` (sha256_chain) for the
 *      row about to be inserted, call:
 *         const seal = sealRecord({ recordHash, previousHash, sequenceNumber });
 *   2. Persist `seal` alongside the row (e.g. an `hmac_seal` column on
 *      audit_logs). Store the key id / rotation epoch if you rotate keys.
 *   3. On verification, re-read the row, recompute the chain hash (chain.ts
 *      verifyAuditChain), then call verifySeal(record, storedSeal) — or
 *      verifyChainSeals(records) to walk the whole ledger.
 *
 * KEY MANAGEMENT: the HMAC key comes from the `key` parameter when supplied,
 * otherwise from process.env.AUDIT_HMAC_KEY. The key MUST be a high-entropy
 * secret held outside the database (KMS / secrets manager) so that a DB-only
 * compromise cannot forge seals. If no key is configured, sealRecord throws —
 * seals must never be silently computed under an empty key.
 *
 * This module is PURE and DETERMINISTIC: identical inputs + key always yield
 * the identical hex seal, with no I/O, clock, or randomness. That makes it
 * unit-testable and lets the writer and any verifier agree byte-for-byte.
 */

import { createHmac, timingSafeEqual } from 'crypto';

/**
 * The minimal projection of an audit-chain row required to seal/verify it.
 * Mirrors the chain.ts field semantics (record_hash / previous_hash) plus the
 * monotonic sequence position.
 */
export interface SealableRecord {
  /** Current row's SHA-256 chain hash (chain.ts sha256_chain / record_hash). */
  recordHash: string;
  /** Prior row's chain hash (previous_hash); genesis uses 64 zeros to match chain.ts. */
  previousHash: string;
  /** Monotonic append position of this row. Bound in so reordering is detected. */
  sequenceNumber: number;
}

/** Genesis previous-hash sentinel — must match chain.ts ('0'.repeat(64)). */
export const GENESIS_PREVIOUS_HASH = '0'.repeat(64);

/**
 * Resolve the HMAC key from an explicit param or AUDIT_HMAC_KEY. Throws when
 * neither is present — a seal under an empty/absent key would be worthless and
 * must never be produced silently.
 */
function resolveKey(key?: string | Buffer): Buffer {
  const resolved = key ?? process.env.AUDIT_HMAC_KEY;
  if (resolved === undefined || resolved === null || resolved === '') {
    throw new Error(
      'AUDIT_HMAC_KEY is not configured: cannot compute or verify an audit HMAC seal without a secret key.',
    );
  }
  return Buffer.isBuffer(resolved) ? resolved : Buffer.from(resolved, 'utf8');
}

/**
 * Canonical, deterministic serialization of the sealed fields. Pinning the
 * exact byte layout here (rather than JSON.stringify of the whole object) means
 * the writer and every verifier compute identical input and can never drift on
 * key ordering or whitespace. Newline separators avoid field-boundary ambiguity
 * (so e.g. recordHash "ab"+previousHash "c" never collides with "a"+"bc").
 */
function canonicalInput(record: SealableRecord): string {
  return [
    `seq:${record.sequenceNumber}`,
    `record:${record.recordHash}`,
    `previous:${record.previousHash}`,
  ].join('\n');
}

/**
 * Compute the HMAC-SHA256 seal (lowercase hex) over a single chain link.
 *
 * @param record - The record_hash / previous_hash / sequenceNumber to seal.
 * @param key    - Optional key; falls back to process.env.AUDIT_HMAC_KEY.
 * @returns 64-char lowercase hex HMAC-SHA256.
 */
export function sealRecord(record: SealableRecord, key?: string | Buffer): string {
  const hmacKey = resolveKey(key);
  return createHmac('sha256', hmacKey).update(canonicalInput(record), 'utf8').digest('hex');
}

/**
 * Constant-time verification that `seal` is the valid HMAC seal for `record`.
 *
 * Uses crypto.timingSafeEqual so verification leaks no timing side-channel
 * about how many leading bytes matched. Returns false (never throws) on any
 * malformed/length-mismatched seal so a tampered value simply fails closed.
 * A missing key still throws via resolveKey — that is a configuration error,
 * not a verification outcome.
 *
 * @param record - The record whose seal is being checked.
 * @param seal   - The stored hex seal to compare against.
 * @param key    - Optional key; falls back to process.env.AUDIT_HMAC_KEY.
 */
export function verifySeal(record: SealableRecord, seal: string, key?: string | Buffer): boolean {
  const expected = sealRecord(record, key);
  if (typeof seal !== 'string') return false;

  const expectedBuf = Buffer.from(expected, 'hex');
  let actualBuf: Buffer;
  try {
    actualBuf = Buffer.from(seal, 'hex');
  } catch {
    return false;
  }

  // timingSafeEqual requires equal-length buffers; a length mismatch is itself
  // a verification failure (and short-circuiting on it here leaks no useful
  // timing info because the lengths are public).
  if (expectedBuf.length !== actualBuf.length || actualBuf.length === 0) {
    return false;
  }
  return timingSafeEqual(expectedBuf, actualBuf);
}

/** A sealed chain row: the sealable fields plus its stored seal. */
export interface SealedRecord extends SealableRecord {
  seal: string;
}

/** Result of walking a sealed chain. `brokenAt` is the index of the first bad seal. */
export interface ChainSealVerification {
  valid: boolean;
  /** Index (0-based) of the first record whose seal failed, or null if all valid. */
  brokenAt: number | null;
}

/**
 * Verify the HMAC seals of an ordered list of sealed chain rows.
 *
 * Walks the records in the given order (which must be the append order) and
 * checks each seal independently. Returns `{ valid: true, brokenAt: null }`
 * when every seal verifies, otherwise stops at and reports the index of the
 * first failure — everything after a break is already untrustworthy.
 *
 * Pure: no I/O. The caller supplies the rows already read from storage.
 *
 * @param records - Ordered sealed rows (record_hash / previous_hash / seq / seal).
 * @param key     - Optional key; falls back to process.env.AUDIT_HMAC_KEY.
 */
export function verifyChainSeals(records: SealedRecord[], key?: string | Buffer): ChainSealVerification {
  for (let i = 0; i < records.length; i++) {
    const r = records[i];
    if (!verifySeal({ recordHash: r.recordHash, previousHash: r.previousHash, sequenceNumber: r.sequenceNumber }, r.seal, key)) {
      return { valid: false, brokenAt: i };
    }
  }
  return { valid: true, brokenAt: null };
}

export default {
  sealRecord,
  verifySeal,
  verifyChainSeals,
  GENESIS_PREVIOUS_HASH,
};
