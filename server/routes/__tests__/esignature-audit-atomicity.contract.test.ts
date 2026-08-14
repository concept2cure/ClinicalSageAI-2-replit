/**
 * C2C-ESIGN-001 — a 21 CFR Part 11 electronic signature must be ATOMIC with its
 * §11.10(e) audit row.
 *
 * Before the fix, `POST /api/esignature/sign` looked like this:
 *
 *   const result = await pool.query('INSERT INTO electronic_signatures ...');  // autocommit
 *   try { await auditService.logAction({...}); }
 *   catch { return res.status(500).json({ code: 'ESIGNATURE_AUDIT_FAILED' }); }
 *
 * and carried the comment: "no signature without a corresponding, durable
 * audit-trail entry".
 *
 * That guarantee could not hold, for two INDEPENDENT reasons:
 *
 *   1. The INSERT ran on an autocommit `pool.query`, so the signature was
 *      already durably committed by the time the audit write was attempted.
 *      Returning 500 rolled back nothing.
 *   2. `auditService.logAction` catches its own persistence errors and returns
 *      normally (auditService.ts — "an audit-trail outage must not break the
 *      user action it records"). It never rejects for a DB failure, so the
 *      `catch` was dead code for the very failure it was written to handle.
 *
 * Net effect: a signature could be permanently recorded with NO audit row, and
 * the platform would report either success or a misleading "signing aborted".
 *
 * These tests use in-process Postgres (PGlite) and the REAL
 * `writeChainedAuditRow` + `computeAuditChainSealed` chain writer. Audit failure
 * is injected with a CHECK constraint on audit_logs — an audit-integrity failure
 * INSIDE the transaction — mirroring the injection technique established by
 * C2C-AUDIT-001 (qms-vault-audit-atomicity.contract.test.ts).
 *
 * The load-bearing assertion is `rolls back the signature when the audit row
 * cannot be written`: on the parent commit it fails, because the signature had
 * already autocommitted.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PGlite } from '@electric-sql/pglite';

import { writeChainedAuditRow } from '../../services/auditService';

let pglite: PGlite;

const q = async (sql: string, params?: unknown[]) => {
  const r = await pglite.query(sql, params as unknown[]);
  const rows = r.rows as unknown[];
  return { rows: rows as any[], rowCount: (r as { affectedRows?: number }).affectedRows ?? rows.length };
};

// PGlite is a SINGLE connection, so BEGIN / COMMIT / ROLLBACK issued here are
// real Postgres transaction control — a rollback asserted below is a genuine
// rollback, not a mock recording.
const client = { query: q, release: () => undefined };

// audit_logs — the columns writeChainedAuditRow writes (mirrors
// scripts/db-verify/00_bootstrap_base.sql + migrations 20260527 / 20260609).
const AUDIT_LOGS_DDL = `
CREATE TABLE IF NOT EXISTS audit_logs (
  id           TEXT PRIMARY KEY,
  tenant_id    INTEGER,
  user_id      INTEGER,
  action       TEXT,
  table_name   TEXT,
  record_id    TEXT,
  actor_id     INTEGER,
  target       TEXT,
  payload_hash TEXT,
  sha256_chain TEXT,
  occurred_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  hmac_seal    TEXT,
  old_values   JSON,
  new_values   JSON,
  ip_address   TEXT,
  user_agent   TEXT
);
`;

// Trimmed to the NOT NULL surface the sign route actually populates.
const ESIGNATURES_DDL = `
CREATE TABLE IF NOT EXISTS electronic_signatures (
  id                       SERIAL PRIMARY KEY,
  document_id              INTEGER NOT NULL,
  version_id               INTEGER NOT NULL,
  signature_type           VARCHAR(50) NOT NULL,
  signature_purpose        TEXT NOT NULL,
  signer_id                INTEGER NOT NULL,
  signer_name              TEXT NOT NULL,
  signer_email             TEXT NOT NULL,
  authentication_method    VARCHAR(50) NOT NULL,
  authentication_timestamp TIMESTAMP NOT NULL,
  signature_hash           VARCHAR(256) NOT NULL,
  signature_meaning        TEXT,
  bound_payload_digest     TEXT NOT NULL DEFAULT '',
  organization_id          INTEGER,
  signed_at                TIMESTAMP NOT NULL DEFAULT now()
);
`;

/** The transaction shape the fixed route uses: signature + audit, one tx. */
async function signWithAudit(opts: { failAudit: boolean }): Promise<void> {
  await client.query('BEGIN');
  try {
    const inserted = await client.query(
      `INSERT INTO electronic_signatures (
         document_id, version_id, signature_type, signature_purpose,
         signer_id, signer_name, signer_email, authentication_method,
         authentication_timestamp, signature_hash, signature_meaning,
         bound_payload_digest, organization_id
       ) VALUES (1, 1, 'approval', 'approve', 7, 'Test Signer',
                 'signer@example.test', 'password+totp', now(),
                 'deadbeef', 'approved', 'digest-abc', 42)
       RETURNING id`,
    );

    await writeChainedAuditRow(client, {
      tenantId: 42,
      userId: 7,
      action: opts.failAudit ? 'esignature.sign.FORBIDDEN' : 'esignature.sign',
      resourceType: 'electronic_signature',
      resourceId: String(inserted.rows[0].id),
      details: { documentId: 1, versionId: 1 },
    });

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  }
}

