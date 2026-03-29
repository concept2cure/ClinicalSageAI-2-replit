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

