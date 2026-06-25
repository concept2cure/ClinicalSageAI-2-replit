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

  it('grounds the workspace in the program model (segment, evidence, claims)', async () => {
    const req = createMockRequest({}) as any;
    req.user = { organizationId: 2 };
    req.query = { need: 'NDA' };
    const res = createMockResponse() as any;

    await getHandler('get', '/config')(req, res);

    const { program } = res.json.mock.calls[0][0].data;
    expect(program.segment).toBe('pharma');
    expect(program.evidenceModel).toBe('clinical_efficacy');
    expect(program.validationProfile).toBe('pharma-clinical_efficacy');
    expect(program.requiredClaims.map((c: any) => c.id)).toContain('efficacy');
  });
});

describe('GET /api/workspace/config — region + client-type axes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('defaults the region overlay to the selected type’s own region', async () => {
    const req = createMockRequest({}) as any;
    req.user = { organizationId: 2 };
    req.query = { need: 'NDA' }; // US_NDA → US
    const res = createMockResponse() as any;

    await getHandler('get', '/config')(req, res);

    const { region } = res.json.mock.calls[0][0].data;
    expect(region.code).toBe('US');
    expect(region.m1BackbonePath).toBe('m1/us/us-regional.xml');
    expect(region.requiredModule1Components).toContain('us_356h');
    expect(region.gatewaySizeLimitBytes).toBeGreaterThan(0);
  });

  it('applies a region override with translation mandate (JP)', async () => {
    const req = createMockRequest({}) as any;
    req.user = { organizationId: 2 };
    req.query = { need: 'NDA', region: 'JP' };
    const res = createMockResponse() as any;

    await getHandler('get', '/config')(req, res);

    const { region } = res.json.mock.calls[0][0].data;
    expect(region.code).toBe('JP');
    expect(region.language).toBe('ja');
    expect(region.translationMandate).toMatch(/Japanese/);
  });

  it('presets the client-type overlay from the org industryMode', async () => {
    const req = createMockRequest({}) as any;
    req.user = { organizationId: 2, industryMode: 'medtech' };
    req.query = { need: 'NDA' };
    const res = createMockResponse() as any;

    await getHandler('get', '/config')(req, res);

    const { clientType } = res.json.mock.calls[0][0].data;
    expect(clientType.vertical).toBe('mdx');
    expect(clientType.defaultNeed).toBe('US_510K');
  });

  it('lets an explicit clientType override beat the org industryMode', async () => {
    const req = createMockRequest({}) as any;
    req.user = { organizationId: 2, industryMode: 'medtech' };
    req.query = { need: 'NDA', clientType: 'pharma' };
    const res = createMockResponse() as any;

    await getHandler('get', '/config')(req, res);

    const { clientType } = res.json.mock.calls[0][0].data;
    expect(clientType.vertical).toBe('biopharma');
  });
});

describe('GET /api/workspace/project-map', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns the ordered project map + capability inventory for a known need', async () => {
    const req = createMockRequest({}) as any;
    req.user = { organizationId: 2 };
    req.query = { need: 'BLA' };
    const res = createMockResponse() as any;

    await getHandler('get', '/project-map')(req, res);

    const { data } = res.json.mock.calls[0][0];
    expect(data.known).toBe(true);
    expect(data.scope).toBe('dossier');
    // the full program arc, in order
    expect(data.milestones.map((m: any) => m.phase)).toEqual([
      'strategy', 'quality', 'nonclinical', 'clinical',
      'authoring', 'assembly', 'submission', 'review', 'post_market',
    ]);
    // the inventory says when each ability is first needed
    const cmc = data.inventory.apps.find((a: any) => a.id === 'cmc');
    expect(cmc.firstNeededPhase).toBe('quality');
  });

  it('rejects when the need query parameter is missing (400)', async () => {
    const req = createMockRequest({}) as any;
    req.user = { organizationId: 2 };
    req.query = {};
    const res = createMockResponse() as any;
    await getHandler('get', '/project-map')(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('rejects when tenant context is missing (403)', async () => {
    const req = createMockRequest({}) as any;
    req.query = { need: 'BLA' };
    const res = createMockResponse() as any;
    await getHandler('get', '/project-map')(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
  });
});
