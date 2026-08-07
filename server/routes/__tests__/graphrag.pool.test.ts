/**
 * GraphRAG pool resolution.
 *
 * Every GraphRAG route read its pg pool from `(req as any).pool ||
 * (req.app as any).pool` — but the router is mounted with no per-request pool
 * injection and nothing ever sets `req.pool` / `req.app.pool`, so both were
 * always undefined and every route 500'd on `pool.query` of undefined
 * (independent of RLS: the pool was never wired at all).
 *
 * This mounts the router on a bare app that sets NEITHER field — exactly
 * production — and asserts a route succeeds by falling back to the canonical
 * `getPool()`. Before the fix this request 500s; the spy also proves the
 * fallback path is the one taken.
 */

import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

// A stub pool that answers any SELECT with one graph-node-shaped row, enough for
// the /communities handler to map entities + edges and return success.
const stubPool = {
  query: vi.fn(async () => ({
    rows: [
      {
        id: 'n1',
        entity_type: 'drug',
        name: 'Aspirin',
        description: null,
        metadata: {},
        confidence: 0.8,
        source_id: 'n1',
        target_id: 'n1',
        relationship_type: 'TREATS',
        weight: 1,
      },
    ],
    rowCount: 1,
  })),
};

const getPoolSpy = vi.fn(() => stubPool);
vi.mock('../../db', () => ({ getPool: () => getPoolSpy() }));

describe('GraphRAG routes resolve a pool when none is injected on the request', () => {
  it('falls back to getPool() instead of 500-ing on an undefined pool', async () => {
    const graphrag = (await import('../graphrag')).default;

    const app = express();
    app.use(express.json());
    // Deliberately set NEITHER app.pool NOR a req.pool middleware — the exact
    // production mount, where the old code found `undefined`.
    app.use('/api/graphrag', graphrag);

    const res = await request(app).get('/api/graphrag/communities');

    expect(res.status).toBe(200);
    expect(res.body?.success).toBe(true);
    // The fallback path — not an injected pool — is what served the request.
    expect(getPoolSpy).toHaveBeenCalled();
    expect(stubPool.query).toHaveBeenCalled();
  });
});
