import { and, eq } from 'drizzle-orm';
import { clientWorkspaces, csrBuildJobs, organizationUsers, projects } from '@shared/schema';
import type { RequestDb } from '../../db/requestDb';
import { queryableFromDrizzle } from '../../db/drizzle-queryable';
import { looksLikeProgramUuid } from '../../lib/project-id';
import { readProgramAnchorRow } from '../c2c/program-project-anchor';
import { canAccessReportProject, type ReportProjectActor } from '../report-os/project-access';

export class CsrScopeError extends Error {
  constructor(readonly code: string, readonly status: 400 | 403 | 404 | 409, message: string) {
    super(message);
    this.name = 'CsrScopeError';
  }
}

export interface CsrScopeInput { projectId?: unknown; programId?: unknown; clientWorkspaceId?: unknown }
export interface CsrScope { projectId?: number; programId?: string; clientWorkspaceId?: number }
export interface CsrScopeExecutor {
  query: (text: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
}

/** Read membership now, on the same connection used for the project policy.
 * A queued job must not inherit the creator's old session role after revocation. */
export async function readCsrProjectActor(database: Pick<RequestDb, 'select'> | CsrScopeExecutor, organizationId: number, userId: number | undefined, options: { forShare?: boolean } = {}): Promise<ReportProjectActor> {
  if (!Number.isSafeInteger(userId) || !userId || userId <= 0) throw new CsrScopeError('CSR_PROJECT_ACCESS_DENIED', 403, 'Current project access could not be established for the CSR actor.');
  if (!('select' in database)) {
    const statement = options.forShare
      ? `SELECT ou.role FROM organization_users ou
         JOIN users u ON u.id=ou.user_id JOIN organizations o ON o.id=ou.organization_id
         WHERE ou.organization_id=$1 AND ou.user_id=$2 AND u.status='active' AND o.status='active' FOR SHARE OF ou,u,o`
      : `SELECT ou.role FROM organization_users ou
         JOIN users u ON u.id=ou.user_id JOIN organizations o ON o.id=ou.organization_id
         WHERE ou.organization_id=$1 AND ou.user_id=$2 AND u.status='active' AND o.status='active'`;
    const { rows } = await database.query(statement,[organizationId,userId]);
    if (rows.length !== 1 || typeof rows[0].role !== 'string' || !rows[0].role.trim()) throw new CsrScopeError('CSR_PROJECT_ACCESS_DENIED', 403, 'The CSR actor is no longer an active member of this organization.');
    return { userId, role: rows[0].role.trim().toLowerCase() };
  }
  const [member] = await database.select({ role: organizationUsers.role }).from(organizationUsers).where(and(eq(organizationUsers.organizationId, organizationId), eq(organizationUsers.userId, userId))).limit(1);
  if (!member?.role) throw new CsrScopeError('CSR_PROJECT_ACCESS_DENIED', 403, 'The CSR actor is no longer a member of this organization.');
  return { userId, role: String(member.role).trim().toLowerCase() };
}

/** Explicit malformed scope never becomes an organization-wide request. */
export function parseCsrScopeId(value: unknown, name: string): number | undefined {
  if (value === undefined) return undefined;
  const number = typeof value === 'number' ? value : typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : NaN;
  if (!Number.isSafeInteger(number) || number <= 0) throw new CsrScopeError('CSR_SCOPE_INVALID', 400, `${name} must be a positive integer.`);
  return number;
}

async function resolveProgramScope(database: Pick<RequestDb, 'select'>, organizationId: number, input: CsrScopeInput): Promise<CsrScope> {
  let projectId = parseCsrScopeId(input.projectId, 'projectId');
  let programId: string | undefined;
  if (input.programId !== undefined) {
    if (typeof input.programId !== 'string' || !looksLikeProgramUuid(input.programId)) throw new CsrScopeError('CSR_SCOPE_INVALID', 400, 'programId must be a program UUID.');
    programId = input.programId.trim().toLowerCase();
    const anchor = await readProgramAnchorRow(database as RequestDb, { programId, orgId: organizationId, context: 'csr-workflow', requireUnique: true });
    if (!anchor) throw new CsrScopeError('CSR_PROGRAM_NOT_ANCHORED', 409, 'The program has no unique project record for this organization. Nothing was read or built under another program.');
    if (projectId !== undefined && projectId !== anchor.id) throw new CsrScopeError('CSR_SCOPE_MISMATCH', 400, 'projectId does not identify the selected program.');
    projectId = anchor.id;
  }
  return { projectId, programId };
}

async function verifyWorkspaceScope(database: Pick<RequestDb, 'select'>, organizationId: number, projectId: number | undefined, clientWorkspaceId: number | undefined): Promise<void> {
  if (clientWorkspaceId !== undefined) {
    const [workspace] = await database.select({ id: clientWorkspaces.id }).from(clientWorkspaces).where(and(eq(clientWorkspaces.id, clientWorkspaceId), eq(clientWorkspaces.organizationId, organizationId))).limit(1);
    if (!workspace) throw new CsrScopeError('CSR_WORKSPACE_NOT_FOUND', 403, 'That client workspace is not in your organization.');
    if (projectId === undefined) throw new CsrScopeError('CSR_SCOPE_INVALID', 400, 'A client workspace filter requires an explicit project or program.');
  }
}

/** The project/program boundary shared by CSR writes and scoped board reads.
 * Reading an archived project's retained work remains valid; new builds refuse it. */
export async function resolveCsrScope(database: Pick<RequestDb, 'select' | 'execute'>, organizationId: number, input: CsrScopeInput, options: { forWrite?: boolean; actorUserId?: number } = {}): Promise<CsrScope> {
  if (!Number.isSafeInteger(organizationId) || organizationId <= 0) throw new CsrScopeError('CSR_SCOPE_INVALID', 400, 'A valid organization is required.');
  const { projectId, programId } = await resolveProgramScope(database, organizationId, input);
  const clientWorkspaceId = parseCsrScopeId(input.clientWorkspaceId, 'clientWorkspaceId');
  await verifyWorkspaceScope(database, organizationId, projectId, clientWorkspaceId);
  if (projectId === undefined) return {};
  const [project] = await database.select({ id: projects.id, status: projects.status, clientWorkspaceId: projects.clientWorkspaceId }).from(projects).where(and(eq(projects.id, projectId), eq(projects.organizationId, organizationId))).limit(1);
  if (!project) throw new CsrScopeError('CSR_PROJECT_NOT_FOUND', 404, 'Project not found for this organization.');
  const actor = await readCsrProjectActor(database, organizationId, options.actorUserId);
  if (!await canAccessReportProject(organizationId, actor, projectId, queryableFromDrizzle(database))) throw new CsrScopeError('CSR_PROJECT_ACCESS_DENIED', 403, 'The CSR actor does not have access to this project.');
  if (clientWorkspaceId !== undefined && clientWorkspaceId !== project.clientWorkspaceId) throw new CsrScopeError('CSR_WORKSPACE_SCOPE_MISMATCH', 403, 'The selected project is not in this client workspace.');
  if (options.forWrite !== false && ['archived', 'deleted'].includes(project.status)) throw new CsrScopeError('CSR_PROJECT_ARCHIVED', 409, 'New CSR builds are unavailable for an archived project. Retained CSR work can still be read.');
  return { projectId, ...(programId ? { programId } : {}), ...(clientWorkspaceId ? { clientWorkspaceId } : {}) };
}

export async function resolveCsrBuildContext(
  database: Pick<RequestDb, 'select' | 'execute'>,
  request: { organizationId: number; projectId?: number; userId: number },
  context: { organizationId: number; projectId?: number; programId?: string; clientWorkspaceId?: number; requestedBy?: number },
) {
  if (request.organizationId !== context.organizationId || (context.requestedBy !== undefined && context.requestedBy !== request.userId)) throw new CsrScopeError('CSR_SCOPE_MISMATCH', 400, 'The CSR request and execution context must identify the same organization and actor.');
  const requestProject = parseCsrScopeId(request.projectId, 'projectId');
  const contextProject = parseCsrScopeId(context.projectId, 'projectId');
  if (requestProject !== undefined && contextProject !== undefined && requestProject !== contextProject) throw new CsrScopeError('CSR_SCOPE_MISMATCH', 400, 'The CSR request and execution context identify different projects.');
  const scope = await resolveCsrScope(database, context.organizationId, { ...context, projectId: contextProject ?? requestProject }, { actorUserId: request.userId });
  return { ...context, ...scope, requestedBy: context.requestedBy ?? request.userId };
}

/** Saved output/status/cancellation reads enforce the current project policy too. */
export async function requireCsrJobAccess(database: Pick<RequestDb, 'select' | 'execute'> | CsrScopeExecutor, organizationId: number, jobId: number, userId: number | undefined): Promise<boolean> {
  const actor = await readCsrProjectActor(database, organizationId, userId);
  if (!('select' in database)) {
    const { rows } = await database.query('SELECT project_id FROM csr_build_jobs WHERE id = $1 AND organization_id = $2', [jobId, organizationId]);
    if (rows.length !== 1) return false;
    const projectId = rows[0].project_id == null ? undefined : parseCsrScopeId(rows[0].project_id, 'projectId');
    if (projectId !== undefined && !await canAccessReportProject(organizationId, actor, projectId, database)) {
      throw new CsrScopeError('CSR_PROJECT_ACCESS_DENIED', 403, 'The CSR actor does not have access to this project.');
    }
    return true;
  }
  const [job] = await database.select({ projectId: csrBuildJobs.projectId }).from(csrBuildJobs).where(and(eq(csrBuildJobs.id, jobId), eq(csrBuildJobs.organizationId, organizationId))).limit(1);
  if (!job) return false;
  if (job.projectId != null) await resolveCsrScope(database, organizationId, { projectId: job.projectId }, { forWrite: false, actorUserId: userId });
  return true;
}
