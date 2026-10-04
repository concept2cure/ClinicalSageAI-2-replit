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
    // The request itself, so the settings writer uses its connection, its
    // tenant scope and its actor (P1-49): not a bare user id.
    expect(mockController.updateSettings).toHaveBeenCalledWith(
      42,
      { theme: 'x' },
      expect.objectContaining({ method: 'PATCH', userId: 7 })
    );
  });

  it('a member may still read settings', async () => {
    const app = await appAs('member');
    const res = await request(app).get('/api/ana/platform/settings');
    expect(res.status).toBe(200);
    expect(mockController.getSettings).toHaveBeenCalledWith(42);
  });
});

/**
 * P1-49 (DP-58): the settings writes go through the one settings writer
 * (services/tenant/tenant-settings-writer.ts), which writes the change and its
 * chained audit row in one transaction and throws when either is refused. A
 * write that throws was not made: the route answers 500, says so calmly, and
 * never reports success or carries the error's text.
 * tests/db/role-config-change-audit.dbtest.ts proves the writer on PostgreSQL.
 */
describe('AnA platform control: a settings write that is refused is not reported as saved', () => {
  const SETTINGS_WRITES: Array<[method: 'patch' | 'post', path: string, controller: keyof typeof mockController, body: object]> = [
    ['patch', '/settings', 'updateSettings', { theme: 'x' }],
    ['post', '/modules/toggle', 'toggleModule', { moduleId: 'm', enabled: true }],
    ['patch', '/ai-config', 'configureAI', { defaultModel: 'm' }],
    ['patch', '/compliance', 'setComplianceDefaults', { frameworks: ['FDA'] }],
    ['post', '/onboard', 'onboardOrganization', { therapeuticArea: 'a', primaryAgency: 'FDA', submissionType: 'NDA' }],
    ['post', '/execute', 'executeAction', { category: 'settings', action: 'x', parameters: {} }],
  ];

  async function adminApp() {
    const { default: router } = await import('../../routes/ana-platform-control');
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      (req as any).tenantContext = { organizationId: 42 };
      (req as any).user = { id: 7, role: 'admin', roles: ['admin'] };
      (req as any).userId = 7;
      next();
    });
    app.use('/api/ana/platform', router);
    return app;
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each(SETTINGS_WRITES)('%s %s: the request reaches the controller', async (method, path, controller, body) => {
    mockController[controller].mockResolvedValue({ success: true, result: {} });
    const app = await adminApp();
    const res = await request(app)[method](`/api/ana/platform${path}`).send(body);
    expect(res.status).toBe(200);
    const call = mockController[controller].mock.calls[0];
    expect(call[call.length - 1], 'the request is the last argument').toEqual(
      expect.objectContaining({ userId: 7, method: method.toUpperCase() })
    );
  });

  it.each(SETTINGS_WRITES)('%s %s: a refused write is a 500 with no detail, never a success', async (method, path, controller, body) => {
    mockController[controller].mockRejectedValue(new Error('probe: the audit store refused the row'));
    const app = await adminApp();
    const res = await request(app)[method](`/api/ana/platform${path}`).send(body);
    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({ success: false });
    expect(typeof res.body.error).toBe('string');
    expect(res.text).not.toContain('probe');
  });
});
