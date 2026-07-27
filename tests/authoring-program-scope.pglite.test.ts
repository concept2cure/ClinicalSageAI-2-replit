/**
 * Authoring documents — project (program) scoping.
 *
 * Proves the additive program link on the flagship authoring loop:
 *   • POST /api/authoring/docs with client_program_id tags the document to a
 *     regulatory_programs UUID (verified by reading the row back).
 *   • GET /api/authoring/docs?programId=<uuid> returns ONLY that project's
 *     documents; without programId the org-wide list is unchanged.
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

const AUTHOR = {
  id: '4a2b3c10-0000-4000-8000-000000000001',
  organizationId: 1,
  email: 'author@scope.example',
  name: 'Pat Author',
};
const PROGRAM_A = '11111111-1111-4111-8111-111111111111';
const PROGRAM_B = '22222222-2222-4222-8222-222222222222';

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

const PREREQ = `
  CREATE TABLE organizations (id SERIAL PRIMARY KEY, name TEXT);
  CREATE TABLE users (id UUID PRIMARY KEY, name TEXT, email TEXT);
  INSERT INTO organizations (id, name) VALUES (1, 'scope-org');
  INSERT INTO users (id, name, email) VALUES ('${AUTHOR.id}', '${AUTHOR.name}', '${AUTHOR.email}');
`;

let jdb: JourneyDb;
let app: express.Express;
let token: string;
const auth = (req: request.Test) => req.set('Authorization', `Bearer ${token}`);

beforeAll(async () => {
  jdb = await createJourneyDb({
    prereqSql: PREREQ,
    migrations: [
      'db/migrations/20260725_authoring_document_loop_tables.sql',
      'migrations/20260727_authoring_document_program_scope.sql',
    ],
  });
  h.db = jdb.db;
  h.pool = jdb.pool;
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
    // One document scoped to program A, one org-wide (no program).
    const a = await auth(request(app).post('/api/authoring/docs')).send({
      title: 'Program A doc',
      module: 'M3',
      client_program_id: PROGRAM_A,
    });
    expect(a.status).toBe(201);

    const orgWide = await auth(request(app).post('/api/authoring/docs')).send({
      title: 'Org-wide doc',
      module: 'M3',
    });
    expect(orgWide.status).toBe(201);

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

    // Org-wide list (no programId) is unchanged — returns both.
    const all = await auth(
      request(app).get('/api/authoring/docs').query({ module: 'M3', status: 'draft' }),
    );
    expect(all.body.documents.length).toBe(2);
  });
});
