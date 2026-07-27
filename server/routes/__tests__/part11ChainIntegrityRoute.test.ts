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
    req.pool = { query: mockQuery };
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

  it('still resolves an ordinary entity id through the :entityId route', async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    const res = await request(makeApp()).get('/api/part11/audit-trail/DOC-42');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('entityId', 'DOC-42');
    expect(res.body.data).toHaveProperty('entries');
  });
});
