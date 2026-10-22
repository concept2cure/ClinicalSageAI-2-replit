/**
 * Fixity: every stored version's bytes re-proven against the SHA-256 recorded
 * at ingest, each verdict in the audit chain (plan critique 15, rows D5, D2).
 *
 * Byte loss or alteration was found only when someone downloaded the affected
 * version. Here, on PostgreSQL as the runtime role with RLS on, through the
 * real ingest and the real route, with real files changed on disk:
 *
 *   - POST /:id/fixity checks every stored version of the program: an intact
 *     one is `verified`, one whose stored file was overwritten is `altered`,
 *     and one whose stored file was removed is `missing`;
 *   - each verdict is its own chained vault.document.fixity row, naming the
 *     person who ran the check;
 *   - a viewer is refused, and another organisation's program is not found.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import request from 'supertest';
import { Pool } from 'pg';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { databaseUrl } from '../setup.db';
import { assertVaultFixtureDatabase, assertVaultFixtureRuntime, closeVaultFixtureRuntime, seedVaultFixtureParent, seedVaultFixtureViewer } from './vault-current-access-fixture';
import { nativeCatalogRunId } from './catalog-native-fixture';

const RUN = nativeCatalogRunId();
const PROBE = `dbtest-vfix-${RUN} `;
const CODE = `DBTEST-VFIX-${RUN}`;

type Tenant = { orgId: number; orgUuid: string; programId: string };
let owner: Pool;
let userId: number;
let viewerId: number;
let mine: Tenant;
let theirs: Tenant;
const ids: Record<'intact' | 'intactV2' | 'altered' | 'missing', string> = { intact: '', intactV2: '', altered: '', missing: '' };

async function appFor(t: Tenant, role = 'admin'): Promise<express.Express> {
  const createVaultIngestRoutes = (await import('../../server/routes/vault-ingest')).default;
  const createProjectVaultRoutes = (await import('../../server/routes/c2c/project-vault')).default;
  const { establishRequestTenantScope } = await import('../../server/middleware/establishRequestTenantScope');
  const a = express();
  const actorId = role === 'viewer' ? viewerId : userId;
  a.use(express.json());
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

async function ingest(t: Tenant, text: string, fields: Record<string, string>): Promise<string> {
  let r = request(await appFor(t)).post('/api/vault/ingest').field('programId', t.programId).field('documentType', 'OTHER');
  for (const [k, v] of Object.entries(fields)) r = r.field(k, v);
  const res = await r.attach('file', Buffer.from(text, 'utf8'), { filename: 'record.txt', contentType: 'text/plain' });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return String(res.body.document.id);
}

/** The stored file of a version, as the local provider wrote it. */
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

const fixity = async (t: Tenant, role = 'admin') =>
  request(await appFor(t, role)).post(`/api/c2c/project-vault/${t.programId}/fixity`).send({});

async function tenant(slug: string): Promise<Tenant> {
  const org = await owner.query(
    `INSERT INTO organizations (name, slug, status) VALUES ($1, $2, 'active') RETURNING id, uuid`,
    [`${PROBE}${slug}`, `dbtest-vfix-${RUN}-${slug}`],
  );
  const prog = await owner.query(
    `INSERT INTO regulatory_programs (name, code, organization_id, program_type, product_type, primary_agency, product_name)
     VALUES ($1, $2, $3, 'ind', 'drug', 'FDA', 'Fixa 5mg') RETURNING id`,
    [`${PROBE}${slug} program`, `${CODE}-${slug.toUpperCase()}`, org.rows[0].id],
  );
  const current = { orgId: Number(org.rows[0].id), orgUuid: String(org.rows[0].uuid), programId: String(prog.rows[0].id) };
  await seedVaultFixtureParent(owner, current, { userId, namespace: `${PROBE}${slug}-parent` });
  return current;
}

