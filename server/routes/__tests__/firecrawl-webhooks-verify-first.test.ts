/**
 * POST /api/firecrawl-webhooks must verify before it writes anything.
 *
 * The route is public — on the session-auth open list
 * (server/bootstrap/register-platform-routes.ts) and mounted unconditionally
 * (server/startup/middleware.ts). Until 2026-09-24 it INSERTed an audit row into
 * `external_tool_audit_log` BEFORE checking the signature, with no catch, in the
 * platform super-admin scope, for every request from anyone.
 *
 * That table is on no applier, so in production each request raised 42P01 and
 * answered 500 instead of its contract's 401. And with FIRECRAWL_WEBHOOK_SECRET
 * unset — the launch posture, Firecrawl being outside the launch catalog —
 * verification always fails, so unverified requests are the only ones production
 * gets. Had the table existed, the route would have been an unauthenticated,
 * RLS-bypassing write any internet client could repeat.
 *
 * The pool here fails the way production's does, so the old order is a 500 and
 * the fixed order is a 401 that never reaches the pool.
 */
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import express from 'express';
import request from 'supertest';

const query = vi.fn(async () => {
  const err = new Error('relation "external_tool_audit_log" does not exist') as Error & { code: string };
  err.code = '42P01';
  throw err;
});
vi.mock('../../db', () => ({ getPool: () => ({ query }) }));

const { default: router } = await import('../firecrawl-webhooks');

function app() {
  const a = express();
  a.use('/api/firecrawl-webhooks', router);
  return a;
}

describe('POST /api/firecrawl-webhooks — verify first, write nothing for a stranger', () => {
  const original = process.env.FIRECRAWL_WEBHOOK_SECRET;
  beforeEach(() => {
    query.mockClear();
    delete process.env.FIRECRAWL_WEBHOOK_SECRET; // the launch posture
  });
  afterAll(() => {
    if (original === undefined) delete process.env.FIRECRAWL_WEBHOOK_SECRET;
    else process.env.FIRECRAWL_WEBHOOK_SECRET = original;
  });

  it('an unsigned request answers 401, not 500', async () => {
    const res = await request(app()).post('/api/firecrawl-webhooks').send('{"event":"x"}');
    expect(res.status).toBe(401);
  });

  it('an unsigned request never reaches the database', async () => {
    await request(app()).post('/api/firecrawl-webhooks').send('{"event":"x"}');
    expect(query).not.toHaveBeenCalled();
  });

  it('a badly signed request, with a secret configured, is refused the same way', async () => {
    process.env.FIRECRAWL_WEBHOOK_SECRET = 'configured-secret';
    const res = await request(app())
      .post('/api/firecrawl-webhooks')
      .set('x-firecrawl-signature', 'not-a-valid-signature')
      .send('{"event":"x"}');
    expect(res.status).toBe(401);
    expect(query).not.toHaveBeenCalled();
  });
});
