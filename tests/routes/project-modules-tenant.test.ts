import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockRequest, createMockResponse, expectStatus } from '../setup';

const bridgeMocks = vi.hoisted(() => ({
  getProjectModules: vi.fn(),
  getModuleSummary: vi.fn(),
  linkModule: vi.fn(),
  bulkLink: vi.fn(),
  unlinkModule: vi.fn(),
  updateModuleStatus: vi.fn(),
  findProjectsForModule: vi.fn(),
  getOrganizationModuleStats: vi.fn(),
}));

vi.mock('../../server/services/project-module-bridge', () => ({
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

    expect(bridgeMocks.unlinkModule).toHaveBeenCalledWith(12, 'cer', 44, 3, 9);
    expect(res.json).toHaveBeenCalledWith({ message: 'Module unlinked successfully' });
  });

  it('passes tenant org/workspace to updateModuleStatus', async () => {
    bridgeMocks.updateModuleStatus.mockResolvedValue({
      id: 1,
      projectId: 12,
      moduleType: 'cer',
      moduleInstanceId: 44,
      status: 'completed',
    });

    const req = createMockRequest({
      params: { projectId: '12', moduleType: 'cer', moduleInstanceId: '44' },
      body: { status: 'completed' },
      headers: { 'x-client-workspace-id': '9' },
    }) as any;
    req.user = { id: 7, organizationId: 3 };

    const res = createMockResponse();
    const handler = getRouteHandler(
      '/:projectId/modules/:moduleType/:moduleInstanceId/status',
      'patch'
    );
    expect(handler).toBeDefined();

    await handler!(req, res);

    expect(bridgeMocks.updateModuleStatus).toHaveBeenCalledWith(12, 'cer', 44, 'completed', 3, 9);
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
