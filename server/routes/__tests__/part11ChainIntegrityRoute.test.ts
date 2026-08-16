/**
 * Part 11 audit-trail routing — `/audit-trail/chain-integrity` was shadowed by
 * the earlier `/audit-trail/:entityId` param route, making the hash-chain
 * integrity verifier (a core 21 CFR Part 11 feature) unreachable as a GET. This
 * locks in the fall-through fix: the reserved word reaches the dedicated
 * chain-integrity handler, while ordinary entity ids still hit the entity route.
 */
import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockQuery = vi.fn();

import router from '../part11-compliance';

function makeApp() {
  const app = express();
  app.use(express.json());
  (app as any).pool = { query: mockQuery };
  app.use((req: any, _res, next) => {
    req.dbClient = { query: mockQuery };
    req.user = { id: 1, organizationId: 101, roles: ['admin'] };
    req.tenantContext = { organizationId: 101 };
    next();
  });
  app.use('/api/part11', router);
  return app;
}

describe('part11 audit-trail routing', () => {
  beforeEach(() => { mockQuery.mockReset(); });

  it('reaches the chain-integrity handler (not the :entityId route)', async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    const res = await request(makeApp()).get('/api/part11/audit-trail/chain-integrity');
    expect(res.status).toBe(200);
    // The chain-integrity handler reports chainStatus; the :entityId route would
    // instead return { entries, total, entityId } — so this proves fall-through.
    expect(res.body.data).toHaveProperty('chainStatus');
    expect(res.body.data).not.toHaveProperty('entries');
  });

  /**
   * ROUTING only. This proves the param route still receives an ordinary id —
   * it does NOT prove the route works, and it cannot.
   *
   * It passes because `makeApp` sets `(app as any).pool`, which is what the
   * `:entityId` handler still reads and what production never assigns. That
   * route is deliberately left unconnected (see its comment in the router): it
   * selects six columns that exist on no table it can reach, and has no tenant
   * column to filter on. In production it answers 500 before touching Postgres,
   * and with a working client it would answer 42703 instead.
   *
   * The injection stays because the assertion here is about Express matching
   * `chain-integrity` before `:entityId`, and that is worth keeping. Naming the
   * limit so the green tick is not read as "this endpoint works".
   */
  it('still resolves an ordinary entity id through the :entityId route', async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    const res = await request(makeApp()).get('/api/part11/audit-trail/DOC-42');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('entityId', 'DOC-42');
    expect(res.body.data).toHaveProperty('entries');
  });
});

/**
 * The response keys Part11Console's shape guard requires.
 *
 * `Part11Console.tsx:85` is `hasKeys<ChainIntegrity>('chainStatus', 'totalEntries')`,
 * and `readData` REJECTS a body that fails the guard — the panel then renders
 * its honest error state. So renaming either key on the server does not break a
 * test or throw anywhere: the console silently stops showing chain integrity
 * and says it could not load, which is indistinguishable from the endpoint
 * being down. That is the same silent-failure shape this whole remediation has
 * been about, one layer up.
 *
 * This is the only route in the file with a live client caller, and it has been
 * answering 500 for as long as `req.pool` has been undefined, so the contract
 * has never actually been exercised end to end.
 */
describe('chain-integrity answers the shape Part11Console guards on', () => {
  beforeEach(() => { mockQuery.mockReset(); });

  const GUARDED_KEYS = ['chainStatus', 'totalEntries'] as const;

  it('carries them on the empty chain', async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    const res = await request(makeApp()).get('/api/part11/audit-trail/chain-integrity');
    expect(res.status).toBe(200);
    for (const k of GUARDED_KEYS) expect(res.body.data).toHaveProperty(k);
    expect(res.body.data.chainStatus).toBe('empty');
  });

  it('carries them on a populated, intact chain', async () => {
    mockQuery.mockResolvedValue({
      rows: [
        {
          id: 1, organization_id: 101, sequence_number: 1, event_type: 'CREATE',
          entity_type: 'doc', entity_id: 'D1', user_id: 'u1', user_name: 'A',
          timestamp: new Date('2026-08-14T09:00:00Z'), reason: 'r',
          record_hash: 'whatever', previous_hash: null,
        },
      ],
    });
    const res = await request(makeApp()).get('/api/part11/audit-trail/chain-integrity');
    expect(res.status).toBe(200);
    for (const k of GUARDED_KEYS) expect(res.body.data).toHaveProperty(k);
    // A row whose stored hash does not recompute is a BROKEN chain, and the
    // route must say so rather than rounding to intact — an inspector reads
    // this verdict directly.
    expect(res.body.data.chainStatus).toBe('broken');
    expect(res.body.data.integrityValid).toBe(false);
  });

  it('never reports success:true when the verification could not run', async () => {
    const err: any = new Error('relation "audit_events" does not exist');
    err.code = '42P01';
    mockQuery.mockRejectedValue(err);
    const res = await request(makeApp()).get('/api/part11/audit-trail/chain-integrity');
    expect(res.status).toBe(503);
    expect(res.body.success).toBe(false);
  });
});
