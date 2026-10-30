/**
 * Export a Vault folder: the current version of every document the folder
 * shows, each verified against its recorded SHA-256, with an index,
 * SHA256SUMS and the documents' audit trail (MR-08 Stage 6 step 3, CAT1-14,
 * docs/work-orders/MR-08-vault-upload-safety-and-document-control.md).
 *
 * A regulatory team hands a folder over: Module 3 to a CMC consultant, the
 * clinical folder to a partner's diligence team, a module to an inspector.
 * The Vault downloaded one file at a time, unverified as a set and with no
 * index, so a hand-over was assembled outside the record. On real PostgreSQL
 * as app_service under RLS, through the real routes and storage provider:
 *   - the archive holds exactly the folder's current versions (an earlier
 *     version is not exported; another folder's documents are not), each the
 *     recorded bytes, with manifest.json, INDEX.txt, SHA256SUMS and the
 *     audit trail of each exported version, and a chained audit row carrying
 *     the archive's own SHA-256 written before a byte is sent;
 *   - a viewer the project admits may export, as they may download;
 *   - a file that no longer matches its hash refuses the whole export, and
 *     nothing is recorded or sent;
 *   - a document whose original file a data disposition withdrew is listed
 *     as withheld, not read;
 *   - another organisation's project, an unknown folder and an empty folder
 *     are refused; an export that cannot be recorded is not sent.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Pool } from 'pg';
import { createHash, randomUUID } from 'node:crypto';
import AdmZip from 'adm-zip';
import { readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { databaseUrl } from '../setup.db';
import { assertVaultFixtureDatabase, assertVaultFixtureRuntime, closeVaultFixtureRuntime, seedVaultFixtureParent, seedVaultFixtureViewer } from './vault-current-access-fixture';

/* The chained writer, real unless a case asks the next export row to fail. */
const failExportAudit = vi.hoisted(() => ({ on: false }));
vi.mock('../../server/services/auditService', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../server/services/auditService')>();
  return {
    ...real,
    writeChainedAuditRow: async (...args: Parameters<typeof real.writeChainedAuditRow>) => {
      if (failExportAudit.on && args[1]?.action === 'vault.folder.export') {
        failExportAudit.on = false;
        throw new Error('injected audit write failure');
      }
      return real.writeChainedAuditRow(...args);
    },
  };
});

const RUN = randomUUID().slice(0, 12);
const PROBE = `dbtest-vexport-${RUN} `;
const CODE = `DBTEST-VEXPORT-${RUN}`;

type Tenant = { orgId: number; orgUuid: string; programId: string };
type Actor = { userId: number; role: string };
let owner: Pool;
let editor: Actor;
let viewer: Actor;
let mine: Tenant;
let theirs: Tenant;
const ids: Record<string, string> = {};

async function appFor(t: Tenant, actor: Actor): Promise<express.Express> {
  const createVaultIngestRoutes = (await import('../../server/routes/vault-ingest')).default;
  const createProjectVaultRoutes = (await import('../../server/routes/c2c/project-vault')).default;
  const { establishRequestTenantScope } = await import('../../server/middleware/establishRequestTenantScope');
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => {
    Object.assign(req, {
      userId: actor.userId, tenantId: t.orgId, userRole: actor.role,
      user: { id: actor.userId, organizationId: t.orgId, organizationUuid: t.orgUuid, role: actor.role },
    });
    next();
  });
  a.use(establishRequestTenantScope);
  a.use('/api/vault/ingest', createVaultIngestRoutes());
  a.use('/api/c2c/project-vault', createProjectVaultRoutes());
  return a;
}

async function ingest(t: Tenant, text: string, fields: Record<string, string>): Promise<string> {
  let r = request(await appFor(t, editor)).post('/api/vault/ingest').field('programId', t.programId).field('documentType', 'OTHER');
  for (const [k, v] of Object.entries(fields)) r = r.field(k, v);
  const res = await r.attach('file', Buffer.from(text, 'utf8'), { filename: 'record.txt', contentType: 'text/plain' });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return String(res.body.document.id);
}

