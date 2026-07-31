/**
 * Authoring lifecycle mutations are ATOMIC.
 *
 * The section-save (PATCH /sections/:id), freeze (POST /docs/:id/freeze) and
 * sign (POST /docs/:id/sign) handlers each perform SEVERAL writes that must
 * agree with one another: a section edit writes a revision row, the section
 * update and an audit row; a freeze writes a frozen snapshot, flips the
 * document status and an audit row; a signing writes the signature, approves
 * the workflow step (and, when it is the last, the document) and an audit row.
 *
 * Previously each write was its own commit against the pool, so a failure
 * part-way through left partial state — a revision with no matching section
 * change, a snapshot for a still-editable document, a signature whose workflow
 * step was never approved — and no Part 11 audit record for the act. These
 * tests pin the fix: every one of those handlers now runs its writes inside a
 * single BEGIN…COMMIT on ONE pooled client, and a mid-transaction failure
 * issues ROLLBACK and reports 500 instead of committing a fragment.
 *
 * The router carries its own §11 JWT gate, so we sign a real HS256 token rather
 * than stubbing auth (mirrors authoringExportPdf.test.ts).
 */
import express from 'express';
import request from 'supertest';
import { SignJWT } from 'jose';
import bcrypt from 'bcryptjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => {
  const clientQuery = vi.fn();
  const clientRelease = vi.fn();
  const client = { query: clientQuery, release: clientRelease };
  return {
    poolQuery: vi.fn(),
    clientQuery,
    clientRelease,
    connect: vi.fn(async () => client),
    auditLogAction: vi.fn(),
  };
});

vi.mock('../../db', () => ({
  pool: { query: (...a: unknown[]) => h.poolQuery(...a), connect: () => h.connect() },
  getPool: () => ({ query: (...a: unknown[]) => h.poolQuery(...a), connect: () => h.connect() }),
  query: (...a: unknown[]) => h.poolQuery(...a),
  db: {},
}));
vi.mock('../../services/auditService', () => ({
  default: { logAction: (...a: unknown[]) => h.auditLogAction(...a) },
}));

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-authoring-atomic';
process.env.JWT_SECRET_DEV = process.env.JWT_SECRET;

import router from '../authoring.router';

const PIN = '246810';
let PIN_HASH = '';

