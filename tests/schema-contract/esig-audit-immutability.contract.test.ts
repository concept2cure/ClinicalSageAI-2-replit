/**
 * Schema contract: database-level immutability for the Part 11 trails.
 *
 * Auth/e-signature audit 2026-07-30: the append-only invariant for
 * electronic_signatures and device_audit_trail was enforced only by an
 * HTTP-layer route guard (applyImmutabilityPolicy) and code-review convention.
 * Any service, script, or future route could UPDATE or DELETE a final
 * signature or an audit event straight through SQL — "append-only" was
 * described, not proven, at the database layer.
 *
 * db/migrations/20260730_esign_audit_db_level_immutability.sql closes that:
 *   - electronic_signatures: DELETE always refused; UPDATE refused EXCEPT the
 *     write-once supersession transition (superseded_by NULL → id). A row
 *     that is already superseded can never change again.
 *   - device_audit_trail: strictly append-only — UPDATE and DELETE refused.
 *
 * These tests apply the REAL baseline shape + the REAL esig-gate port + the
 * REAL immutability migration to an in-process Postgres and attempt the
 * mutations a regulator would ask about.
 *
 * @compliance 21 CFR Part 11 §11.70 (signature/record linking), §11.10(e)
 *             (audit trail) — records can be appended, never altered.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const ESIG_PORT = 'db/migrations/20260725_esig_gate_columns_port.sql';
const IMMUTABILITY = 'db/migrations/20260730_esign_audit_db_level_immutability.sql';

const read = (f: string) => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');

/** Baseline shape (0000_sweet_joseph.sql column set) + FK targets. */
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
  CREATE TABLE device_audit_trail (
    id SERIAL PRIMARY KEY,
    organization_id INTEGER,
    user_id INTEGER,
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(100) NOT NULL,
    entity_id INTEGER,
    user_name TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
  );
  CREATE TABLE submission_orchestrator_runs (
    id SERIAL PRIMARY KEY,
    organization_id INTEGER,
    status TEXT NOT NULL DEFAULT 'running'
      CONSTRAINT submission_orchestrator_runs_status_check
      CHECK (status IN ('running', 'awaiting-async', 'complete', 'failed', 'partial'))
  );
  INSERT INTO organizations (id, name) VALUES (1, 'org-a');
  INSERT INTO users (id, email) VALUES (1, 'signer@example.com');
  INSERT INTO documents (id, title) VALUES (1, 'Submission package');
  INSERT INTO document_versions (id, document_id) VALUES (1, 1);
`;

/** A complete signature row, org + digest bound AT INSERT (the shipped path). */
const INSERT_SIGNATURE = `
  INSERT INTO electronic_signatures
    (document_id, version_id, organization_id, signature_type, signature_purpose,
     signer_id, signer_name, signer_email, authentication_method,
     authentication_timestamp, signature_hash, signature_meaning,
     bound_payload_digest)
  VALUES (1, 1, 1, 'approval', 'release', 1, 'A Signer', 'signer@example.com',
          'password', NOW(), 'attribution-hash', 'approval', 'digest-abc')
  RETURNING id
