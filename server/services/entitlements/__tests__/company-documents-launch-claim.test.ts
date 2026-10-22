import { beforeEach, describe, expect, it, vi } from 'vitest';

const license = vi.hoisted(() => vi.fn());
vi.mock('../../license-manager.js', () => ({ canAccessModule: license }));
vi.mock('../enforcement-mode.js', () => ({ currentEnforcementMode: async () => ({ mode: 'enforce' }) }));
vi.mock('../master-admin', () => ({ resolveMasterAdmin: async () => false }));

import { buildPrefixMap, modulesForPath, NEVER_GATED } from '../api-prefix-map';
import { launchScopeApiVerdict } from '../launch-scope-api';
import { moduleEntitlementGate } from '../../../middleware/moduleEntitlementGate';

const BASE = '/api/client-branding/company-documents';
const prefixMap = buildPrefixMap();
const verdict = (path: string) => launchScopeApiVerdict(path, prefixMap, NEVER_GATED);

async function requestGate(path: string) {
  const next = vi.fn();
  const res = { status: vi.fn(), json: vi.fn() };
  res.status.mockReturnValue(res);
  await moduleEntitlementGate(prefixMap, { launchScope: 'on', unattributed: 'enforce' })(
    { path, originalUrl: path, tenantContext: { organizationId: 7 } } as any, res as any, next,
  );
  return { next, res };
}

beforeEach(() => { license.mockReset(); license.mockResolvedValue({ allowed: false }); });

describe('shared Company settings and submission documents', () => {
  it.each([BASE, `${BASE}/legal-documents`, `${BASE}/letterhead/extract`, `${BASE}/letterhead/render`])(
    '%s reaches its tenant/actor boundary in commercial enforce mode without a deferred module', async path => {
      expect(verdict(path)).toBe('launch');
      expect(modulesForPath(path, prefixMap)).toBeNull();
      const { next } = await requestGate(path);
      expect(next).toHaveBeenCalledOnce();
      expect(license).not.toHaveBeenCalled();
    },
  );

  it.each(['/api/c2c/templates', '/api/c2c/templates/extract', '/api/c2c/templates/from-upload', '/api/c2c/templates/tpl-1/render'])(
    '%s remains outside launch, including when no template license is held', async path => {
      expect(verdict(path)).toBe('out-of-scope');
      const { next, res } = await requestGate(path);
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: { code: 'LAUNCH_SCOPE', message: expect.any(String) } });
    },
  );

  it.each(['/api/client-branding/unused', `${BASE}-other/letterhead/extract`])('%s is not covered by the narrow company claim', path => {
    expect(verdict(path)).toBe('unmapped');
  });
});