const exportFolder = async (t: Tenant, folderId: string, actor: Actor = editor) =>
  request(await appFor(t, actor)).get(`/api/c2c/project-vault/${t.programId}/folders/${folderId}/export`)
    .buffer(true).parse((res, done) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => done(null, Buffer.concat(chunks)));
    });
const json = (b: unknown) => JSON.parse(Buffer.isBuffer(b) ? b.toString('utf8') : JSON.stringify(b));
const sha256 = (b: Buffer | string) => createHash('sha256').update(b).digest('hex');
const stagedBefore = new Set(readdirSync(tmpdir()).filter((n) => n.startsWith('vault-archive-')));
const leftovers = () => readdirSync(tmpdir()).filter((n) => n.startsWith('vault-archive-') && !stagedBefore.has(n));
const exportRows = async (t: Tenant) => (await owner.query(
  `SELECT new_values FROM audit_logs WHERE action = 'vault.folder.export' AND tenant_id = $1 ORDER BY created_at`, [t.orgId])).rows;

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

async function tenant(slug: string, userId: number): Promise<Tenant> {
  const org = await owner.query(`INSERT INTO organizations (name, slug, status) VALUES ($1, $2, 'active') RETURNING id, uuid`,
    [`${PROBE}${slug}`, `dbtest-vexport-${RUN}-${slug}`]);
  const prog = await owner.query(
    `INSERT INTO regulatory_programs (name, code, organization_id, program_type, product_type, primary_agency, product_name)
     VALUES ($1, $2, $3, 'ind', 'drug', 'FDA', 'Exportia 5mg') RETURNING id`,
    [`${PROBE}${slug} program`, `${CODE}-${slug.toUpperCase()}`, org.rows[0].id]);
  const t = { orgId: Number(org.rows[0].id), orgUuid: String(org.rows[0].uuid), programId: String(prog.rows[0].id) };
  await seedVaultFixtureParent(owner, t, { userId, namespace: `${PROBE}${slug}-parent` });
  return t;
}

beforeAll(async () => {
  owner = new Pool({ connectionString: databaseUrl, max: 4 });
  await assertVaultFixtureDatabase(owner);
  const u = await owner.query(`INSERT INTO users (email, name, password_hash, status) VALUES ($1, 'Ezra Exporter', 'x', 'active') RETURNING id`,
    [`dbtest-vexport-${RUN}@example.test`]);
  editor = { userId: Number(u.rows[0].id), role: 'admin' };
  const v = await owner.query(`INSERT INTO users (email, name, password_hash, status) VALUES ($1, 'Vic Viewer', 'x', 'active') RETURNING id`,
    [`dbtest-vexport-${RUN}-viewer@example.test`]);
  viewer = { userId: Number(v.rows[0].id), role: 'viewer' };
  mine = await tenant('mine', editor.userId);
  theirs = await tenant('theirs', editor.userId);
  await seedVaultFixtureViewer(owner, mine, { userId: viewer.userId, invitedBy: editor.userId });
  await assertVaultFixtureRuntime(mine);
  ids.specV1 = await ingest(mine, 'Drug product specification, version 1.', { documentCode: `${CODE}-SPEC`, documentTitle: 'Drug product specification', folderId: 'module-3' });
  ids.specV2 = await ingest(mine, 'Drug product specification, version 2.', { supersedesDocumentId: ids.specV1, documentTitle: 'Drug product specification' });
  ids.stability = await ingest(mine, 'Stability protocol, 25 C / 60 percent RH.', { documentCode: `${CODE}-STAB`, documentTitle: 'Stability protocol', folderId: 'module-3' });
  ids.csr = await ingest(mine, 'Clinical study report of the pivotal study.', { documentCode: `${CODE}-CSR`, documentTitle: 'Clinical study report', folderId: 'module-5' });
  // Module 2 as the tree shows it: one filing confirmed, one the Vault suggested
  // and nobody has confirmed, and one row that carries the folder but is Unfiled.
  ids.overview = await ingest(mine, 'Quality overall summary.', { documentCode: `${CODE}-QOS`, documentTitle: 'Quality overall summary', folderId: 'module-2' });
  ids.suggested = await ingest(mine, 'Nonclinical overview.', { documentCode: `${CODE}-NCO`, documentTitle: 'Nonclinical overview', folderId: 'module-2' });
  ids.stray = await ingest(mine, 'Clinical overview, draft.', { documentCode: `${CODE}-CO`, documentTitle: 'Clinical overview draft', folderId: 'module-2' });
  await owner.query(`UPDATE vault.documents SET placement_status = 'suggested', placed_by = NULL WHERE id = $1`, [ids.suggested]);
  await owner.query(`UPDATE vault.documents SET placement_status = 'unfiled' WHERE id = $1`, [ids.stray]);
}, 90_000);

