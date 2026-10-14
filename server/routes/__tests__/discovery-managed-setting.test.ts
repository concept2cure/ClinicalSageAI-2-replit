import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { runWithTenantScope } from '../../db/tenantStore';
import { DISCOVERY_NOT_A_GENERAL_SETTING, DiscoverySettingRefusedError } from '../../services/tenant/tenant-settings-writer';
import type { OrgSettings } from '../../services/ana-platform-controller';

const writer = vi.hoisted(() => vi.fn());
vi.mock('../../services/tenant/tenant-settings-writer', async original => ({
  ...await original<typeof import('../../services/tenant/tenant-settings-writer')>(),
  writeTenantSettings: (...args: unknown[]) => writer(...args),
}));
vi.mock('../../auth', () => ({
  authMiddleware: (req: Request, _res: Response, next: NextFunction) => {
    Object.assign(req, { user: { id: 7, organizationId: 2, role: 'admin' }, userId: 7, userRole: 'admin', tenantId: 2 });
    runWithTenantScope({ tenantId: '2', role: 'admin', source: 'test', caller: 'discovery-managed-setting' }, next);
  },
}));
vi.mock('../../middleware/tenantContext', () => ({ requireOrganizationContext: (_req: Request, _res: Response, next: NextFunction) => next() }));

let app: express.Express;
let controller: typeof import('../../services/ana-platform-controller')['anaPlatformController'];
beforeAll(async () => {
  app = express(); app.use(express.json());
  app.use('/api/organizations', (await import('../organizations-routes')).default);
  app.use('/api/tenant-config', (await import('../tenant-config')).default);
  controller = (await import('../../services/ana-platform-controller')).anaPlatformController;
});
beforeEach(() => { writer.mockReset(); });

describe('discovery has one managed settings door', () => {
  it('organization settings refuses bare and governed bodies naming discovery, including null', async () => {
    for (const value of [null, {}, { revision: 999, completedAt: '2026-10-14T00:00:00.000Z' }]) {
      for (const body of [
        { onboardingDiscovery: value },
        { settings: { onboardingDiscovery: value }, reason: 'Bypass discovery endpoint' },
      ]) {
        const res = await request(app).patch('/api/organizations/2/settings').send(body);
        expect(res.status).toBe(403);
        expect(res.body.error).toBe(DISCOVERY_NOT_A_GENERAL_SETTING);
      }
    }
    expect(writer).not.toHaveBeenCalled();
  });

  it('tenant configuration refuses a discovery key before its ordinary settings schema can strip it', async () => {
    for (const value of [null, {}, { revision: 999 }]) {
      const res = await request(app).patch('/api/tenant-config/2/settings').send({ onboardingDiscovery: value });
      expect(res.status).toBe(403);
      expect(res.body.error).toBe(DISCOVERY_NOT_A_GENERAL_SETTING);
    }
    expect(writer).not.toHaveBeenCalled();
  });

  it('AnA cannot replace discovery through generic updateSettings, even as a paid customer', async () => {
    const access = vi.spyOn(controller, 'verifyPaidAccess').mockResolvedValue({ authorized: true });
    try {
      const updates = { onboardingDiscovery: { revision: 999, completedAt: '2026-10-14T00:00:00.000Z' } } as Partial<OrgSettings>;
      const res = await controller.updateSettings(2, updates, {} as Request);
      expect(res).toEqual({ success: false, action: 'update_settings', error: DISCOVERY_NOT_A_GENERAL_SETTING });
      expect(access).not.toHaveBeenCalled();
      expect(writer).not.toHaveBeenCalled();
    } finally { access.mockRestore(); }
  });

  it('general organization settings still works for its ordinary managed sections', async () => {
    writer.mockResolvedValue({ notifications: { weeklyReports: true } });
    const res = await request(app).patch('/api/organizations/2/settings').send({ settings: { notifications: { weeklyReports: true } }, reason: 'Enable weekly reports' });
    expect(res.status).toBe(200);
    expect(writer).toHaveBeenCalledTimes(1);
    expect(writer.mock.calls[0][2]).not.toHaveProperty('discoveryDoor');
  });

  it('the generic API gives a refused-door response if the canonical writer detects a discovery change', async () => {
    writer.mockRejectedValue(new DiscoverySettingRefusedError());
    const res = await request(app).patch('/api/organizations/2/settings').send({ settings: { notifications: { weeklyReports: true } }, reason: 'Enable weekly reports' });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe(DISCOVERY_NOT_A_GENERAL_SETTING);
  });
});
