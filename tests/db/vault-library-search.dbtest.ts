/**
 * Library search: every project's Vault at once (plan critique 15, row D2).
 *
 * The Vault searched one project, so a reviewer had to know which project held
 * a document before they could find it. Here, on PostgreSQL as the runtime
 * role with RLS on, through the real ingest and the real Vault routes:
 *
 *   - GET /api/c2c/project-vault/search finds matching documents in every
 *     project the organisation holds, each named with its project;
 *   - another organisation's documents are never among them;
 *   - an earlier version is listed only when asked, as in a project search;
 *   - an empty query answers no results and says why;
 *   - the project search (GET /:id/search) still searches its project only:
 *     both read through the one search query.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import request from 'supertest';
import { Pool } from 'pg';
import { databaseUrl } from '../setup.db';
import { assertVaultFixtureDatabase, assertVaultFixtureRuntime, closeVaultFixtureRuntime, seedVaultFixtureParent } from './vault-current-access-fixture';
import { nativeCatalogRunId } from './catalog-native-fixture';

const RUN = nativeCatalogRunId();
const PROBE = `dbtest-vlib-${RUN} `;
const CODE = `DBTEST-VLIB-${RUN}`;
const WORD = 'zirconoxide';

type Tenant = { orgId: number; orgUuid: string };
let owner: Pool;
let userId: number;
let mine: Tenant;
let theirs: Tenant;
let progA: string;
let progB: string;
let progT: string;
let a1: string;
let a2: string;
let b1: string;

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

async function ingest(t: Tenant, programId: string, text: string, fields: Record<string, string>): Promise<string> {
  let r = request(await appFor(t)).post('/api/vault/ingest').field('programId', programId).field('documentType', 'OTHER');
  for (const [k, v] of Object.entries(fields)) r = r.field(k, v);
  const res = await r.attach('file', Buffer.from(text, 'utf8'), { filename: `${fields.documentTitle}.txt`, contentType: 'text/plain' });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return String(res.body.document.id);
}

const library = async (t: Tenant, qs: string) => request(await appFor(t)).get(`/api/c2c/project-vault/search?${qs}`);

async function tenant(slug: string): Promise<Tenant> {
  const org = await owner.query(
    `INSERT INTO organizations (name, slug, status) VALUES ($1, $2, 'active') RETURNING id, uuid`,
    [`${PROBE}${slug}`, `dbtest-vlib-${RUN}-${slug}`],
  );
  return { orgId: Number(org.rows[0].id), orgUuid: String(org.rows[0].uuid) };
}

async function program(t: Tenant, name: string): Promise<string> {
  const prog = await owner.query(
    `INSERT INTO regulatory_programs (name, code, organization_id, program_type, product_type, primary_agency, product_name)
     VALUES ($1, $2, $3, 'ind', 'drug', 'FDA', 'Librium 5mg') RETURNING id`,
    [`${PROBE}${name}`, `${CODE}-${name.toUpperCase().replace(/\W+/g, '-')}`, t.orgId],
  );
  const programId = String(prog.rows[0].id);
  await seedVaultFixtureParent(owner, { ...t, programId }, { userId, namespace: `${PROBE}${name}-parent` });
  return programId;
}

beforeAll(async () => {
  owner = new Pool({ connectionString: databaseUrl, max: 4 });
  await assertVaultFixtureDatabase(owner);
  const user = await owner.query(
    `INSERT INTO users (email, name, password_hash, status) VALUES ($1, 'Lib Rarian', 'not-a-real-hash', 'active') RETURNING id`,
    [`dbtest-vlib-${RUN}@example.test`],
  );
  userId = Number(user.rows[0].id);
  mine = await tenant('mine');
  theirs = await tenant('theirs');
  progA = await program(mine, 'alpha');
  progB = await program(mine, 'beta');
  progT = await program(theirs, 'their program');
  await assertVaultFixtureRuntime({ ...mine, programId: progA });
  a1 = await ingest(mine, progA, `Stability report. The ${WORD} impurity stays under 0.1%.`, { documentCode: `${CODE}-A`, documentTitle: 'Alpha stability report' });
  a2 = await ingest(mine, progA, `Stability report, revised. The ${WORD} impurity stays under 0.05%.`, { supersedesDocumentId: a1, documentTitle: 'Alpha stability report' });
  b1 = await ingest(mine, progB, `Beta method validation for ${WORD}.`, { documentCode: `${CODE}-B`, documentTitle: 'Beta method validation' });
  await ingest(theirs, progT, `Their own ${WORD} study.`, { documentCode: `${CODE}-T`, documentTitle: 'Their study' });
}, 90_000);

afterAll(async () => {
  // Keep this invocation's source bytes, records and append-only history.
  try { await closeVaultFixtureRuntime(); }
  finally { await owner?.end(); }
});

describe('library search across every project (critique 15)', () => {
  it("finds matches in every project the organisation holds, each named with its project, and never another organisation's", async () => {
    const res = await library(mine, `q=${WORD}`);
    expect(res.status, JSON.stringify(res.body).slice(0, 300)).toBe(200);
    const d = res.body.data;
    expect(d.total).toBe(2);
    const hits = d.results.map((h: { id: string; program: { id: string; name: string } }) => [h.id, h.program.id, h.program.name]);
    expect(hits).toEqual(expect.arrayContaining([
      [a2, progA, `${PROBE}alpha`],
      [b1, progB, `${PROBE}beta`],
    ]));
    expect(d.results.every((h: { program: { id: string } }) => h.program.id !== progT)).toBe(true);
    expect(d.results.find((h: { id: string }) => h.id === b1).snippet).toMatch(new RegExp(WORD, 'i'));
  });

  it('lists an earlier version only when asked', async () => {
    const res = await library(mine, `q=${WORD}&includeSuperseded=true`);
    expect(res.body.data.total).toBe(3);
    expect(res.body.data.results.map((h: { id: string }) => h.id)).toEqual(expect.arrayContaining([a1, a2, b1]));
    expect(res.body.data.results.find((h: { id: string }) => h.id === a1).current).toBe(false);
  });

  it('an empty query answers no results and says why', async () => {
    const res = await library(mine, 'q=');
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ total: 0, results: [], reason: 'EMPTY_QUERY' });
  });

  /* F1, S6 V2 (2026-11-05): a CRO works for several sponsors in one organisation, each a client workspace. Asked
     from inside a project, "All my projects" is that project's sponsor's projects, so sponsors never mix in one list;
     each hit names its sponsor. The fixture gives every program its own client workspace (seedVaultFixtureParent). */
  it("from inside a project, lists only its sponsor's projects, and names the sponsor", async () => {
    const res = await library(mine, `q=${WORD}&sameClientAs=${progA}`);
    expect(res.status, JSON.stringify(res.body).slice(0, 300)).toBe(200);
    const d = res.body.data;
    expect(d.total).toBe(1);
    expect(d.results.map((h: { id: string }) => h.id)).toEqual([a2]);
    expect(d.client).toEqual({ id: expect.any(Number), name: `${PROBE}alpha-parent` });
    expect(d.results[0].client).toEqual(d.client);
  });

  it('across every project, each hit names its own sponsor', async () => {
    const res = await library(mine, `q=${WORD}`);
    const byId = new Map(res.body.data.results.map((h: { id: string; client: unknown }) => [h.id, h.client]));
    expect(byId.get(a2)).toEqual({ id: expect.any(Number), name: `${PROBE}alpha-parent` });
    expect(byId.get(b1)).toEqual({ id: expect.any(Number), name: `${PROBE}beta-parent` });
    expect(res.body.data.client).toBeUndefined();
  });

  it("refuses a project that is not the caller's to scope by, and never widens to it", async () => {
    const res = await library(mine, `q=${WORD}&sameClientAs=${progT}`);
    expect(res.status).toBe(404);
    expect(JSON.stringify(res.body)).not.toContain('Their study');
    const bad = await library(mine, `q=${WORD}&sameClientAs=not-a-project`);
    expect(bad.status).toBe(400);
  });

  it('the project search still searches its project only', async () => {
    const res = await request(await appFor(mine)).get(`/api/c2c/project-vault/${progB}/search?q=${WORD}`);
    expect(res.status).toBe(200);
    expect(res.body.data.total).toBe(1);
    expect(res.body.data.results.map((h: { id: string }) => h.id)).toEqual([b1]);
    expect(res.body.data.results[0].size).toMatch(/B$/);
  });
});
