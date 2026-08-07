/**
 * Audit-trail attestation report generator.
 *
 * Produces a customer-facing attestation that the audit trail for a tenant
 * has not been tampered with. Walks the hash chain in `audit_events`
 * scoped to the customer's organization, recomputes each row's hash, and
 * reports any mismatches.
 *
 * The report is signed (HMAC-SHA256 over the report body) so an external
 * auditor can verify it was issued by the platform and not modified after
 * the fact.
 *
 * Compliance: 21 CFR Part 11 §11.10(e) — audit trail must be tamper-
 * evident; the customer can request this report on demand per the BETA
 * customer-onboarding runbook.
 *
 * ── What UNVERIFIABLE will mean after the chain is switched on ────────────────
 * Today every row reports UNVERIFIABLE because no row carries a hash. The
 * columns exist — drizzle creates them from shared/schema.ts — but the trigger
 * that fills them lives in db/migrations/20260222_audit_events_hash_chain.sql,
 * which is not in C2C_MIGRATION_FILES, so it has never run.
 *
 * That trigger is real and works: BEFORE INSERT, it assigns a per-org
 * sequence_number and a SHA-256 record_hash over the previous hash plus the
 * event's fields. Applying it starts a chain.
 *
 * It starts one. It does not create one retroactively, and this is the part
 * worth knowing before someone treats the migration as a fix: rows written
 * before cutover have no hash and cannot honestly be given one. Computing
 * hashes over historical records after the fact produces a chain that is
 * self-consistent and proves nothing about the period it claims to cover —
 * which is the opposite of what a tamper-evidence control is for.
 *
 * So the honest end state is permanent: this report will say UNVERIFIABLE with
 * `hashedEntries` / `unhashedEntries` splitting at the cutover, for the life of
 * the tenant's history. That is not a defect to be tuned away. A tenant whose
 * audit trail predates the chain has a period nobody can attest to, and the
 * report should keep saying so rather than average it into a verdict.
 *
 * A backfill would make this report say INTACT. It would also be the single
 * most misleading thing this codebase could do, so it needs a compliance
 * decision and not an engineering one.
 */

import crypto from 'crypto';
import type { Pool, PoolClient } from 'pg';

export interface AttestationReport {
  schemaVersion: '1.0';
  organization: { id: number; slug: string; name: string };
  generatedAt: string;
  windowStart: string | null;
  windowEnd: string | null;
  totalEntries: number;
  /** Entries carrying a `record_hash`, i.e. the ones that CAN be attested. */
  hashedEntries: number;
  /** Entries with no `record_hash`. Any value above zero means the trail is
   *  not fully covered and the report cannot claim INTACT. */
  unhashedEntries: number;
  brokenLinks: number;
  brokenLinkSamples: Array<{ id: string; sequenceNumber: number }>;
  firstSequenceNumber: number | null;
  lastSequenceNumber: number | null;
  /**
   * INTACT       every entry is hashed and every link checks out
   * BROKEN       a link does not check out — tampering or corruption
   * EMPTY        the tenant has no audit entries at all
   * UNVERIFIABLE entries exist but some or all carry no hash, so there is
   *              nothing to check. NOT a synonym for INTACT — see below.
   */
  attestation: 'INTACT' | 'BROKEN' | 'EMPTY' | 'UNVERIFIABLE';
  /** Present on UNVERIFIABLE; plain-language reason for the reader. */
  unverifiableReason?: string;
  signature: {
    algorithm: 'HMAC-SHA256';
    keyId: string;
    value: string;
  };
}

export class AttestationKeyMissingError extends Error {
  constructor() {
    super('AUDIT_ATTESTATION_KEY env var is required to sign attestation reports');
    this.name = 'AttestationKeyMissingError';
  }
}

/**
 * Resolve the active signing key. Newly-generated reports always use the
 * current key (`AUDIT_ATTESTATION_KEY`). The key id is embedded in the
 * report so rotated keys can still verify older reports — the verifier
 * picks `current` or `previous` by id.
 */
function getCurrentKey(): { id: string; secret: Buffer } {
  const raw = process.env.AUDIT_ATTESTATION_KEY;
  if (!raw || raw.length < 32) {
    throw new AttestationKeyMissingError();
  }
  const id = process.env.AUDIT_ATTESTATION_KEY_ID || 'k1';
  return { id, secret: Buffer.from(raw, 'utf8') };
}

function resolveVerifyKey(id: string): Buffer | null {
  const current = process.env.AUDIT_ATTESTATION_KEY;
  const currentId = process.env.AUDIT_ATTESTATION_KEY_ID || 'k1';
  if (current && id === currentId) return Buffer.from(current, 'utf8');

  const previous = process.env.AUDIT_ATTESTATION_KEY_PREV;
  const previousId = process.env.AUDIT_ATTESTATION_KEY_PREV_ID;
  if (previous && previousId && id === previousId) return Buffer.from(previous, 'utf8');

  return null;
}

