/**
 * Audit integrity verification.
 *
 * Activates the (previously dormant) audit_logs chain + HMAC-seal verifiers into
 * a single integrity check: re-derives the sha256 hash-chain and verifies the
 * HMAC seals (21 CFR Part 11 §11.10(e), §11.70). The audit_logs sha256 chain is
 * GLOBAL (not per-org), so this is a system/admin integrity check.
 *
 * Read-only. FAIL-CLOSED: integrity is only `ok:true` when the sha256 chain is
 * intact AND the HMAC seals are verified. When AUDIT_HMAC_KEY is unavailable the
 * seals cannot be verified, so the result is `ok:false` with `unverifiable:true`
 * — an unsealed/unverifiable chain MUST NOT be reported as verified integrity
 * (21 CFR Part 11 §11.70). The sha256 chain alone is tamper-detectable but
 * forgeable by anyone who can rewrite the table, so it is not sufficient on its
 * own to assert record authenticity.
 */

import { verifyAuditChain, verifyAuditChainSeals, type PoolClient } from './chain.js';

export type SealIntegrity =
  | { checked: true; valid: boolean; brokenAt: number | null }
  | { checked: false; reason: string };

export interface AuditIntegrityResult {
  chain: Awaited<ReturnType<typeof verifyAuditChain>>;
  seals: SealIntegrity;
  /**
   * True ONLY when the chain is intact AND the HMAC seals were checked and valid.
   * Never true when seal verification was skipped/unavailable (fail-closed).
   */
  ok: boolean;
  /**
   * True when integrity could not be positively verified because the HMAC seal
   * key was unavailable (so `ok` is false for an "unverifiable", not necessarily
   * "tampered", reason). Callers MUST treat this as a verification failure, never
   * as a pass. False when seals were actually checked (valid or broken).
   */
  unverifiable: boolean;
}

/**
 * Verify the audit_logs integrity. `client` only needs `.query` (a pg pool, a
 * pool client, or any PoolClient-compatible handle).
 */
export async function verifyAuditIntegrity(client: PoolClient): Promise<AuditIntegrityResult> {
  const chain = await verifyAuditChain(client);

  let seals: SealIntegrity;
  let unverifiable: boolean;
  if (!process.env.AUDIT_HMAC_KEY) {
    // No seal key → seals cannot be verified. Fail closed: this is NOT a pass.
    seals = { checked: false, reason: 'AUDIT_HMAC_KEY not configured; HMAC seals cannot be verified — integrity unverifiable.' };
    unverifiable = true;
  } else {
    const result = await verifyAuditChainSeals(client);
    seals = { checked: true, valid: result.valid, brokenAt: result.brokenAt };
    unverifiable = false;
  }

  // ok requires BOTH the chain intact AND the seals checked-and-valid. An
  // unverifiable seal state can never yield ok:true.
  const ok = chain.ok && seals.checked && seals.valid;
  return { chain, seals, ok, unverifiable };
}
