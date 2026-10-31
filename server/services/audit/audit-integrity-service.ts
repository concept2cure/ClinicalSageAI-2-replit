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

import { verifyAuditChain, verifyAuditChainSeals, type PoolClient, type VerifyAuditChainOptions } from './chain.js';

export type SealIntegrity =
  | {
      checked: true;
      valid: boolean;
      brokenAt: number | null;
      /** Seals actually verified. */
      verified: number;
      /** Rows with no seal; covered by the sha256 chain only. */
      unsealed: number;
      /** Rows with no seal written after sealing began — a lapse or a removed seal. */
      unsealedAfterSealed: number;
      firstUnsealedAfterSealed: string | null;
    }
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
 * pool client, or any PoolClient-compatible handle). With `{ tenantId }`, one
 * organisation's chain and seals only, as the integrity sweep checks each
 * organisation in its own scope (P-72 slice 1b).
 */
export async function verifyAuditIntegrity(client: PoolClient, opts: VerifyAuditChainOptions = {}): Promise<AuditIntegrityResult> {
  const chain = await verifyAuditChain(client, opts);

  let seals: SealIntegrity;
  let unverifiable: boolean;
  if (!process.env.AUDIT_HMAC_KEY) {
    // No seal key → seals cannot be verified. Fail closed: this is NOT a pass.
    seals = { checked: false, reason: 'AUDIT_HMAC_KEY not configured; HMAC seals cannot be verified — integrity unverifiable.' };
    unverifiable = true;
  } else {
    const result = await verifyAuditChainSeals(client, opts);
    if (result.valid && result.verified === 0 && result.unsealed > 0) {
      // Rows exist and none carries a seal: nothing was verified. This read
      // `checked: true, valid: true` — a pass over zero seals.
      seals = {
        checked: false,
        reason: `None of the ${result.unsealed} audit_logs rows carries an HMAC seal, so no seal was verified — integrity unverifiable.`,
      };
      unverifiable = true;
    } else {
      seals = {
        checked: true,
        valid: result.valid,
        brokenAt: result.brokenAt,
        verified: result.verified,
        unsealed: result.unsealed,
        unsealedAfterSealed: result.unsealedAfterSealed,
        firstUnsealedAfterSealed: result.firstUnsealedAfterSealed,
      };
      // Rows written after sealing began with no seal cannot be verified,
      // whatever the verified ones say.
      unverifiable = result.valid && result.unsealedAfterSealed > 0;
    }
  }

  // ok requires BOTH the chain intact AND the seals checked-and-valid, with no
  // row after sealing began left unsealed. An unverifiable seal state can
  // never yield ok:true.
  const ok = chain.ok && seals.checked && seals.valid && !unverifiable;
  return { chain, seals, ok, unverifiable };
}
