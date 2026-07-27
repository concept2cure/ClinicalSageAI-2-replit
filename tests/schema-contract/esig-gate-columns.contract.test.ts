/**
 * Schema contract: the Part 11 e-signature release gate is provisioned by the
 * canonical migration lineage, not only by `drizzle-kit push` (ledger C-17).
 *
 * POST /api/submissions/:submissionId/sign-release is the human-credential gate
 * between a validated submission package and transmit. Its final step binds the
 * signature to the payload:
 *
 *     UPDATE electronic_signatures
 *        SET organization_id = $1, bound_payload_digest = $2
 *      WHERE id = $3
 *
 * and returns 500 `signature_binding_failed` if that write fails. The three
 * columns it depends on were added by
 * migrations/20260629_orchestrator_awaiting_signature_status.sql — a file in the
 * ROOT lineage, which is not journaled and is not in the allowlist of
 * scripts/db/apply-c2c-migrations.mjs. Nothing applied it. The columns existed
 * only in shared/schema.ts, so only push-provisioned databases had them, and on
 * every migration-provisioned database the release gate could not be passed.
 *
 * These tests pin the port at db/migrations/20260725_esig_gate_columns_port.sql:
 * apply the REAL baseline shape plus the REAL port, then execute the route's
 * REAL update statement and the orchestrator's REAL resume-path lookup.
 *
 * @compliance 21 CFR Part 11 §11.70 (signature/record linking), §11.200
 *             (signature components) — a signature that cannot be bound to its
 *             payload is not a Part 11 signature.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const PORT_MIGRATION = 'db/migrations/20260725_esig_gate_columns_port.sql';
const ROOT_ORIGINAL = 'migrations/20260629_orchestrator_awaiting_signature_status.sql';

const read = (f: string) => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');

/**
 * The pre-port baseline: electronic_signatures as migrations/0000_sweet_joseph.sql
 * defines it (the columns under test deliberately absent), plus the FK targets
 * and the orchestrator runs table the port's CHECK constraint touches.
 */
const BASELINE = `
  CREATE TABLE organizations (id SERIAL PRIMARY KEY, name TEXT);
  CREATE TABLE users (id SERIAL PRIMARY KEY, email TEXT);
  CREATE TABLE documents (id SERIAL PRIMARY KEY, title TEXT);
  CREATE TABLE document_versions (id SERIAL PRIMARY KEY, document_id INTEGER);
  CREATE TABLE electronic_signatures (
    id SERIAL PRIMARY KEY,
    document_id INTEGER NOT NULL REFERENCES documents(id),
    version_id INTEGER NOT NULL REFERENCES document_versions(id),
    signature_type VARCHAR(50) NOT NULL,
    signature_purpose TEXT NOT NULL,
    signature_level INTEGER DEFAULT 1,
    signer_id INTEGER NOT NULL REFERENCES users(id),
    signer_name TEXT NOT NULL,
    signer_title TEXT,
    signer_email TEXT NOT NULL,
    authentication_method VARCHAR(50) NOT NULL,
    authentication_timestamp TIMESTAMP NOT NULL,
    second_factor_verified BOOLEAN DEFAULT FALSE,
    signature_hash VARCHAR(256) NOT NULL,
    signature_meaning TEXT,
    signature_manifest JSON,
    is_valid BOOLEAN DEFAULT TRUE,
    verification_status VARCHAR(50),
    verification_date TIMESTAMP,
    compliance_statement TEXT,
    legal_disclaimer TEXT,
    ip_address VARCHAR(45),
    device_info JSON,
    signed_at TIMESTAMP NOT NULL DEFAULT NOW(),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
  );
  CREATE TABLE submission_orchestrator_runs (
    id SERIAL PRIMARY KEY,
    organization_id INTEGER,
    status TEXT NOT NULL DEFAULT 'running'
      CONSTRAINT submission_orchestrator_runs_status_check
      CHECK (status IN ('running', 'awaiting-async', 'complete', 'failed', 'partial'))
  );
  INSERT INTO organizations (id, name) VALUES (1, 'org-a'), (2, 'org-b');
  INSERT INTO users (id, email) VALUES (1, 'signer@example.com');
  INSERT INTO documents (id, title) VALUES (1, 'Submission package');
  INSERT INTO document_versions (id, document_id) VALUES (1, 1);
`;

/** A signature row in the pre-port shape — what the sign route's step 6 creates. */
const INSERT_SIGNATURE = `
  INSERT INTO electronic_signatures
    (document_id, version_id, signature_type, signature_purpose, signer_id,
     signer_name, signer_email, authentication_method, authentication_timestamp,
     signature_hash, signature_meaning)
  VALUES (1, 1, 'approval', 'release', 1, 'A Signer', 'signer@example.com',
          'password', NOW(), 'attribution-hash', 'approval')
  RETURNING id
`;

