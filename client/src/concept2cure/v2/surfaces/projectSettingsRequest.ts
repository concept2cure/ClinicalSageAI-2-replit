import { ApiRequestError, apiRequest, serverMessage } from '@/lib/queryClient';
import { capturedActorHeaders } from '@/utils/authToken';
import { isProjectSettingsEnvelope, type ProjectSettingsEnvelope, type ProjectSettingsScope, type ProjectSettingsWrite } from '@shared/project-settings';
import { mutationUnconfirmed } from '../mutationOutcome';

export type ProjectSettingsAnswer =
  | { kind: 'confirmed'; envelope: ProjectSettingsEnvelope }
  | { kind: 'unavailable' | 'refused' | 'unconfirmed' | 'retired'; message: string; code?: string; status?: number };
const retired = (): ProjectSettingsAnswer => ({ kind: 'retired', message: 'The project, workspace or signed-in account changed. Reopen project settings. A change already sent may have completed.' });
const unknown = (): ProjectSettingsAnswer => ({ kind: 'unconfirmed', message: 'The settings save could not be confirmed. Reload saved settings before another change; your request may have been saved.' });
const object = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
function errorCode(body: unknown): string | undefined {
  if (!object(body)) return undefined;
  const error = body.error;
  return typeof error === 'string' ? error : typeof body.code === 'string' ? body.code
    : object(error) && typeof error.code === 'string' ? error.code : undefined;
}

/** The token is reread at each boundary; ordinary refresh may retain the actor. */
export function projectSettingsHeaders(scope: ProjectSettingsScope, isCurrent: () => boolean): Record<string, string> | null {
  if (!isCurrent()) return null;
  try {
    const headers = capturedActorHeaders({ userId: scope.actorUserId, organizationId: scope.organizationId });
    if (scope.clientWorkspaceId != null) headers['x-client-id'] = String(scope.clientWorkspaceId);
    return headers;
  } catch { return null; }
}
function failure(write: ProjectSettingsWrite | undefined, status?: number, body?: unknown, codeHint?: string): ProjectSettingsAnswer {
  const code = errorCode(body) ?? codeHint;
  if (write && mutationUnconfirmed(status, code?.endsWith('OUTCOME_UNKNOWN') ? 'OUTCOME_UNKNOWN' : code)) return unknown();
  return { kind: write ? 'refused' : 'unavailable', code, status, message: serverMessage(body) || (write
    ? 'The settings change was refused. Reload saved settings before making another change.'
    : 'Project settings could not be verified. Retry the settings read.') };
}

/** Retain the full scoped and audited envelope; the shared guard owns its wire. */
export async function requestProjectSettings(scope: ProjectSettingsScope, isCurrent: () => boolean,
  write?: ProjectSettingsWrite): Promise<ProjectSettingsAnswer> {
  const headers = projectSettingsHeaders(scope, isCurrent);
  if (!headers) return retired();
  try {
    const res = await apiRequest(write ? 'PATCH' : 'GET', `/api/c2c/projects/${encodeURIComponent(scope.programId)}/settings`, write, headers);
    const body: unknown = await res.json().catch(() => null);
    if (!projectSettingsHeaders(scope, isCurrent)) return retired();
    if (!res.ok) return failure(write, res.status, body);
    if (!isProjectSettingsEnvelope(body, scope, write)) return write ? unknown() : failure(undefined);
    return { kind: 'confirmed', envelope: body };
  } catch (error) {
    if (!projectSettingsHeaders(scope, isCurrent)) return retired();
    return error instanceof ApiRequestError ? failure(write, error.status, error.payload, error.code) : failure(write);
  }
}