async function bearer(roles?: string[]): Promise<string> {
  const secret = new TextEncoder().encode(process.env.JWT_SECRET);
  const token = await new SignJWT({
    sub: 'u1', // non-numeric subject → membership re-check is skipped
    organizationId: 7,
    email: 'author@test.co',
    ...(roles ? { roles } : {}),
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(secret);
  return `Bearer ${token}`;
}

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/authoring', router);
  return app;
}

/** Ordered list of the SQL verbs the transaction client saw. */
function clientSql(): string[] {
  return h.clientQuery.mock.calls.map((c) => String(c[0]).trim());
}
const sawBegin = () => clientSql().findIndex((s) => /^BEGIN/i.test(s));
const sawCommit = () => clientSql().findIndex((s) => /^COMMIT/i.test(s));
const sawRollback = () => clientSql().some((s) => /^ROLLBACK/i.test(s));
const writeIndex = (re: RegExp) => clientSql().findIndex((s) => re.test(s));

// When set, the client throws for the first query whose SQL matches — a
// mid-transaction failure.
let failOn: RegExp | null = null;

beforeEach(async () => {
  if (!PIN_HASH) PIN_HASH = await bcrypt.hash(PIN, 4);
  vi.clearAllMocks();
  failOn = null;
  h.auditLogAction.mockResolvedValue(undefined);

  h.connect.mockImplementation(async () => ({ query: h.clientQuery, release: h.clientRelease }));

  h.clientQuery.mockImplementation(async (sql: string) => {
    const s = String(sql);
    if (failOn && failOn.test(s)) throw new Error('injected mid-transaction failure');
    if (/^BEGIN|^COMMIT|^ROLLBACK/i.test(s)) return {};
    if (/UPDATE authoring_sections/i.test(s)) {
      return { rowCount: 1, rows: [{ id: 'S1', doc_id: 'D1', content: 'new text' }] };
    }
    if (/SELECT COUNT\(\*\) as pending FROM authoring_workflow_steps/i.test(s)) {
      return { rowCount: 1, rows: [{ pending: '0' }] };
    }
    return { rowCount: 1, rows: [{}] };
  });
});

describe('PATCH /sections/:id — revision + update + audit are atomic', () => {
  beforeEach(() => {
    h.poolQuery.mockImplementation(async (sql: string) => {
      if (/FROM authoring_sections WHERE id = \$1/i.test(sql)) {
        return { rowCount: 1, rows: [{ id: 'S1', doc_id: 'D1', content: 'old text' }] };
      }
      return { rowCount: 0, rows: [] };
    });
  });

  it('brackets the revision, section update and audit in one BEGIN…COMMIT', async () => {
    const res = await request(makeApp())
      .patch('/api/authoring/sections/S1')
      .set('Authorization', await bearer())
      .send({ content: 'new text' });

    expect(res.status).toBe(200);

    const begin = sawBegin();
    const commit = sawCommit();
    expect(begin).toBe(0); // first thing on the client
    expect(commit).toBeGreaterThan(begin); // and the last
    expect(sawRollback()).toBe(false);

    // Every write ran on the transaction client, between BEGIN and COMMIT.
    for (const re of [/INSERT INTO doc_revisions/i, /UPDATE authoring_sections/i, /INSERT INTO authoring_audit_trail/i]) {
      const idx = writeIndex(re);
      expect(idx).toBeGreaterThan(begin);
      expect(idx).toBeLessThan(commit);
    }
    // None of those writes leaked onto the pool (they must use the client).
    expect(h.poolQuery.mock.calls.some((c) => /INSERT INTO doc_revisions/i.test(String(c[0])))).toBe(false);
    expect(h.clientRelease).toHaveBeenCalledTimes(1);
  });

  it('ROLLBACK + 500 when the section update fails mid-transaction', async () => {
    failOn = /UPDATE authoring_sections/i;

    const res = await request(makeApp())
      .patch('/api/authoring/sections/S1')
      .set('Authorization', await bearer())
      .send({ content: 'new text' });

    expect(res.status).toBe(500);
    expect(sawBegin()).toBe(0);
    expect(sawRollback()).toBe(true);
    expect(sawCommit()).toBe(-1); // never committed
    expect(h.clientRelease).toHaveBeenCalledTimes(1); // released in finally
  });
});

describe('POST /docs/:id/freeze — snapshot + status flip + audit are atomic', () => {
  beforeEach(() => {
    h.poolQuery.mockImplementation(async (sql: string) => {
      if (/FROM authoring_documents WHERE id = \$1/i.test(sql)) {
        return { rowCount: 1, rows: [{ id: 'D1', status: 'draft', version: '1.0' }] };
      }
      if (/FROM authoring_sections WHERE doc_id = \$1/i.test(sql)) {
        return { rowCount: 1, rows: [{ id: 'S1', code: '2.5', title: 'T', content: 'body' }] };
      }
      return { rowCount: 0, rows: [] };
    });
  });

  it('brackets the snapshot, status update and audit in one BEGIN…COMMIT', async () => {
    const res = await request(makeApp())
      .post('/api/authoring/docs/D1/freeze')
      .set('Authorization', await bearer())
      .send({ reason: 'lock for review' });

    expect(res.status).toBe(200);
    const begin = sawBegin();
    const commit = sawCommit();
    expect(begin).toBe(0);
    expect(commit).toBeGreaterThan(begin);
    expect(sawRollback()).toBe(false);
    for (const re of [/INSERT INTO frozen_documents/i, /UPDATE authoring_documents/i, /INSERT INTO authoring_audit_trail/i]) {
      const idx = writeIndex(re);
      expect(idx).toBeGreaterThan(begin);
      expect(idx).toBeLessThan(commit);
    }
    expect(h.clientRelease).toHaveBeenCalledTimes(1);
  });

  it('ROLLBACK + 500 when the status update fails mid-transaction', async () => {
    failOn = /UPDATE authoring_documents/i;

    const res = await request(makeApp())
      .post('/api/authoring/docs/D1/freeze')
      .set('Authorization', await bearer())
      .send({ reason: 'lock for review' });

    expect(res.status).toBe(500);
    expect(sawRollback()).toBe(true);
    expect(sawCommit()).toBe(-1);
    expect(h.clientRelease).toHaveBeenCalledTimes(1);
  });
});

describe('POST /docs/:id/sign — signature + workflow approval + audit are atomic', () => {
  beforeEach(() => {
    h.poolQuery.mockImplementation(async (sql: string) => {
      if (/FROM user_pins/i.test(sql)) {
        return { rowCount: 1, rows: [{ pin_hash: PIN_HASH, failed_attempts: 0, locked_until: null }] };
      }
      if (/SELECT code, content FROM authoring_sections/i.test(sql)) {
        return { rowCount: 1, rows: [{ code: '2.5', content: 'body' }] };
      }
      if (/FROM frozen_documents/i.test(sql)) {
        return { rowCount: 0, rows: [] };
      }
      return { rowCount: 0, rows: [] };
    });
  });

  it('brackets the signature, workflow step, document approval and audit in one BEGIN…COMMIT', async () => {
    const res = await request(makeApp())
      .post('/api/authoring/docs/D1/sign')
      .set('Authorization', await bearer(['REVIEWER']))
      .send({ pin: PIN, meaning: 'REVIEWER', reason: 'reviewed and approved' });

    expect(res.status).toBe(200);
    const begin = sawBegin();
    const commit = sawCommit();
    expect(begin).toBe(0);
    expect(commit).toBeGreaterThan(begin);
    expect(sawRollback()).toBe(false);
    for (const re of [
      /INSERT INTO authoring_signatures/i,
      /UPDATE authoring_workflow_steps/i,
      /UPDATE authoring_documents/i,
      /INSERT INTO authoring_audit_trail/i,
    ]) {
      const idx = writeIndex(re);
      expect(idx).toBeGreaterThan(begin);
      expect(idx).toBeLessThan(commit);
    }
    expect(h.clientRelease).toHaveBeenCalledTimes(1);
  });

  it('ROLLBACK + 500 when the signature insert fails mid-transaction', async () => {
    failOn = /INSERT INTO authoring_signatures/i;

    const res = await request(makeApp())
      .post('/api/authoring/docs/D1/sign')
      .set('Authorization', await bearer(['REVIEWER']))
      .send({ pin: PIN, meaning: 'REVIEWER', reason: 'reviewed and approved' });

    expect(res.status).toBe(500);
    expect(sawRollback()).toBe(true);
    expect(sawCommit()).toBe(-1);
    expect(h.clientRelease).toHaveBeenCalledTimes(1);
  });
});
