/** Shared catalog actor admission. Uses the existing project policy on the
 * caller's transaction connection; a token/ALS role cannot replace live membership. */
import type { RequestSqlClient } from '../../db/requestDb';
import { getTenantScope } from '../../db/tenantStore.js';
import { GOVERNED_WRITE_ROLES } from '../../middleware/orgMembership.js';
import { admitAnaProjectScope, AnaProjectScopeError } from '../ana/project-scope-admission.js';
import { setTenantContextTx } from '../tenant/governed-tenant-context.js';

export class CatalogAdmissionError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message); this.name = 'CatalogAdmissionError';
  }
}

export interface CatalogActorArgs { organizationId: number; userId: number | null; programId: string }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const positive = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v > 0;

function catalogTenantPreflight(args: CatalogActorArgs): string | null | undefined {
  const scope = getTenantScope();
  if (!positive(args.organizationId) || !UUID.test(args.programId) || !scope || scope.tenantId !== String(args.organizationId)) {
    throw new CatalogAdmissionError(403, 'CATALOG_SCOPE_REQUIRED', 'The catalog request has no matching organization scope. Nothing was changed.');
  }
  if (!positive(args.userId)) throw new CatalogAdmissionError(401, 'ACTOR_REQUIRED', 'An identified organization member is required. Nothing was changed.');
  return scope.role;
}

async function catalogMembershipRole(client: RequestSqlClient, args: CatalogActorArgs, opts: { write?: boolean; hold?: boolean }): Promise<string> {
  const membership = await client.query(
    `SELECT ou.role FROM organization_users ou
       JOIN users u ON u.id = ou.user_id JOIN organizations o ON o.id = ou.organization_id
      WHERE ou.user_id = $1 AND ou.organization_id = $2 AND u.status = 'active' AND o.status = 'active'
      ${opts.hold ? 'FOR SHARE OF ou, u, o' : ''}`,
    [args.userId, args.organizationId],
  );
  const role = membership.rows.length === 1 && typeof membership.rows[0].role === 'string'
    ? membership.rows[0].role.trim().toLowerCase() : null;
  if (!role) throw new CatalogAdmissionError(403, 'CATALOG_ACCESS_DENIED', 'Current organization membership could not be established. Nothing was changed.');
  if (opts.write && !GOVERNED_WRITE_ROLES.has(role)) {
    throw new CatalogAdmissionError(403, 'VAULT_WRITE_ROLE_REQUIRED', 'Your current organization role can read the Vault but cannot change its catalog. Nothing was changed.');
  }
  return role;
}

async function holdCatalogProject(client: RequestSqlClient, args: CatalogActorArgs, projectId: number): Promise<void> {
  const program = await client.query(
    'SELECT id FROM regulatory_programs WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL FOR SHARE',
    [args.programId, args.organizationId],
  );
  const project = await client.query(
    'SELECT id FROM projects WHERE id = $1 AND organization_id = $2 AND regulatory_program_id = $3 FOR UPDATE',
    [projectId, args.organizationId, args.programId],
  );
  if (program.rows.length !== 1 || project.rows.length !== 1 || project.rows[0].id !== projectId) {
    throw new CatalogAdmissionError(404, 'DOCUMENT_NOT_FOUND', 'No such document in this project.');
  }
  // Parent FOR UPDATE also fences FK-bound policy insertions. Existing
  // policy rows are held against revocation until this short write commits.
  await client.query('SELECT project_id FROM project_visibility_settings WHERE project_id = $1 AND organization_id = $2 FOR SHARE', [projectId, args.organizationId]);
  await client.query('SELECT project_id FROM project_members WHERE project_id = $1 AND organization_id = $2 FOR SHARE', [projectId, args.organizationId]);
  await client.query('SELECT id FROM concept2cure_artifacts WHERE project_id = $1 AND organization_id = $2 FOR SHARE', [projectId, args.organizationId]);
  await client.query(`SELECT ra.id FROM concept2cure_review_assignments ra JOIN concept2cure_artifacts a ON a.id = ra.artifact_id
    WHERE ra.organization_id = $1 AND a.organization_id = $1 AND a.project_id = $2 FOR SHARE OF ra`, [args.organizationId, projectId]);
}

export async function admitCatalogActor(
  client: RequestSqlClient,
  args: CatalogActorArgs,
  opts: { write?: boolean; hold?: boolean } = {},
): Promise<{ role: string; projectId: number }> {
  await setTenantContextTx(client, args.organizationId, catalogTenantPreflight(args));
  const role = await catalogMembershipRole(client, args, opts);
  // Stamp the fresh role, rather than letting a stale request role authorize DML.
  await setTenantContextTx(client, args.organizationId, role);
  try {
    let admitted = await admitAnaProjectScope(client, { ...args, projectRef: args.programId });
    if (!positive(admitted.projectId) || admitted.programId?.toLowerCase() !== args.programId.toLowerCase()) {
      throw new CatalogAdmissionError(409, 'CATALOG_PROJECT_UNRESOLVED', 'The project relationship could not be verified. Nothing was changed.');
    }
    const projectId = admitted.projectId;
    if (opts.hold) {
      await holdCatalogProject(client, args, projectId);
      admitted = await admitAnaProjectScope(client, { ...args, projectRef: args.programId });
      if (admitted.projectId !== projectId || admitted.programId?.toLowerCase() !== args.programId.toLowerCase()) {
        throw new CatalogAdmissionError(409, 'CATALOG_PROJECT_UNRESOLVED', 'The project relationship changed. Nothing was changed.');
      }
    }
    return { role, projectId };
  } catch (err) {
    if (err instanceof CatalogAdmissionError) throw err;
    if (err instanceof AnaProjectScopeError) throw new CatalogAdmissionError(err.status, err.code, err.message);
    throw err;
  }
}
