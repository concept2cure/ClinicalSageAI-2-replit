import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockController = {
  getSettings: vi.fn(),
  updateSettings: vi.fn(),
  listCapabilities: vi.fn(),
  toggleModule: vi.fn(),
  createProject: vi.fn(),
  updateProject: vi.fn(),
  configureAI: vi.fn(),
  setComplianceDefaults: vi.fn(),
  onboardOrganization: vi.fn(),
  analyzeUsage: vi.fn(),
  executeAction: vi.fn(),
};

vi.mock('../../services/ana-platform-controller', () => ({
  anaPlatformController: mockController,
}));

describe('AnA platform control route org binding', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects org id from query/body fallback when auth tenant context is missing', async () => {
    const { default: router } = await import('../../routes/ana-platform-control');
    const app = express();
    app.use(express.json());
    app.use('/api/ana/platform', router);

    const res = await request(app).get('/api/ana/platform/capabilities?organizationId=999');

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Organization ID required');
    expect(mockController.listCapabilities).not.toHaveBeenCalled();
  });

  it('returns entitlements when tenant context provides organization id', async () => {
    mockController.listCapabilities.mockResolvedValue({
      success: true,
      action: 'list_capabilities',
      result: {
        capabilities: [
          { id: 'deep_research', enabled: true },
          { id: 'e_signatures', enabled: false },
        ],
      },
    });

    const { default: router } = await import('../../routes/ana-platform-control');
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      (req as any).tenantContext = { organizationId: 42 };
      next();
    });
    app.use('/api/ana/platform', router);

    const res = await request(app).get('/api/ana/platform/entitlements');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.result.orgId).toBe(42);
    expect(res.body.result.enabledModuleIds).toContain('deep_research');
    expect(res.body.result.disabledModuleIds).toContain('e_signatures');
    expect(mockController.listCapabilities).toHaveBeenCalledWith(42);
  });
});


/**
 * IAM-20 (2026-10-01): every write in this router changes organisation-wide
 * configuration (settings, AI configuration, compliance defaults, module
 * toggles, onboarding) or creates a project outside the Projects app, and
 * /execute dispatches any of them. Behind the session gate alone, any member
 * of the organisation could do all of it. Writes now need the owner or admin
 * role, the same as tenant-config's settings writes; reads are unchanged.
 */
describe('AnA platform control: writes need the owner or admin role', () => {
  const WRITES: Array<[method: 'patch' | 'post', path: string, controller: keyof typeof mockController]> = [
    ['patch', '/settings', 'updateSettings'],
    ['post', '/modules/toggle', 'toggleModule'],
    ['post', '/projects', 'createProject'],
    ['patch', '/projects/7', 'updateProject'],
    ['patch', '/ai-config', 'configureAI'],
    ['patch', '/compliance', 'setComplianceDefaults'],
    ['post', '/onboard', 'onboardOrganization'],
    ['post', '/execute', 'executeAction'],
  ];

  async function appAs(role: string) {
    const { default: router } = await import('../../routes/ana-platform-control');
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      (req as any).tenantContext = { organizationId: 42 };
      (req as any).user = { id: 7, role, roles: [role] };
      (req as any).userId = 7;
      next();
    });
    app.use('/api/ana/platform', router);
    return app;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    for (const fn of Object.values(mockController)) fn.mockResolvedValue({ success: true, result: {} });
  });

  it.each(WRITES)('a member %s %s is refused before the controller runs', async (method, path, controller) => {
    const app = await appAs('member');
    const res = await request(app)[method](`/api/ana/platform${path}`).send({ category: 'settings', action: 'x', moduleId: 'm', enabled: true, name: 'P' });
    expect(res.status).toBe(403);
    expect(mockController[controller]).not.toHaveBeenCalled();
  });

  it('an admin may still change settings', async () => {
    const app = await appAs('admin');
    const res = await request(app).patch('/api/ana/platform/settings').send({ theme: 'x' });
    expect(res.status).toBe(200);
    expect(mockController.updateSettings).toHaveBeenCalledWith(42, { theme: 'x' }, 7);
  });

  it('a member may still read settings', async () => {
    const app = await appAs('member');
    const res = await request(app).get('/api/ana/platform/settings');
    expect(res.status).toBe(200);
    expect(mockController.getSettings).toHaveBeenCalledWith(42);
  });
});
