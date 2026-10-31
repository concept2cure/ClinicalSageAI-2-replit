/**
 * What a seal walk could NOT check, kept beside what it did.
 *
 * Both chain verifiers (chain.ts: audit_logs and audit_events) skip a row with
 * no hmac_seal so a chain written before sealing never raises a false tamper
 * alarm. They skipped it silently, so a walk over rows no seal covered read
 * "valid" — and a walk with zero sealed rows read "valid" over nothing. This
 * counts the skipped rows, and the ones written after sealing had begun in
 * their scope (the whole log for audit_logs, the organisation for
 * audit_events): a lapse in sealing, or a seal that was removed, which no walk
 * can tell apart and neither can pass for verified.
 */
import {
  verifyChainSeals,
  GENESIS_PREVIOUS_HASH,
  type ChainSealVerification,
  type SealedRecord,
} from './audit-hmac-seal.js';
import type { PoolClient } from './chain.js';

export interface ChainSealReport extends ChainSealVerification {
  unsealed: number;
  unsealedAfterSealed: number;
  /** The first such row: an audit_logs id, or `<organization>:<sequence>` for audit_events. */
  firstUnsealedAfterSealed: string | null;
}

export function sealCoverage() {
  const began = new Set<string>();
  const counts = { unsealed: 0, unsealedAfterSealed: 0, firstUnsealedAfterSealed: null as string | null };
  return {
    sealed(scope: string): void {
      began.add(scope);
    },
    unsealed(scope: string, id: string): void {
      counts.unsealed += 1;
      if (began.has(scope)) {
        counts.unsealedAfterSealed += 1;
        counts.firstUnsealedAfterSealed ??= id;
      }
    },
    counts: () => ({ ...counts }),
  };
}

/**
 * Verify the HMAC seals over the `audit_events` chain (21 CFR Part 11 §11.70).
 *
 * audit_events is the SIEM / export-facing audit table. Unlike audit_logs it
 * carries a real per-org monotonic `sequence_number`, so its seal binds the
 * ACTUAL sequence number (strictly stronger than audit_logs' fixed
 * AUDIT_SEAL_SEQ — reordering is detected directly). See
 * docs/AUDIT_INTEGRITY_HMAC_PLAN.md §2b/§2c and migration
 * 20260617_audit_events_hmac_seal.sql for the additive nullable hmac_seal column.
 *
 * TOLERANT OF ABSENT SEALS — this is the whole point of the F1 rollout's "step 2
 * before the writer ships" ordering. While the writer is still deferred, EVERY
 * row's hmac_seal is NULL. This verifier:
 *   - verifies the seal of every row that HAS a non-NULL hmac_seal,
 *   - SKIPS (never fails) rows with a NULL seal — they are validly unsealed and
 *     remain covered by the SHA-256 chain,
 *   - walks rows per organization in sequence order so each sealed row's
 *     previousHash is reconstructed correctly even across interleaved unsealed
 *     rows,
 *   - returns valid: true when no sealed row fails — INCLUDING the all-NULL
 *     (pre-writer) state, so exports/attestations never see a false tamper
 *     alarm — and says how much that covers: `verified` seals, `unsealed` rows,
 *     and rows unsealed after their organisation's sealing began. With
 *     `verified: 0` nothing was checked; the sweep reports that as
 *     unverifiable, never as ok (it read "ok" until 2026-10-15).
 *
 * Read-only. Requires AUDIT_HMAC_KEY only when at least one sealed row is present
 * (verifySeal throws via resolveKey when the key is absent — a configuration
 * error, not a verification outcome). When every row is unsealed, no seal is
 * verified and the key is never consulted, so this is safe to call with the key
 * unset during the pre-writer phase.
 */
export async function verifyAuditEventsChainSeals(
  client: PoolClient,
  opts: { organizationId?: number } = {},
): Promise<ChainSealReport> {
  // One organisation's rows only, when named: the integrity sweep checks each in its own scope (P-72 slice 1b).
  const res = await client.query(
    `SELECT organization_id, record_hash, previous_hash, sequence_number, hmac_seal
       FROM audit_events
      WHERE record_hash IS NOT NULL AND ($1::int IS NULL OR organization_id = $1::int)
      ORDER BY organization_id ASC, sequence_number ASC`,
    [opts.organizationId ?? null],
  );

  // Group sealed rows per org, reconstructing each row's previousHash from the
  // prior chained row within the same org (sealed or not).
  const sealed: SealedRecord[] = [];
  const prevByOrg = new Map<string, string>();
  const coverage = sealCoverage(); // scoped per organisation

  for (const r of res.rows) {
    const orgKey = String((r.organization_id as unknown) ?? 'null');
    const recordHash = r.record_hash as string;
    const storedPrev = (r.previous_hash as string | null) ?? null;
    const previousHash = storedPrev ?? prevByOrg.get(orgKey) ?? GENESIS_PREVIOUS_HASH;
    const sequenceNumber = Number(r.sequence_number ?? 0);
    const seal = (r.hmac_seal as string | null) ?? null;

    if (seal) {
      sealed.push({ recordHash, previousHash, sequenceNumber, seal });
      coverage.sealed(orgKey);
    } else {
      coverage.unsealed(orgKey, `${orgKey}:${sequenceNumber}`);
    }
    // Advance the per-org pointer using EVERY chained row (sealed or not).
    prevByOrg.set(orgKey, recordHash);
  }

  // No sealed rows (e.g. pre-writer, all-NULL state): nothing fails and the key
  // is not consulted — and `verified: 0` says nothing was checked.
  return { ...verifyChainSeals(sealed), ...coverage.counts() };
}
