import { ApiRequestError, apiRequest, serverMessage } from '@/lib/queryClient';
import { capturedActorHeaders } from '@/utils/authToken';
import { isProjectSharingResponse, type ProjectSharingResponse, type ProjectSharingScope } from '@shared/project-sharing';

export type SharingWrite = { memberId: number; role: 'use' | 'edit' } | { memberId: number; role?: never };
export type SharingAnswer =
  | { kind: 'confirmed'; data: ProjectSharingResponse; auditWarning: string | null }
  | { kind: 'unavailable' | 'unconfirmed' | 'refused' | 'retired'; message: string };
const object = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

function auditWarning(body: unknown): string | null {
  const meta = object(body) && object(body.meta) ? body.meta : null;
  const audit = meta && object(meta.auditTrail) ? meta.auditTrail : null;
  if (audit?.persisted === true && audit.attributed === false) return 'The sharing change and audit entry were saved, but the audit attribution could not be confirmed. Check the audit history.';
  if (audit?.persisted === true) return null;
  return 'The sharing change was saved, but its audit entry could not be confirmed. Check the audit history before treating this as a complete governed change.';
}

function failure(method: string, status?: number, payload?: unknown): SharingAnswer {
  if (method !== 'GET' && (!status || status >= 500)) {
    return { kind: 'unconfirmed', message: 'Could not confirm the sharing change. Refresh sharing before retrying; the change may have reached the server.' };
  }
  return { kind: method === 'GET' ? 'unavailable' : 'refused',
    message: serverMessage(payload) || (method === 'GET' ? 'Project sharing could not be verified. Retry the read.' : 'The server refused the sharing change. Refresh sharing to check current access.') };
}

function confirmsWrite(data: ProjectSharingResponse, method: string, write?: SharingWrite): boolean {
  if (!write || method === 'GET') return true;
  const member = data.members.find(row => row.userId === write.memberId);
  return method === 'DELETE' ? !member?.explicit : Boolean(member?.explicit && member.role === write.role);
}

function readAnswer(res: Response, body: unknown, scope: ProjectSharingScope, method: string, write?: SharingWrite): SharingAnswer {
  if (!res.ok) return failure(method, res.status, body);
  const pendingStore = object(body) && object(body.meta) && body.meta.pendingStore === true;
  const data = object(body) && body.success === true && !pendingStore ? body.data : null;
  if (!isProjectSharingResponse(data, scope) || !confirmsWrite(data, method, write)) return failure(method);
  return { kind: 'confirmed', data, auditWarning: method === 'GET' ? null : auditWarning(body) };
}

/** Keep the full canonical envelope: its audit receipt must survive unwrapping. */
export async function requestProjectSharing(scope: ProjectSharingScope, isCurrent: () => boolean,
  method: 'GET' | 'PUT' | 'DELETE' = 'GET', write?: SharingWrite): Promise<SharingAnswer> {
  if (!isCurrent()) return { kind: 'retired', message: 'The project or account changed. Reopen sharing.' };
  let headers: Record<string, string>;
  try {
    headers = capturedActorHeaders({ userId: scope.actorUserId, organizationId: scope.organizationId });
    if (scope.clientWorkspaceId != null) headers['x-client-id'] = String(scope.clientWorkspaceId);
  } catch { return { kind: 'retired', message: 'The signed-in account or organization changed. Reopen the project.' }; }
  const suffix = write ? `/members/${write.memberId}` : '';
  const url = `/api/concept2cure/projects/${scope.projectId}/sharing${suffix}?programId=${encodeURIComponent(scope.programId)}`;
  try {
    const res = await apiRequest(method, url, method === 'PUT' ? { role: write?.role } : undefined, headers);
    const body = await res.json().catch(() => null) as unknown;
    if (!isCurrent()) return { kind: 'retired', message: 'The project or account changed. Reopen sharing.' };
    return readAnswer(res, body, scope, method, write);
  } catch (error) {
    if (!isCurrent()) return { kind: 'retired', message: 'The project or account changed. Reopen sharing.' };
    return error instanceof ApiRequestError ? failure(method, error.status, error.payload) : failure(method);
  }
}
