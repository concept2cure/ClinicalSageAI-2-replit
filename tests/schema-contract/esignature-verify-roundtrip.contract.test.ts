/**
 * @vitest-environment node
 *
 * Signature verify round-trip + release-uniqueness backstop.
 *
 * TWO integrity properties the release-gate audit (2026-07-30) left unproven:
 *
 *   1. createElectronicSignature → verifySignatureIntegrity (the LIVE endpoint) must round-trip
 *      to `valid: true`. The attribution hash is computed over the manifest
 *      that is persisted; verifySignatureIntegrity re-hashes the STORED
 *      manifest and compares. Before the audit's fix the hash covered a
 *      DIFFERENT object than the stored manifest (missing boundPayloadDigest),
 *      so every signature verified as "integrity compromised" — a §11.70
 *      verification path that never passed. This proves it now does, and that
 *      tampering with the stored manifest is detected.
 *
 *   2. The release-gate one-active-signature invariant (OQ-3) has a DATABASE
 *      backstop: a second active release signature for the same
 *      (org, bound_payload_digest) is rejected by the unique index, while a
 *      DIFFERENT document's multi-signature (approval + witness on one
 *      version) is still allowed.
 *
 * Drives the REAL part11ComplianceService against PGlite with the real
 * migrations, mirroring the release-signature journey's db redirection.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createJourneyDb, extractTableDdl, type JourneyDb } from '../golden-journeys/harness';

const h = vi.hoisted(() => ({ db: null as unknown, pool: null as unknown }));
vi.mock('../../server/db', () => ({
  get db() { return h.db; },
  get pool() { return h.pool; },
  getPool: () => h.pool,
  query: (t: string, p?: unknown[]) =>
    (h.pool as { query: (t: string, p?: unknown[]) => Promise<unknown> }).query(t, p),
}));
vi.mock('../../server/db.js', () => ({
  get db() { return h.db; },
  get pool() { return h.pool; },
  getPool: () => h.pool,
  query: (t: string, p?: unknown[]) =>
    (h.pool as { query: (t: string, p?: unknown[]) => Promise<unknown> }).query(t, p),
}));

const ORG = 1;
const PASSWORD = 'Correct-Horse-Battery-42';
const T = 180_000;

let jdb: JourneyDb;
let part11: typeof import('../../server/services/part11ComplianceService').default;

beforeAll(async () => {
  const baseline = extractTableDdl('migrations/0000_sweet_joseph.sql', [
    'organizations', 'users', 'organization_users', 'documents',
    'document_versions', 'electronic_signatures', 'device_audit_trail',
  ]);
  jdb = await createJourneyDb({
    migrations: [
      // The esig gate port ALTERs submission_orchestrator_runs, so the store
      // port must precede it (same ordering as the release-signature journey).
      'db/migrations/20260725_submission_orchestrator_store_port.sql',
      'db/migrations/20260725_esig_gate_columns_port.sql',
      'db/migrations/20260725_users_signing_lockout_columns.sql',
      'db/migrations/20260730_esign_audit_db_level_immutability.sql',
      'db/migrations/20260730_release_signature_uniqueness.sql',
      // D6 (single e-signature write path): signed_target/binding_basis columns
      // + nullable document anchor. The Drizzle insert in
      // part11ComplianceService enumerates every declared column, so the
      // journey schema must carry the D6 shape or every insert 42703s.
      'migrations/20260813d_esignature_governed_unification.sql',
    ],
    prereqSql: `${baseline}\nCREATE TABLE IF NOT EXISTS submissions (id SERIAL PRIMARY KEY, organization_id INTEGER);`,
  });
  h.db = jdb.db;
  h.pool = jdb.pool;

  const bcrypt = await import('bcryptjs');
  const hash = await bcrypt.hash(PASSWORD, 4);
  await jdb.pool.query(
    `INSERT INTO organizations (id, name, slug) VALUES ($1, 'org', 'org')`, [ORG],
  );
  await jdb.pool.query(
    `INSERT INTO users (id, name, email, password_hash, status) VALUES (1,'Signer','s@x.test',$1,'active')`,
    [hash],
  );
  // Two documents, each with a stored version (the §11.70 content anchor).
  for (const docId of [10, 20]) {
    await jdb.pool.query(
      `INSERT INTO documents (id, organization_id, client_workspace_id, document_code, title, document_type, owner_id, created_by_id)
       VALUES ($1,$2,1,$3,'Doc','submission',1,1)`,
      [docId, ORG, `DOC-${docId}`],
    );
    await jdb.pool.query(
      `INSERT INTO document_versions (document_id, version_number, content, created_by_id, created_at)
       VALUES ($1,'1',$2,1,NOW())`,
      [docId, `content-of-${docId}`],
    );
  }

  part11 = (await import('../../server/services/part11ComplianceService')).default;
}, T);

afterAll(async () => {
  await jdb?.close();
});

describe('e-signature verify round-trip (§11.70 integrity)', () => {
  it('a freshly created signature validates as valid — hash covers the stored manifest', async () => {
    const created = await part11.createElectronicSignature({
      userId: 1,
      organizationId: ORG,
      documentId: 10,
      documentType: 'approval',
      signatureReason: 'approve',
      signatureMeaning: 'I approve this content',
      password: PASSWORD,
    });
    expect(created.signatureId).toBeGreaterThan(0);

    // The LIVE verify endpoint, not a service-only twin: this is the path
    // GET /electronic-signature/:id/verify runs, and it is the one that was
    // reporting every genuine signature as COMPROMISED because it re-hashed an
    // identifier payload no writer produces. A real write followed by the real
    // verify is the only test that could have shown that.
    const { verifySignatureIntegrity } = await import('../../server/services/auth-security-service');
    const verdict = await verifySignatureIntegrity(created.signatureId);
    expect(verdict.details?.hashIntegrity).toBe('VERIFIED');
    expect(verdict.valid).toBe(true);
  }, T);

  it('detects a manifest that does not match its hash — integrity is not vacuous', async () => {
    // Insert a row whose stored manifest and stored hash DISAGREE (a forged
    // or corrupted record). verifySignatureIntegrity re-hashes the manifest
    // and must reject it — proving the positive test above passes because the
    // hash genuinely binds the manifest, not because verify always returns
    // true. Direct INSERT is allowed; the append-only trigger blocks only
    // UPDATE/DELETE.
    const r = await jdb.pool.query(
      `INSERT INTO electronic_signatures
         (document_id, version_id, organization_id, signature_type, signature_purpose,
          signer_id, signer_name, signer_email, authentication_method,
          authentication_timestamp, signature_hash, signature_meaning, signature_manifest,
          bound_payload_digest, signed_at, verification_status)
       VALUES (20, 2, $1, 'approval', 'approve', 1, 'S', 's@x.test', 'password', NOW(),
               'not-the-real-hash', 'm', $2::jsonb, 'zz', NOW(), 'valid')
       RETURNING id`,
      [ORG, JSON.stringify({ reason: 'approve', meaning: 'm', documentId: 20 })],
    );
    const forgedId = (r.rows[0] as { id: number }).id;

    const { verifySignatureIntegrity } = await import('../../server/services/auth-security-service');
    const verdict = await verifySignatureIntegrity(forgedId);
    expect(verdict.valid).toBe(false);
    expect(verdict.details?.hashIntegrity).toBe('COMPROMISED');
  }, T);
});

describe('release-gate OQ-3 uniqueness backstop', () => {
  async function insertReleaseSig(digest: string) {
    // Insert directly in the release path's shape (signature_type =
    // 'submission-release'), the shape createElectronicSignature produces for
    // the orchestrator gate.
    return jdb.pool.query(
      `INSERT INTO electronic_signatures
         (document_id, version_id, organization_id, signature_type, signature_purpose,
          signer_id, signer_name, signer_email, authentication_method,
          authentication_timestamp, signature_hash, signature_meaning, bound_payload_digest)
       VALUES (10, 1, $1, 'submission-release', 'release', 1, 'S', 's@x.test',
               'password', NOW(), 'h', 'approval', $2)
       RETURNING id`,
      [ORG, digest],
    );
  }

  it('refuses a second ACTIVE release signature for the same (org, digest)', async () => {
    const digest = 'r'.repeat(64);
    await insertReleaseSig(digest);
    await expect(insertReleaseSig(digest)).rejects.toThrow(
      /duplicate key value|unique constraint/i,
    );
  });

  it('allows the SAME digest once the first is superseded (append-only re-sign)', async () => {
    const digest = 's'.repeat(64);
    const first = await insertReleaseSig(digest);
    const firstId = (first.rows[0] as { id: number }).id;
    const second = await insertReleaseSig(digest.replace('s', 't')); // new active row
    const secondId = (second.rows[0] as { id: number }).id;
    // Supersede the first via the permitted write-once transition, then a new
    // active row on the ORIGINAL digest is allowed.
    await jdb.pool.query(
      `UPDATE electronic_signatures SET superseded_by = $1 WHERE id = $2`,
      [secondId, firstId],
    );
    await expect(insertReleaseSig(digest)).resolves.toBeTruthy();
  });

  it('does NOT block document multi-signature (different signature_type, same digest)', async () => {
    const digest = 'd'.repeat(64);
    const mkDocSig = (purpose: string, type: string) => jdb.pool.query(
      `INSERT INTO electronic_signatures
         (document_id, version_id, organization_id, signature_type, signature_purpose,
          signer_id, signer_name, signer_email, authentication_method,
          authentication_timestamp, signature_hash, signature_meaning, bound_payload_digest)
       VALUES (10, 1, $1, $2, $3, 1, 'S', 's@x.test', 'password', NOW(), 'h', 'm', $4)`,
      [ORG, type, purpose, digest],
    );
    // Approval + witness on the same version digest — both active, legitimate.
    await expect(mkDocSig('approval', 'approval')).resolves.toBeTruthy();
    await expect(mkDocSig('witness', 'witness')).resolves.toBeTruthy();
  });
});