afterAll(async () => {
  try { await closeVaultFixtureRuntime(); }
  finally { await owner?.end(); }
});

describe("a Vault folder's export", () => {
  it("holds the folder's current versions, their manifest, an index, SHA256SUMS and audit trail, and records its own hash before sending", async () => {
    const res = await exportFolder(mine, 'module-3');
    expect(res.status, String(res.body).slice(0, 300)).toBe(200);
    const body = res.body as Buffer;
    expect(res.headers['x-content-sha256']).toBe(sha256(body));
    const zip = new AdmZip(body);
    const names = zip.getEntries().map((e) => e.entryName).sort();
    expect(names.filter((n) => n.startsWith('documents/'))).toHaveLength(2);
    expect(names).toEqual(expect.arrayContaining(['manifest.json', 'INDEX.txt', 'SHA256SUMS', 'audit/audit-trail.json']));
    const sums = zip.readAsText('SHA256SUMS').trim().split('\n').map((l) => l.split(/\s+/));
    expect(sums.map(([, name]) => name).sort()).toEqual(names.filter((n) => n !== 'SHA256SUMS').sort());
    for (const [digest, name] of sums) expect(sha256(zip.readFile(name)!), name).toBe(digest);

    const manifest = JSON.parse(zip.readAsText('manifest.json'));
    expect(manifest).toMatchObject({ schema: 'vault-folder-export/1', programId: mine.programId, folder: { id: 'module-3' } });
    const exported = (manifest.files as Array<{ id: string; path: string; sha256: string }>).map((f) => f.id).sort();
    expect(exported).toEqual([ids.specV2, ids.stability].sort());
    for (const f of manifest.files as Array<{ id: string; path: string; sha256: string }>) {
      const recorded = (await owner.query('SELECT content_hash FROM vault.documents WHERE id = $1', [f.id])).rows[0].content_hash;
      expect(sha256(zip.readFile(f.path)!)).toBe(recorded);
    }
    expect(zip.readAsText('INDEX.txt')).toMatch(/Module 3 · Quality[\s\S]*Drug product specification[\s\S]*Stability protocol|Module 3 · Quality[\s\S]*Stability protocol[\s\S]*Drug product specification/);
    const trail = JSON.parse(zip.readAsText('audit/audit-trail.json'));
    const targets = (trail.entries as Array<{ target: string }>).map((e) => e.target);
    for (const id of [ids.specV2, ids.stability]) expect(targets.some((t) => t.endsWith(id)), id).toBe(true);
    expect(targets.some((t) => t.endsWith(ids.csr))).toBe(false);
    expect(trail.chain).toBeTruthy();

    const rows = await exportRows(mine);
    expect(rows).toHaveLength(1);
    expect(rows[0].new_values).toMatchObject({ programId: mine.programId, folderId: 'module-3', archiveSha256: sha256(body), documentCount: 2, withheldCount: 0 });
    await vi.waitFor(() => expect(leftovers()).toEqual([]));
  });

  it('a viewer the project admits may export it, as they may download each file', async () => {
    expect((await exportFolder(mine, 'module-5', viewer)).status).toBe(200);
  });

  it("refuses another organisation's project, an unknown folder and an empty folder, and records nothing", async () => {
    const before = (await exportRows(mine)).length;
    // Another organisation, naming this project.
    const foreign = await request(await appFor(theirs, editor)).get(`/api/c2c/project-vault/${mine.programId}/folders/module-3/export`);
    expect(foreign.status).toBe(404);
    const unknown = await exportFolder(mine, 'no-such-folder');
    expect(unknown.status).toBe(404);
    expect(json(unknown.body).error).toBe('FOLDER_NOT_FOUND');
    const empty = await exportFolder(mine, 'module-4');
    expect(empty.status).toBe(409);
    expect(json(empty.body).error).toBe('FOLDER_EMPTY');
    expect((await exportRows(mine)).length).toBe(before);
  });

  it('sends nothing when the export cannot be recorded in the audit trail', async () => {
    const before = (await exportRows(mine)).length;
    failExportAudit.on = true;
    const res = await exportFolder(mine, 'module-5');
    expect(failExportAudit.on).toBe(false);
    expect(res.status).toBe(500);
    expect(json(res.body).error).toBe('AUDIT_WRITE_FAILED');
    expect((await exportRows(mine)).length).toBe(before);
    await vi.waitFor(() => expect(leftovers()).toEqual([]));
  });

  // keep_data withdraws the original file and keeps the record, which the tree
  // still shows ("Original file unavailable"); remove_data takes it out of the tree.
  it('lists a document whose original file a disposition withdrew as withheld, and does not read it', async () => {
    const withdrawn = await ingest(mine, 'Investigator brochure, edition 3.', { documentCode: `${CODE}-IB`, documentTitle: 'Investigator brochure', folderId: 'module-5' });
    await owner.query(
      `INSERT INTO document_data_dispositions (organization_id, program_id, vault_document_id, choice, reason, actor_id,
         source_sha256, preview_hash, linked_ids, impact_snapshot, audit_receipt)
       SELECT $1, $2, $3, 'keep_data', 'Withdrawn: it carries personal data.', $4, d.content_hash, $5, $6, '{}', $7
         FROM vault.documents d WHERE d.id = $3`,
      [mine.orgId, mine.programId, withdrawn, editor.userId, 'b'.repeat(64),
        JSON.stringify({ capturedSourceIds: [], vaultDocumentIds: [withdrawn], artifactIds: [], uploadIds: [] }),
        JSON.stringify({ id: randomUUID(), sha256Chain: 'c'.repeat(64) })]);
    const res = await exportFolder(mine, 'module-5');
    expect(res.status).toBe(200);
    expect(res.headers['x-archive-withheld']).toBe('1');
    const zip = new AdmZip(res.body as Buffer);
    const manifest = JSON.parse(zip.readAsText('manifest.json'));
    expect((manifest.withheld as Array<{ id: string }>).map((w) => w.id)).toEqual([withdrawn]);
    expect((manifest.files as Array<{ id: string }>).map((f) => f.id)).toEqual([ids.csr]);
    expect(zip.readAsText('INDEX.txt')).toMatch(/Withheld[\s\S]*Investigator brochure/);
  });

  it('refuses the whole export when one file no longer matches its hash, and records and sends nothing', async () => {
    await fs.writeFile(await storedFile(mine, ids.stability), 'Stability protocol, quietly changed.');
    const before = (await exportRows(mine)).length;
    const res = await exportFolder(mine, 'module-3');
    expect(res.status).toBe(409);
    const answer = json(res.body);
    expect(answer.error).toBe('EXPORT_FILE_UNVERIFIED');
    expect(answer.message).toMatch(/Stability protocol/);
    expect((await exportRows(mine)).length).toBe(before);
    await vi.waitFor(() => expect(leftovers()).toEqual([]));
  });
});

