/**
 * File into Vault from the data room, with a result for every source (VR-11, row D2).
 *
 * The capture lane dead-ended: nothing moved a captured source to 'filed'
 * except re-uploading identical bytes on the Vault page. Here, on PostgreSQL as
 * the runtime role with RLS on, through the real routes and the real ingest:
 *
 *   - POST /:id/data-room/file with [new bytes, bytes already in the Vault,
 *     another organization's source] answers [filed, already_filed, refused
 *     NOT_FOUND]. Exactly one Vault row is added, suggested or unfiled, never
 *     confirmed, with its chained ingest row, and the data room then reads it
 *     as filed;
 *   - an antivirus refusal on one source does not undo another's filing, and
 *     the batch says complete:false;
 *   - bytes that no longer hash to the capture's checksum are refused
 *     SOURCE_BYTES_CHANGED and nothing is stored;
 *   - a viewer is refused 403 and nothing is filed;
 *   - a superseded capture, another project's capture and a source with no
 *     stored file are each refused with their own reason.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { Pool } from 'pg';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { createHash } from 'node:crypto';
import { databaseUrl } from '../setup.db';

/* The scanner, for one marked file only: it reports an infection there and
   passes everything else to the real (dev-permissive) scanner. */
vi.mock('../../server/utils/virusScan', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../server/utils/virusScan')>();
  return {
    ...real,
    scanBuffer: async (buf: Buffer) =>
      buf.includes('VR11-INFECTED') ? { scanned: true, clean: false, signature: 'Test.Signature' } : real.scanBuffer(buf),
  };
});

const PROBE = 'dbtest-vr11 ';
const CODE = 'DBTEST-VR11';
const TAG = `vr11-${process.pid}-${Date.now().toString(36)}`;

type Tenant = { orgId: number; orgUuid: string; programId: string };
let owner: Pool;
let userId: number;
let mine: Tenant;
let theirs: Tenant;
const written: string[] = [];

const pdf = (tag: string) =>
  Buffer.from(`%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n% ${tag}\ntrailer<</Root 1 0 R>>\n%%EOF\n`, 'utf8');
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');

async function appFor(t: Tenant, role = 'admin'): Promise<express.Express> {
  const createVaultIngestRoutes = (await import('../../server/routes/vault-ingest')).default;
  const createProjectVaultRoutes = (await import('../../server/routes/c2c/project-vault')).default;
  const { establishRequestTenantScope } = await import('../../server/middleware/establishRequestTenantScope');
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => {
    const r = req as unknown as Record<string, unknown>;
    r.userId = userId;
    r.tenantId = t.orgId;
    r.userRole = role;
    r.user = { id: userId, organizationId: t.orgId, organizationUuid: t.orgUuid, role };
    next();
  });
  a.use(establishRequestTenantScope);
  a.use('/api/vault/ingest', createVaultIngestRoutes());
  a.use('/api/c2c/project-vault', createProjectVaultRoutes());
  return a;
}

const fileFromRoom = async (t: Tenant, sourceIds: number[], role = 'admin') =>
  request(await appFor(t, role)).post(`/api/c2c/project-vault/${t.programId}/data-room/file`).send({ sourceIds });

/** A file upload with real bytes on disk, as the chat upload route writes one. */
async function upload(t: Tenant, name: string, bytes: Buffer, checksum: string | null = sha(bytes)): Promise<string> {
  const id = `file_${Date.now()}_${TAG}-${written.length}`;
  const storagePath = path.join('uploads', `org-${t.orgId}`, id);
  const resolved = path.resolve(process.cwd(), storagePath);
  await fs.mkdir(path.dirname(resolved), { recursive: true });
  await fs.writeFile(resolved, bytes);
  written.push(resolved);
  await owner.query(
    `INSERT INTO file_uploads
       (id, user_id, organization_id, original_name, mime_type, file_size, storage_path, checksum_sha256, status, created_at)
     VALUES ($1, NULL, $2, $3, 'application/pdf', $4, $5, $6, 'uploaded', NOW())`,
    [id, t.orgId, name, bytes.length, storagePath, checksum],
  );
  return id;
}

/** A captured data-room source, as createSource writes one. */
async function capture(t: Tenant, title: string, checksum: string | null, fileUploadId: string | null, extra: Record<string, unknown> = {}): Promise<number> {
  const cols = ['organization_id', 'source_type', 'title', 'checksum', 'client_program_id', 'provenance', ...Object.keys(extra)];
  const vals = [t.orgId, 'client_document', `${PROBE}${title}`, checksum, t.programId,
    JSON.stringify(fileUploadId ? { origin: 'chat_upload', fileUploadId } : { origin: 'projection' }), ...Object.values(extra)];
  const { rows } = await owner.query(
    `INSERT INTO cre_evidence_sources (${cols.join(', ')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING id`,
    vals,
  );
  return Number(rows[0].id);
}

