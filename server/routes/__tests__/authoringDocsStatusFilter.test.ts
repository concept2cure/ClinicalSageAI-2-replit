/**
 * BP-W0-7 — a document must stay retrievable after it leaves draft.
 *
 * The report was "frozen documents are unreachable under all status filters".
 * They were, and so was everything else past draft: `GET /docs` compared
 * `d.status = $n` case-sensitively against a vocabulary this router writes in
 * two cases (`'draft'` on insert; `'IN_REVIEW'`, `'APPROVED'`, `'FROZEN'` on the
 * lifecycle transitions), while the editor's dropdown sent lower case for all of
 * them. So `status=in_review` and `status=approved` matched nothing, and FROZEN
 * had no dropdown option at all.
 *
 * These assertions run against the mocked pool and check the SQL and parameters
 * the handler BUILDS, because that is where the defect lived — a case-sensitive
 * predicate. A test that mocked the rows back would have passed against the
 * broken code, since the mock never applies the filter it is being asked about.
 */
import express from 'express';
import request from 'supertest';
import { SignJWT } from 'jose';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockQuery } = vi.hoisted(() => ({ mockQuery: vi.fn() }));

vi.mock('../../db', () => ({
  pool: { query: (...a: unknown[]) => mockQuery(...a) },
  getPool: () => ({ query: (...a: unknown[]) => mockQuery(...a) }),
  query: (...a: unknown[]) => mockQuery(...a),
  db: {},
}));

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-authoring-status';
process.env.JWT_SECRET_DEV = process.env.JWT_SECRET;

import router from '../authoring.router';

async function bearer(): Promise<string> {
  const secret = new TextEncoder().encode(process.env.JWT_SECRET);
  return (
    'Bearer ' +
    (await new SignJWT({ sub: 'u1', organizationId: 7, email: 'author@test.co' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(secret))
  );
}

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/authoring', router);
  return app;
}

/** The SELECT the list handler issued, with its parameters. */
function listCall(): { sql: string; params: unknown[] } {
  const call = mockQuery.mock.calls.find((c) => String(c[0]).includes('FROM authoring_documents d'));
  if (!call) throw new Error('list query was never issued');
  return { sql: String(call[0]), params: (call[1] ?? []) as unknown[] };
}

describe('BP-W0-7 — GET /docs status filter', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockQuery.mockResolvedValue({ rowCount: 0, rows: [] });
  });

  it('compares status case-insensitively, so lower-case filters reach upper-case rows', async () => {
    const res = await request(makeApp())
      .get('/api/authoring/docs?status=frozen')
      .set('Authorization', await bearer());

    expect(res.status).toBe(200);
    const { sql, params } = listCall();

    // The predicate must normalise BOTH sides. `d.status = $n` is the defect.
    expect(sql).toContain('upper(d.status) = upper(');
    expect(sql).not.toMatch(/AND d\.status = \$/);
    expect(params).toContain('frozen');
  });

  it('the same holds for in_review and approved, which also matched nothing', async () => {
    for (const status of ['in_review', 'approved']) {
      mockQuery.mockClear();
      await request(makeApp())
        .get(`/api/authoring/docs?status=${status}`)
        .set('Authorization', await bearer());
      const { sql, params } = listCall();
      expect(sql, `${status} must normalise case`).toContain('upper(d.status) = upper(');
      expect(params).toContain(status);
    }
  });

  it('status=all applies NO status predicate, so no state can orphan a document', async () => {
    await request(makeApp())
      .get('/api/authoring/docs?status=all')
      .set('Authorization', await bearer());

    const { sql, params } = listCall();
    expect(sql).not.toContain('upper(d.status)');
    expect(params).not.toContain('all');
  });

  it('an absent status also lists everything rather than silently defaulting to draft', async () => {
    // The old handler defaulted `status = 'draft'` in its destructuring, so a
    // caller that asked for no filter got one anyway and could not tell.
    await request(makeApp()).get('/api/authoring/docs').set('Authorization', await bearer());

    const { sql, params } = listCall();
    expect(sql).not.toContain('upper(d.status)');
    expect(params).not.toContain('draft');
  });

  it('other filters are unaffected', async () => {
    await request(makeApp())
      .get('/api/authoring/docs?status=draft&module=M3')
      .set('Authorization', await bearer());

    const { sql, params } = listCall();
    expect(sql).toContain('d.module = $');
    expect(params).toContain('M3');
    expect(params).toContain('draft');
  });
});
