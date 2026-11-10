/** Admit a conversation's explicit project before reading its source context.
 * A program's tenant ownership is not permission to use its private project. */
import type { RequestSqlClient } from '../../db/requestDb';
import { looksLikeProgramUuid, parseIntegerProjectId } from '../../lib/project-id';
import { programInOrganization } from '../c2c/program-access';
import { readProgramAnchorRow } from '../c2c/program-project-anchor';
import { canAccessReportProject } from '../report-os/project-access';

export class AnaProjectScopeError extends Error {
  constructor(readonly status: 400 | 403 | 404 | 409 | 503, readonly code: string, message: string) {
    super(message);
    this.name = 'AnaProjectScopeError';
  }
}

export interface AnaProjectScopeInput {
  organizationId: unknown;
  userId: unknown;
  projectId?: unknown;
  projectRef?: unknown;
}
export interface AdmittedAnaProjectScope {
  projectId: number | null;
  programId: string | null;
  projectRef: string | null;
}

const present = (value: unknown): boolean => value !== undefined && value !== null && value !== '';
const positiveId = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
function invalid(): never {
  throw new AnaProjectScopeError(400, 'ANA_PROJECT_SCOPE_INVALID', 'Choose a valid project identifier.');
}

function optionalProjectId(value: unknown): number | null {
  if (!present(value)) return null;
  const id = parseIntegerProjectId(value);
  if (id === null) invalid();
  return id;
}

async function uniqueAnchor(q: RequestSqlClient, organizationId: number, programId: string): Promise<number> {
  // Adapt only the canonical anchor reader's declared result, validating its
  // identities instead of casting an arbitrary SQL result into an anchor.
  const anchor = await readProgramAnchorRow({
    async query(sql, params) {
      const { rows } = await q.query(sql, params);
      return { rows: rows.map(row => {
        if (!positiveId(row.id) || (row.clientWorkspaceId != null && !positiveId(row.clientWorkspaceId))) {
          throw new Error('Invalid project anchor identity');
        }
        return { id: row.id, clientWorkspaceId: row.clientWorkspaceId == null ? null : row.clientWorkspaceId };
      }) };
    },
  }, { orgId: organizationId, programId, context: 'ana-project-scope', requireUnique: true });
  if (!anchor) throw new AnaProjectScopeError(409, 'ANA_PROJECT_ANCHOR_UNRESOLVED', 'This project needs one verified tracking record before AnA can read its sources.');
  return anchor.id;
}

async function resolveProjectIdentity(q: RequestSqlClient, organizationId: number, ref: unknown): Promise<{ projectId: number; programId: string | null }> {
  let projectId: number;
  let programId: string | null = null;
  if (looksLikeProgramUuid(ref)) {
    programId = String(ref).trim().toLowerCase();
    if (!await programInOrganization(q, programId, organizationId)) {
      throw new AnaProjectScopeError(404, 'ANA_PROJECT_NOT_FOUND', 'Project not found.');
    }
    projectId = await uniqueAnchor(q, organizationId, programId);
  } else {
    const numericRef = parseIntegerProjectId(ref);
    if (numericRef === null) invalid();
    projectId = numericRef;
    const { rows } = await q.query('SELECT id, regulatory_program_id FROM projects WHERE id = $1 AND organization_id = $2', [projectId, organizationId]);
    if (rows.length !== 1) throw new AnaProjectScopeError(404, 'ANA_PROJECT_NOT_FOUND', 'Project not found.');
    const program = rows[0].regulatory_program_id;
    if (program != null) {
      if (!looksLikeProgramUuid(program)) throw new Error('Invalid recorded program identity');
      programId = String(program).trim().toLowerCase();
      if (!await programInOrganization(q, programId, organizationId)) throw new AnaProjectScopeError(404, 'ANA_PROJECT_NOT_FOUND', 'Project not found.');
      if (await uniqueAnchor(q, organizationId, programId) !== projectId) throw new AnaProjectScopeError(409, 'ANA_PROJECT_ANCHOR_UNRESOLVED', 'The project relationship could not be verified.');
    }
  }
  return { projectId, programId };
}

/** Current persisted read membership shared by explicit project and source
 * admission. Read authority is the project policy, never a write-role list. */