describe('C-17: the e-sig gate columns are only in the push surface', () => {
  it('the root-lineage original is in NO application path', () => {
    const applyScript = read('scripts/db/apply-c2c-migrations.mjs');
    // The allowlist is the only thing that applies root-lineage files.
    expect(applyScript).not.toContain('20260629_orchestrator_awaiting_signature_status.sql');
    // And the root lineage's journal carries only the 0000 baseline.
    const journal = JSON.parse(read('migrations/meta/_journal.json'));
    expect(journal.entries.map((e: { tag: string }) => e.tag)).toEqual(['0000_sweet_joseph']);
  });

  it('the port exists in the canonical lineage and is journaled in the manifest', () => {
    const manifest = JSON.parse(read('db/migrations/migrations_manifest.json'));
    expect(manifest.executionOrder).toContain('20260725_esig_gate_columns_port.sql');
  });

  it('the port carries the original statements verbatim', () => {
    const original = read(ROOT_ORIGINAL);
    const port = read(PORT_MIGRATION);
    // Everything from the original's own header onward is byte-identical; only a
    // provenance preamble was prepended.
    expect(port.endsWith(original)).toBe(true);
  });
});

describe('C-17: the release-gate write works after the canonical port', () => {
  let pg: PGlite;
  let signatureId: number;

  beforeAll(async () => {
    pg = new PGlite();
    await pg.exec(BASELINE);
    const r = await pg.query<{ id: number }>(INSERT_SIGNATURE);
    signatureId = r.rows[0].id;
  }, 120_000);

  afterAll(async () => {
    await pg?.close();
  });

  it('FAILS before the port — this is the defect, demonstrated', async () => {
    await expect(
      pg.query(
        `UPDATE electronic_signatures SET organization_id = $1, bound_payload_digest = $2 WHERE id = $3`,
        [1, 'digest-abc', signatureId],
      ),
      // Postgres names the FIRST missing column, so match either of the two the
      // release gate depends on rather than pinning one.
    ).rejects.toThrow(/(organization_id|bound_payload_digest).*does not exist/i);
  });

  it('applies the real port migration', async () => {
    await pg.exec(read(PORT_MIGRATION));
    const cols = await pg.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
        WHERE table_name = 'electronic_signatures'`,
    );
    const names = cols.rows.map((c) => c.column_name);
    for (const c of ['organization_id', 'bound_payload_digest', 'superseded_by']) {
      expect(names, `electronic_signatures is missing ${c}`).toContain(c);
    }
  });

  it('the route\'s exact binding UPDATE now succeeds', async () => {
    await pg.query(
      `UPDATE electronic_signatures SET organization_id = $1, bound_payload_digest = $2 WHERE id = $3`,
      [1, 'digest-abc', signatureId],
    );
    const r = await pg.query<{ organization_id: number; bound_payload_digest: string }>(
      `SELECT organization_id, bound_payload_digest FROM electronic_signatures WHERE id = $1`,
      [signatureId],
    );
    expect(r.rows[0].organization_id).toBe(1);
    expect(r.rows[0].bound_payload_digest).toBe('digest-abc');
  });

  it('the orchestrator resume-path lookup finds the active signature, tenant-scoped', async () => {
    const found = await pg.query<{ id: number }>(
      `SELECT id FROM electronic_signatures
        WHERE organization_id = $1 AND bound_payload_digest = $2 AND superseded_by IS NULL
        ORDER BY created_at DESC LIMIT 1`,
      [1, 'digest-abc'],
    );
    expect(found.rows).toHaveLength(1);

    // OQ-7: another tenant must not observe it, even knowing the digest.
    const crossTenant = await pg.query(
      `SELECT id FROM electronic_signatures
        WHERE organization_id = $1 AND bound_payload_digest = $2 AND superseded_by IS NULL`,
      [2, 'digest-abc'],
    );
    expect(crossTenant.rows).toHaveLength(0);
  });

  it('supersession is append-only: the superseded row stops being active', async () => {
    const next = await pg.query<{ id: number }>(INSERT_SIGNATURE);
    const newId = next.rows[0].id;
    await pg.query(
      `UPDATE electronic_signatures SET organization_id = $1, bound_payload_digest = $2 WHERE id = $3`,
      [1, 'digest-abc', newId],
    );
    // OQ-4 §11.70: the prior row is never deleted — it is marked superseded.
    await pg.query(`UPDATE electronic_signatures SET superseded_by = $1 WHERE id = $2`, [
      newId,
      signatureId,
    ]);

    const active = await pg.query<{ id: number }>(
      `SELECT id FROM electronic_signatures
        WHERE organization_id = $1 AND bound_payload_digest = $2 AND superseded_by IS NULL`,
      [1, 'digest-abc'],
    );
    expect(active.rows.map((r) => r.id)).toEqual([newId]);

    // The forensic chain survives.
    const all = await pg.query(`SELECT id FROM electronic_signatures`);
    expect(all.rows.length).toBe(2);
  });

  it('the orchestrator can park a run in awaiting-signature', async () => {
    // The widened CHECK constraint is what lets the run reach the state this
    // whole gate exists to serve.
    await pg.query(
      `INSERT INTO submission_orchestrator_runs (organization_id, status) VALUES (1, 'awaiting-signature')`,
    );
    const r = await pg.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM submission_orchestrator_runs WHERE status = 'awaiting-signature'`,
    );
    expect(r.rows[0].n).toBe(1);
  });
});
