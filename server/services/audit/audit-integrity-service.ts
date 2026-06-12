/**
 * Audit integrity verification.
 *
 * Activates the (previously dormant) audit_logs chain + HMAC-seal verifiers into
 * a single integrity check: re-derives the sha256 hash-chain and verifies the
 * HMAC seals (21 CFR Part 11 §11.10(e), §11.70). The audit_logs sha256 chain is
 * GLOBAL (not per-org), so this is a system/admin integrity check.
 *
 * Read-only. Seal verification is skipped (not failed) when AUDIT_HMAC_KEY is
 * not configured — unsealed rows are still covered by the sha256 chain.
 */

import { verifyAuditChain, verifyAuditChainSeals, type PoolClient } from './chain.js';

export type SealIntegrity =
  | { checked: true; valid: boolean; brokenAt: number | null }
  | { checked: false; reason: string };

export interface AuditIntegrityResult {
  chain: Awaited<ReturnType<typeof verifyAuditChain>>;
  seals: SealIntegrity;
  /** True only when the chain is intact AND (seals valid OR seal check skipped). */
  ok: boolean;
}

/**
 * Verify the audit_logs integrity. `client` only needs `.query` (a pg pool, a
 * pool client, or any PoolClient-compatible handle).
 */
export async function verifyAuditIntegrity(client: PoolClient): Promise<AuditIntegrityResult> {
  const chain = await verifyAuditChain(client);

  let seals: SealIntegrity;
  if (!process.env.AUDIT_HMAC_KEY) {
    seals = { checked: false, reason: 'AUDIT_HMAC_KEY not configured; seal verification skipped.' };
  } else {
    const result = await verifyAuditChainSeals(client);
    seals = { checked: true, valid: result.valid, brokenAt: result.brokenAt };
  }

  const ok = chain.ok && (seals.checked ? seals.valid : true);
  return { chain, seals, ok };
}
