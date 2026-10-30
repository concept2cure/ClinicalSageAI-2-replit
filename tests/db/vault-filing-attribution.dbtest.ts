/**
 * Who filed a Vault document, and when (Part 11 review F4, 2026-10-22).
 *
 * placed_by and placed_at have been recorded since 20260823 on every person's
 * filing decision: a file into a chosen folder at ingest, and a confirm, move
 * or unfile afterwards (vault-placement.service.ts). The Vault read returned
 * neither, so the detail could say where a document is filed but not who
 * decided it. A classifier's or AnA's suggestion names nobody (placed_by
 * NULL): it is a proposal, not a filing, and the read must not invent a filer.
 *
 * Real PostgreSQL, as app_service under RLS: the name is read through
 * public.actor_name, which answers only within the request's organisation.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import request from 'supertest';
import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { databaseUrl } from '../setup.db';
import { assertVaultFixtureDatabase, assertVaultFixtureRuntime, closeVaultFixtureRuntime, seedVaultFixtureParent } from './vault-current-access-fixture';

const RUN = randomUUID().slice(0, 12);
const PROBE = `dbtest-vfiler-${RUN} `;
const CODE = `DBTEST-VFILER-${RUN}`;

type Tenant = { orgId: number; orgUuid: string; programId: string };
type Filing = { placementStatus: string; folderId: string | null; placedBy: string | null; placedAt: string | null };
let owner: Pool;
let userId: number;
let mine: Tenant;

async function appFor(t: Tenant): Promise<express.Express> {
  const createVaultIngestRoutes = (await import('../../server/routes/vault-ingest')).default;
  const createProjectVaultRoutes = (await import('../../server/routes/c2c/project-vault')).default;
  const { establishRequestTenantScope } = await import('../../server/middleware/establishRequestTenantScope');
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => {
    Object.assign(req, {
      userId, tenantId: t.orgId, userRole: 'admin',
      user: { id: userId, organizationId: t.orgId, organizationUuid: t.orgUuid, role: 'admin' },
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

/** The document's filing block, as the Vault tree gives it to the detail. */
async function filingOf(t: Tenant, docId: string): Promise<Filing> {
  const res = await request(await appFor(t)).get(`/api/c2c/project-vault/${t.programId}`);
  expect(res.status, JSON.stringify(res.body).slice(0, 300)).toBe(200);
  const walk = (nodes: unknown[]): Filing | null => {
    for (const n of nodes as Array<{ docId?: string; filing?: Filing; children?: unknown[] }>) {
      if (n.docId === docId && n.filing) return n.filing;
      const inner = n.children ? walk(n.children) : null;
      if (inner) return inner;
    }
    return null;
  };
  const found = walk(res.body.data.tree);
  expect(found, `document ${docId} is in the Vault tree`).not.toBeNull();
  return found!;
}

beforeAll(async () => {
  owner = new Pool({ connectionString: databaseUrl, max: 4 });
  await assertVaultFixtureDatabase(owner);
  const user = await owner.query(
    `INSERT INTO users (email, name, password_hash) VALUES ($1, 'Fern Filer', 'not-a-real-hash') RETURNING id`,
    [`dbtest-vfiler-${RUN}@example.test`],
  );
  userId = Number(user.rows[0].id);
  const org = await owner.query(
    `INSERT INTO organizations (name, slug, status) VALUES ($1, $2, 'active') RETURNING id, uuid`,
    [`${PROBE}mine`, `dbtest-vfiler-${RUN}-mine`],
  );
  const prog = await owner.query(
    `INSERT INTO regulatory_programs (name, code, organization_id, program_type, product_type, primary_agency, product_name)
     VALUES ($1, $2, $3, 'ind', 'drug', 'FDA', 'Filera 5mg') RETURNING id`,
    [`${PROBE}program`, `${CODE}-MINE`, org.rows[0].id],
  );
  mine = { orgId: Number(org.rows[0].id), orgUuid: String(org.rows[0].uuid), programId: String(prog.rows[0].id) };
  await seedVaultFixtureParent(owner, mine, { userId, namespace: `${PROBE}mine-parent` });
  await assertVaultFixtureRuntime(mine);
});

afterAll(async () => {
  // Retain new namespaces, source bytes and append-only history, including failures.
  try { await closeVaultFixtureRuntime(); }
  finally { await owner?.end(); }
});

describe('the Vault read names who filed a document, and when (Part 11 review F4)', () => {
  it('a document its uploader filed into a folder names them and the time', async () => {
    const before = Date.now();
    const id = await ingest(mine, 'Stability protocol for the drug product.', {
      documentCode: `${CODE}-STAB`, documentTitle: 'Stability protocol', folderId: 'module-3',
    });
    const filing = await filingOf(mine, id);
    expect(filing).toMatchObject({ placementStatus: 'confirmed', folderId: 'module-3', placedBy: 'Fern Filer' });
    expect(Date.parse(filing.placedAt ?? '')).toBeGreaterThanOrEqual(before - 60_000);
  });

  it('a suggestion names nobody: no filer is invented for a proposal', async () => {
    const id = await ingest(mine, 'Clinical overview of the program.', {
      documentCode: `${CODE}-CO`, documentTitle: 'Clinical overview',
    });
    const filing = await filingOf(mine, id);
    expect(['suggested', 'unfiled']).toContain(filing.placementStatus);
    expect(filing.placedBy).toBeNull();
    expect(filing.placedAt).toBeNull();
  });

  it('the person who files it afterwards is the one named', async () => {
    const id = await ingest(mine, 'Investigator brochure.', { documentCode: `${CODE}-IB`, documentTitle: 'Investigator brochure' });
    expect((await filingOf(mine, id)).placedBy).toBeNull();
    const before = Date.now();
    const res = await request(await appFor(mine)).post(`/api/c2c/project-vault/${mine.programId}/file`)
      .send({ documentId: id, folderId: 'module-1', note: 'Module 1 administrative record.' });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const filing = await filingOf(mine, id);
    expect(filing).toMatchObject({ placementStatus: 'confirmed', folderId: 'module-1', placedBy: 'Fern Filer' });
    expect(Date.parse(filing.placedAt ?? '')).toBeGreaterThanOrEqual(before - 60_000);
  });
});
