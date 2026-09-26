/**
 * A same-bytes re-upload to the Vault changes nothing it does not say, and
 * records what it does change (VR-05, row D5).
 *
 * `ingestVaultDocument`'s ON CONFLICT … DO UPDATE refused different bytes at an
 * occupied (program, code, version), but for the same bytes it rewrote the
 * governed row: a retry that omitted the classification reset it to INTERNAL,
 * one that omitted the retention policy nulled it, the storage pointer moved to
 * the retry's fresh copy and orphaned the admitted one, and the only audit was
 * a second ingest row carrying the new values, never the old. The column-level
 * rules are pinned on the real SQL in
 * server/routes/__tests__/vault-ingest-conflict.pglite.integration.test.ts;
 * this suite drives the real route and service on PostgreSQL as the runtime
 * role, RLS on, through the storage provider.
 *
 * Its harness mirrors tests/db/vault-ingest.dbtest.ts, with its own tenant,
 * program and codes so the two suites never share a row.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import request from 'supertest';
import { Pool } from 'pg';
import { createHash } from 'node:crypto';
import { databaseUrl } from '../setup.db';

const PROBE_PREFIX = 'dbtest-vr05 ';
const CODE = 'DBTEST-VR05-DOC';

let owner: Pool;
let orgId: number;
let orgUuid: string;
let userId: number;
let programId: string;
let app: express.Express;

const PDF_BYTES = Buffer.from(
  '%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n% dbtest-vr05\ntrailer<</Root 1 0 R>>\n%%EOF\n',
  'utf8',
);
const PDF_SHA256 = createHash('sha256').update(PDF_BYTES).digest('hex');

async function buildApp(): Promise<express.Express> {
  const createVaultIngestRoutes = (await import('../../server/routes/vault-ingest')).default;
  const { establishRequestTenantScope } = await import('../../server/middleware/establishRequestTenantScope');
  const a = express();
  a.use((req, _res, next) => {
    const r = req as unknown as Record<string, unknown>;
    r.userId = userId;
    r.tenantId = orgId;
    r.userRole = 'admin';
    r.user = { id: userId, organizationId: orgId, organizationUuid: orgUuid, role: 'admin' };
    next();
  });
  // The real scope middleware: RLS_ENFORCE=on refuses an unscoped query.
  a.use(establishRequestTenantScope);
  a.use('/api/vault/ingest', createVaultIngestRoutes());
  return a;
}

async function cleanup(): Promise<void> {
  // audit_logs is append-only; the probe rows go as the owner with the DELETE
  // trigger disabled for this transaction only (as vault-ingest.dbtest.ts does).
  const client = await owner.connect();
  try {
    await client.query('BEGIN');
    await client.query('ALTER TABLE audit_logs DISABLE TRIGGER trg_audit_logs_no_delete');
    await client.query(
      `DELETE FROM audit_logs WHERE action IN ('vault.document.ingest', 'vault.document.reupload')
         AND record_id IN (SELECT id::text FROM vault.documents WHERE document_code LIKE $1)`,
      [`${CODE}%`],
    );
    await client.query('ALTER TABLE audit_logs ENABLE TRIGGER trg_audit_logs_no_delete');
    await client.query('COMMIT');
  } catch {
    await client.query('ROLLBACK').catch(() => {});
  } finally {
    client.release();
  }
  await owner.query('DELETE FROM vault.documents WHERE document_code LIKE $1', [`${CODE}%`]);
  await owner.query('DELETE FROM regulatory_programs WHERE name LIKE $1', [`${PROBE_PREFIX}%`]);
}

beforeAll(async () => {
  owner = new Pool({ connectionString: databaseUrl, max: 4 });
  const org = await owner.query(
    `INSERT INTO organizations (name, slug) VALUES ($1, $2)
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
    [`${PROBE_PREFIX}tenant`, 'dbtest-vr05-tenant'],
  );
  orgId = Number(org.rows[0].id);
  orgUuid = String((await owner.query('SELECT uuid FROM organizations WHERE id = $1', [orgId])).rows[0].uuid);
  const user = await owner.query(
    `INSERT INTO users (email, name, password_hash) VALUES ($1, $2, $3)
       ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
    ['dbtest-vr05@example.test', `${PROBE_PREFIX}actor`, 'not-a-real-hash'],
  );
  userId = Number(user.rows[0].id);
  await cleanup();
  const prog = await owner.query(
    `INSERT INTO regulatory_programs
       (name, code, organization_id, program_type, product_type, primary_agency, product_name)
     VALUES ($1, $2, $3, '510k', 'device', 'FDA', $4) RETURNING id`,
    [`${PROBE_PREFIX}device program`, 'DBTEST-VR05-A', orgId, 'AeroFlow AF-1000'],
  );
  programId = String(prog.rows[0].id);
  app = await buildApp();
});

afterAll(async () => {
  await cleanup().catch(() => {});
  await owner.end().catch(() => {});
});

const upload = (fields: Record<string, string>) => {
  let r = request(app).post('/api/vault/ingest').field('programId', programId).field('documentCode', CODE);
  for (const [k, v] of Object.entries(fields)) r = r.field(k, v);
  return r.attach('file', PDF_BYTES, 'protocol.pdf');
};

const recorded = async () =>
  (
    await owner.query(
      `SELECT id, document_title, classification, retention_policy, storage_version_id, file_name
         FROM vault.documents WHERE document_code = $1`,
      [CODE],
    )
  ).rows[0];

const auditRows = async (id: string) =>
  (
    await owner.query(
      `SELECT action, new_values FROM audit_logs
        WHERE record_id = $1 AND action IN ('vault.document.ingest', 'vault.document.reupload')
        ORDER BY occurred_at`,
      [id],
    )
  ).rows as Array<{ action: string; new_values: Record<string, unknown> | null }>;

async function storedVersionIds(): Promise<Set<string>> {
  const { getStorageProvider } = await import('../../server/services/storage/index');
  return new Set((await getStorageProvider().list(orgId, programId)).map((o) => o.vaultVersionId));
}

describe('a same-bytes re-upload to the Vault (VR-05, D5)', () => {
  it('admits the document with a classification and a retention policy', async () => {
    const res = await upload({
      documentTitle: 'Protocol',
      documentType: 'OTHER',
      classification: 'CONFIDENTIAL',
      retentionPolicy: 'DBTEST-VR05-POLICY',
    });
    expect(res.status).toBe(201);
    expect(res.body.document.contentHash).toBe(PDF_SHA256);
    expect(res.body.reupload).toBeUndefined();
  });

  it('a retry that omits them changes nothing, writes no audit row, and leaves no second copy', async () => {
    const before = await recorded();
    const beforeObjects = await storedVersionIds();
    const auditBefore = (await auditRows(String(before.id))).length;

    const res = await upload({ documentTitle: 'Protocol', documentType: 'OTHER' });

    // What the record holds first; the response's account of it last.
    const after = await recorded();
    expect(after).toMatchObject({
      classification: 'CONFIDENTIAL',
      retention_policy: 'DBTEST-VR05-POLICY',
      storage_version_id: before.storage_version_id,
      file_name: before.file_name,
    });
    expect((await auditRows(String(before.id))).length).toBe(auditBefore);
    // The retry's own copy was removed; the recorded copy is the one left, and it reads back.
    expect([...(await storedVersionIds())].filter((v) => !beforeObjects.has(v))).toEqual([]);
    const { getStorageProvider } = await import('../../server/services/storage/index');
    const got = await getStorageProvider().get(String(after.storage_version_id), orgId);
    expect(got, 'the recorded copy must still be readable').toBeTruthy();
    expect(createHash('sha256').update(got!.bytes).digest('hex')).toBe(PDF_SHA256);
    expect(res.status).toBe(200);
    expect(res.body.reupload).toEqual({ unchanged: true, changes: [] });
  });

  it('a retry that changes the title records it once, with the value before and after', async () => {
    const before = await recorded();
    const res = await upload({ documentTitle: 'Clinical protocol v1', documentType: 'OTHER' });

    const rows = await auditRows(String(before.id));
    const reuploads = rows.filter((r) => r.action === 'vault.document.reupload');
    expect(reuploads).toHaveLength(1);
    expect(JSON.stringify(reuploads[0].new_values)).toContain('"from":"Protocol"');
    // Still the recorded copy and classification.
    expect(await recorded()).toMatchObject({
      document_title: 'Clinical protocol v1',
      classification: 'CONFIDENTIAL',
      storage_version_id: before.storage_version_id,
    });
    expect(res.status).toBe(200);
    expect(res.body.reupload.unchanged).toBe(false);
    expect(res.body.reupload.changes).toContainEqual({
      field: 'document_title',
      from: 'Protocol',
      to: 'Clinical protocol v1',
    });
  });
});
