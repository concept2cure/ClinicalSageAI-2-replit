import { apiRequest, extractApiError, queryClient, redactInternals } from '@/lib/queryClient';
import { authService } from '@/services/portal/authService';
import { capturedActorHeaders, getAuthToken } from '@/utils/authToken';
import { hasUnsavedSessionWork, reserveSessionChange } from '@/lib/sessionChangeGuard';
import { clearShellProject } from './shellProject';
import { rememberOrganizationSwitchAuditNotice } from './organizationSwitchAuditNotice';

export const ORGANIZATION_SESSION_CHANGED = 'Your session has changed. Reload this page before continuing.';
export interface OrganizationSource { userId: string; organizationId: string }
export interface OrganizationOwner extends OrganizationSource { headers: Record<string, string>; current: () => boolean }
export class OrganizationSwitchFailure extends Error {
  constructor(message: string, readonly requiresSignIn = false, cause?: unknown) { super(message, { cause }); }
}

/** One captured source account for membership reads, consent and rotation. */
export function captureOrganizationOwner(source?: OrganizationSource): OrganizationOwner {
  const user = authService.getUser();
  const identity = source ?? { userId: String(user?.id ?? ''), organizationId: String(user?.organizationId ?? '') };
  try {
    if (!user || String(user.id) !== identity.userId || String(user.organizationId) !== identity.organizationId) throw new Error();
    const headers = capturedActorHeaders({ userId: Number(identity.userId), organizationId: Number(identity.organizationId) });
    return { ...identity, headers, current: () => authService.getUser() === user && headers.Authorization === `Bearer ${getAuthToken()}` };
  } catch { throw new OrganizationSwitchFailure(ORGANIZATION_SESSION_CHANGED); }
}
export function requireOrganizationOwner(owner: OrganizationOwner): void {
  if (!owner.current()) throw new OrganizationSwitchFailure(ORGANIZATION_SESSION_CHANGED);
}

/** Preserve the existing native unload guard as well as the editor reservation. */
export function assertOrganizationSwitchSafe(): void {
  const event = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(event);
  if (event.defaultPrevented) throw new OrganizationSwitchFailure('Save or discard your unsaved document changes before switching organizations. Nothing was switched.');
}
const expiredOrUnknown = (status: number) => status >= 500 || status === 401;
function switchFailure(failure: unknown, rotated: boolean): OrganizationSwitchFailure {
  if (failure instanceof OrganizationSwitchFailure) return failure;
  const status = (failure as { status?: number } | null)?.status;
  if (rotated || !status || expiredOrUnknown(status)) return new OrganizationSwitchFailure(rotated
    ? 'The new organisation could not be opened. Sign in again before continuing.'
    : 'The organisation switch could not be confirmed. Sign in again before continuing.', true, failure);
  return new OrganizationSwitchFailure(redactInternals(failure instanceof Error ? failure.message : null, 'The organisation was not switched. Try again.'), false, failure);
}
async function selectSession(organizationId: number, owner: OrganizationOwner) {
  requireOrganizationOwner(owner);
  const response = await apiRequest('POST', '/api/auth/enterprise/select-organization', { organizationId }, owner.headers);
  const answer = await response.json() as { success?: boolean; token?: unknown; organization?: { id?: unknown } };
  if (!response.ok || answer?.success !== true) throw new OrganizationSwitchFailure(extractApiError(answer, response.status).message, expiredOrUnknown(response.status));
  if (typeof answer.token !== 'string' || !answer.token || String(answer.organization?.id) !== String(organizationId)) {
    throw new OrganizationSwitchFailure('The new organisation session could not be confirmed. Sign in again before continuing.', true);
  }
  return { response, answer: { ...answer, token: answer.token } };
}

const replacementOwnsBearer = (current: string | null, original: string, successor: string | null) =>
  Boolean(current && current !== original && current !== successor);
async function adoptDestination(owner: OrganizationOwner, token: string, organizationId: number) {
  const persistent = !sessionStorage.getItem('trialsage_access_token') && Boolean(localStorage.getItem('trialsage_access_token'));
  const user = await authService.adoptSession(token, persistent, { userId: owner.userId, organizationId: String(organizationId) }, () => !hasUnsavedSessionWork());
  if (!user || String(user.id) !== owner.userId || String(user.organizationId) !== String(organizationId) || getAuthToken() !== token) {
    throw new OrganizationSwitchFailure('The new organisation session could not be verified. Sign in again before continuing.', true);
  }
}

/** Canonical rotation ceremony for Account and the top-bar membership entry. */
export async function switchOrganization(organizationId: number, navigate: (path: string) => void = path => window.location.assign(path), source?: OrganizationSource | OrganizationOwner): Promise<void> {
  if (!Number.isInteger(organizationId) || organizationId < 1) throw new OrganizationSwitchFailure('Choose an organization from your membership list.');
  const owner = source && 'current' in source ? source : captureOrganizationOwner(source);
  requireOrganizationOwner(owner);
  assertOrganizationSwitchSafe();
  const release = reserveSessionChange();
  if (!release) throw new OrganizationSwitchFailure('Save or resolve your unsaved work before switching organisations. Nothing was switched.');
  const originalToken = owner.headers.Authorization.slice('Bearer '.length);
  let successorToken: string | null = null;
  let rotated = false;
  let keepHeld = false;
  try {
    const { response, answer } = await selectSession(organizationId, owner);
    rotated = true; successorToken = answer.token;
    requireOrganizationOwner(owner);
    if (hasUnsavedSessionWork()) throw new Error('Unsaved work changed while the organisation switch was pending.');
    await adoptDestination(owner, answer.token, organizationId);
    if (getAuthToken() !== answer.token) throw new Error(ORGANIZATION_SESSION_CHANGED);
    sessionStorage.removeItem('trialsage_refresh_token'); localStorage.removeItem('trialsage_refresh_token');
    localStorage.removeItem('currentClientWorkspaceId'); localStorage.removeItem('currentModuleId');
    clearShellProject(); queryClient.clear();
    rememberOrganizationSwitchAuditNotice(response.headers, answer);
    navigate('/concept2cure/projects');
    keepHeld = true;
  } catch (failure) {
    const currentToken = getAuthToken();
    if (replacementOwnsBearer(currentToken, originalToken, successorToken)) {
      keepHeld = true;
      throw new OrganizationSwitchFailure(ORGANIZATION_SESSION_CHANGED);
    }
    const refusal = switchFailure(failure, rotated);
    // The server may have spent the source bearer. End only that account's
    // uncertain session and preserve its recoverable device text.
    if (refusal.requiresSignIn || rotated) {
      authService.endSession(null, true);
      throw new OrganizationSwitchFailure(refusal.message, true, failure);
    }
    throw refusal;
  } finally { if (!keepHeld) release(); }
}
