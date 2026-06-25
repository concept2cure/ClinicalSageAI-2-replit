import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockRequest, createMockResponse } from '../setup';

vi.mock('../../server/auth', () => ({
  authMiddleware: (_req: any, _res: any, next: any) => next(),
}));

import workspaceRoutes from '../../server/routes/workspace-config.routes';

function getHandler(method: 'get' | 'post', path: string) {
  const layer = (workspaceRoutes as any).stack.find(
    (l: any) => l.route?.path === path && l.route?.methods?.[method],
  );
  if (!layer) throw new Error(`Missing route ${method.toUpperCase()} ${path}`);
  return layer.route.stack[layer.route.stack.length - 1].handle;
}

describe('GET /api/workspace/selection-catalog', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns the unified need catalog for an authenticated tenant', async () => {
    const req = createMockRequest({}) as any;
    req.user = { organizationId: 2 };
    const res = createMockResponse() as any;

    await getHandler('get', '/selection-catalog')(req, res);

    const payload = res.json.mock.calls[0][0];
    expect(Array.isArray(payload.data)).toBe(true);
    // Multiple scope groups, and a healthy number of selectable needs.
    expect(payload.data.length).toBeGreaterThan(1);
    const total = payload.data.reduce((n: number, g: any) => n + g.options.length, 0);
    expect(total).toBeGreaterThan(100);
  });

  it('rejects when tenant context is missing (403)', async () => {
    const req = createMockRequest({}) as any;
    const res = createMockResponse() as any;
    await getHandler('get', '/selection-catalog')(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
  });
});

describe('GET /api/workspace/config', () => {
  beforeEach(() => vi.clearAllMocks());

  it('resolves a tailored workspace for a known need', async () => {
    const req = createMockRequest({}) as any;
    req.user = { organizationId: 2 };
    req.query = { need: 'NDA' };
    const res = createMockResponse() as any;

    await getHandler('get', '/config')(req, res);

    const payload = res.json.mock.calls[0][0];
    expect(payload.data.known).toBe(true);
    expect(payload.data.resolved.id).toBe('US_NDA');
    expect(payload.data.scope).toBe('dossier');
    expect(Array.isArray(payload.data.apps)).toBe(true);
    expect(payload.data.apps.length).toBeGreaterThan(0);
  });

  it('rejects when the need query parameter is missing (400)', async () => {
    const req = createMockRequest({}) as any;
    req.user = { organizationId: 2 };
    req.query = {};
    const res = createMockResponse() as any;
    await getHandler('get', '/config')(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('rejects when tenant context is missing (403)', async () => {
    const req = createMockRequest({}) as any;
    req.query = { need: 'NDA' };
    const res = createMockResponse() as any;
    await getHandler('get', '/config')(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
  });
});
