/**
 * Server-keyed HMAC seal over the eCTD release-signature payload digest.
 *
 * THE GAP THIS CLOSES. The resume integrity guard proves the persisted
 * `signedSnapshot` is internally consistent with its `payloadDigest`, but both
 * live in the MUTABLE `submission_orchestrator_runs.steps` JSONB column. An
 * adversary with write access to that column could replace the snapshot AND
 * recompute a matching digest (the digest fn is a public sha256), then have a
 * legitimate signer bind a real §11.70 signature to the forged record — the
 * "self-consistency ≠ authenticity" finding from the snapshot-hydration review.
 *
 * This seal binds the digest to SERVER authority: it is an HMAC-SHA256 over the
 * digest, keyed by `AUDIT_HMAC_KEY` — the same high-entropy secret that seals
 * the audit ledger, held OUTSIDE the database (KMS / secrets manager). Without
 * the key an attacker cannot produce a matching seal, so a forged snapshot+digest
 * fails seal verification on resume even though it is internally self-consistent.
 * This raises the bar from "DB steps-column write" to "DB write AND app-secret
 * exfiltration" — the same guarantee audit-hmac-seal gives the ledger.
 *
 * OPT-IN / POSTURE. Sealing is active exactly when `AUDIT_HMAC_KEY` is
 * configured. Production already requires it at boot
 * (assertAuditSealPostureForProduction), so production runs are always sealed.
 * In dev/staging without the key, `sealSignPayloadDigest` returns null (no seal
 * stored) and resume enforces nothing extra — the self-consistency guard still
 * applies. A run that WAS sealed always has its seal enforced on resume (a
 * missing key at verify time fails closed — the control was on and is now
 * unverifiable, so we refuse rather than accept blindly).
 *
 * PURE + DETERMINISTIC: identical (digest, org, key) always yields the identical
 * hex seal, no I/O / clock / randomness.
 *
 * @module server/services/ectd/sign-payload-seal
 */

import { createHmac, timingSafeEqual } from 'crypto';

/** Domain-separation tag: prevents this seal from ever colliding with another
 *  HMAC that reuses AUDIT_HMAC_KEY (e.g. the audit-chain seal). Versioned so the
 *  canonical input can evolve without ambiguity. */
const DOMAIN = 'ectd.release-signature.payload-digest.v1';

/** Read the seal key. Null (not throw) when unconfigured — the caller decides
 *  whether that means "skip sealing" (sign-prep) or "fail closed" (verify of a
 *  run that already carries a seal). */
function resolveKey(env: NodeJS.ProcessEnv = process.env): Buffer | null {
  const raw = env.AUDIT_HMAC_KEY;
  if (raw === undefined || raw === null || raw === '') return null;
  return Buffer.from(raw, 'utf8');
}

/** True when a seal key is configured (sealing is active). */
export function isSignSealConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return resolveKey(env) !== null;
}

/** Canonical, newline-delimited seal input — pinned so writer and verifier never
 *  drift on ordering/whitespace. The digest already binds the full identity
 *  tuple (self-contained snapshot), so org here is defense-in-depth. */
function canonicalInput(payloadDigest: string, organizationId: number): string {
  return [DOMAIN, `org:${organizationId}`, `digest:${payloadDigest}`].join('\n');
}

/**
 * Compute the seal for a payload digest. Returns the 64-char hex HMAC, or `null`
 * when no key is configured (sealing disabled — dev/staging). Never throws.
 */
export function sealSignPayloadDigest(
  payloadDigest: string,
  organizationId: number,
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const key = resolveKey(env);
  if (!key) return null;
  return createHmac('sha256', key).update(canonicalInput(payloadDigest, organizationId), 'utf8').digest('hex');
}

export type SealVerdict =
  /** No seal was stored and none is required (unsealed run under an unsealed posture). */
  | 'unsealed'
  /** Seal present (or required) and verified. */
  | 'ok'
  /** Seal present but does not verify, OR a seal is present but the key is gone. */
  | 'failed';

/**
 * Verify a stored seal against a (digest, org). Constant-time. Semantics:
 *   - storedSeal absent  → 'unsealed' (caller skips enforcement — opt-in path).
 *   - storedSeal present, key configured, HMAC matches → 'ok'.
 *   - storedSeal present, key configured, HMAC differs  → 'failed' (tamper).
 *   - storedSeal present, key ABSENT → 'failed' (a seal was applied but cannot
 *     be verified now — the control is on and unverifiable, so fail closed).
 */
export function verifySignPayloadSeal(
  payloadDigest: string,
  organizationId: number,
  storedSeal: string | undefined | null,
  env: NodeJS.ProcessEnv = process.env,
): SealVerdict {
  if (storedSeal === undefined || storedSeal === null || storedSeal === '') return 'unsealed';
  const key = resolveKey(env);
  if (!key) return 'failed'; // a seal exists but we cannot verify it — refuse
  const expected = createHmac('sha256', key)
    .update(canonicalInput(payloadDigest, organizationId), 'utf8')
    .digest('hex');
  const expectedBuf = Buffer.from(expected, 'hex');
  let actualBuf: Buffer;
  try {
    actualBuf = Buffer.from(storedSeal, 'hex');
  } catch {
    return 'failed';
  }
  if (expectedBuf.length !== actualBuf.length || actualBuf.length === 0) return 'failed';
  return timingSafeEqual(expectedBuf, actualBuf) ? 'ok' : 'failed';
}

export default { isSignSealConfigured, sealSignPayloadDigest, verifySignPayloadSeal };