/** A captured file: its upload and its source, bytes and checksum agreeing. */
async function captured(t: Tenant, title: string, bytes: Buffer): Promise<number> {
  return capture(t, title, sha(bytes), await upload(t, `${title}.pdf`, bytes));
}

const vaultRows = async (t: Tenant) =>
  (await owner.query(
    `SELECT id, content_hash, placement_status, version FROM vault.documents WHERE program_id = $1 ORDER BY created_at`,
    [t.programId],
  )).rows as Array<{ id: string; content_hash: string; placement_status: string; version: string }>;

async function tenant(slug: string): Promise<Tenant> {
  const org = await owner.query(
    `INSERT INTO organizations (name, slug) VALUES ($1, $2)
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name RETURNING id, uuid`,
    [`${PROBE}${slug}`, `dbtest-vr11-${slug}`],
  );
  const prog = await owner.query(
    `INSERT INTO regulatory_programs (name, code, organization_id, program_type, product_type, primary_agency, product_name)
     VALUES ($1, $2, $3, 'ind', 'drug', 'FDA', 'Filan 5mg') RETURNING id`,
    [`${PROBE}${slug} program`, `${CODE}-${slug.toUpperCase()}`, org.rows[0].id],
  );
  return { orgId: Number(org.rows[0].id), orgUuid: String(org.rows[0].uuid), programId: String(prog.rows[0].id) };
}

async function cleanup(): Promise<void> {
  const programs = `SELECT id FROM regulatory_programs WHERE name LIKE '${PROBE}%'`;
  const client = await owner.connect();
  try {
    await client.query('BEGIN');
    await client.query('ALTER TABLE audit_logs DISABLE TRIGGER trg_audit_logs_no_delete');
    await client.query(
      `DELETE FROM audit_logs WHERE action LIKE 'vault.document.%'
         AND record_id IN (SELECT id::text FROM vault.documents WHERE program_id IN (${programs}))`,
    );
    await client.query('ALTER TABLE audit_logs ENABLE TRIGGER trg_audit_logs_no_delete');
    await client.query('COMMIT');
  } catch {
    await client.query('ROLLBACK').catch(() => {});
  } finally {
    client.release();
  }
  await owner.query(`DELETE FROM vault.documents WHERE program_id IN (${programs}) AND supersedes_id IS NOT NULL`);
  await owner.query(`DELETE FROM vault.documents WHERE program_id IN (${programs})`);
  await owner.query(`DELETE FROM cre_evidence_sources WHERE title LIKE '${PROBE}%' AND previous_version_id IS NOT NULL`);
  await owner.query(`DELETE FROM cre_evidence_sources WHERE title LIKE '${PROBE}%'`);
  await owner.query(`DELETE FROM file_uploads WHERE id LIKE $1`, [`%${TAG}%`]);
  await owner.query(`DELETE FROM regulatory_programs WHERE name LIKE '${PROBE}%'`);
}