beforeAll(async () => {
  owner = new Pool({ connectionString: databaseUrl, max: 4 });
  await assertVaultFixtureDatabase(owner);
  const user = await owner.query(
    `INSERT INTO users (email, name, password_hash, status) VALUES ($1, 'Fay Fixity', 'not-a-real-hash', 'active') RETURNING id`,
    [`dbtest-vfix-${RUN}@example.test`],
  );
  userId = Number(user.rows[0].id);
  mine = await tenant('mine');
  theirs = await tenant('theirs');
  viewerId = Number((await owner.query("INSERT INTO users(email,name,password_hash,status) VALUES($1,'QA Viewer','not-a-real-hash','active') RETURNING id",
    [`dbtest-viewer-${RUN}@example.test`])).rows[0].id);
  await seedVaultFixtureViewer(owner, mine, { userId: viewerId, invitedBy: userId });
  await assertVaultFixtureRuntime(mine);
  ids.intact = await ingest(mine, 'The intact record, version 1.', { documentCode: `${CODE}-INTACT`, documentTitle: 'Intact record' });
  ids.intactV2 = await ingest(mine, 'The intact record, version 2.', { supersedesDocumentId: ids.intact, documentTitle: 'Intact record' });
  ids.altered = await ingest(mine, 'The record someone will alter.', { documentCode: `${CODE}-ALTERED`, documentTitle: 'Altered record' });
  ids.missing = await ingest(mine, 'The record whose file will be lost.', { documentCode: `${CODE}-MISSING`, documentTitle: 'Lost record' });
  // What fixity exists to find: a stored file changed in place, and one gone.
  await fs.writeFile(await storedFile(mine, ids.altered), 'The record, quietly changed.');
  await fs.rm(await storedFile(mine, ids.missing));
}, 90_000);

afterAll(async () => {
  // Keep this invocation's source bytes, records and append-only history.
  try { await closeVaultFixtureRuntime(); }
  finally { await owner?.end(); }
});

describe('fixity: every stored version re-proven (critique 15)', () => {
  it('reports each version verified, altered or missing, and lists the failures', async () => {
    const res = await fixity(mine);
    expect(res.status, JSON.stringify(res.body).slice(0, 300)).toBe(200);
    const d = res.body.data;
    expect(d.checked).toBe(4);
    expect(d.counts).toEqual({ verified: 2, altered: 1, missing: 1, unreadable: 0, unverifiable: 0 });
    expect(d.truncated).toBe(false);
    expect(d.findings).toEqual(expect.arrayContaining([
      { documentId: ids.altered, title: 'Altered record', version: '1.0', verdict: 'altered' },
      { documentId: ids.missing, title: 'Lost record', version: '1.0', verdict: 'missing' },
    ]));
    expect(d.findings).toHaveLength(2);
  });

  it('writes one chained verdict per version, naming the person', async () => {
    const { rows } = await owner.query(
      `SELECT record_id, user_id, new_values ->> 'verdict' AS verdict, sha256_chain
         FROM audit_logs WHERE action = 'vault.document.fixity' AND tenant_id = $1 ORDER BY record_id`,
      [mine.orgId],
    );
    const byDoc = new Map(rows.map((r) => [r.record_id, r]));
    expect(byDoc.get(ids.intact)?.verdict).toBe('verified');
    expect(byDoc.get(ids.intactV2)?.verdict).toBe('verified');
    expect(byDoc.get(ids.altered)?.verdict).toBe('altered');
    expect(byDoc.get(ids.missing)?.verdict).toBe('missing');
    expect(rows.every((r) => r.user_id === userId && r.sha256_chain)).toBe(true);
  });

  it("the document's history shows the check", async () => {
    const h = await request(await appFor(mine)).get(`/api/c2c/project-vault/${mine.programId}/documents/${ids.altered}/history`);
    expect(h.status).toBe(200);
    expect(h.body.data.entries.map((e: { event: string }) => e.event)).toContain('Fixity check: altered');
  });

  it("a viewer is refused, and another organisation's program is not found", async () => {
    expect((await fixity(mine, 'viewer')).status).toBe(403);
    const foreign = await request(await appFor(theirs)).post(`/api/c2c/project-vault/${mine.programId}/fixity`).send({});
    expect(foreign.status).toBe(404);
  });
});
