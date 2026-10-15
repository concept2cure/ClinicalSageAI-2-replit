/**
 * Authoring a market's own part of the filing (FILING_SPINE F22b).
 *
 * A project that adds a market (EMA's MAA on an NDA project) gets a governed
 * document holding that market's Module 1 and 3.2.R. Authoring it takes an
 * editing copy bound to that document, so:
 *   - POST /api/authoring/docs with `c2c_document_id` naming the market
 *     document binds the new document to it;
 *   - naming a document that is not a market document of this project is
 *     refused 409, and nothing is created (never created unbound: the person
 *     asked for that market's copy);
 *   - a section of a common code in the market's copy is refused 409
 *     WRONG_FILING_SCOPE, and nothing is created; a Module 1 section is
 *     created.
 *
 * The REAL authoring router over HTTP with a REAL signed JWT, on the real
 * migrations in PGlite.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { SignJWT } from 'jose';
import { createJourneyDb, type JourneyDb } from './golden-journeys/harness';

const JWT_SECRET = 'authoring-market-binding-secret';
process.env.JWT_SECRET = JWT_SECRET;
process.env.JWT_SECRET_DEV = JWT_SECRET;

const AUTHOR = { id: '42', organizationId: 1, email: 'ra@market.example', name: 'Robin RA' };
const NDA = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';

const h = vi.hoisted(() => ({ db: null as unknown, pool: null as unknown }));
vi.mock('../server/db', () => ({
  get db() { return h.db; },
  get pool() { return h.pool; },
  getPool: () => h.pool,
  query: (text: string, params?: unknown[]) =>
    (h.pool as { query: (t: string, p?: unknown[]) => Promise<unknown> }).query(text, params),
}));

const PREREQ = `
  CREATE TABLE organizations (id SERIAL PRIMARY KEY, name TEXT);
  CREATE TABLE users (id SERIAL PRIMARY KEY, name TEXT, email TEXT);
  CREATE TABLE organization_users (organization_id INTEGER NOT NULL, user_id INTEGER NOT NULL, role TEXT NOT NULL DEFAULT 'member');
  INSERT INTO organizations (id, name) VALUES (1, 'market-org');
  INSERT INTO users (id, name, email) VALUES (42, '${AUTHOR.name}', '${AUTHOR.email}');
  INSERT INTO organization_users (organization_id, user_id, role) VALUES (1, 42, 'member');
`;

const T = 180_000;
let jdb: JourneyDb;
let app: express.Express;
let token = '';
const as = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);
const q = async (sql: string, params?: unknown[]) => (await jdb.pool.query(sql, params)).rows as Array<Record<string, unknown>>;

beforeAll(async () => {
  jdb = await createJourneyDb({
    prereqSql: PREREQ,
    migrations: [
      'migrations/20260524_program_workbench_schema.sql',
      'db/migrations/20260725_authoring_document_loop_tables.sql',
      'migrations/20260727_authoring_document_program_scope.sql',
      'db/migrations/20260730_authoring_comments_router_columns.sql',
      'db/migrations/20260817_doc_revisions_immutable_ledger.sql',
      'migrations/20260527_mutation_primitives.sql',
      'migrations/20260528_phase9_document_schema.sql',
      'migrations/20260804_phase9_rule_pack_outlines.sql',
      'migrations/20260728_authoring_document_governed_binding.sql',
      'migrations/20261015e_c2c_documents_filing_scope.sql',
    ],
  });
  h.db = jdb.db;
  h.pool = jdb.pool;
  await jdb.pool.query(
    `INSERT INTO regulatory_programs (id, organization_id, name, code, program_type, product_type, primary_agency, product_name)
     VALUES ($1, 1, 'NDA', 'N-1', 'nda', 'drug', 'FDA', 'Vorelinib'), ($2, 1, 'Other', 'O-1', 'nda', 'drug', 'FDA', 'Other')`,
    [NDA, OTHER],
  );
  for (const [id, project, docType, agency, scope] of [
    ['doc_home', NDA, 'nda', 'fda', 'home'], ['doc_ema', NDA, 'maa', 'ema', 'market'], ['doc_other_ema', OTHER, 'maa', 'ema', 'market'],
  ]) {
    await jdb.pool.query(
      `INSERT INTO c2c_documents (id, org_id, project_id, doc_type, agency, rule_pack_version, title, status, readiness, filing_scope)
       SELECT $1, 1, $2, doc_type, agency, version, $1, 'draft', 0, $5
         FROM c2c_rule_packs WHERE doc_type = $3 AND agency = $4 AND superseded_by IS NULL LIMIT 1`,
      [id, project, docType, agency, scope],
    );
  }
  token = await new SignJWT({ userId: AUTHOR.id, email: AUTHOR.email, name: AUTHOR.name, organizationId: 1, tenant_id: 1 })
    .setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('1h')
    .sign(new TextEncoder().encode(JWT_SECRET));
  const { default: authoringRouter } = await import('../server/routes/authoring.router');
  app = express();
  app.use(express.json({ limit: '5mb' }));
  app.use('/api/authoring', authoringRouter);
}, T);

afterAll(async () => { await jdb?.close(); });

describe("authoring a market's own part of the filing (F22b)", () => {
  let emaDocId = '';

  it("binds a new document to the market's governed document when it is named", async () => {
    const res = await as(request(app).post('/api/authoring/docs')).send({
      title: 'EU Module 1', module: 'M1', client_program_id: NDA, c2c_document_id: 'doc_ema',
    });
    expect(res.status).toBe(201);
    emaDocId = res.body.document.id;
    expect((await q(`SELECT c2c_document_id FROM authoring_documents WHERE id = $1`, [emaDocId]))[0].c2c_document_id).toBe('doc_ema');
  }, T);

  it.each([['the home filing', 'doc_home'], ["another project's market", 'doc_other_ema'], ['an unknown document', 'doc_nope']])(
    'naming %s is refused, and nothing is created', async (_what, id) => {
      const before = (await q(`SELECT count(*)::int AS n FROM authoring_documents`))[0].n;
      const res = await as(request(app).post('/api/authoring/docs')).send({ title: 'X', module: 'M1', client_program_id: NDA, c2c_document_id: id });
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('MARKET_DOCUMENT_NOT_BOUND');
      expect((await q(`SELECT count(*)::int AS n FROM authoring_documents`))[0].n).toBe(before);
    }, T);

  it("a market's copy starts without a template, and nothing is created", async () => {
    const before = (await q(`SELECT count(*)::int AS n FROM authoring_documents`))[0].n;
    const res = await as(request(app).post('/api/authoring/docs')).send({
      title: 'EU Module 1', module: 'M1', client_program_id: NDA, c2c_document_id: 'doc_ema', template_id: 'org-template-1',
    });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('MARKET_DOCUMENT_TEMPLATE');
    expect((await q(`SELECT count(*)::int AS n FROM authoring_documents`))[0].n).toBe(before);
  }, T);

  it("refuses a common section in the market's copy, and creates nothing", async () => {
    const res = await as(request(app).post('/api/authoring/sections')).send({ doc_id: emaDocId, code: '2.5', title: 'Clinical overview', content: '' });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('WRONG_FILING_SCOPE');
    expect(res.body.error).toMatch(/Section 2\.5 belongs to the project's home filing/);
    expect(await q(`SELECT 1 FROM authoring_sections WHERE doc_id = $1`, [emaDocId])).toHaveLength(0);
  }, T);

  it("creates the market's own Module 1 section", async () => {
    const res = await as(request(app).post('/api/authoring/sections')).send({ doc_id: emaDocId, code: '1.3.1', title: 'SmPC', content: '' });
    expect(res.status).toBe(201);
    expect(await q(`SELECT code FROM authoring_sections WHERE doc_id = $1`, [emaDocId])).toEqual([{ code: '1.3.1' }]);
  }, T);
});
