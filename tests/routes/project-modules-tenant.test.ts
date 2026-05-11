import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockRequest, createMockResponse, expectStatus } from '../setup';

const bridgeMocks = vi.hoisted(() => ({
  getProjectModules: vi.fn(),
  getModuleSummary: vi.fn(),
  linkModule: vi.fn(),
  bulkLink: vi.fn(),
  unlinkModule: vi.fn(),
  updateModuleLink: vi.fn(),
  findProjectsForModule: vi.fn(),
  getOrganizationModuleStats: vi.fn(),
}));

vi.mock('../../server/services/project-module-bridge', () => ({
  SUPPORTED_PROJECT_MODULE_TYPES: [
    'cer',
    'csr',
    'ectd',
    'vault',
    'protocol',
    'literature',
    'regulatory_intelligence',
    'analytics',
    'faers',
    'risk',
    'ind',
    '510k',
    'cmc',
    'pma',
  ],
  projectModuleBridge: bridgeMocks,
}));

import projectModulesRouter from '../../server/routes/project-modules';

const getRouteHandler = (path: string, method: 'get' | 'post' | 'patch' | 'delete') => {
  const layer = (projectModulesRouter as any).stack.find(
    (l: any) => l.route?.path === path && l.route?.methods?.[method]
  );
  return layer?.route?.stack?.[layer.route.stack.length - 1]?.handle as
    | ((req: any, res: any) => Promise<void>)
    | undefined;
};

describe('project-modules tenant/workspace enforcement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('passes tenant org/workspace to unlinkModule', async () => {
    bridgeMocks.unlinkModule.mockResolvedValue(true);

    const req = createMockRequest({
      params: { projectId: '12', moduleType: 'cer', moduleInstanceId: '44' },
      headers: { 'x-client-workspace-id': '9' },
    }) as any;
    req.user = { id: 7, organizationId: 3 };

    const res = createMockResponse();
    const handler = getRouteHandler('/:projectId/modules/:moduleType/:moduleInstanceId', 'delete');
    expect(handler).toBeDefined();

    await handler!(req, res);

    // unlinkModule signature was tightened to (projectId, organizationId,
    // moduleType, moduleInstanceId) — was previously
    // (projectId, moduleType, moduleInstanceId, organizationId, clientWorkspaceId).
    // The two trailing args were dropped when workspace-scope was unified into
    // the org-scope check inside the bridge service. Test updated to match.
    expect(bridgeMocks.unlinkModule).toHaveBeenCalledWith(12, 3, 'cer', 44);
    // Response shape was simplified to { success: true } from the prior
    // { message: 'Module unlinked successfully' }. The DELETE route now
    // mirrors the POST/PATCH conventions.
    expect(res.json).toHaveBeenCalledWith({ success: true });
  });

  it('passes tenant org to updateModuleLink', async () => {
    bridgeMocks.updateModuleLink.mockResolvedValue({
      id: 1,
      projectId: 12,
      moduleType: 'cer',
      moduleInstanceId: 44,
      status: 'completed',
    });

    const req = createMockRequest({
      params: { projectId: '12', moduleType: 'cer', moduleInstanceId: '44' },
      body: { status: 'completed', metadata: { source: 'test' } },
      headers: { 'x-client-workspace-id': '9' },
    }) as any;
    req.user = { id: 7, organizationId: 3 };

    const res = createMockResponse();
    const handler = getRouteHandler('/:projectId/modules/:moduleType/:moduleInstanceId', 'patch');
    expect(handler).toBeDefined();

    await handler!(req, res);

    expect(bridgeMocks.updateModuleLink).toHaveBeenCalledWith(
      12, 3, 'cer', 44, { status: 'completed', metadata: { source: 'test' } }
    );
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 1,
        projectId: 12,
        moduleType: 'cer',
        moduleInstanceId: 44,
        status: 'completed',
      })
    );
  });

  it('rejects invalid moduleType on /find query', async () => {
    const req = createMockRequest({
      query: { moduleType: 'unknown', moduleInstanceId: '1' } as any,
      headers: { 'x-client-workspace-id': '9' },
    }) as any;
    req.user = { id: 7, organizationId: 3 };

    const res = createMockResponse();
    const handler = getRouteHandler('/find', 'get');
    expect(handler).toBeDefined();

    await handler!(req, res);

    expect(bridgeMocks.findProjectsForModule).not.toHaveBeenCalled();
    expectStatus(res, 400);
  });
});