describe('what an export holds, says and records (security review, 2026-10-30)', () => {
  it("names people in a viewer's copy only by account reference, with no IP address; an audit reader's copy names them", async () => {
    const asViewer = new AdmZip((await exportFolder(mine, 'module-5', viewer)).body as Buffer);
    const trail = JSON.parse(asViewer.readAsText('audit/audit-trail.json'));
    expect(trail.actors).toBe('by reference');
    expect(trail.entries.length).toBeGreaterThan(0);
    for (const e of trail.entries as Array<{ actor: string; ip: string }>) {
      expect(e.actor).toMatch(/^(user:\d+|System|not named in this copy)$/);
      expect(e.ip).toBe('');
    }
    const text = asViewer.readAsText('audit/audit-trail.json') + asViewer.readAsText('manifest.json') + asViewer.readAsText('INDEX.txt');
    expect(text).not.toContain('@example.test');
    expect(text).not.toContain('Ezra Exporter');
    expect(asViewer.readAsText('INDEX.txt')).toContain('People are named by account reference');
    expect(JSON.parse(asViewer.readAsText('manifest.json')).auditTrail.actors).toBe('by reference');

    const asAdmin = JSON.parse(new AdmZip((await exportFolder(mine, 'module-5')).body as Buffer).readAsText('audit/audit-trail.json'));
    expect(asAdmin.actors).toBe('named');
    expect((asAdmin.entries as Array<{ actor: string }>).some((e) => e.actor === 'Ezra Exporter')).toBe(true);
  });

  // Module 5 here: the case above changed module 3's stability file. Module 5 also holds the withdrawn brochure,
  // which is withheld and so gets no row.
  it("records in each exported document's own history that it left in this export, and nothing for one withheld", async () => {
    const res = await exportFolder(mine, 'module-5');
    expect(res.status).toBe(200);
    const archiveSha256 = sha256(res.body as Buffer);
    const { rows } = await owner.query(
      `SELECT record_id, new_values FROM audit_logs
        WHERE tenant_id = $1 AND action = 'vault.document.exported' AND table_name = 'vault_document' AND new_values->>'archiveSha256' = $2`,
      [mine.orgId, archiveSha256]);
    expect(rows.map((r) => String(r.record_id))).toEqual([ids.csr]);
    expect(rows[0].new_values).toMatchObject({ via: 'vault.folder.export', vault_folder: `${mine.programId}:module-5` });
    expect(String(rows[0].new_values.description)).toMatch(/^Left the Vault in the export of /);
  });

  it('holds what the tree shows in the folder: a suggested filing, named as unconfirmed, and not a row the tree lists as Unfiled', async () => {
    const res = await exportFolder(mine, 'module-2');
    expect(res.status, String(res.body).slice(0, 300)).toBe(200);
    const zip = new AdmZip(res.body as Buffer);
    const exported = (JSON.parse(zip.readAsText('manifest.json')).files as Array<{ id: string }>).map((f) => f.id).sort();
    expect(exported).toEqual([ids.overview, ids.suggested].sort());
    expect(zip.readAsText('INDEX.txt')).toMatch(/not yet confirmed by a person \(1\):\n  Nonclinical overview/);
  });

  it('refuses, rather than leave out, a document the folder showed and the file read no longer finds', async () => {
    const { planFolderExport } = await import('../../server/services/vault/vault-folder-export');
    const losing = {
      query: async (sql: string, params?: unknown[]) => {
        const r = await owner.query(sql, params);
        return sql.includes('binary_available') ? { ...r, rows: r.rows.filter((row) => String(row.id) !== ids.stability) } : r;
      },
    };
    const plan = await planFolderExport(losing, { organizationId: mine.orgId, programId: mine.programId, folderId: 'module-3' });
    expect(plan).toMatchObject({ ok: false, status: 409, code: 'FOLDER_CHANGED' });
  });

  it('builds one archive at a time for each person', async () => {
    const { beginArchiveBuild } = await import('../../server/services/vault/vault-archive-delivery');
    const end = beginArchiveBuild(mine.orgId, editor.userId);
    expect(end).not.toBeNull();
    try {
      const busy = await exportFolder(mine, 'module-5');
      expect(busy.status).toBe(429);
      expect(json(busy.body).error).toBe('ARCHIVE_BUSY');
      expect((await exportFolder(mine, 'module-5', viewer)).status).toBe(200);
    } finally {
      end!();
    }
    expect((await exportFolder(mine, 'module-5')).status).toBe(200);
  });
});