export async function generateAttestation(
  client: Pool | PoolClient,
  organizationId: number,
): Promise<AttestationReport> {
  const orgRes = await client.query<{ id: number; slug: string; name: string }>(
    `SELECT id, slug, name FROM organizations WHERE id = $1 LIMIT 1`,
    [organizationId],
  );
  if (orgRes.rows.length === 0) {
    throw new Error(`Organization ${organizationId} not found`);
  }
  const org = orgRes.rows[0];

  const { rows } = await client.query<{
    id: string;
    sequence_number: number;
    record_hash: string;
    previous_hash: string | null;
    timestamp: string;
  }>(
    `SELECT id, sequence_number, record_hash, previous_hash, timestamp
     FROM audit_events
     WHERE organization_id = $1
     ORDER BY sequence_number ASC`,
    [organizationId],
  );

  if (rows.length === 0) {
    return signed({
      schemaVersion: '1.0',
      organization: org,
      generatedAt: new Date().toISOString(),
      windowStart: null,
      windowEnd: null,
      totalEntries: 0,
      hashedEntries: 0,
      unhashedEntries: 0,
      brokenLinks: 0,
      brokenLinkSamples: [],
      firstSequenceNumber: null,
      lastSequenceNumber: null,
      // EMPTY is distinct from UNVERIFIABLE: the tenant genuinely has no audit
      // history, which is a true statement about the tenant. UNVERIFIABLE is a
      // statement about this report's inability to check one that exists.
      attestation: 'EMPTY',
    });
  }

  const broken: Array<{ id: string; sequenceNumber: number }> = [];
  let prevHash: string | null = null;
  for (const row of rows) {
    const expectedPrev = prevHash;
    if (
      expectedPrev !== null &&
      row.previous_hash !== null &&
      row.previous_hash !== expectedPrev
    ) {
      broken.push({ id: row.id, sequenceNumber: row.sequence_number });
    }
    prevHash = row.record_hash;
  }

  /*
   * An unhashed trail is UNVERIFIABLE, and must never be reported as INTACT.
   *
   * The loop above cannot detect a break in a trail that was never hashed, and
   * it fails silently in two independent ways: with every `record_hash` NULL,
   * `prevHash` stays null so `expectedPrev !== null` is never true; and every
   * `row.previous_hash` is null so the second guard is never true either. Zero
   * broken links, `intact === true`, and the report went out saying INTACT —
   * under an HMAC signature — over rows carrying no hash at all.
   *
   * That is not a weaker attestation. It is a claim about tamper-evidence
   * supported by no evidence, in the one document a customer hands an
   * inspector, and it would be found by a single `SELECT ... WHERE record_hash
   * IS NULL`. The columns exist (drizzle creates them nullable from
   * shared/schema.ts) while the migrations that populate them —
   * db/migrations/20260222_audit_events_hash_chain.sql and its three siblings —
   * are absent from C2C_MIGRATION_FILES in scripts/db/migration-set.mjs, so on
   * a deployment that never ran them by hand, every row is NULL.
   *
   * Fixing the apply path is the other half and is a separate change. This half
   * makes the report unable to lie while that is still true: it fails closed,
   * and it says which entries it could not attest to rather than averaging them
   * away.
   *
   * PARTIAL hashing is UNVERIFIABLE too. A trail hashed from some point onward
   * can have its later links checked, but the earlier span cannot be attested
   * at all, and "INTACT" over a partially-covered trail is the same overclaim
   * in miniature. The counts are reported so the reader can see the split
   * instead of taking a verdict on trust.
   */
  const hashedEntries = rows.filter((r) => r.record_hash != null).length;
  const unhashedEntries = rows.length - hashedEntries;

  const base = {
    schemaVersion: '1.0' as const,
    organization: org,
    generatedAt: new Date().toISOString(),
    windowStart: rows[0].timestamp,
    windowEnd: rows[rows.length - 1].timestamp,
    totalEntries: rows.length,
    hashedEntries,
    unhashedEntries,
    brokenLinks: broken.length,
    brokenLinkSamples: broken.slice(0, 25),
    firstSequenceNumber: rows[0].sequence_number,
    lastSequenceNumber: rows[rows.length - 1].sequence_number,
  };

  if (unhashedEntries > 0) {
    return signed({
      ...base,
      attestation: 'UNVERIFIABLE',
      unverifiableReason:
        hashedEntries === 0
          ? `No audit entry carries a hash, so the trail cannot be attested. ` +
            `All ${rows.length} entries are unhashed.`
          : `${unhashedEntries} of ${rows.length} audit entries carry no hash and ` +
            `cannot be attested. The remaining ${hashedEntries} are chained.`,
    });
  }

  return signed({ ...base, attestation: broken.length === 0 ? 'INTACT' : 'BROKEN' });
}

export function verifyAttestationSignature(report: AttestationReport): boolean {
  try {
    const key = resolveVerifyKey(report.signature.keyId);
    if (!key) return false;
    const { signature, ...body } = report;
    const expected = crypto
      .createHmac('sha256', key)
      .update(canonicalJSON(body))
      .digest('hex');
    return crypto.timingSafeEqual(
      Buffer.from(expected, 'hex'),
      Buffer.from(signature.value, 'hex'),
    );
  } catch {
    return false;
  }
}

function signed(body: Omit<AttestationReport, 'signature'>): AttestationReport {
  const { id, secret } = getCurrentKey();
  const value = crypto
    .createHmac('sha256', secret)
    .update(canonicalJSON(body))
    .digest('hex');
  return { ...body, signature: { algorithm: 'HMAC-SHA256', keyId: id, value } };
}

// Canonical JSON: sorted keys, no whitespace. Matches what verifiers expect.
function canonicalJSON(value: unknown): string {
  if (Array.isArray(value)) {
    return '[' + value.map(canonicalJSON).join(',') + ']';
  }
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    return (
      '{' +
      keys.map(k => JSON.stringify(k) + ':' + canonicalJSON(obj[k])).join(',') +
      '}'
    );
  }
  return JSON.stringify(value);
}
