/** Fresh actor and project authorization for canonical authoring reads/writes. */
import { GOVERNED_WRITE_ROLES } from '../../middleware/orgMembership';
import { programInOrganization } from '../c2c/program-access';
import { readProgramAnchorRow } from '../c2c/program-project-anchor';
import { canAccessReportProject } from '../report-os/project-access';
import type { AuthoringActor } from './authoring-documents';
import type { AuthoringPrincipal } from './authoring-permissions';
import type { Queryable } from './authoring-evidence';

export class AuthoringProgramAccessError extends Error {
  constructor(readonly status: 403 | 404 | 409 | 503, readonly code: string, message: string) {
    super(message);
    this.name = 'AuthoringProgramAccessError';
  }
}

export interface AuthorizedAuthoringProgram {
  principal: AuthoringPrincipal;
  role: string;
  projectId: number;
  programId: string;
}

function verifiedActorId(actor: AuthoringActor, principal?: AuthoringPrincipal): number {
  const id = actor.id;
  const valid = typeof id === 'string' && /^[1-9]\d*$/.test(id) && Number.isSafeInteger(Number(id)) && Number(id) <= 2_147_483_647;
  if (!valid || (principal && principal.id !== id)) throw new AuthoringProgramAccessError(403, 'IMPORT_ACTOR_REQUIRED', 'A verified organization member is required to author this document.');
  return Number(id);
}

async function currentRole(q: Queryable, userId: number, tenantId: number, forWrite: boolean): Promise<string> {
  const membership = await q.query(`SELECT ou.role FROM organization_users ou
    JOIN users u ON u.id = ou.user_id JOIN organizations o ON o.id = ou.organization_id
    WHERE ou.user_id = $1 AND ou.organization_id = $2 AND u.status = 'active' AND o.status = 'active'
    FOR SHARE OF ou, u, o`, [userId, tenantId]);
  const role = membership.rows.length === 1 && typeof membership.rows[0].role === 'string' ? membership.rows[0].role.trim().toLowerCase() : null;
  if (!role || (forWrite && !GOVERNED_WRITE_ROLES.has(role))) throw new AuthoringProgramAccessError(403, 'IMPORT_WRITE_PERMISSION_DENIED', 'Your current organization role cannot create or adopt a working copy.');
  return role;
}

export async function authorizeAuthoringProgram(q: Queryable, input: {
  tenantId: number; actor: AuthoringActor; programId: string; principal?: AuthoringPrincipal; forWrite?: boolean;
}): Promise<AuthorizedAuthoringProgram> {
  const { tenantId, actor, programId, principal } = input;
  const id = actor.id;
  const userId = verifiedActorId(actor, principal);
  try {
    if (!(await programInOrganization(q, programId, tenantId))) throw new AuthoringProgramAccessError(404, 'PROJECT_NOT_FOUND', 'Project not found.');
    const role = await currentRole(q, userId, tenantId, input.forWrite !== false);
    const anchor = await readProgramAnchorRow(q, { programId, orgId: tenantId, context: 'authoring-program-access', requireUnique: true });
    if (!anchor) throw new AuthoringProgramAccessError(409, 'PROJECT_ANCHOR_UNRESOLVED', 'This project needs one verified tracking record before authoring.');
    if (!await canAccessReportProject(tenantId, { userId, role }, anchor.id, q)) {
      throw new AuthoringProgramAccessError(403, 'PROJECT_PERMISSION_DENIED', 'You cannot author this project with your current access.');
    }
    return { principal: { id, email: principal?.email ?? actor.email, roles: [role.toUpperCase()] }, role, projectId: anchor.id, programId };
  } catch (error) {
    if (error instanceof AuthoringProgramAccessError) throw error;
    throw new AuthoringProgramAccessError(503, 'PROJECT_ACCESS_UNAVAILABLE', 'Current project access could not be verified. Nothing was changed.');
  }
}
