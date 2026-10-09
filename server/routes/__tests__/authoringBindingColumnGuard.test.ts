/**
 * Creating a document must not depend on a column that may not exist.
 *
 * `authoring_documents.c2c_document_id` binds the editing layer to the filing
 * that is the system of record. It is added by
 * migrations/20260728_authoring_document_governed_binding.sql — which lives in
 * the ROOT `migrations/` tree, while the authoring tables live in
 * `db/migrations/`, and which the canonical authoring migration set
 * (authoring-migration.pglite.integration.test.ts) does not include.
 *
 * The create path used to reference that column whenever a governed binding
 * RESOLVED, on the reasoning that a database without the migration would never
 * resolve one. Those two facts are independent: resolution depends on the
 * governance store answering, the column depends on an ALTER having run. Where
 * the store resolved and the ALTER had not, the INSERT named a column that did
 * not exist — inside the create transaction, so the whole thing rolled back and
 * no document could be created at all.
 *
 * commit-section-to-filing.ts already checks information_schema for this exact
 * column before writing. These tests pin the same check on the create half.
 */
import express from 'express';
import request from 'supertest';
import { SignJWT } from 'jose';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockQuery, mockClientQuery } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
  mockClientQuery: vi.fn(),
}));

vi.mock('../../db', () => {
  const api = {
    query: (...a: unknown[]) => mockQuery(...a),
    connect: async () => ({
      query: (...a: unknown[]) => mockClientQuery(...a),
      release: () => {},
    }),
  };
  return { pool: api, getPool: () => api, query: (...a: unknown[]) => mockQuery(...a), db: {} };
});

/* The governance resolver answers with a real binding — the case that used to
   break the create when the column was absent. */
vi.mock('../../services/c2c/governed-document-binding.js', () => ({
  resolveGovernedDocument: async () => ({ documentId: 'C2C-DOC-1' }),
}));

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-binding-guard';
process.env.JWT_SECRET_DEV = process.env.JWT_SECRET;

import router from '../authoring.router';

async function bearer(): Promise<string> {
  const secret = new TextEncoder().encode(process.env.JWT_SECRET);
  return `Bearer ${await new SignJWT({ sub: 'u1', organizationId: ORG_ID, email: 'ra@test.co' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(secret)}`;
}

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/authoring', router);
  return app;
}

/* A document belongs to a project (PF-07; founder decision 2026-09-26): a create
   with no client_program_id is refused 400 PROJECT_REQUIRED before the binding
   path this file pins is ever reached. So every create here names a live
   project owned by the caller's organization (org 7, from the bearer), and the
   mock pool answers programInOrganization's ownership SELECT for that id only.
   The binding question under test is unchanged: the governed-document resolver
   is mocked to name a filing either way, so only the column state decides
   bound vs unbound. */
const ORG_ID = 7;
const PROGRAM_ID = '0b2c7d4e-5f60-4a71-8b92-a3c4d5e6f701';

/** `columnPresent` decides what information_schema reports for the binding column. */
function wire(columnPresent: boolean) {
  mockQuery.mockImplementation(async (sql: unknown, params?: unknown[]) => {
    const s = String(sql);
    if (s.includes('information_schema.columns') && s.includes('c2c_document_id')) {
      return { rowCount: 1, rows: [{ ok: columnPresent }] };
    }
    // programInOrganization: a row for the owned, live program only; nothing
    // for any other id or organization, as the real SELECT answers.
    if (s.includes('FROM regulatory_programs') && s.includes('deleted_at IS NULL')) {
      const owned = Array.isArray(params) && params[0] === PROGRAM_ID && params[1] === ORG_ID;
      return owned ? { rowCount: 1, rows: [{ id: PROGRAM_ID }] } : { rowCount: 0, rows: [] };
    }
    return { rowCount: 0, rows: [] };
  });
  mockClientQuery.mockImplementation(async (sql: unknown) => {
    const s = String(sql);
    if (s.includes('INSERT INTO authoring_documents')) {
      /* A real Postgres refuses the statement when the column is absent. The
         mock reproduces that rather than accepting anything, because accepting
         it is what would make this test pass against the defect. */
      if (!columnPresent && s.includes('c2c_document_id')) {
        throw new Error('column "c2c_document_id" of relation "authoring_documents" does not exist');
      }
      return { rowCount: 1, rows: [{ id: 'D1', title: 'A doc' }] };
    }
    return { rowCount: 0, rows: [] };
  });
}

async function createDoc() {
  return request(makeApp())
    .post('/api/authoring/docs')
    .set('Authorization', await bearer())
    .send({ title: 'A doc', module: 'M3', client_program_id: PROGRAM_ID });
}

beforeEach(() => {
  mockQuery.mockReset();
  mockClientQuery.mockReset();
});

describe('POST /docs — governed binding column', () => {
  it('creates the document when the binding column is ABSENT, rather than failing', async () => {
    wire(false);
    const res = await createDoc();

    // The defect: the create rolled back and no document could be made at all.
    expect(res.status).toBeLessThan(500);
    const insert = mockClientQuery.mock.calls
      .map(c => String(c[0]))
      .find(s => s.includes('INSERT INTO authoring_documents'));
    expect(insert).toBeTruthy();
    expect(insert).not.toContain('c2c_document_id');
  });

  it('says the document is NOT bound, rather than claiming a binding it dropped', async () => {
    wire(false);
    const res = await createDoc();

    // Precondition: the document was actually created. Every assertion below is
    // a negative, so a refused create (e.g. 400 PROJECT_REQUIRED, 404 project
    // not found) would satisfy them without testing anything.
    expect(res.status).toBe(201);
    // Reporting bound:true here would send every later save looking for a
    // filing that was never linked.
    const body = JSON.stringify(res.body);
    expect(body).not.toMatch(/"bound"\s*:\s*true/);
    expect(body).not.toContain('C2C-DOC-1');
  });

  it('still binds when the column IS present', async () => {
    wire(true);
    await createDoc();

    const insert = mockClientQuery.mock.calls
      .map(c => String(c[0]))
      .find(s => s.includes('INSERT INTO authoring_documents'));
    expect(insert).toContain('c2c_document_id');
  });
});
