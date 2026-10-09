/**
 * Authoring documents — project (program) scoping.
 *
 * Proves the additive program link on the flagship authoring loop:
 *   • POST /api/authoring/docs with client_program_id tags the document to a
 *     regulatory_programs UUID (verified by reading the row back).
 *   • GET /api/authoring/docs?programId=<uuid> returns ONLY that project's
 *     documents; without programId the org-wide list is unchanged.
 *   • A create that names no project is refused 400 (PF-07, founder decision
 *     2026-09-26: a document belongs to a project), so there is no longer an
 *     "org-wide, no program" document; the org-wide list is exercised across
 *     two projects of the same organization instead.
 *
 * Runs the REAL authoring.router over HTTP (supertest) with a REAL signed JWT,
 * against the canonical loop DDL plus
 * migrations/20260727_authoring_document_program_scope.sql on an in-process
 * Postgres (PGlite) — the same harness the IND-authoring journey uses.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { SignJWT } from 'jose';
import { createJourneyDb, type JourneyDb } from './golden-journeys/harness';

const JWT_SECRET = 'authoring-program-scope-secret-0727';
process.env.JWT_SECRET = JWT_SECRET;
// The authoring router verifies via the CANONICAL verifyJwtWithRotation, which in
// test env (NODE_ENV=test → suffix DEV) reads JWT_SECRET_DEV ?? JWT_SECRET. This
// file overrides JWT_SECRET for isolation, so it must override the env-suffixed
// secret the verifier actually reads, or every token 401s.
process.env.JWT_SECRET_DEV = JWT_SECRET;

const AUTHOR = {
  id: '4a2b3c10-0000-4000-8000-000000000001',
  organizationId: 1,
  email: 'author@scope.example',
  name: 'Pat Author',
};
const PROGRAM_A = '11111111-1111-4111-8111-111111111111';
const PROGRAM_B = '22222222-2222-4222-8222-222222222222';
/**
 * A third project of the SAME organization. PF-07 removed the org-wide (no
 * program) document this file used to create as the "not in program A" case;
 * that document now lives here, so program B stays empty (the no-leakage
 * check) and the unfiltered list still spans more than one project.
 */
const PROGRAM_C = '44444444-4444-4444-8444-444444444444';
/** A project of ANOTHER organization. */
const PROGRAM_FOREIGN = '33333333-3333-4333-8333-333333333333';

