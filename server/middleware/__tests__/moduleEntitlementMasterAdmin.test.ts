import { beforeEach, describe, expect, it, vi } from 'vitest';
const { masterAdmin, access } = vi.hoisted(() => ({ masterAdmin: vi.fn(), access: vi.fn() }));
vi.mock('../../services/entitlements/master-admin', () => ({ resolveMasterAdmin: masterAdmin }));
vi.mock('../../services/license-manager.js', () => ({ canAccessModule: access }));
vi.mock('../../services/entitlements/enforcement-mode.js', () => ({ currentEnforcementMode: async () => ({ mode: 'enforce' }) }));
vi.mock('../../services/entitlements/enforcement-observations.js', () => ({ recordObservation: vi.fn() }));
import { moduleEntitlementGate } from '../moduleEntitlementGate';
const request = { path: '/api/cmc/registers', user: { id: 4, organizationId: 7, role: 'admin' }, tenantContext: { organizationId: 7 } } as any;
const response = () => { const res = { statusCode: 0, status(code: number) { this.statusCode = code; return this; }, json: vi.fn() }; return res as any; };
beforeEach(() => { vi.clearAllMocks(); masterAdmin.mockResolvedValue(false); access.mockResolvedValue({ allowed: false, reason: 'Professional plan required' }); });
describe('actor entitlement agreement between rail and API', () => {
  it('admits the verified platform owner while preserving the selected organization', async () => {
    masterAdmin.mockResolvedValue(true);
    const next = vi.fn(); const res = response();
    await moduleEntitlementGate(new Map([['/api/cmc', new Set(['cmc'])]]), { launchScope: 'on', unattributed: 'enforce' })(request, res, next);
    expect(next).toHaveBeenCalledOnce(); expect(res.statusCode).toBe(0);
    expect(masterAdmin).toHaveBeenCalledWith(request);
    expect(request.tenantContext.organizationId).toBe(7);
    expect(access).not.toHaveBeenCalled();
  });
  it('still refuses an ordinary organization administrator who lacks the module', async () => {
    const next = vi.fn(); const res = response();
    await moduleEntitlementGate(new Map([['/api/cmc', new Set(['cmc'])]]), { launchScope: 'on', unattributed: 'enforce' })(request, res, next);
    expect(res.statusCode).toBe(403); expect(next).not.toHaveBeenCalled();
    expect(access).toHaveBeenCalledWith(7, 'cmc');
  });
  it('never widens the release boundary for the owner', async () => {
    masterAdmin.mockResolvedValue(true);
    const next = vi.fn(); const res = response();
    await moduleEntitlementGate(new Map([['/api/cmc', new Set(['regulatory-digital-twin'])]]), { launchScope: 'on', unattributed: 'enforce' })(request, res, next);
    expect(res.statusCode).toBe(403); expect(next).not.toHaveBeenCalled();
    expect(masterAdmin).not.toHaveBeenCalled();
  });
});
