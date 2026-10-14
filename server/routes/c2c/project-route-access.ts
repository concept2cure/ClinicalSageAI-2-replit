/** Current parent admission shared by the existing Projects and Vault routers. */
import type { Request, Response, Router } from 'express';
import { pool } from '../../db';
import { governedActorId, GOVERNED_WRITE_ROLES } from '../../middleware/orgMembership';
import { resolveOrgId } from '../../types/auth-request';
import { canCreateProgram, canMutateProgram } from '../../services/c2c/program-access';
import {
  ProgramReadAccessError, requireCurrentProgramAccess, readCurrentProgramActor,
  type CurrentProgramAccess, type ProgramAccessExecutor,
} from '../../services/c2c/current-program-access';

export async function requireProjectCreationAccess(q: ProgramAccessExecutor, organizationId: number, userId: number, forShare = false): Promise<void> {
  const actor = await readCurrentProgramActor(q, { organizationId, userId, forShare });
  if (!canCreateProgram({ orgRole: actor.role })) throw new ProgramReadAccessError(403, 'PROJECT_WRITE_ACCESS_DENIED', 'Your current role cannot create a project. Nothing was changed.');
}

export function sendProjectAccessFailure(res: Response, error: unknown, concealDenied = false): Response {
  const failure = error instanceof ProgramReadAccessError ? error
    : new ProgramReadAccessError(503, 'PROJECT_ACCESS_UNAVAILABLE', 'Current project access could not be verified. No project data was supplied.');
  const hidden = failure.status === 404 || (concealDenied && failure.status === 403);
  return res.status(hidden ? 404 : failure.status).json({ success: false,
    error: hidden ? 'PROJECT_NOT_FOUND' : failure.code,
    message: hidden ? 'Project not found.' : failure.message });
}

export async function requireProjectRouteAccess(req: Request, res: Response, options: {
  kind: 'projects' | 'vault'; executor?: ProgramAccessExecutor; forShare?: boolean;
  includeDeleted?: boolean; programId?: string;
}): Promise<CurrentProgramAccess> {
  const organizationId = resolveOrgId(req);
  const userId = governedActorId(req);
  if (!organizationId || !userId) throw new ProgramReadAccessError(403, 'PROJECT_ACTOR_REQUIRED', 'A current organization actor is required.');
  const q = options.executor ?? pool;
  const access = await requireCurrentProgramAccess(q, { organizationId, userId,
    programId: options.programId ?? String(req.params.id ?? ''),
    forShare: options.forShare, includeDeleted: options.includeDeleted });
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    const role = access.actor.role.trim().toLowerCase();
    let permitted = options.kind === 'vault' && GOVERNED_WRITE_ROLES.has(role);
    if (options.kind === 'projects' && canCreateProgram({ orgRole: role })) {
      const program = options.forShare
        ? await q.query(`SELECT lead_user_id FROM regulatory_programs
            WHERE id=$1 AND organization_id=$2 FOR SHARE`, [access.programId, organizationId])
        : await q.query(`SELECT lead_user_id FROM regulatory_programs
            WHERE id=$1 AND organization_id=$2`, [access.programId, organizationId]);
      const lead = program.rows[0]?.lead_user_id;
      permitted = program.rows.length === 1 && canMutateProgram({
        actor: { userId: access.actor.userId, orgRole: role },
        program: { leadUserId: lead == null ? null : Number(lead) } });
    }
    if (!permitted) throw new ProgramReadAccessError(403, 'PROJECT_WRITE_ACCESS_DENIED', 'Your current project permissions do not permit this change. Nothing was changed.');
  }
  res.locals.currentProgramAccess = access;
  return access;
}

/** A literal library route has no :id and keeps its own evaluated list scope. */
export function installProjectRouteAccess(router: Router, kind: 'projects' | 'vault'): void {
  router.param('id', (req, res, next, id: string) => {
    const lifecycle = kind === 'projects' && (req.method === 'DELETE' && req.path === `/${id}`
      || req.method === 'POST' && [`/${id}/archive`, `/${id}/unarchive`].includes(req.path));
    void requireProjectRouteAccess(req, res, { kind, programId: id, includeDeleted: lifecycle })
      .then(() => next())
      .catch(error => { sendProjectAccessFailure(res, error, ['GET', 'HEAD'].includes(req.method)); });
  });
  if (kind === 'vault') router.param('documentId', (req, res, next, documentId: string) => {
    void requireVaultDocumentTenant(req, documentId).then(() => next())
      .catch(error => { sendProjectAccessFailure(res, error, ['GET', 'HEAD'].includes(req.method)); });
  });
}

async function requireVaultDocumentTenant(req: Request, documentId: string): Promise<void> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(documentId)) {
    throw new ProgramReadAccessError(404, 'PROJECT_NOT_FOUND', 'Document not found.');
  }
  const organizationId = resolveOrgId(req);
  // Identity-only quarantine check after the current program admission. A
  // NULL is refused below; it never authorizes metadata, prose or bytes.
  const identity = await pool.query(`SELECT organization_id FROM vault.documents WHERE id=$1 AND program_id=$2
    AND (organization_id=$3 OR organization_id IS NULL)`,
    [documentId, String(req.params.id), organizationId]);
  const row = identity.rows[0];
  if (!row || row.organization_id != null && row.organization_id !== organizationId) {
    throw new ProgramReadAccessError(404, 'PROJECT_NOT_FOUND', 'Document not found.');
  }
  if (row.organization_id == null) throw new ProgramReadAccessError(409, 'VAULT_TENANT_RECONCILIATION_REQUIRED',
    'This retained Vault record needs a verified organization association before its content can be supplied.');
}

export async function withProjectWriteReservation<T>(req: Request, res: Response, operation: (q: ProgramAccessExecutor) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await requireProjectRouteAccess(req, res, { kind: 'projects', executor: client, forShare: true });
    const result = await operation(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally { client.release(); }
}