export async function readActiveAnaActorRole(
  q: RequestSqlClient,
  input: Pick<AnaProjectScopeInput, 'organizationId' | 'userId'>,
): Promise<string> {
  const { organizationId, userId } = input;
  if (!positiveId(organizationId) || !positiveId(userId) || organizationId > 2_147_483_647 || userId > 2_147_483_647) {
    throw new AnaProjectScopeError(403, 'ANA_PROJECT_ACCESS_DENIED', 'An identified organization member is required to read this project.');
  }
  // Same persisted membership source as resolveSignerOrgRole, on the
  // connection used for the project policy and the protected source read.
  try {
    const membership = await q.query(`SELECT ou.role FROM organization_users ou
      JOIN users u ON u.id = ou.user_id JOIN organizations o ON o.id = ou.organization_id
      WHERE ou.user_id = $1 AND ou.organization_id = $2 AND u.status = 'active' AND o.status = 'active'`, [userId, organizationId]);
    const role = membership.rows.length === 1 && typeof membership.rows[0].role === 'string'
      ? membership.rows[0].role.trim().toLowerCase() : null;
    if (!role) throw new AnaProjectScopeError(403, 'ANA_PROJECT_ACCESS_DENIED', 'You do not have current access to this project.');
    return role;
  } catch (error) {
    if (error instanceof AnaProjectScopeError) throw error;
    throw new AnaProjectScopeError(503, 'ANA_PROJECT_ACCESS_UNAVAILABLE', 'Current project access could not be verified. AnA has not read its sources.');
  }
}

async function assertActiveProjectAccess(q: RequestSqlClient, organizationId: number, userId: number, projectId: number): Promise<void> {
  const role = await readActiveAnaActorRole(q, { organizationId, userId });
  if (!await canAccessReportProject(organizationId, { userId, role }, projectId, q)) {
    throw new AnaProjectScopeError(403, 'ANA_PROJECT_ACCESS_DENIED', 'You do not have current access to this project.');
  }
}

/** The actor is pinned by the caller; role and sharing are read now, never
 * taken from the prompt, token claims or a previously admitted conversation.
 * Explicit invalid scope cannot become an organization-wide conversation. */
export async function admitAnaProjectScope(q: RequestSqlClient, input: AnaProjectScopeInput): Promise<AdmittedAnaProjectScope> {
  if (!present(input.projectRef) && !present(input.projectId)) return { projectId: null, programId: null, projectRef: null };
  if (!positiveId(input.organizationId) || !positiveId(input.userId)) {
    throw new AnaProjectScopeError(403, 'ANA_PROJECT_ACCESS_DENIED', 'An identified organization member is required to read this project.');
  }
  const organizationId = input.organizationId;
  const userId = input.userId;
  const ref = present(input.projectRef) ? input.projectRef : input.projectId;
  const numericRef = parseIntegerProjectId(ref);
  const numericId = optionalProjectId(input.projectId);
  if (numericRef === null && !looksLikeProgramUuid(ref)) invalid();
  try {
    const { projectId, programId } = await resolveProjectIdentity(q, organizationId, ref);
    if (numericId !== null && numericId !== projectId) {
      throw new AnaProjectScopeError(400, 'ANA_PROJECT_SCOPE_MISMATCH', 'The project identifiers do not refer to the same project.');
    }
    await assertActiveProjectAccess(q, organizationId, userId, projectId);
    return { projectId, programId, projectRef: programId ?? String(projectId) };
  } catch (error) {
    if (error instanceof AnaProjectScopeError) throw error;
    throw new AnaProjectScopeError(503, 'ANA_PROJECT_ACCESS_UNAVAILABLE', 'Current project access could not be verified. AnA has not read its sources.');
  }
}

/**
 * The projects AnA's reads may read for this person (F1, 2026-11-05): the projects the sharing policy admits the
 * person to (getAccessibleReportProjectIds, the policy the Vault's organization view lists by,
 * routes/artifacts-center-routes.ts). With a project open (projectId, or projectRef, a program uuid under the v2
 * shell), that project is admitted first (admitAnaProjectScope) and the projects are narrowed to its sponsor's
 * (narrowToSponsorOf, the Vault's own narrowing). A CRO works across authorized sponsor projects "without mixing
 * sponsor data or permissions" (the founder, 2026-11-05). An id outside them reads as no row, so it is answered as a
 * missing id is. A check that cannot run is a refusal with a code, never an empty scope.
 *
 * One implementation for AnA's tools (AnaToolExecutor.ts) and AnA's platform commands (ana-ri/command-executor.ts),
 * which cannot import AnaToolExecutor (F1-C, 2026-11-05: moved here from AnaToolExecutor.ts).
 */