beforeAll(async () => {
  owner = new Pool({ connectionString: databaseUrl, max: 4 });
  const user = await owner.query(
    `INSERT INTO users (email, name, password_hash) VALUES ($1, $2, $3)
       ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
    ['dbtest-vr11@example.test', 'Fiona Filer', 'not-a-real-hash'],
  );
  userId = Number(user.rows[0].id);
  await cleanup();
  mine = await tenant('mine');
  theirs = await tenant('theirs');
}, 60_000);

afterAll(async () => {
  await cleanup().catch(() => {});
  await owner.end().catch(() => {});
  for (const f of written) await fs.rm(f, { force: true }).catch(() => {});
});

describe('File into Vault from the data room (VR-11)', () => {
  it('files new bytes, reports bytes already in the Vault, and refuses another organization’s source', async () => {
    const fresh = await captured(mine, 'protocol synopsis', pdf('fresh'));
    // These bytes are already in the Vault, uploaded on the Vault page.
    const inVault = pdf('already');
    const ingested = await request(await appFor(mine))
      .post('/api/vault/ingest')
      .field('programId', mine.programId).field('documentCode', `${CODE}-ALREADY`)
      .field('documentTitle', 'Already filed').field('documentType', 'OTHER')
      .attach('file', inVault, 'already.pdf');
    expect(ingested.status, JSON.stringify(ingested.body)).toBe(201);
    const already = await captured(mine, 'already', inVault);
    const foreign = await captured(theirs, 'their file', pdf('theirs'));
    const before = await vaultRows(mine);

    const res = await fileFromRoom(mine, [fresh, already, foreign]);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.items.map((i: { sourceId: number; outcome: string }) => [i.sourceId, i.outcome])).toEqual([
      [fresh, 'filed'], [already, 'already_filed'], [foreign, 'refused'],
    ]);
    expect(res.body.items[1]).toMatchObject({ documentId: ingested.body.document.id, version: '1.0' });
    expect(res.body.items[2]).toMatchObject({ code: 'NOT_FOUND' });
    expect(res.body.complete).toBe(false);

    const after = await vaultRows(mine);
    expect(after).toHaveLength(before.length + 1);
    const added = after.find((r) => r.content_hash === sha(pdf('fresh')))!;
    expect(added.id).toBe(res.body.items[0].documentId);
    expect(['suggested', 'unfiled']).toContain(added.placement_status);
    expect((await vaultRows(theirs))).toHaveLength(0);
    const audit = await owner.query(`SELECT action, user_id FROM audit_logs WHERE record_id = $1`, [added.id]);
    expect(audit.rows).toEqual([{ action: 'vault.document.ingest', user_id: userId }]);

    // The data room now reads the source as filed, as v1.0.
    const room = await request(await appFor(mine)).get(`/api/c2c/project-vault/${mine.programId}`);
    const row = room.body.data.dataRoom.sources.find((s: { id: number }) => s.id === fresh);
    expect(row).toMatchObject({ stage: 'filed', filedAs: { version: '1.0', supersededBy: null } });

    // Filing it again changes nothing.
    const again = await fileFromRoom(mine, [fresh]);
    expect(again.body).toMatchObject({ complete: true, items: [{ sourceId: fresh, outcome: 'already_filed', documentId: added.id }] });
    expect(await vaultRows(mine)).toHaveLength(after.length);
  });

  it('an antivirus refusal on one source leaves the other filed, and the batch is not complete', async () => {
    const good = await captured(mine, 'good', pdf('good'));
    const infected = await captured(mine, 'infected', pdf('VR11-INFECTED'));
    const res = await fileFromRoom(mine, [good, infected]);
    expect(res.status).toBe(200);
    expect(res.body.items[0]).toMatchObject({ sourceId: good, outcome: 'filed' });
    expect(res.body.items[1]).toMatchObject({ sourceId: infected, outcome: 'refused', code: 'FILE_SCAN_REJECTED' });
    expect(res.body.complete).toBe(false);
    const hashes = (await vaultRows(mine)).map((r) => r.content_hash);
    expect(hashes).toContain(sha(pdf('good')));
    expect(hashes).not.toContain(sha(pdf('VR11-INFECTED')));
  });

  it('refuses bytes that no longer match the checksum recorded at capture, storing nothing', async () => {
    const stored = pdf('changed after capture');
    // The upload's own digest matches its bytes; the capture recorded different ones.
    const id = await capture(mine, 'changed', sha(pdf('as captured')), await upload(mine, 'changed.pdf', stored));
    const before = await vaultRows(mine);
    const res = await fileFromRoom(mine, [id]);
    expect(res.body.items).toEqual([expect.objectContaining({ sourceId: id, outcome: 'refused', code: 'SOURCE_BYTES_CHANGED' })]);
    expect(res.body.complete).toBe(false);
    expect(await vaultRows(mine)).toHaveLength(before.length);
  });

  it('a viewer is refused before anything is filed', async () => {
    const id = await captured(mine, 'viewer', pdf('viewer'));
    const before = await vaultRows(mine);
    const res = await fileFromRoom(mine, [id], 'viewer');
    expect(res.status).toBe(403);
    expect(await vaultRows(mine)).toHaveLength(before.length);
  });

  it('a superseded capture, another project’s capture and a source with no file are each refused with a reason', async () => {
    const old = await captured(mine, 'old', pdf('old'));
    await owner.query('UPDATE cre_evidence_sources SET is_current = FALSE WHERE id = $1', [old]);
    const other = await owner.query(
      `INSERT INTO regulatory_programs (name, code, organization_id, program_type, product_type, primary_agency, product_name)
       VALUES ($1, $2, $3, 'ind', 'drug', 'FDA', 'Filan 10mg') RETURNING id`,
      [`${PROBE}mine other program`, `${CODE}-OTHER`, mine.orgId],
    );
    const elsewhere = await captured({ ...mine, programId: String(other.rows[0].id) }, 'elsewhere', pdf('elsewhere'));
    const noFile = await capture(mine, 'projection', sha(pdf('projection')), null);
    const before = await vaultRows(mine);
    const res = await fileFromRoom(mine, [old, elsewhere, noFile]);
    expect(res.body.items.map((i: { code: string }) => i.code)).toEqual(['SOURCE_SUPERSEDED', 'NOT_FOUND', 'NO_STORED_FILE']);
    expect(await vaultRows(mine)).toHaveLength(before.length);
  });

  it('refuses an empty or oversized selection', async () => {
    expect((await fileFromRoom(mine, [])).body).toMatchObject({ error: 'INVALID_SOURCES' });
    expect((await fileFromRoom(mine, Array.from({ length: 26 }, (_, i) => i + 1))).body).toMatchObject({ error: 'INVALID_SOURCES' });
  });
});
