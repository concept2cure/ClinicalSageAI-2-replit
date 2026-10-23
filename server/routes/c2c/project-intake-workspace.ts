/** Existing New-project intake's workspace input and narrow client-list view. */
import type { Request, Response } from 'express';
import { requestPgClient } from '../../db/requestDb';
import { projectIntakeId } from '../../../shared/project-intake-workspace';
import { governedActorId } from '../../middleware/orgMembership';

export class ProjectWorkspaceInputError extends Error {
  readonly code = 'INVALID_CLIENT_WORKSPACE';
}

function positiveId(value: unknown): value is number {
  return typeof value === 'number' && projectIntakeId(value) !== null;
}

export function projectWorkspaceInput(req: Request): { clientWorkspaceId?: number; workspaceClaim?: number } {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const supplied = Object.prototype.hasOwnProperty.call(body, 'clientWorkspaceId');
  if (supplied && !positiveId(body.clientWorkspaceId)) {
    throw new ProjectWorkspaceInputError('Choose a valid client workspace. Nothing was saved.');
  }
  // security-allow: workspace-claim only; lockIntakeWorkspace verifies it against the selected active organization-owned row in the creation transaction.
  const claim = req.headers['x-client-id'];
  if (claim !== undefined && (typeof claim !== 'string' || !/^[1-9]\d*$/.test(claim) || !positiveId(Number(claim)))) {
    throw new ProjectWorkspaceInputError('The workspace request claim is invalid. Nothing was saved.');
  }
  return { ...(supplied ? { clientWorkspaceId: body.clientWorkspaceId as number } : {}),
    ...(claim !== undefined ? { workspaceClaim: Number(claim) } : {}) };
}

export async function sendProjectIntakeWorkspaces(req: Request, res: Response, organizationId: number | null): Promise<Response> {
  // Keep ordinary legacy client listings independent of this purpose's current
  // project-policy imports. Admission is the same existing creator policy.
  const { requireProjectCreationAccess, sendProjectAccessFailure } = await import('./project-route-access');
  try {
    const actorUserId = governedActorId(req);
    if (!positiveId(organizationId) || !positiveId(actorUserId)) {
      return res.status(403).json({ success: false, error: 'PROJECT_ACTOR_REQUIRED', message: 'A current organization actor is required.' });
    }
    const q = requestPgClient(req);
    await requireProjectCreationAccess(q, organizationId, actorUserId);
    const { rows } = await q.query(`SELECT id, name, organization_id, status FROM client_workspaces
      WHERE organization_id=$1 AND status='active' ORDER BY name,id`, [organizationId]);
    const clients = rows.map(row => {
      if (!positiveId(row.id) || row.organization_id !== organizationId || row.status !== 'active'
        || typeof row.name !== 'string' || !row.name.trim()) throw new Error('Workspace identity unavailable');
      return { id: String(row.id), name: row.name, organizationId: String(organizationId), status: 'active' as const };
    });
    await requireProjectCreationAccess(q, organizationId, actorUserId);
    return res.json({ success: true, clients, meta: { purpose: 'project-intake', organizationId, actorUserId } });
  } catch (error) { return sendProjectAccessFailure(res, error); }
}