`;

describe('Part 11 DB-level immutability — electronic_signatures', () => {
  let pg: PGlite;
  let signatureId: number;

  beforeAll(async () => {
    pg = new PGlite();
    await pg.exec(BASELINE);
    await pg.exec(read(ESIG_PORT));
    await pg.exec(read(IMMUTABILITY));
    const r = await pg.query<{ id: number }>(INSERT_SIGNATURE);
    signatureId = r.rows[0].id;
  }, 120_000);

  afterAll(async () => {
    await pg?.close();
  });

  it('is journaled in the canonical migration manifest (never push-only)', () => {
    // The audited failure class: a control that exists only on the drizzle-kit
    // push surface silently never provisions on migration-provisioned
    // environments (C-17/C-19/C-20). Pin the lineage.
    const manifest = JSON.parse(read('db/migrations/migrations_manifest.json'));
    expect(manifest.executionOrder).toContain(
      '20260730_esign_audit_db_level_immutability.sql',
    );
  });

  it('INSERT still works — append is the one permitted verb', async () => {
    const r = await pg.query<{ id: number }>(INSERT_SIGNATURE);
    expect(r.rows[0].id).toBeGreaterThan(signatureId);
  });

  it('refuses UPDATE of substantive columns (signer, hash, meaning, digest)', async () => {
    for (const stmt of [
      `UPDATE electronic_signatures SET signer_name = 'Someone Else' WHERE id = $1`,
      `UPDATE electronic_signatures SET signature_hash = 'tampered' WHERE id = $1`,
      `UPDATE electronic_signatures SET signature_meaning = 'rejected' WHERE id = $1`,
      `UPDATE electronic_signatures SET bound_payload_digest = 'other-digest' WHERE id = $1`,
      `UPDATE electronic_signatures SET organization_id = 2 WHERE id = $1`,
    ]) {
      await expect(pg.query(stmt, [signatureId])).rejects.toThrow(
        /IMMUTABILITY_VIOLATION/,
      );
    }
  });

  it('refuses DELETE outright', async () => {
    await expect(
      pg.query(`DELETE FROM electronic_signatures WHERE id = $1`, [signatureId]),
    ).rejects.toThrow(/IMMUTABILITY_VIOLATION/);
  });

  it('permits ONLY the write-once supersession transition, then freezes the row', async () => {
    const next = await pg.query<{ id: number }>(INSERT_SIGNATURE);
    const newId = next.rows[0].id;

    // OQ-4 §11.70: supersession marks the old row, never mutates its content.
    await pg.query(
      `UPDATE electronic_signatures SET superseded_by = $1 WHERE id = $2`,
      [newId, signatureId],
    );
    const r = await pg.query<{ superseded_by: number }>(
      `SELECT superseded_by FROM electronic_signatures WHERE id = $1`,
      [signatureId],
    );
    expect(r.rows[0].superseded_by).toBe(newId);

    // Write-once: a superseded row can never be re-pointed or "un-superseded".
    await expect(
      pg.query(`UPDATE electronic_signatures SET superseded_by = $1 WHERE id = $2`, [
        newId + 1,
        signatureId,
      ]),
    ).rejects.toThrow(/already superseded/);
    await expect(
      pg.query(`UPDATE electronic_signatures SET superseded_by = NULL WHERE id = $1`, [
        signatureId,
      ]),
    ).rejects.toThrow(/already superseded/);

    // And supersession cannot smuggle content changes along with the marker.
    await expect(
      pg.query(
        `UPDATE electronic_signatures SET superseded_by = $1, signer_name = 'Mallory' WHERE id = $2`,
        [signatureId, newId],
      ),
    ).rejects.toThrow(/IMMUTABILITY_VIOLATION/);
  });
});

describe('Part 11 DB-level immutability — device_audit_trail', () => {
  let pg: PGlite;
  let eventId: number;

  beforeAll(async () => {
    pg = new PGlite();
    await pg.exec(BASELINE);
    await pg.exec(read(ESIG_PORT));
    await pg.exec(read(IMMUTABILITY));
    const r = await pg.query<{ id: number }>(
      `INSERT INTO device_audit_trail (organization_id, user_id, action, entity_type, entity_id, user_name)
       VALUES (1, 1, 'ELECTRONIC_SIGNATURE_CREATED', 'submission-release', 1, 'A Signer')
       RETURNING id`,
    );
    eventId = r.rows[0].id;
  }, 120_000);

  afterAll(async () => {
    await pg?.close();
  });

  it('INSERT still works', async () => {
    const r = await pg.query<{ id: number }>(
      `INSERT INTO device_audit_trail (organization_id, user_id, action, entity_type)
       VALUES (1, 1, 'ACCESS_DENIED', 'document') RETURNING id`,
    );
    expect(r.rows[0].id).toBeGreaterThan(eventId);
  });

  it('refuses UPDATE of any column — strictly append-only', async () => {
    await expect(
      pg.query(`UPDATE device_audit_trail SET action = 'nothing_happened' WHERE id = $1`, [
        eventId,
      ]),
    ).rejects.toThrow(/IMMUTABILITY_VIOLATION/);
  });

  it('refuses DELETE — history cannot be erased', async () => {
    await expect(
      pg.query(`DELETE FROM device_audit_trail WHERE id = $1`, [eventId]),
    ).rejects.toThrow(/IMMUTABILITY_VIOLATION/);
  });
});