export interface ProjectReadScope { organizationId: number; userId: number; projectIds: number[] }
/** Governed documents are keyed by program: the verified anchors (verifiedProgramAnchors) of the scope's projects. */
export interface ProgramReadScope extends ProjectReadScope { programIds: string[]; anchorProjectIds: number[] }
/** Why a scope could not be resolved: words to say and a code. */
export interface ProjectScopeRefusal { error: string; code: string }
/** Who is reading and the project open, as the server pinned them; never a project the model names. */
export interface ProjectScopeContext { organizationId?: unknown; userId?: unknown; projectId?: unknown; projectRef?: unknown }

export function isProjectScopeRefusal(scope: ProjectReadScope | ProjectScopeRefusal): scope is ProjectScopeRefusal {
  return 'code' in scope;
}

/**
 * ProgramReadAccessError (c2c/current-program-access.ts), known by the name its constructor sets. This module imports
 * that one only dynamically: a static import would load it for every importer of this module, and a test that mocks it
 * with a factory reaching this module would wait on itself.
 */
function isProgramReadAccessError(error: unknown): error is Error & { code: string } {
  return error instanceof Error && error.name === 'ProgramReadAccessError' && typeof (error as { code?: unknown }).code === 'string';
}

export function projectScopeRefusalOf(error: unknown): ProjectScopeRefusal {
  if (isProgramReadAccessError(error) || error instanceof AnaProjectScopeError) {
    return { error: error.message, code: error.code };
  }
  return { error: 'Current project access could not be verified. No project data was supplied.', code: 'PROJECT_ACCESS_UNAVAILABLE' };
}

/** The refusal as a tool answers it. */
export function projectScopeRefusal(error: unknown): string {
  return JSON.stringify(projectScopeRefusalOf(error));
}

export async function resolveProjectReadScope(name: string, ctx: ProjectScopeContext): Promise<ProjectReadScope | ProjectScopeRefusal> {
  const organizationId = Number(ctx.organizationId);
  const userId = Number(ctx.userId);
  if (!Number.isSafeInteger(userId) || userId <= 0) {
    return { error: `${name} reads only the projects you can open, and no identified member is known. Nothing was read.`, code: 'PROJECT_ACTOR_REQUIRED' };
  }
  try {
    const { getPool } = await import('../../db.js');
    const { readCurrentProgramActor } = await import('../c2c/current-program-access.js');
    const { getAccessibleReportProjectIds } = await import('../report-os/project-access.js');
    const { narrowToSponsorOf } = await import('../artifact-registry-read.js');
    const q = getPool();
    const actor = await readCurrentProgramActor(q, { organizationId, userId });
    const accessible = await getAccessibleReportProjectIds(organizationId, actor, q);
    const open = await admitAnaProjectScope(q, { organizationId, userId, projectId: ctx.projectId, projectRef: ctx.projectRef });
    if (open.projectId === null) return { organizationId, userId, projectIds: accessible };
    return { organizationId, userId, projectIds: (await narrowToSponsorOf(organizationId, accessible, open.projectId)).projectIds };
  } catch (error) {
    return projectScopeRefusalOf(error);
  }
}

export async function resolveProgramReadScope(name: string, ctx: ProjectScopeContext): Promise<ProgramReadScope | ProjectScopeRefusal> {
  const scope = await resolveProjectReadScope(name, ctx);
  if (isProjectScopeRefusal(scope)) return scope;
  try {
    const { getPool } = await import('../../db.js');
    const { getCurrentAccessibleProgramScope, verifiedProgramAnchors } = await import('../c2c/current-program-access.js');
    const q = getPool();
    const identity = { organizationId: scope.organizationId, userId: scope.userId };
    const allowed = new Set(scope.projectIds);
    const anchors = verifiedProgramAnchors(q, identity, await getCurrentAccessibleProgramScope(q, identity))
      .filter((anchor) => allowed.has(anchor.projectId));
    return { ...scope, programIds: anchors.map((a) => a.programId), anchorProjectIds: anchors.map((a) => a.projectId) };
  } catch (error) {
    return projectScopeRefusalOf(error);
  }
}

/** The scope, or the refusal as a tool answers it. */
export async function projectReadScope(name: string, ctx: ProjectScopeContext): Promise<ProjectReadScope | string> {
  const scope = await resolveProjectReadScope(name, ctx);
  return isProjectScopeRefusal(scope) ? JSON.stringify(scope) : scope;
}

export async function programReadScope(name: string, ctx: ProjectScopeContext): Promise<ProgramReadScope | string> {
  const scope = await resolveProgramReadScope(name, ctx);
  return isProjectScopeRefusal(scope) ? JSON.stringify(scope) : scope;
}