async function mint(u: typeof AUTHOR) {
  return new SignJWT({
    userId: u.id,
    email: u.email,
    name: u.name,
    organizationId: u.organizationId,
    tenant_id: u.organizationId,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(new TextEncoder().encode(JWT_SECRET));
}

const T = 180_000;

const h = vi.hoisted(() => ({ db: null as unknown, pool: null as unknown }));
vi.mock('../server/db', () => ({
  get db() {
    return h.db;
  },
  get pool() {
    return h.pool;
  },
  getPool: () => h.pool,
  query: (text: string, params?: unknown[]) =>
    (h.pool as { query: (t: string, p?: unknown[]) => Promise<unknown> }).query(text, params),
}));

// The authoring router re-checks live org membership (enforceOrgMembership)
// by coercing the token's userId with parseInt (server/middleware/orgMembership
// .parseFiniteInt). A UUID like '4a2b3c10-…' coerces to its leading integer, so
// the seeded organization_users row must key on that same coerced id or every
// request is refused as membership-indeterminate (503).
const AUTHOR_MEMBERSHIP_ID = Number.parseInt(AUTHOR.id, 10); // 4a2b3c10-… → 4

const PREREQ = `
  CREATE TABLE organizations (id SERIAL PRIMARY KEY, name TEXT);
  CREATE TABLE users (id UUID PRIMARY KEY, name TEXT, email TEXT);
  CREATE TABLE organization_users (
    organization_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    role TEXT NOT NULL DEFAULT 'member'
  );
  INSERT INTO organizations (id, name) VALUES (1, 'scope-org'), (2, 'other-org');
  INSERT INTO users (id, name, email) VALUES ('${AUTHOR.id}', '${AUTHOR.name}', '${AUTHOR.email}');
  INSERT INTO organization_users (organization_id, user_id, role)
    VALUES (${AUTHOR.organizationId}, ${AUTHOR_MEMBERSHIP_ID}, 'member');
`;

let jdb: JourneyDb;
let app: express.Express;
let token: string;
const auth = (req: request.Test) => req.set('Authorization', `Bearer ${token}`);

beforeAll(async () => {
  jdb = await createJourneyDb({
    prereqSql: PREREQ,
    migrations: [
      // The projects a document is anchored to. createDocument refuses a
      // program its organization does not own (LX-20), so the programs must
      // exist, in the real table, for a create to succeed.
      'migrations/20260524_program_workbench_schema.sql',
      'db/migrations/20260725_authoring_document_loop_tables.sql',
      'db/migrations/20260817_doc_revisions_immutable_ledger.sql',
      'db/migrations/20260730_authoring_comments_router_columns.sql',
      'migrations/20260727_authoring_document_program_scope.sql',
    ],
  });
  h.db = jdb.db;
  h.pool = jdb.pool;
  await jdb.pool.query(
    `INSERT INTO regulatory_programs (id, organization_id, name, code, program_type, product_type, primary_agency, product_name)
     VALUES ($1, 1, 'Program A', 'PA-1', 'ind', 'drug', 'FDA', 'Alpha'),
            ($2, 1, 'Program B', 'PB-1', 'ind', 'drug', 'FDA', 'Beta'),
            ($3, 2, 'Other org program', 'OO-1', 'ind', 'drug', 'FDA', 'Other'),
            ($4, 1, 'Program C', 'PC-1', 'ind', 'drug', 'FDA', 'Gamma')`,
    [PROGRAM_A, PROGRAM_B, PROGRAM_FOREIGN, PROGRAM_C],
  );
  token = await mint(AUTHOR);

  const { default: authoringRouter } = await import('../server/routes/authoring.router');
  app = express();
  app.use(express.json({ limit: '5mb' }));
  // No auth shim: the router's OWN jose middleware verifies the token.
  app.use('/api/authoring', authoringRouter);
}, T);

afterAll(async () => {
  await jdb?.close();
});

describe('authoring documents — program scoping (over HTTP, canonical DDL)', () => {
  it('adds the client_program_id column via the migration', async () => {
    const col = await jdb.pool.query(
      `SELECT 1 FROM information_schema.columns
       WHERE table_name = 'authoring_documents' AND column_name = 'client_program_id'`,
    );
    expect(col.rows.length).toBe(1);
  });

  it('tags a create with client_program_id and scopes the list to it', async () => {
    // One document scoped to program A, one in ANOTHER project of the same
    // organization. This second document used to be created org-wide (no
    // program); PF-07 (a document belongs to a project) refuses that create,
    // so it now names program C. Its role is unchanged: a document of this
    // organization that is NOT in program A.
    const a = await auth(request(app).post('/api/authoring/docs')).send({
      title: 'Program A doc',
      module: 'M3',
      client_program_id: PROGRAM_A,
    });
    expect(a.status).toBe(201);

    const programC = await auth(request(app).post('/api/authoring/docs')).send({
      title: 'Program C doc',
      module: 'M3',
      client_program_id: PROGRAM_C,
    });
    expect(programC.status).toBe(201);

    // A legacy row: a document created org-wide before PF-07, which deployed
    // databases still hold (PF-07 refuses new ones; it does not backfill). No
    // route can make it now, so it is written directly. No project's list may
    // show it; the organization's own unfiltered list still does.
    await jdb.pool.query(
      `INSERT INTO authoring_documents (id, title, module, status, created_by, tenant_id, client_program_id)
       VALUES ('55555555-5555-4555-8555-555555555555', 'Legacy org-wide doc', 'M3', 'draft', 'u-1', 1, NULL)`,
    );

    // The tagged document really carries the program id.
    const row = await jdb.pool.query(
      `SELECT client_program_id FROM authoring_documents WHERE id = $1`,
      [a.body.document.id],
    );
    expect((row.rows[0] as { client_program_id: string }).client_program_id).toBe(PROGRAM_A);

    // Scoped list returns ONLY program A's document.
    const scoped = await auth(
      request(app).get('/api/authoring/docs').query({ module: 'M3', status: 'draft', programId: PROGRAM_A }),
    );
    expect(scoped.status).toBe(200);
    expect(scoped.body.documents.map((d: { title: string }) => d.title)).toEqual(['Program A doc']);

    // A different program sees none of it (no cross-project leakage).
    const scopedB = await auth(
      request(app).get('/api/authoring/docs').query({ module: 'M3', status: 'draft', programId: PROGRAM_B }),
    );
    expect(scopedB.body.documents.length).toBe(0);

    // Org-wide list (no programId) is unchanged — all three, across projects
    // and the legacy row.
    const all = await auth(
      request(app).get('/api/authoring/docs').query({ module: 'M3', status: 'draft' }),
    );
    expect(all.body.documents.map((d: { title: string }) => d.title).sort()).toEqual([
      'Legacy org-wide doc',
      'Program A doc',
      'Program C doc',
    ]);
  });

  it('refuses another organization’s project with 404, and writes nothing', async () => {
    const before = await jdb.pool.query(`SELECT count(*)::int AS n FROM authoring_documents`);
    const res = await auth(request(app).post('/api/authoring/docs')).send({
      title: 'Anchored to someone else',
      module: 'M3',
      client_program_id: PROGRAM_FOREIGN,
    });
    expect(res.status).toBe(404);
    const after = await jdb.pool.query(`SELECT count(*)::int AS n FROM authoring_documents`);
    expect((after.rows[0] as { n: number }).n).toBe((before.rows[0] as { n: number }).n);
  });

  it('refuses a create that names no project with 400, and writes nothing (PF-07)', async () => {
    // The create this file used to make org-wide. A document belongs to a
    // project, so it is refused before anything is written.
    const before = await jdb.pool.query(`SELECT count(*)::int AS n FROM authoring_documents`);
    const res = await auth(request(app).post('/api/authoring/docs')).send({
      title: 'No project',
      module: 'M3',
    });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.code).toBe('PROJECT_REQUIRED');
    expect(res.body.error).toBe('Open a project first: a document belongs to a project.');
    const after = await jdb.pool.query(`SELECT count(*)::int AS n FROM authoring_documents`);
    expect((after.rows[0] as { n: number }).n).toBe((before.rows[0] as { n: number }).n);
  });

  it('rejects a malformed client_program_id with 400, not a 500', async () => {
    const res = await auth(request(app).post('/api/authoring/docs')).send({
      title: 'Bad program id',
      module: 'M3',
      client_program_id: 'not-a-uuid',
    });
    expect(res.status).toBe(400);
  });
});
