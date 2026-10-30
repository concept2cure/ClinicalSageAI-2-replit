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
import { assertVaultFixtureDatabase, assertVaultFixtureRuntime, closeVaultFixtureRuntime, seedVaultFixtureParent } from './vault-current-access-fixture';
import { nativeCatalogRunId } from './catalog-native-fixture';
import { readVaultIngestReceipt } from '../../client/src/concept2cure/v2/vaultIngestReceipt';

const RUN = nativeCatalogRunId();
const PROBE_PREFIX = `dbtest-vr05-${RUN} `;
const CODE = `DBTEST-VR05-DOC-${RUN}`;

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

beforeAll(async () => {
  owner = new Pool({ connectionString: databaseUrl, max: 4 });
  await assertVaultFixtureDatabase(owner);
  const org = await owner.query(
    `INSERT INTO organizations (name, slug, status) VALUES ($1, $2, 'active') RETURNING id`,
    [`${PROBE_PREFIX}tenant`, `dbtest-vr05-${RUN}-tenant`],
  );
  orgId = Number(org.rows[0].id);
  orgUuid = String((await owner.query('SELECT uuid FROM organizations WHERE id = $1', [orgId])).rows[0].uuid);
  const user = await owner.query(
    `INSERT INTO users (email, name, password_hash, status) VALUES ($1, $2, $3, 'active') RETURNING id`,
    [`dbtest-vr05-${RUN}@example.test`, `${PROBE_PREFIX}actor`, 'not-a-real-hash'],
  );
  userId = Number(user.rows[0].id);
  const prog = await owner.query(
    `INSERT INTO regulatory_programs
       (name, code, organization_id, program_type, product_type, primary_agency, product_name)
     VALUES ($1, $2, $3, '510k', 'device', 'FDA', $4) RETURNING id`,
    [`${PROBE_PREFIX}device program`, 'DBTEST-VR05-A', orgId, 'AeroFlow AF-1000'],
  );
  programId = String(prog.rows[0].id);
  await seedVaultFixtureParent(owner, { orgId, orgUuid, programId }, { userId, namespace: `${PROBE_PREFIX}parent` });
  await assertVaultFixtureRuntime({ orgId, orgUuid, programId });
  app = await buildApp();
});

afterAll(async () => {
  // Keep this invocation's source bytes, records and append-only history.
  try { await closeVaultFixtureRuntime(); }
  finally { await owner?.end(); }
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
    expect(res.body.reupload).toEqual({ unchanged: true, changes: [], differs: [] });
  });

  it('a retry asking for another title or type changes nothing, and says what differs', async () => {
    // Title, type and classification change through Edit details, with a
    // reason (vault-metadata-edit.service.ts), never as a side effect of
    // re-uploading the same bytes.
    const before = await recorded();
    const auditBefore = (await auditRows(String(before.id))).length;
    const res = await upload({ documentTitle: 'Clinical protocol v1', documentType: 'PROTOCOL' });

    expect(await recorded()).toMatchObject({
      document_title: 'Protocol',
      classification: 'CONFIDENTIAL',
      storage_version_id: before.storage_version_id,
    });
    expect((await auditRows(String(before.id))).length).toBe(auditBefore);
    expect(res.status).toBe(200);
    expect(res.body.reupload).toMatchObject({ unchanged: true, changes: [] });
    expect(res.body.reupload.differs).toEqual([
      { field: 'document_title', recorded: 'Protocol', requested: 'Clinical protocol v1' },
      { field: 'document_type', recorded: 'OTHER', requested: 'PROTOCOL' },
    ]);
    expect(res.body.document.documentTitle).toBe('Protocol');
  });

  it('a retry asking to file it elsewhere changes nothing, and says its filing differs (Part 11 review F3)', async () => {
    // The filing changes through Confirm or Move (placeVaultDocument), as a
    // person's decision with its own audit row. A retry that named another
    // folder was told "nothing changed" with no word that the folder was ignored.
    const filingOf = async () => (await owner.query(
      `SELECT folder_id, evidence_kind, ctd_section, placement_status FROM vault.documents WHERE document_code = $1`, [CODE])).rows[0];
    const before = await filingOf();
    const elsewhere = before.folder_id === 'qms' ? 'eng' : 'qms';
    // The recorded title and type, so that only the filing differs.
    const res = await upload({ documentTitle: 'Protocol', documentType: 'OTHER', folderId: elsewhere, evidenceKind: 'qms', ctdSection: '4.1' });

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(await filingOf()).toEqual(before);
    expect(res.body.reupload).toMatchObject({ unchanged: true, changes: [] });
    expect(res.body.reupload.differs).toEqual(expect.arrayContaining([
      { field: 'folder_id', recorded: before.folder_id, requested: elsewhere },
    ]));
    for (const d of res.body.reupload.differs as Array<{ field: string; recorded: string | null; requested: string }>) {
      expect(d.requested).not.toBe(d.recorded);
    }
  });
});

describe('the upload client accepts the actual committed ingest receipts', () => {
  it('accepts client-shaped new, same-bytes and check-in replies with their recorded identities', async () => {
    const fileName = `receipt-${RUN}.txt`;
    const title = fileName.replace(/\.txt$/, '');
    const bytes = Buffer.from(`Client-shaped receipt contract ${RUN}.`, 'utf8');
    const created = await request(app).post('/api/vault/ingest')
      .field('programId', programId).field('documentCode', fileName)
      .field('documentTitle', title).field('documentType', 'OTHER')
      .attach('file', bytes, { filename: fileName, contentType: 'text/plain' });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const first = readVaultIngestReceipt(created.body, created.status, { programId, fileName });
    expect(first).toMatchObject({ success: true, document: { programId, documentCode: fileName, version: '1.0' } });
    const documentId = String(created.body.document.id);

    const retried = await request(app).post('/api/vault/ingest')
      .field('programId', programId).field('documentCode', fileName)
      .field('documentTitle', title).field('documentType', 'OTHER')
      .attach('file', bytes, { filename: fileName, contentType: 'text/plain' });
    expect(retried.status, JSON.stringify(retried.body)).toBe(200);
    expect(readVaultIngestReceipt(retried.body, retried.status, { programId, fileName })).toMatchObject({
      document: { id: documentId }, reupload: { unchanged: true, changes: [], differs: [] },
    });

    const nextFile = `receipt-${RUN}-v2.txt`;
    const checkedIn = await request(app).post('/api/vault/ingest')
      .field('programId', programId).field('supersedesDocumentId', documentId)
      .field('documentTitle', title).field('documentType', 'OTHER')
      .attach('file', Buffer.from(`The revised receipt contract ${RUN}.`, 'utf8'), { filename: nextFile, contentType: 'text/plain' });
    expect(checkedIn.status, JSON.stringify(checkedIn.body)).toBe(201);
    const next = readVaultIngestReceipt(checkedIn.body, checkedIn.status, { programId, fileName: nextFile, supersedesDocumentId: documentId });
    expect(next).toMatchObject({ document: { programId, documentCode: fileName, version: '2.0' } });
    expect(next?.document.id).not.toBe(documentId);
  });

});
