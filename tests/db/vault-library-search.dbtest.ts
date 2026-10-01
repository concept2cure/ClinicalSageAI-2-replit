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

const PROBE = 'dbtest-vlib ';
const CODE = 'DBTEST-VLIB';
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
    `INSERT INTO organizations (name, slug) VALUES ($1, $2)
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name RETURNING id, uuid`,
    [`${PROBE}${slug}`, `dbtest-vlib-${slug}`],
  );
  return { orgId: Number(org.rows[0].id), orgUuid: String(org.rows[0].uuid) };
}

async function program(t: Tenant, name: string): Promise<string> {
  const prog = await owner.query(
    `INSERT INTO regulatory_programs (name, code, organization_id, program_type, product_type, primary_agency, product_name)
     VALUES ($1, $2, $3, 'ind', 'drug', 'FDA', 'Librium 5mg') RETURNING id`,
    [`${PROBE}${name}`, `${CODE}-${name.toUpperCase().replace(/\W+/g, '-')}`, t.orgId],
  );
  return String(prog.rows[0].id);
}

async function cleanup(): Promise<void> {
  const client = await owner.connect();
  try {
    await client.query('BEGIN');
    await client.query('ALTER TABLE audit_logs DISABLE TRIGGER trg_audit_logs_no_delete');
    await client.query(`DELETE FROM audit_logs WHERE tenant_id IN (SELECT id FROM organizations WHERE slug LIKE 'dbtest-vlib-%')`);
    await client.query('ALTER TABLE audit_logs ENABLE TRIGGER trg_audit_logs_no_delete');
    await client.query('COMMIT');
  } catch {
    await client.query('ROLLBACK').catch(() => {});
  } finally {
    client.release();
  }
  await owner.query('DELETE FROM vault.documents WHERE document_code LIKE $1 AND supersedes_id IS NOT NULL', [`${CODE}%`]);
  await owner.query('DELETE FROM vault.documents WHERE document_code LIKE $1', [`${CODE}%`]);
  await owner.query('DELETE FROM regulatory_programs WHERE name LIKE $1', [`${PROBE}%`]);
}

beforeAll(async () => {
  owner = new Pool({ connectionString: databaseUrl, max: 4 });
  const user = await owner.query(
    `INSERT INTO users (email, name, password_hash) VALUES ('dbtest-vlib@example.test', 'Lib Rarian', 'not-a-real-hash')
       ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
  );
  userId = Number(user.rows[0].id);
  await cleanup();
  mine = await tenant('mine');
  theirs = await tenant('theirs');
  progA = await program(mine, 'alpha');
  progB = await program(mine, 'beta');
  progT = await program(theirs, 'their program');
  a1 = await ingest(mine, progA, `Stability report. The ${WORD} impurity stays under 0.1%.`, { documentCode: `${CODE}-A`, documentTitle: 'Alpha stability report' });
  a2 = await ingest(mine, progA, `Stability report, revised. The ${WORD} impurity stays under 0.05%.`, { supersedesDocumentId: a1, documentTitle: 'Alpha stability report' });
  b1 = await ingest(mine, progB, `Beta method validation for ${WORD}.`, { documentCode: `${CODE}-B`, documentTitle: 'Beta method validation' });
  await ingest(theirs, progT, `Their own ${WORD} study.`, { documentCode: `${CODE}-T`, documentTitle: 'Their study' });
}, 90_000);

afterAll(async () => {
  await cleanup().catch(() => {});
  await owner.end().catch(() => {});
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

  it('the project search still searches its project only', async () => {
    const res = await request(await appFor(mine)).get(`/api/c2c/project-vault/${progB}/search?q=${WORD}`);
    expect(res.status).toBe(200);
    expect(res.body.data.total).toBe(1);
    expect(res.body.data.results.map((h: { id: string }) => h.id)).toEqual([b1]);
    expect(res.body.data.results[0].size).toMatch(/B$/);
  });
});
