import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockRequest, createMockResponse } from '../setup';

vi.mock('../../server/auth', () => ({
  authMiddleware: (_req: any, _res: any, next: any) => next(),
}));

import globalMarketsRoutes from '../../server/routes/global-markets';

function getHandler(method: 'get' | 'post', path: string) {
  const layer = (globalMarketsRoutes as any).stack.find(
    (l: any) => l.route?.path === path && l.route?.methods?.[method],
  );
  if (!layer) throw new Error(`Missing route ${method.toUpperCase()} ${path}`);
  return layer.route.stack[layer.route.stack.length - 1].handle;
}

describe('GET /api/global-markets', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lists the market registry for an authenticated tenant', async () => {
    const req = createMockRequest({}) as any;
    req.user = { organizationId: 2 };
    const res = createMockResponse() as any;

    await getHandler('get', '/')(req, res);

    const payload = res.json.mock.calls[0][0];
    expect(Array.isArray(payload.data)).toBe(true);
    expect(payload.data.length).toBeGreaterThan(5);
  });

  it('rejects when tenant context is missing (403)', async () => {
    const req = createMockRequest({}) as any;
    const res = createMockResponse() as any;
    await getHandler('get', '/')(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
  });
});

describe('POST /api/global-markets/plan', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns a multi-market plan for an authenticated tenant', async () => {
    const req = createMockRequest({
      body: {
        profile: { name: 'Acme Analyzer', isIvd: true, availableArtifacts: [] },
        targetMarkets: ['us-fda', 'eu-mdr-ivdr'],
      },
    }) as any;
    req.user = { organizationId: 2 };
    const res = createMockResponse() as any;

    await getHandler('post', '/plan')(req, res);

    const payload = res.json.mock.calls[0][0];
    expect(payload.data).toBeDefined();
    expect(Array.isArray(payload.data.marketPlans)).toBe(true);
    // honest invariant: platform transmits to no authority
    expect(payload.data.transmitCapableMarkets).toEqual([]);
  });

  it('rejects an invalid body (400)', async () => {
    const req = createMockRequest({ body: { profile: { name: 'x' } } }) as any;
    req.user = { organizationId: 2 };
    const res = createMockResponse() as any;
    await getHandler('post', '/plan')(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('rejects when tenant context is missing (403)', async () => {
    const req = createMockRequest({ body: { profile: { name: 'x', isIvd: false, availableArtifacts: [] }, targetMarkets: [] } }) as any;
    const res = createMockResponse() as any;
    await getHandler('post', '/plan')(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
  });
});
