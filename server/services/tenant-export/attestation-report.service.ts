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
  brokenLinks: number;
  brokenLinkSamples: Array<{ id: string; sequenceNumber: number }>;
  firstSequenceNumber: number | null;
  lastSequenceNumber: number | null;
  attestation: 'INTACT' | 'BROKEN' | 'EMPTY';
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
      brokenLinks: 0,
      brokenLinkSamples: [],
      firstSequenceNumber: null,
      lastSequenceNumber: null,
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

  const intact = broken.length === 0;
  return signed({
    schemaVersion: '1.0',
    organization: org,
    generatedAt: new Date().toISOString(),
    windowStart: rows[0].timestamp,
    windowEnd: rows[rows.length - 1].timestamp,
    totalEntries: rows.length,
    brokenLinks: broken.length,
    brokenLinkSamples: broken.slice(0, 25),
    firstSequenceNumber: rows[0].sequence_number,
    lastSequenceNumber: rows[rows.length - 1].sequence_number,
    attestation: intact ? 'INTACT' : 'BROKEN',
  });
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
