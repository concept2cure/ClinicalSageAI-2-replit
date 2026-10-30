import { ApiRequestError, apiRequest } from '@/lib/queryClient';
import { capturedActorHeaders } from '@/utils/authToken';
import { isProjectIntakeReceipt, isProjectIntakeWorkspaces, type ProjectIntakeActor, type ProjectIntakeReceipt, type ProjectIntakeWorkspace } from '@shared/project-intake-workspace';

type Refusal = { kind: 'refused' | 'unavailable' | 'retired' | 'unconfirmed'; message: string; correlationId?: string; notOffered?: boolean; confirmedCreated?: boolean };
export type IntakeOptionsAnswer = { kind: 'confirmed'; clients: ProjectIntakeWorkspace[] } | Refusal;
export type IntakeCreateAnswer = { kind: 'confirmed'; receipt: ProjectIntakeReceipt } | Refusal;
const retired = (): Refusal => ({ kind: 'retired', message: 'The signed-in account or organization changed. Reopen New project before continuing.' });
const unknown = (message?: string, correlationId?: string): Refusal => ({ kind: 'unconfirmed', message: `${message ? `${message} ` : ''}Project creation could not be confirmed. Check projects before starting another project; this request may have been saved.`, correlationId });
function currentActor(actor: ProjectIntakeActor, isCurrent: () => boolean): boolean {
  if (!isCurrent()) return false;
  try { capturedActorHeaders({ userId: actor.actorUserId, organizationId: actor.organizationId }); return true; } catch { return false; }
}
export async function readProjectIntakeWorkspaces(actor: ProjectIntakeActor, isCurrent: () => boolean): Promise<IntakeOptionsAnswer> {
  if (!isCurrent()) return retired();
  let headers: Record<string, string>;
  try { headers = capturedActorHeaders({ userId: actor.actorUserId, organizationId: actor.organizationId }); } catch { return retired(); }
  try {
    const res = await apiRequest('GET', '/api/clients?purpose=project-intake', undefined, headers);
    const body: unknown = await res.json().catch(() => null);
    if (!currentActor(actor, isCurrent)) return retired();
    if (!res.ok || !isProjectIntakeWorkspaces(body, actor)) return { kind: 'unavailable', message: 'Client workspaces could not be verified. Refresh the workspace list before continuing.' };
    return { kind: 'confirmed', clients: body.clients };
  } catch {
    return currentActor(actor, isCurrent) ? { kind: 'unavailable', message: 'Client workspaces could not be verified. Refresh the workspace list before continuing.' } : retired();
  }
}
export async function createProjectIntake(actor: ProjectIntakeActor, workspace: ProjectIntakeWorkspace, body: Record<string, unknown>, isCurrent: () => boolean): Promise<IntakeCreateAnswer> {
  if (!isCurrent()) return retired();
  let headers: Record<string, string>;
  try { headers = capturedActorHeaders({ userId: actor.actorUserId, organizationId: actor.organizationId }); } catch { return retired(); }
  headers['x-client-id'] = workspace.id;
  try {
    const res = await apiRequest('POST', '/api/c2c/projects', { ...body, clientWorkspaceId: Number(workspace.id) }, headers);
    const receipt: unknown = await res.json().catch(() => null);
    if (!currentActor(actor, isCurrent)) return retired();
    if (res.status >= 500) return unknown();
    if (!res.ok) return { kind: 'refused', message: 'Your session has expired. Sign in again to create this project.' };
    if (res.status !== 201 || !isProjectIntakeReceipt(receipt, actor, workspace)) return unknown();
    return { kind: 'confirmed', receipt };
  } catch (error) {
    if (!currentActor(actor, isCurrent)) return retired();
    if (error instanceof ApiRequestError) {
      if (error.status >= 400 && error.status < 500) return { kind: 'refused', message: error.message || 'The server refused this project. Review its details before retrying.', correlationId: error.correlationId, notOffered: error.code === 'FILING_NOT_OFFERED' };
      if (error.code === 'PROJECT_CREATED_DETAILS_UNAVAILABLE') return { kind: 'unconfirmed', confirmedCreated: true, message: 'The project was created, but its details could not be loaded. Check projects before starting another project.', correlationId: error.correlationId };
      return unknown(error.message, error.correlationId);
    }
    return unknown();
  }
}
