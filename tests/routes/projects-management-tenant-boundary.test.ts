import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createMockRequest,
  createMockResponse,
  expectStatus,
} from '../setup';

const mockDb = {
  select: vi.fn(() => ({
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        limit: vi.fn().mockResolvedValue([
          {
            id: 99,
            name: 'Test Org',
            slug: 'test-org',
            industryMode: 'pharmaceutical',
            tier: 'standard',
            maxUsers: 5,
            maxProjects: 10,
            maxStorage: 5,
          },
        ]),
      })),
    })),
  })),
  insert: vi.fn(() => ({
    values: vi.fn(() => ({
      returning: vi.fn().mockResolvedValue([
        {
          id: 101,
          name: 'Default Workspace',
        },
      ]),
    })),
  })),
  delete: vi.fn(),
  update: vi.fn(),
};

vi.mock('../../server/db', () => ({
  db: mockDb,
}));

vi.mock('@shared/schema', () => ({
  auditEvents: {},
  projects: {
    id: { name: 'id' },
    organizationId: { name: 'organization_id' },
    clientWorkspaceId: { name: 'client_workspace_id' },
  },
  clientWorkspaces: {
    id: { name: 'id' },
    organizationId: { name: 'organization_id' },
  },
  organizations: { id: { name: 'id' } },
}));

vi.mock('../../server/services/quotaEnforcementService.js', () => ({
  default: {
    getActiveLicenseForOrganization: vi.fn(async () => ({ id: 'lic_1' })),
  },
}));

vi.mock('../../server/services/rules-engine', () => ({
  emitRuleEvent: vi.fn(async () => undefined),
}));

vi.mock('../../server/services/atomicQuotaService.js', () => ({
  atomicCreateProject: vi.fn(async (_organizationId: number) => ({
    success: true,
    data: { id: 555, name: 'Created Project' },
    quotaInfo: { used: 1, maximum: 10, remaining: 9 },
  })),
}));

describe('projects-management tenant boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects create when payload organizationId mismatches authenticated tenant', async () => {
    const routerModule = await import('../../server/routes/projects-management');
    const router = routerModule.default;
    const layer = router.stack.find(
      (l: any) => l.route?.path === '/' && l.route?.methods?.post
    );
    const handler = layer.route.stack[layer.route.stack.length - 1].handle;

    const req = createMockRequest({
      body: {
        name: 'Tenant Boundary Project',
        type: 'regulatory_submission',
        priority: 'medium',
        organizationId: 999,
      },
    }) as any;
    req.ip = '127.0.0.1';
    req.get = vi.fn(() => 'vitest');
    req.user = { organizationId: 1 };
    req.tenantContext = {
      organizationId: 1,
      clientWorkspaceId: 1,
    };
    req.headers = {
      'x-organization-id': '1',
      'x-client-workspace-id': '1',
    };

    const res = createMockResponse();
    await handler(req, res);

    expectStatus(res, 403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'organizationId in payload does not match authenticated tenant',
      })
    );
  });

  it('allows create when payload organizationId matches authenticated tenant', async () => {
    const routerModule = await import('../../server/routes/projects-management');
    const router = routerModule.default;
    const layer = router.stack.find(
      (l: any) => l.route?.path === '/' && l.route?.methods?.post
    );
    const handler = layer.route.stack[layer.route.stack.length - 1].handle;

    const req = createMockRequest({
      body: {
        name: 'Tenant Safe Project',
        type: 'regulatory_submission',
        priority: 'medium',
        organizationId: 1,
      },
    }) as any;
    req.ip = '127.0.0.1';
    req.get = vi.fn(() => 'vitest');
    req.user = { organizationId: 1 };
    req.tenantContext = {
      organizationId: 1,
      clientWorkspaceId: 1,
    };
    req.headers = {
      'x-organization-id': '1',
      'x-client-workspace-id': '1',
    };

    const res = createMockResponse();
    await handler(req, res);

    expectStatus(res, 201);
  });
});
