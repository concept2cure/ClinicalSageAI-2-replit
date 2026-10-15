/**
 * GET /api/authoring/docs?conversationId= — the documents a conversation built.
 *
 * docs/design/ONE_ANA_ONE_CANVAS.md §4.3, slice 11. A conversation finds the
 * documents AnA built in it from each document's own provenance
 * ({ source: 'ana', conversationId }), not from a capped copy of a tool result
 * in the saved trace: on 2026-10-08 a real browser showed a reopened
 * conversation with no document at all because that copy had cut the id off.
 * Checks the SQL the handler builds, the place a filter lives or does not.
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

function listCall(): { sql: string; params: unknown[] } {
  const call = mockQuery.mock.calls.find((c) => String(c[0]).includes('FROM authoring_documents d'));
  if (!call) throw new Error('list query was never issued');
  return { sql: String(call[0]), params: (call[1] ?? []) as unknown[] };
}

beforeEach(() => {
  mockQuery.mockReset();
  mockQuery.mockResolvedValue({ rowCount: 0, rows: [] });
});

describe('the documents a conversation built', () => {
  it('filters on the conversation recorded in the document\'s provenance, as a parameter', async () => {
    const res = await request(makeApp())
      .get('/api/authoring/docs?conversationId=ana-ri_1791422302138_3qisj9qga')
      .set('Authorization', await bearer());
    expect(res.status).toBe(200);
    const { sql, params } = listCall();
    expect(sql).toMatch(/to_jsonb\(d\)->'provenance'->>'conversationId' = \$2/);
    expect(params).toEqual([7, 'ana-ri_1791422302138_3qisj9qga']);
  });

  it('narrows to what AnA drafted when asked, with no parameter to inject', async () => {
    await request(makeApp()).get('/api/authoring/docs?source=ana&programId=5ac45b38-a1d8-4a41-9488-fac39a57b852').set('Authorization', await bearer());
    const { sql, params } = listCall();
    expect(sql).toContain("to_jsonb(d)->'provenance'->>'source' = 'ana'");
    expect(params).toEqual([7, '5ac45b38-a1d8-4a41-9488-fac39a57b852']);
  });

  it('returns each document\'s conversation and source, so a list can say where it came from', async () => {
    await request(makeApp()).get('/api/authoring/docs').set('Authorization', await bearer());
    const { sql } = listCall();
    expect(sql).toContain("AS conversation_id");
    expect(sql).toContain("AS provenance_source");
  });

  it('adds no provenance predicate when none is asked for', async () => {
    await request(makeApp()).get('/api/authoring/docs').set('Authorization', await bearer());
    const { sql, params } = listCall();
    expect(sql).not.toMatch(/->>'conversationId' =/);
    expect(sql).not.toMatch(/->>'source' = 'ana'/);
    expect(params).toEqual([7]);
  });
});