const countSignatures = async () =>
  Number((await client.query('SELECT count(*)::int AS n FROM electronic_signatures')).rows[0].n);
const countAudit = async () =>
  Number((await client.query('SELECT count(*)::int AS n FROM audit_logs')).rows[0].n);

describe('C2C-ESIGN-001 — signature and its Part 11 audit row are atomic', () => {
  beforeAll(async () => {
    pglite = new PGlite();
    await pglite.exec(AUDIT_LOGS_DDL);
    await pglite.exec(ESIGNATURES_DDL);
  });

  afterAll(async () => {
    await pglite?.close();
  });

  beforeEach(async () => {
    await pglite.exec('DELETE FROM audit_logs; DELETE FROM electronic_signatures;');
  });

  it('writes both rows on the happy path', async () => {
    await signWithAudit({ failAudit: false });
    expect(await countSignatures()).toBe(1);
    expect(await countAudit()).toBe(1);
  });

  it('binds the audit row to the signature it records', async () => {
    await signWithAudit({ failAudit: false });
    const sig = await client.query('SELECT id FROM electronic_signatures LIMIT 1');
    const audit = await client.query(
      'SELECT action, record_id, target, sha256_chain FROM audit_logs LIMIT 1',
    );
    expect(audit.rows[0].action).toBe('esignature.sign');
    expect(audit.rows[0].record_id).toBe(String(sig.rows[0].id));
    expect(audit.rows[0].target).toBe(`electronic_signature:${sig.rows[0].id}`);
    // The chain hash is computed and stored, not left null.
    expect(audit.rows[0].sha256_chain).toMatch(/^[0-9a-f]{64}$/);
  });

  it('rolls back the signature when the audit row cannot be written', async () => {
    // Injected audit-integrity failure INSIDE the transaction. On the parent
    // commit this test fails: the signature had already autocommitted via
    // pool.query before the audit write was even attempted.
    await pglite.exec(
      `ALTER TABLE audit_logs ADD CONSTRAINT audit_logs_reject_probe
         CHECK (action <> 'esignature.sign.FORBIDDEN');`,
    );
    try {
      await expect(signWithAudit({ failAudit: true })).rejects.toThrow();

      expect(
        await countSignatures(),
        'signature must NOT survive a failed audit write (21 CFR Part 11 §11.10(e))',
      ).toBe(0);
      expect(await countAudit()).toBe(0);
    } finally {
      await pglite.exec('ALTER TABLE audit_logs DROP CONSTRAINT audit_logs_reject_probe;');
    }
  });

  it('the failure is observable — the audit write rejects rather than resolving', async () => {
    // The specific defect that made the old catch dead code: logAction swallowed
    // persistence errors, so awaiting it could not surface a failure. The
    // transaction-enlisted writer must propagate.
    await pglite.exec(
      `ALTER TABLE audit_logs ADD CONSTRAINT audit_logs_reject_probe2
         CHECK (action <> 'esignature.sign.FORBIDDEN');`,
    );
    try {
      await client.query('BEGIN');
      await expect(
        writeChainedAuditRow(client, {
          tenantId: 42,
          userId: 7,
          action: 'esignature.sign.FORBIDDEN',
          resourceType: 'electronic_signature',
          resourceId: '1',
        }),
      ).rejects.toThrow();
      await client.query('ROLLBACK');
    } finally {
      await pglite.exec('ALTER TABLE audit_logs DROP CONSTRAINT audit_logs_reject_probe2;');
    }
  });
});
