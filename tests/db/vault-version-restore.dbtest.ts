/**
 * Restore an earlier version of a Vault document as its next version (MR-08
 * Stage 5 steps 1–2, CAT1-04,
 * docs/work-orders/MR-08-vault-upload-safety-and-document-control.md).
 *
 * A version is a write-once row, so going back means adding one. Before this,
 * a person who wanted version 1 back could not have it: uploading its bytes
 * again was refused CONTENT_ALREADY_A_VERSION, and no route restored a
 * version. On real PostgreSQL as the runtime role, RLS on, through the real
 * routes and the storage provider:
 *   - restoring v1 after v2 records v3 with v1's SHA-256, superseding v2, as a
 *     new stored object, with the version restored and the reason in its
 *     chained audit row; v1 and v2 stay as they were, and v3 has no review
 *     record of its own yet;
 *   - an upload of v1's bytes is still refused: only a restore admits them;
 *   - a restore without a reason, by a viewer, of another program's version,
 *     of the current version, of bytes the current version already holds, or
 *     of a stored file that no longer matches its hash, is refused, and
 *     nothing is saved.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import request from 'supertest';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Pool } from 'pg';
import { createHash, randomUUID } from 'node:crypto';
import { databaseUrl } from '../setup.db';
import { assertVaultFixtureDatabase, assertVaultFixtureRuntime, closeVaultFixtureRuntime, seedVaultFixtureParent, seedVaultFixtureViewer } from './vault-current-access-fixture';

const RUN = randomUUID().slice(0, 12);
const PROBE = `dbtest-vrestore-${RUN} `;
const CODE = `DBTEST-VRESTORE-${RUN}`;
const REASON = 'Version 2 changed the dosing table in error; version 1 is the approved text.';

type Tenant = { orgId: number; orgUuid: string; programId: string };
let owner: Pool;
let userId: number;
let viewerId: number;
let mine: Tenant;
let otherProgram: Tenant;
let otherOrg: Tenant;

const pdf = (tag: string) =>
  Buffer.from(`%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n% ${tag}\ntrailer<</Root 1 0 R>>\n%%EOF\n`, 'utf8');
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');

async function appFor(t: Tenant, role = 'admin'): Promise<express.Express> {
  const createVaultIngestRoutes = (await import('../../server/routes/vault-ingest')).default;
  const createProjectVaultRoutes = (await import('../../server/routes/c2c/project-vault')).default;
  const { establishRequestTenantScope } = await import('../../server/middleware/establishRequestTenantScope');
  const a = express();
  a.use(express.json());
  const actorId = role === 'viewer' ? viewerId : userId;
  a.use((req, _res, next) => {
    Object.assign(req, {
      userId: actorId, tenantId: t.orgId, userRole: role,
      user: { id: actorId, organizationId: t.orgId, organizationUuid: t.orgUuid, role },
    });
    next();
  });
  a.use(establishRequestTenantScope);
  a.use('/api/vault/ingest', createVaultIngestRoutes());
  a.use('/api/c2c/project-vault', createProjectVaultRoutes());
  return a;
}

async function ingest(t: Tenant, bytes: Buffer, fields: Record<string, string>) {
  let r = request(await appFor(t)).post('/api/vault/ingest')
    .field('programId', t.programId).field('documentTitle', 'Clinical overview').field('documentType', 'OTHER');
  for (const [k, v] of Object.entries(fields)) r = r.field(k, v);
  return r.attach('file', bytes, { filename: 'overview.pdf', contentType: 'application/pdf' });
}

async function restore(t: Tenant, documentId: string, versionId: string, body: Record<string, unknown> = { reason: REASON }, role = 'admin') {
  return request(await appFor(t, role))
    .post(`/api/c2c/project-vault/${t.programId}/documents/${documentId}/versions/${versionId}/restore`)
    .send(body);
}

const row = async (id: string) => (await owner.query(
  `SELECT id::text, document_code, document_title, version, supersedes_id::text, content_hash, storage_version_id,
          folder_id, placement_status, deleted_at
     FROM vault.documents WHERE id = $1`, [id])).rows[0];
const family = async (code: string) => (await owner.query(
  `SELECT id::text, version, supersedes_id::text, content_hash FROM vault.documents
    WHERE document_code = $1 AND deleted_at IS NULL ORDER BY created_at`, [code])).rows;
const auditOf = async (id: string) => (await owner.query(
  `SELECT action, user_id, reason, new_values FROM audit_logs WHERE record_id = $1 ORDER BY created_at`, [id])).rows;

async function storedFile(t: Tenant, documentId: string): Promise<string> {
  const { rows } = await owner.query('SELECT storage_version_id FROM vault.documents WHERE id = $1', [documentId]);
  const versionId = String(rows[0].storage_version_id);
  const orgRoot = path.resolve(process.cwd(), 'storage', 'vault', String(t.orgId));
  for (const project of await fs.readdir(orgRoot)) {
    const dir = path.join(orgRoot, project, 'versions', versionId);
    const names = await fs.readdir(dir).catch(() => [] as string[]);
    const file = names.find((n) => n !== '_meta.json');
    if (file) return path.join(dir, file);
  }
  throw new Error(`no stored file for ${documentId}`);
}

async function tenantProgram(orgId: number, orgUuid: string, programCode: string): Promise<Tenant> {
  const prog = await owner.query(
    `INSERT INTO regulatory_programs (name, code, organization_id, program_type, product_type, primary_agency, product_name)
     VALUES ($1, $2, $3, 'ind', 'drug', 'FDA', 'Restorin 5mg') RETURNING id`,
    [`${PROBE}program ${programCode}`, `${programCode}-${RUN}`, orgId],
  );
  const t = { orgId, orgUuid, programId: String(prog.rows[0].id) };
  await seedVaultFixtureParent(owner, t, { userId, namespace: `${PROBE}${programCode}` });
  return t;
}

beforeAll(async () => {
  owner = new Pool({ connectionString: databaseUrl, max: 4 });
  await assertVaultFixtureDatabase(owner);
  userId = Number((await owner.query(
    `INSERT INTO users (email, name, password_hash, status) VALUES ($1, 'Rita Restorer', 'x', 'active') RETURNING id`,
    [`dbtest-vrestore-${RUN}@example.test`])).rows[0].id);
  const org = await owner.query(`INSERT INTO organizations (name, slug, status) VALUES ($1, $2, 'active') RETURNING id, uuid`,
    [`${PROBE}org`, `dbtest-vrestore-${RUN}`]);
  mine = await tenantProgram(Number(org.rows[0].id), String(org.rows[0].uuid), 'DBTEST-VRESTORE-A');
  otherProgram = await tenantProgram(mine.orgId, mine.orgUuid, 'DBTEST-VRESTORE-B');
  const org2 = await owner.query(`INSERT INTO organizations (name, slug, status) VALUES ($1, $2, 'active') RETURNING id, uuid`,
    [`${PROBE}other org`, `dbtest-vrestore-${RUN}-other`]);
  otherOrg = await tenantProgram(Number(org2.rows[0].id), String(org2.rows[0].uuid), 'DBTEST-VRESTORE-C');
  viewerId = Number((await owner.query(
    `INSERT INTO users (email, name, password_hash, status) VALUES ($1, 'Vic Viewer', 'x', 'active') RETURNING id`,
    [`dbtest-vrestore-${RUN}-viewer@example.test`])).rows[0].id);
  await seedVaultFixtureViewer(owner, mine, { userId: viewerId, invitedBy: userId });
  await assertVaultFixtureRuntime(mine);
}, 60_000);

afterAll(async () => {
  try { await closeVaultFixtureRuntime(); }
  finally { await owner?.end(); }
});

const code = `${CODE}-DOC`;
let v1 = '';
let v2 = '';
let v3 = '';

describe('restoring an earlier version of a Vault document', () => {

  it('records v3 with v1\'s bytes, superseding v2, as a new stored file, with the reason on record', async () => {
    const first = await ingest(mine, pdf('dosing table, approved'), { documentCode: code });
    expect(first.status, JSON.stringify(first.body)).toBe(201);
    v1 = first.body.document.id;
    const second = await ingest(mine, pdf('dosing table, changed in error'), { documentCode: code, supersedesDocumentId: v1 });
    expect(second.status, JSON.stringify(second.body)).toBe(201);
    v2 = second.body.document.id;
    const [before1, before2] = [await row(v1), await row(v2)];

    const res = await restore(mine, v2, v1);
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    v3 = String(res.body.data.document.id);
    const restored = await row(v3);
    expect(restored).toMatchObject({
      document_code: code, document_title: 'Clinical overview', version: '3.0', supersedes_id: v2,
      content_hash: before1.content_hash, folder_id: before2.folder_id, placement_status: before2.placement_status,
    });
    expect(restored.storage_version_id).not.toBe(before1.storage_version_id);
    expect(await fs.readFile(await storedFile(mine, v3))).toEqual(pdf('dosing table, approved'));
    expect(await row(v1)).toEqual(before1);
    expect(await row(v2)).toEqual(before2);
    expect((await family(code)).map((r) => r.version)).toEqual(['1.0', '2.0', '3.0']);

    const audit = await auditOf(v3);
    expect(audit).toHaveLength(1);
    // The reason on the row's own column, where the history reads it, and the line it shows.
    expect(audit[0]).toMatchObject({ action: 'vault.document.ingest', user_id: userId, reason: REASON });
    expect(audit[0].new_values).toMatchObject({ description: 'Restored version 1.0 as version 3.0' });
    expect(audit[0].new_values).toMatchObject({
      contentHash: sha(pdf('dosing table, approved')), version: '3.0',
      lineage: { supersedes: v2, predecessorVersion: '2.0', filingKept: true, restoredFrom: { versionId: v1, version: '1.0', reason: REASON } },
    });
  });

  it('lists all three versions, v3 current, with no review record of its own yet', async () => {
    const res = await request(await appFor(mine)).get(`/api/c2c/project-vault/${mine.programId}/documents/${v1}/versions`);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const versions = res.body.data.versions as Array<{ id: string; version: string; current: boolean; lifecycle: unknown; restoredFrom: unknown }>;
    expect(versions.map((v) => [v.version, v.current])).toEqual([['3.0', true], ['2.0', false], ['1.0', false]]);
    expect(versions.map((v) => v.restoredFrom)).toEqual([{ versionId: v1, version: '1.0' }, null, null]);
    // A review record is a canonical document naming the version (vault-lifecycle.ts).
    const records = (await owner.query(
      `SELECT count(*)::int AS n FROM canonical_documents
        WHERE source_refs -> 'vault_documents' ->> 'nativeId' = $1`, [v3])).rows[0].n;
    expect(records).toBe(0);
    expect(versions[0].lifecycle ?? null).toBeNull();
  });

  it('still refuses an upload of an earlier version\'s bytes: only a restore admits them', async () => {
    const res = await ingest(mine, pdf('dosing table, changed in error'), { documentCode: code, supersedesDocumentId: v3 });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONTENT_ALREADY_A_VERSION');
  });

});

describe('what a restore refuses', () => {
  it('refuses each restore it cannot make, and saves nothing', async () => {
    const elsewhere = await ingest(otherProgram, pdf('another program\'s document'), { documentCode: `${CODE}-ELSEWHERE` });
    expect(elsewhere.status, JSON.stringify(elsewhere.body)).toBe(201);
    const sibling = await ingest(mine, pdf('a sibling document in this program'), { documentCode: `${CODE}-SIBLING` });
    expect(sibling.status, JSON.stringify(sibling.body)).toBe(201);
    const theirs = await ingest(otherOrg, pdf('another organization\'s document'), { documentCode: `${CODE}-THEIRS` });
    expect(theirs.status, JSON.stringify(theirs.body)).toBe(201);
    const theirVersion = String(theirs.body.document.id);
    const before = await family(code);
    const cases: Array<[string, Awaited<ReturnType<typeof restore>>, number, string]> = [
      ['no reason', await restore(mine, v3, v2, {}), 422, 'REASON_REQUIRED'],
      ['a short reason', await restore(mine, v3, v2, { reason: 'undo' }), 422, 'REASON_REQUIRED'],
      ['a viewer', await restore(mine, v3, v2, { reason: REASON }, 'viewer'), 403, ''],
      ['the current version', await restore(mine, v3, v3), 409, 'ALREADY_CURRENT'],
      ['bytes the current version holds', await restore(mine, v3, v1), 409, 'CONTENT_ALREADY_CURRENT'],
      ['another program\'s version, named on this one', await restore(mine, v3, elsewhere.body.document.id), 404, 'VERSION_NOT_FOUND'],
      ['another document\'s version, named on this one', await restore(mine, v3, sibling.body.document.id), 404, 'VERSION_NOT_FOUND'],
      ['another organization\'s version, named on this one', await restore(mine, v3, theirVersion), 404, 'VERSION_NOT_FOUND'],
      ['this program\'s version, through another program', await restore(otherProgram, v3, v2), 404, ''],
    ];
    for (const [what, res, status, error] of cases) {
      expect(res.status, `${what}: ${JSON.stringify(res.body)}`).toBe(status);
      if (error) expect(res.body.error, what).toBe(error);
    }
    expect(await family(code)).toEqual(before);
  });

  it('refuses to restore a version whose stored file no longer matches its hash', async () => {
    const tamperCode = `${CODE}-TAMPER`;
    const a = (await ingest(mine, pdf('tamper v1'), { documentCode: tamperCode })).body.document.id as string;
    const b = (await ingest(mine, pdf('tamper v2'), { documentCode: tamperCode, supersedesDocumentId: a })).body.document.id as string;
    await fs.writeFile(await storedFile(mine, a), pdf('tamper v1, quietly changed'));
    const before = await family(tamperCode);
    const res = await restore(mine, b, a);
    expect(res.status, JSON.stringify(res.body)).toBe(409);
    expect(res.body.error).toBe('SOURCE_BYTES_UNVERIFIED');
    expect(await family(tamperCode)).toEqual(before);
  });

  it('refuses a stored file rewritten together with its storage record: only the recorded hash can tell', async () => {
    const forgedCode = `${CODE}-FORGED`;
    const a = (await ingest(mine, pdf('forged v1'), { documentCode: forgedCode })).body.document.id as string;
    const b = (await ingest(mine, pdf('forged v2'), { documentCode: forgedCode, supersedesDocumentId: a })).body.document.id as string;
    // The provider checks a file against its own record (_meta.json), so both are rewritten.
    const file = await storedFile(mine, a);
    const forged = pdf('forged v1, rewritten with its record');
    await fs.writeFile(file, forged);
    const metaPath = path.join(path.dirname(file), '_meta.json');
    const meta = JSON.parse(await fs.readFile(metaPath, 'utf8'));
    await fs.writeFile(metaPath, JSON.stringify({ ...meta, sha256: sha(forged), sizeBytes: forged.length }));
    const before = await family(forgedCode);
    const res = await restore(mine, b, a);
    expect(res.status, JSON.stringify(res.body)).toBe(409);
    expect(res.body.error).toBe('SOURCE_BYTES_UNVERIFIED');
    expect(await family(forgedCode)).toEqual(before);
  });

  it('refuses a version whose original file a data disposition withdrew', async () => {
    const withdrawnCode = `${CODE}-WITHDRAWN`;
    const a = (await ingest(mine, pdf('withdrawn v1'), { documentCode: withdrawnCode })).body.document.id as string;
    const b = (await ingest(mine, pdf('withdrawn v2'), { documentCode: withdrawnCode, supersedesDocumentId: a })).body.document.id as string;
    // A recorded withdrawal of v1's original file (document-data-disposition).
    await owner.query(
      `INSERT INTO document_data_dispositions (organization_id, program_id, vault_document_id, choice, reason, actor_id,
         source_sha256, preview_hash, linked_ids, impact_snapshot, audit_receipt)
       VALUES ($1, $2, $3, 'remove_data', 'Withdrawn: it carries personal data.', $4, $5, $6, $7, '{}', $8)`,
      [mine.orgId, mine.programId, a, userId, sha(pdf('withdrawn v1')), 'b'.repeat(64),
        JSON.stringify({ capturedSourceIds: [], vaultDocumentIds: [a], artifactIds: [], uploadIds: [] }),
        JSON.stringify({ id: randomUUID(), sha256Chain: 'c'.repeat(64) })]);
    const before = await family(withdrawnCode);
    const res = await restore(mine, b, a);
    expect(res.status, JSON.stringify(res.body)).toBe(409);
    expect(res.body.error).toBe('SOURCE_WITHDRAWN');
    expect(await family(withdrawnCode)).toEqual(before);
  });

});

describe('what the database refuses', () => {
  it('the database admits a restore only of a version of the same document holding the same bytes', async () => {
    const rawRow = (restoredFrom: string | null, hash: string, documentCode: string) => owner.query(
      `INSERT INTO vault.documents (program_id, organization_id, document_code, document_title, version, content_hash, restored_from_id)
       VALUES ($1, $2, $3, 'Forged', '9.0', $4, $5)`,
      [mine.programId, mine.orgId, documentCode, hash, restoredFrom]);
    const v1Hash = (await row(v1)).content_hash as string;
    // Marked a restore of v1, but holding other bytes, or filed under another code.
    await expect(rawRow(v1, sha(pdf('other bytes')), code)).rejects.toThrow(/VAULT_RESTORE_INVALID/);
    await expect(rawRow(v1, v1Hash, `${CODE}-OTHER`)).rejects.toThrow(/VAULT_RESTORE_INVALID/);
    // Not a restore: v1's bytes a second time are still one copy too many.
    await expect(rawRow(null, v1Hash, `${CODE}-OTHER`)).rejects.toMatchObject({ code: '23505' });
    // Which version a row restores is recorded once.
    await expect(owner.query(`UPDATE vault.documents SET restored_from_id = NULL WHERE id = $1`, [v3]))
      .rejects.toThrow(/VAULT_RESTORE_INVALID|immutable|write-once/i);
  });

  it('the database refuses a restore between two rows with no document code', async () => {
    const hash = sha(pdf(`uncoded ${RUN}`));
    const uncoded = randomUUID();
    await owner.query(`INSERT INTO vault.documents (id, program_id, organization_id, document_title, version, content_hash)
      VALUES ($1, $2, $3, 'Uncoded', '1.0', $4)`, [uncoded, mine.programId, mine.orgId, hash]);
    await owner.query(`UPDATE vault.documents SET document_code = NULL WHERE id = $1`, [uncoded]).catch(() => undefined);
    const code = (await owner.query(`SELECT document_code FROM vault.documents WHERE id = $1`, [uncoded])).rows[0].document_code;
    await expect(owner.query(`INSERT INTO vault.documents (program_id, organization_id, document_title, version, content_hash, restored_from_id)
      VALUES ($1, $2, 'Uncoded copy', '2.0', $3, $4)`, [mine.programId, mine.orgId, hash, uncoded])).rejects.toThrow(/VAULT_RESTORE_INVALID/);
    expect(code ?? null).toBeNull();
  });

});

describe('restoring again', () => {
  it('restores an earlier version that is not the oldest', async () => {
    const res = await restore(mine, v1, v2);
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const v4 = await row(String(res.body.data.document.id));
    expect(v4).toMatchObject({ version: '4.0', supersedes_id: v3, content_hash: (await row(v2)).content_hash });
  });
});
