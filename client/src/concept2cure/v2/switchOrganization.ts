import { apiRequest, queryClient, serverMessage } from '@/lib/queryClient';
import { authService } from '@/services/portal/authService';
import { clearShellProject } from './shellProject';
import { rememberOrganizationSwitchAuditNotice } from './organizationSwitchAuditNotice';

/** Ask the native editor's existing unload guard before rotating a tenant
 * token. A refused switch must not leave an old-organization canvas running
 * under a newly scoped token. Device drafts remain preserved. */
export function assertOrganizationSwitchSafe(): void {
  const event = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(event);
  if (event.defaultPrevented) throw new Error('Save or discard your unsaved document changes before switching organizations.');
}

export async function switchOrganization(organizationId: number, navigate: (path: string) => void = (path) => window.location.assign(path)): Promise<void> {
  if (!Number.isInteger(organizationId) || organizationId < 1) throw new Error('Choose an organization from your membership list.');
  assertOrganizationSwitchSafe();
  const persistent = !sessionStorage.getItem('trialsage_access_token') && Boolean(localStorage.getItem('trialsage_access_token'));
  const response = await apiRequest('POST', '/api/auth/enterprise/select-organization', { organizationId });
  const body = await response.json().catch(() => null);
  if (!response.ok || body?.success !== true || typeof body.token !== 'string' || String(body.organization?.id) !== String(organizationId)) {
    throw new Error(serverMessage(body) ?? 'The organization switch was not confirmed.');
  }
  try {
    const user = await authService.adoptSession(body.token, persistent);
    if (!user || String(user.organizationId) !== String(organizationId)) throw new Error('The new organization session could not be verified. Sign in again.');
  } catch (error) {
    // The old access token was spent by rotation. Never keep displaying the
    // old workspace as an authenticated session if adoption failed.
    authService.endSession(null); throw error;
  }
  // A hand-off carries no refresh token. Do not recover one from a different
  // storage tier and later refresh back into the previous organization.
  sessionStorage.removeItem('trialsage_refresh_token'); localStorage.removeItem('trialsage_refresh_token');
  localStorage.removeItem('currentClientWorkspaceId'); localStorage.removeItem('currentModuleId');
  clearShellProject(); queryClient.clear();
  rememberOrganizationSwitchAuditNotice(response.headers, body);
  navigate('/concept2cure/projects');
}
