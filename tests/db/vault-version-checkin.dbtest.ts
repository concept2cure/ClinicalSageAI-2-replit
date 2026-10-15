/**
 * Check in a new version of a Vault document, with lineage the database
 * validates (VR-08, row D2).
 *
 * The Vault's own 409 said "Upload it under a new version", and nothing could:
 * the version was free text from the client, and the lineage fields were
 * refused at the route because they were written unchecked. A check-in names
 * the document (`supersedesDocumentId`). The server assigns the next major
 * version (FD1: 1.0 → 2.0), keeps the document code and filing, and links the
 * predecessor. The database refuses a pointer to another program, code or
 * tenant, and a second successor.
 *
 * Drives the real route and service on PostgreSQL as the runtime role, RLS on,
 * through the storage provider. The harness mirrors vault-reupload.dbtest.ts,
 * with its own tenants, programs and codes.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import request from 'supertest';
import fs from 'node:fs';
import path from 'node:path';
import { Pool } from 'pg';
import { createHash, randomUUID } from 'node:crypto';
import { databaseUrl } from '../setup.db';
import { assertVaultFixtureDatabase, assertVaultFixtureRuntime, closeVaultFixtureRuntime, seedVaultFixtureParent, seedVaultFixtureViewer, withVaultLegacyLineageWrite, assertVaultLineageGuard } from './vault-current-access-fixture';

const RUN = randomUUID().slice(0, 12);
const PROBE = `dbtest-vr08-${RUN} `;
const CODE = `DBTEST-VR08-${RUN}`;
const MIGRATION = path.resolve(__dirname, '../../migrations/20260930_vault_documents_version_lineage.sql');

type Tenant = { orgId: number; orgUuid: string; programId: string };
let owner: Pool;
let userId: number;
let viewerId: number;
const organizations = new Map<string, { id: number; uuid: string }>();
let mine: Tenant;
let theirs: Tenant;
let otherProgramId: string;

const pdf = (tag: string) =>
  Buffer.from(`%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n% ${tag}\ntrailer<</Root 1 0 R>>\n%%EOF\n`, 'utf8');
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');

async function appFor(t: Tenant, role = 'admin'): Promise<express.Express> {
  const createVaultIngestRoutes = (await import('../../server/routes/vault-ingest')).default;
  const { establishRequestTenantScope } = await import('../../server/middleware/establishRequestTenantScope');
  const a = express();
  const actorId = role === 'viewer' ? viewerId : userId;
  a.use((req, _res, next) => {
    const r = req as unknown as Record<string, unknown>;
    r.userId = actorId;
    r.tenantId = t.orgId;
    r.userRole = role;
    r.user = { id: actorId, organizationId: t.orgId, organizationUuid: t.orgUuid, role };
    next();
  });
  a.use(establishRequestTenantScope);
  a.use('/api/vault/ingest', createVaultIngestRoutes());
  return a;
}

async function ingest(t: Tenant, code: string, bytes: Buffer, fields: Record<string, string> = {}, role = 'admin') {
  let r = request(await appFor(t, role))
    .post('/api/vault/ingest')
    .field('programId', t.programId)
    .field('documentCode', code)
    .field('documentTitle', 'Clinical overview')
    .field('documentType', 'OTHER');
  for (const [k, v] of Object.entries(fields)) r = r.field(k, v);
  return r.attach('file', bytes, 'overview.pdf');
}

const row = async (id: string) =>
  (await owner.query(
    `SELECT id, document_code, version, supersedes_id, content_hash, storage_version_id, folder_id,
            placement_status, retention_policy, classification, program_id, organization_id
       FROM vault.documents WHERE id = $1`,
    [id],
  )).rows[0];
const familyOf = async (code: string) =>
  (await owner.query(
    'SELECT id, version, supersedes_id FROM vault.documents WHERE document_code = $1 ORDER BY created_at, version',
    [code],
  )).rows;

async function stored(t: Tenant): Promise<Set<string>> {
  const { getStorageProvider } = await import('../../server/services/storage/index');
  return new Set((await getStorageProvider().list(t.orgId, t.programId)).map((o) => o.vaultVersionId));
}

async function tenant(slug: string, programCode: string): Promise<Tenant> {
  let organization = organizations.get(slug);
  if (!organization) {
    const org = await owner.query(
      `INSERT INTO organizations (name, slug, status) VALUES ($1, $2, 'active') RETURNING id, uuid`,
      [`${PROBE}${slug}`, `dbtest-vr08-${RUN}-${slug}`]);
    organization = { id: Number(org.rows[0].id), uuid: String(org.rows[0].uuid) };
    organizations.set(slug, organization);
  }
  const prog = await owner.query(
    `INSERT INTO regulatory_programs (name, code, organization_id, program_type, product_type, primary_agency, product_name)
     VALUES ($1, $2, $3, 'ind', 'drug', 'FDA', 'Versin 5mg') RETURNING id`,
    [`${PROBE}${slug} program ${programCode}`, `${programCode}-${RUN}`, organization.id],
  );
  const current = { orgId: organization.id, orgUuid: organization.uuid, programId: String(prog.rows[0].id) };
  await seedVaultFixtureParent(owner, current, { userId, namespace: `${PROBE}${slug}-${programCode}` });
  return current;
}


beforeAll(async () => {
  owner = new Pool({ connectionString: databaseUrl, max: 4 });
  await assertVaultFixtureDatabase(owner);
  const user = await owner.query(
    `INSERT INTO users (email, name, password_hash) VALUES ($1, $2, $3) RETURNING id`,
    [`dbtest-vr08-${RUN}@example.test`, `${PROBE}actor`, 'not-a-real-hash'],
  );
  userId = Number(user.rows[0].id);
  mine = await tenant('mine', 'DBTEST-VR08-A');
  theirs = await tenant('theirs', 'DBTEST-VR08-B');
  otherProgramId = (await tenant('mine', 'DBTEST-VR08-C')).programId;
  const viewer = await owner.query(`INSERT INTO users(email,name,password_hash,status)
    VALUES($1,'Vault checkin viewer','not-a-real-hash','active') RETURNING id`, [`dbtest-vr08-${RUN}-viewer@example.test`]);
  viewerId = Number(viewer.rows[0].id);
  await seedVaultFixtureViewer(owner, mine, { userId: viewerId, invitedBy: userId });
  await assertVaultFixtureRuntime(mine);
}, 60_000);

afterAll(async () => {
  // Retain new namespaces, source bytes and append-only history, including failures.
  try { await closeVaultFixtureRuntime(); }
  finally { await owner?.end(); }
});

describe('checking in the next version of a Vault document (VR-08)', () => {
  let v1: string;

  it('records v2 with v1\'s code and filing, version 2.0 and the link to v1, and leaves v1 as it was', async () => {
    const first = await ingest(mine, `${CODE}-DOC`, pdf('v1'), { retentionPolicy: 'DBTEST-VR08-POLICY' });
    expect(first.status, JSON.stringify(first.body)).toBe(201);
    v1 = first.body.document.id;
    const before = await row(v1);

    const res = await ingest(mine, 'ignored-for-a-check-in', pdf('v2'), { supersedesDocumentId: v1 });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const v2 = await row(res.body.document.id);
    expect(v2).toMatchObject({
      document_code: `${CODE}-DOC`,
      version: '2.0',
      supersedes_id: v1,
      content_hash: sha(pdf('v2')),
      folder_id: before.folder_id,
      placement_status: before.placement_status,
      retention_policy: 'DBTEST-VR08-POLICY',
      organization_id: mine.orgId,
    });
    expect(await row(v1)).toEqual(before);
    expect(res.body.document).toMatchObject({ version: '2.0', documentCode: `${CODE}-DOC` });

    const audit = await owner.query(
      `SELECT new_values FROM audit_logs WHERE action = 'vault.document.ingest' AND record_id = $1`,
      [v2.id],
    );
    expect(audit.rows[0].new_values).toMatchObject({ version: '2.0', lineage: { supersedes: v1, predecessorVersion: '1.0' } });
  });

  it('refuses a check-in against a version that already has a successor, naming the current one', async () => {
    const res = await ingest(mine, 'x', pdf('v2-again'), { supersedesDocumentId: v1 });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('VERSION_NOT_CURRENT');
    expect(res.body.error.message).toMatch(/2\.0/);
  });

  it('refuses bytes that are already a version of the document, naming it', async () => {
    const head = (await familyOf(`${CODE}-DOC`)).find((r) => r.version === '2.0');
    const res = await ingest(mine, 'x', pdf('v1'), { supersedesDocumentId: head.id });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONTENT_ALREADY_A_VERSION');
    expect(res.body.error.message).toMatch(/1\.0/);
  });

  it('assigns the version: a client-sent version with a check-in is a 400', async () => {
    const head = (await familyOf(`${CODE}-DOC`)).find((r) => r.version === '2.0');
    const res = await ingest(mine, 'x', pdf('v3'), { supersedesDocumentId: head.id, version: '7.0' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VERSION_IS_ASSIGNED');
  });

  it('invents no version for a head whose version is not a number', async () => {
    const draft = await owner.query(
      `INSERT INTO vault.documents (program_id, organization_id, document_code, document_title, document_type, version,
         content_hash, s3_bucket, s3_key, file_name)
       VALUES ($1, $2, $3, 'Authoring export', 'OTHER', 'draft-1a2b3c4d', $4, 'local', 'k', 'export.pdf') RETURNING id`,
      [mine.programId, mine.orgId, `${CODE}-DRAFT`, sha(pdf('draft'))],
    );
    const res = await ingest(mine, 'x', pdf('draft-next'), { supersedesDocumentId: draft.rows[0].id });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('VERSION_SCHEME_UNKNOWN');
  });

  it("404s another tenant's document, and neither records nor stores anything", async () => {
    const their = await ingest(theirs, `${CODE}-THEIRS`, pdf('theirs'));
    expect(their.status).toBe(201);
    const objects = await stored(mine);
    const res = await ingest(mine, 'x', pdf('stolen-next'), { supersedesDocumentId: their.body.document.id });
    expect(res.status).toBe(404);
    expect(await familyOf(`${CODE}-THEIRS`)).toHaveLength(1);
    expect([...(await stored(mine))].filter((v) => !objects.has(v))).toEqual([]);
  });

  it('a viewer is refused before any byte is stored', async () => {
    const head = (await familyOf(`${CODE}-DOC`)).find((r) => r.version === '2.0');
    const objects = await stored(mine);
    const res = await ingest(mine, 'x', pdf('viewer'), { supersedesDocumentId: head.id }, 'viewer');
    expect(res.status).toBe(403);
    expect([...(await stored(mine))].filter((v) => !objects.has(v))).toEqual([]);
  });

  it('two concurrent check-ins against one version: exactly one succeeds, the other names the new head', async () => {
    const base = await ingest(mine, `${CODE}-RACE`, pdf('race-v1'));
    expect(base.status).toBe(201);
    const [a, b] = await Promise.all([
      ingest(mine, 'x', pdf('race-a'), { supersedesDocumentId: base.body.document.id }),
      ingest(mine, 'x', pdf('race-b'), { supersedesDocumentId: base.body.document.id }),
    ]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    const lost = a.status === 409 ? a : b;
    expect(lost.body.error.code).toBe('VERSION_NOT_CURRENT');
    expect((await familyOf(`${CODE}-RACE`)).map((r) => r.version)).toEqual(['1.0', '2.0']);
  });
});

describe('the database refuses lineage outside the family (VR-08)', () => {
  it("refuses a raw INSERT that names another program's document as its predecessor", async () => {
    const pred = (await familyOf(`${CODE}-DOC`))[0];
    await expect(
      owner.query(
        `INSERT INTO vault.documents (program_id, organization_id, document_code, document_title, document_type, version,
           content_hash, s3_bucket, s3_key, file_name, supersedes_id)
         VALUES ($1, $2, $3, 'Forged', 'OTHER', '9.0', $4, 'local', 'k', 'f.pdf', $5)`,
        [otherProgramId, mine.orgId, `${CODE}-DOC`, sha(pdf('forged')), pred.id],
      ),
    ).rejects.toThrow(/VAULT_LINEAGE_INVALID/);
  });

  it('refuses a second live successor', async () => {
    const [v1row] = await familyOf(`${CODE}-DOC`);
    await expect(
      owner.query(
        `INSERT INTO vault.documents (program_id, organization_id, document_code, document_title, document_type, version,
           content_hash, s3_bucket, s3_key, file_name, supersedes_id)
         VALUES ($1, $2, $3, 'Fork', 'OTHER', '2.1', $4, 'local', 'k', 'f.pdf', $5)`,
        [mine.programId, mine.orgId, `${CODE}-DOC`, sha(pdf('fork')), v1row.id],
      ),
    ).rejects.toThrow(/VAULT_LINEAGE_INVALID/);
  });

  it('replays over legacy duplicate pointers: a notice, no failure, and the trigger still refuses a third', async () => {
    const base = await owner.query(
      `INSERT INTO vault.documents (program_id, organization_id, document_code, document_title, document_type, version,
         content_hash, s3_bucket, s3_key, file_name)
       VALUES ($1, $2, $3, 'Legacy', 'OTHER', '1.0', $4, 'local', 'k', 'l.pdf') RETURNING id`,
      [mine.programId, mine.orgId, `${CODE}-LEGACY`, sha(pdf('legacy-1'))],
    );
    const legacyId = base.rows[0].id;
    // Retain duplicate legacy witnesses on the dedicated QA database. Their
    // eventual soft retirement restores the live-only index without erasing them.
    const successors: string[] = [];
    const sql = fs.readFileSync(MIGRATION, 'utf8');
    const failures: unknown[] = [];
    try {
      await withVaultLegacyLineageWrite(owner, true, async client => {
        for (const v of ['2.0', '2.1']) {
          const inserted = await client.query(
            `INSERT INTO vault.documents (program_id, organization_id, document_code, document_title, document_type, version,
               content_hash, s3_bucket, s3_key, file_name, supersedes_id)
             VALUES ($1, $2, $3, 'Legacy', 'OTHER', $4, $5, 'local', 'k', 'l.pdf', $6) RETURNING id`,
            [mine.programId, mine.orgId, `${CODE}-LEGACY`, v, sha(pdf(`legacy-${v}`)), legacyId],
          );
          successors.push(String(inserted.rows[0].id));
        }
      });
      const witnesses = (await owner.query(`SELECT id, content_hash, supersedes_id FROM vault.documents
        WHERE id=ANY($1::uuid[]) ORDER BY id`, [successors])).rows;
      const notices: string[] = [];
      const replay = await owner.connect();
      replay.on('notice', n => notices.push(String(n.message)));
      try {
        await replay.query(sql);
        await replay.query(sql);
      } finally { replay.release(); }
      expect(notices.some(n => /vault_documents_one_successor/.test(n))).toBe(true);
      const idx = await owner.query(`SELECT to_regclass('vault.vault_documents_one_successor') AS i`);
      expect(idx.rows[0].i).toBeNull();
      await expect(
        owner.query(
          `INSERT INTO vault.documents (program_id, organization_id, document_code, document_title, document_type, version,
             content_hash, s3_bucket, s3_key, file_name, supersedes_id)
           VALUES ($1, $2, $3, 'Legacy', 'OTHER', '2.2', $4, 'local', 'k', 'l.pdf', $5)`,
          [mine.programId, mine.orgId, `${CODE}-LEGACY`, sha(pdf('legacy-2.2')), legacyId],
        ),
      ).rejects.toThrow(/VAULT_LINEAGE_INVALID/);

      // Once these two duplicate pointers leave the live set, replay creates
      // the index. Exact hash and pointer witnesses remain in the QA database.
      await owner.query(`UPDATE vault.documents SET deleted_at=COALESCE(deleted_at,now())
        WHERE organization_id=$1 AND program_id=$2 AND id=ANY($3::uuid[])`, [mine.orgId, mine.programId, successors]);
      await owner.query(sql);
      expect((await owner.query(`SELECT to_regclass('vault.vault_documents_one_successor') AS i`)).rows[0].i).not.toBeNull();
      expect((await owner.query(`SELECT id, content_hash, supersedes_id FROM vault.documents
        WHERE id=ANY($1::uuid[]) ORDER BY id`, [successors])).rows).toEqual(witnesses);
    } catch (error) {
      failures.push(error);
    } finally {
      try {
        await owner.query('ALTER TABLE vault.documents ENABLE TRIGGER vault_documents_lineage_guard');
        await owner.query(`UPDATE vault.documents SET deleted_at=COALESCE(deleted_at,now())
          WHERE organization_id=$1 AND program_id=$2 AND id=ANY($3::uuid[])`, [mine.orgId, mine.programId, successors]);
        await owner.query(sql);
        await assertVaultLineageGuard(owner);
        expect((await owner.query(`SELECT to_regclass('vault.vault_documents_one_successor') AS i`)).rows[0].i).not.toBeNull();
      } catch (restoreError) {
        failures.push(restoreError);
      }
    }
    if (failures.length > 1) throw new AggregateError(failures, 'Legacy assertion or index/guard restoration failed.', { cause: failures[0] });
    if (failures.length) throw failures[0];
  });
});
