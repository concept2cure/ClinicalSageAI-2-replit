// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const { apiRequest, clearQueries, adoptSession, endSession } = vi.hoisted(() => ({ apiRequest: vi.fn(), clearQueries: vi.fn(), adoptSession: vi.fn(), endSession: vi.fn() }));
vi.mock('@/lib/queryClient', async (original) => ({ ...(await original<typeof import('@/lib/queryClient')>()), apiRequest, queryClient: { clear: clearQueries } }));
vi.mock('@/services/portal/authService', () => ({ authService: { adoptSession, endSession } }));
import { switchOrganization } from '../switchOrganization';
const response = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body }) as Response;
beforeEach(() => {
  vi.clearAllMocks(); localStorage.clear(); sessionStorage.clear();
  sessionStorage.setItem('trialsage_access_token', 'previous-access');
  localStorage.setItem('trialsage_refresh_token', 'previous-refresh');
  localStorage.setItem('currentClientWorkspaceId', 'old-client'); sessionStorage.setItem('c2c.shell-project', '{"id":"old-project"}');
  window.C2C_PROJECT = { id: 'old-project' };
  apiRequest.mockResolvedValue(response({ success: true, token: 'rotated-access', organization: { id: '9', role: 'admin' } }));
  adoptSession.mockImplementation(async () => { sessionStorage.setItem('trialsage_access_token', 'rotated-access'); return { organizationId: '9', roles: ['reviewer'] }; });
});
afterEach(() => { localStorage.clear(); sessionStorage.clear(); delete window.C2C_PROJECT; });
describe('verified tenant-session handoff', () => {
  it('probes the rotated token, preserves session storage choice, clears tenant selection and loads Projects', async () => {
    const navigate = vi.fn(); await switchOrganization(9, navigate);
    expect(apiRequest).toHaveBeenCalledWith('POST', '/api/auth/enterprise/select-organization', { organizationId: 9 });
    expect(adoptSession).toHaveBeenCalledWith('rotated-access', false);
    expect(localStorage.getItem('trialsage_refresh_token')).toBeNull();
    expect(localStorage.getItem('currentClientWorkspaceId')).toBeNull(); expect(sessionStorage.getItem('c2c.shell-project')).toBeNull(); expect(window.C2C_PROJECT).toBeUndefined();
    expect(clearQueries).toHaveBeenCalledOnce(); expect(navigate).toHaveBeenCalledWith('/concept2cure/projects');
  });
  it('does not rotate or clear anything while the editor refuses unload', async () => {
    const hold = (event: Event) => event.preventDefault(); window.addEventListener('beforeunload', hold);
    try { await expect(switchOrganization(9, vi.fn())).rejects.toThrow(/unsaved/); } finally { window.removeEventListener('beforeunload', hold); }
    expect(apiRequest).not.toHaveBeenCalled(); expect(clearQueries).not.toHaveBeenCalled(); expect(sessionStorage.getItem('c2c.shell-project')).not.toBeNull();
  });
  it('preserves the original tenant selection on a refused membership switch', async () => {
    apiRequest.mockResolvedValue(response({ error: 'You do not belong to this organization' }, 403));
    await expect(switchOrganization(9, vi.fn())).rejects.toThrow(/do not belong/);
    expect(adoptSession).not.toHaveBeenCalled(); expect(clearQueries).not.toHaveBeenCalled();
    expect(sessionStorage.getItem('trialsage_access_token')).toBe('previous-access');
  });
  it('ends the spent old session if the destination probe fails rather than retaining an old canvas under a new token', async () => {
    adoptSession.mockResolvedValue(null); const navigate = vi.fn();
    await expect(switchOrganization(9, navigate)).rejects.toThrow(/could not be verified/);
    expect(endSession).toHaveBeenCalledWith(null); expect(navigate).not.toHaveBeenCalled();
  });
});
