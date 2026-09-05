/**
 * `c2c_document_id` has three states here, and only two used to be modelled.
 *
 * The column binds the editing layer to the filing that is the system of
 * record. Its migration's DO-block is guarded on `c2c_documents` existing — a
 * table from another bundle — so a deployment carrying the authoring bundle
 * without the c2c one genuinely does not have it, and every reference has to
 * cope. commit-section-to-filing.ts already treats that as a supported
 * deployment rather than an error.
 *
 * Two defects, one on each side of the same question:
 *
 * 1. THE RENAME PATH DID NOT ASK. The section-code lock added later runs
 *    `WHERE … c2c_document_id IS NOT NULL` unguarded, so on a deployment
 *    without the column the catalog raises 42703 and renaming a section's code
 *    answers 500 — the same defect class the create path was already fixed for,
 *    reintroduced on a different path.
 *
 * 2. THE CREATE PATH ASKED, BUT MISREPORTED A FAILED ANSWER. It treated any
 *    non-TRUE result as "absent" and told the caller "this deployment has no
 *    c2c_document_id column" — a claim about the schema derived from a query
 *    that threw. A check that could not RUN establishes nothing.
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
    connect: async () => ({ query: (...a: unknown[]) => mockClientQuery(...a), release: () => {} }),
  };
  return { pool: api, getPool: () => api, query: (...a: unknown[]) => mockQuery(...a), db: {} };
});
vi.mock('../../services/c2c/governed-document-binding.js', () => ({
  resolveGovernedDocument: async () => ({ documentId: 'C2C-DOC-1' }),
}));

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-binding-states';
process.env.JWT_SECRET_DEV = process.env.JWT_SECRET;

import router from '../authoring.router';

async function bearer(): Promise<string> {
  const secret = new TextEncoder().encode(process.env.JWT_SECRET);
  return `Bearer ${await new SignJWT({ sub: 'u1', organizationId: 7, email: 'ra@test.co' })
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

type ColState = 'present' | 'absent' | 'throws';

/** Wire the catalog probe to report one of the three states. */
function wire(state: ColState, opts: { boundRows?: number } = {}) {
  mockQuery.mockImplementation(async (sql: unknown) => {
    const s = String(sql);
    if (s.includes('information_schema.columns') && s.includes('c2c_document_id')) {
      if (state === 'throws') throw new Error('catalog unavailable');
      return { rowCount: 1, rows: [{ ok: state === 'present' }] };
    }
    // The section being renamed.
    if (s.includes('FROM authoring_sections') && s.includes('WHERE')) {
      return { rowCount: 1, rows: [{ id: 'S1', doc_id: 'D1', code: '3.2.S.1', content: 'x' }] };
    }
    // The bound-document probe. Only reachable when the column is present.
    if (s.includes('FROM authoring_documents') && s.includes('c2c_document_id IS NOT NULL')) {
      if (state !== 'present') {
        throw new Error('column "c2c_document_id" does not exist');
      }
      return { rowCount: opts.boundRows ?? 0, rows: [] };
    }
    return { rowCount: 0, rows: [] };
  });
  mockClientQuery.mockImplementation(async (sql: unknown) => {
    if (String(sql).includes('INSERT INTO authoring_documents')) {
      return { rowCount: 1, rows: [{ id: 'D1', title: 'A doc' }] };
    }
    return { rowCount: 0, rows: [] };
  });
}

const renameCode = async () =>
  request(makeApp())
    .patch('/api/authoring/sections/S1')
    .set('Authorization', await bearer())
    .send({ code: '3.2.S.2' });

const createDoc = async () =>
  request(makeApp())
    .post('/api/authoring/docs')
    .set('Authorization', await bearer())
    .send({ title: 'A doc', module: 'M3' });

beforeEach(() => {
  mockQuery.mockReset();
  mockClientQuery.mockReset();
});

describe('renaming a section code where the binding column is ABSENT', () => {
  it('does not 500 — nothing can be bound, so nothing can break', async () => {
    wire('absent');
    const res = await renameCode();

    // The defect: an unguarded 42703 from the catalog.
    expect(res.status).not.toBe(500);
    expect(JSON.stringify(res.body)).not.toMatch(/does not exist/i);
  });

  it('does not consult the bound-document predicate at all', async () => {
    wire('absent');
    await renameCode();

    const asked = mockQuery.mock.calls
      .map(c => String(c[0]))
      .some(s => s.includes('c2c_document_id IS NOT NULL'));
    expect(asked).toBe(false);
  });
});

describe('renaming a section code where the check could NOT RUN', () => {
  it('refuses rather than guessing, and says nothing was changed', async () => {
    wire('throws');
    const res = await renameCode();

    // The lock exists to stop a rename silently re-pointing a section to a
    // different filing slot. Allowing it on an unverified guess risks that.
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('BINDING_CHECK_UNAVAILABLE');
    expect(res.body.error.message).toMatch(/nothing was modified/i);
    const wrote = mockQuery.mock.calls
      .map(c => String(c[0]))
      .some(s => s.includes('UPDATE authoring_sections'));
    expect(wrote).toBe(false);
  });
});

describe('renaming a section code where the column IS present', () => {
  it('still locks the code on a bound document', async () => {
    wire('present', { boundRows: 1 });
    const res = await renameCode();

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CODE_LOCKED_TO_FILING');
  });
});

describe('creating a document when the check could NOT RUN', () => {
  it('does not claim the deployment lacks the column', async () => {
    wire('throws');
    const res = await createDoc();

    // Asserting a schema fact from a query that threw is the defect.
    const body = JSON.stringify(res.body);
    expect(body).not.toMatch(/has no c2c_document_id column/i);
    expect(body).toMatch(/could not be checked/i);
  });

  it('still creates the document, unbound', async () => {
    wire('throws');
    const res = await createDoc();

    expect(res.status).toBeLessThan(500);
    const insert = mockClientQuery.mock.calls
      .map(c => String(c[0]))
      .find(s => s.includes('INSERT INTO authoring_documents'));
    expect(insert).toBeTruthy();
    expect(insert).not.toContain('c2c_document_id');
  });

  it('DOES name the column when it is genuinely absent', async () => {
    wire('absent');
    const res = await createDoc();

    expect(JSON.stringify(res.body)).toMatch(/has no c2c_document_id column/i);
  });
});
