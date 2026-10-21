/**
 * Project access for the Concept2Cure routers: who is asking (workspace,
 * role), which project they mean, and whether the sharing state lets them
 * use it. Every router that touches a project resolves access through
 * verifyProjectAccess or loadProjectAccessRow — nothing else decides.
 *
 * @module server/routes/c2c/project-access
 */

import type { Request, RequestHandler } from 'express';
import { and, eq } from 'drizzle-orm';
import { db, pool } from '../../db';
import { projects, projectMembers, projectVisibilitySettings } from '../../../shared/schema';
import { parseIntegerProjectId } from '../../lib/project-id.js';
import {
  applyProjectSharingState,
  canUseProject,
  canEditProject,
  getProjectSharingState,
  type ProjectActorRole,
} from '../../services/project-sharing-access';
import { getOrganizationId, getUserId, sendError } from './shared';
import { createScopedLogger } from '../../utils/logger';
import { CsrScopeError, readCsrProjectActor } from '../../services/csr/project-scope';
import { GOVERNED_WRITE_ROLES } from '../../middleware/orgMembership';
import type { RequestSqlClient } from '../../db/requestDb';
import { ProgramReadAccessError, requireCurrentProgramAccess, type CurrentProgramAccess } from '../../services/c2c/current-program-access';
import { programInOrganization } from '../../services/c2c/program-access';
import { canAccessReportProject } from '../../services/report-os/project-access';

export function normalizeProjectSettings(settings: unknown): Record<string, unknown> {
  return settings && typeof settings === 'object' ? (settings as Record<string, unknown>) : {};
}

/**
 * Resolve the caller's client workspace — validated, never fabricated.
 *
 * The previous implementation returned a hardcoded workspace 1 outside
 * production ("dev fallback"), which is a fabricated tenant anchor: on any
 * database whose workspace ids do not start at 1 it broke with an FK
 * violation, and wherever id 1 happened to exist it silently attached rows to
 * whatever tenant owned workspace 1. It also trusted the x-client-id header
 * (tenantContext.clientWorkspaceId) without checking the workspace belongs to
 * the caller's organization, so a tenant could plant rows into another org's
 * workspace. Both are gone:
 *   - a claimed workspace id is accepted only after a same-statement
 *     ownership check against the caller's org (fail closed on mismatch);
 *   - with no claim, the caller org's own workspace is resolved from the
 *     database (deterministic: lowest id);
 *   - no workspace resolvable → error, in every environment.
 */
export async function resolveClientWorkspaceId(req: Request, executor: RequestSqlClient = pool): Promise<number> {
  const ctx = req.tenantContext as Record<string, unknown> | undefined;
  const orgId = Number(ctx?.organizationId ?? req.user?.organizationId);
  const hasOrg = Number.isInteger(orgId) && orgId > 0;

  const claimed = ctx?.clientWorkspaceId;
  if (claimed != null && claimed !== '') {
    const id = Number(claimed);
    if (Number.isInteger(id) && id > 0) {
      if (!hasOrg) {
        throw new Error('Client workspace context requires an authenticated organization');
      }
      const owned = await executor.query(
        'SELECT id FROM client_workspaces WHERE id = $1 AND organization_id = $2',
        [id, orgId]
      );
      if (owned.rows.length === 0) {
        // Fail closed: never accept a workspace outside the caller's org, and
        // do not disclose whether the id exists elsewhere.
        throw new Error('Client workspace does not belong to the caller organization');
      }
      return id;
    }
  }

  if (hasOrg) {
    const own = await executor.query(
      'SELECT id FROM client_workspaces WHERE organization_id = $1 ORDER BY id LIMIT 1',
      [orgId]
    );
    if (own.rows.length > 0) return Number(own.rows[0].id);
  }
  throw new Error('Client workspace context required');
}

export function getActorRole(req: Request): ProjectActorRole {
  const normalized = (req.userRole || 'member').toLowerCase() as ProjectActorRole;
  return normalized || 'member';
}

const logger = createScopedLogger('c2c-project-access');

export function isMissingTableError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === '42P01'
  );
}

export function getProjectScope(
  projectParam: string | string[] | undefined
): { numericId: number } | null {
  const raw = Array.isArray(projectParam) ? projectParam[0] : projectParam;
  if (typeof raw !== 'string') return null;
  const projectId = raw.replace('proj_', '');
  const numericId = parseIntegerProjectId(projectId);
  if (numericId === null) {
    return null;
  }
  return { numericId };
}

export async function loadProjectAccessRow(params: {
  organizationId: number;
  clientWorkspaceId: number;
  projectId: number;
  userId: number;
  actorRole: ProjectActorRole;
}): Promise<{
  project: {
    id: number;
    name: string;
    description: string | null;
    metadata: unknown;
    status: string;
    organizationId: number;
    createdById: number | null;
    ownerId: number | null;
    settings: unknown;
    createdAt: Date;
    updatedAt: Date;
  } | null;
  legacyFallbackApplied: boolean;
}> {
  const [project] = await db
    .select({
      id: projects.id,
      name: projects.name,
      description: projects.description,
      metadata: projects.metadata,
      status: projects.status,
      organizationId: projects.organizationId,
      createdById: projects.createdById,
      ownerId: projects.ownerId,
      settings: projects.settings,
      createdAt: projects.createdAt,
      updatedAt: projects.updatedAt,
    })
    .from(projects)
    .where(
      and(
        eq(projects.id, params.projectId),
        eq(projects.organizationId, params.organizationId),
        eq(projects.clientWorkspaceId, params.clientWorkspaceId)
      )
    )
    .limit(1);

  if (!project) {
    return { project: null, legacyFallbackApplied: false };
  }

  const sharing = await loadProjectSharingState(project.id, params.organizationId, project);
  const settingsWithSharing = applyProjectSharingState(
    normalizeProjectSettings(project.settings),
    sharing
  );
  const hasAccess = canUseProject({
    actor: { userId: params.userId, orgRole: params.actorRole },
    project: {
      createdById: project.createdById ?? null,
      ownerId: project.ownerId ?? null,
      settings: settingsWithSharing,
    },
  });

  if (!hasAccess) {
    // A reviewer with a live assignment on an artifact in this project has
    // access BECAUSE of that assignment. Without this, assignment granted
    // nothing: the assigned reviewer's own decision submission 404'd on this
    // very predicate (creator/owner/sharing only), making the review flow
    // unusable for any reviewer who is not also on the project team —
    // discovered on the golden journey's first real browser execution.
    const assigned = await pool.query(
      `SELECT 1
         FROM concept2cure_review_assignments ra
         JOIN concept2cure_artifacts a ON a.id = ra.artifact_id
        WHERE ra.reviewer_id = $1
          AND ra.organization_id = $2
          AND a.project_id = $3
          AND ra.status = 'pending'
        LIMIT 1`,
      [params.userId, params.organizationId, params.projectId]
    );
    if (assigned.rows.length > 0) {
      return { project, legacyFallbackApplied: sharing.legacyFallbackApplied };
    }
    return { project: null, legacyFallbackApplied: sharing.legacyFallbackApplied };
  }

  return { project, legacyFallbackApplied: sharing.legacyFallbackApplied };
}

export async function loadProjectSharingState(
  projectId: number,
  organizationId: number,
  project?: { ownerId: number | null; createdById: number | null; settings: unknown }
) {
  const fallback = getProjectSharingState({
    settings: normalizeProjectSettings(project?.settings),
    ownerId: project?.ownerId ?? null,
    createdById: project?.createdById ?? null,
  });

  try {
    const [[visibility], members] = await Promise.all([
      db
        .select({ visibility: projectVisibilitySettings.visibility })
        .from(projectVisibilitySettings)
        .where(
          and(
            eq(projectVisibilitySettings.projectId, projectId),
            eq(projectVisibilitySettings.organizationId, organizationId)
          )
        )
        .limit(1),
      db
        .select({
          userId: projectMembers.userId,
          role: projectMembers.role,
          status: projectMembers.status,
          invitedById: projectMembers.invitedById,
          acceptedAt: projectMembers.acceptedAt,
        })
        .from(projectMembers)
        .where(
          and(
            eq(projectMembers.projectId, projectId),
            eq(projectMembers.organizationId, organizationId),
            eq(projectMembers.status, 'active')
          )
        ),
    ]);

    return getProjectSharingState({
      settings: {
        projectSharing: {
          visibility: visibility?.visibility ?? fallback.visibility,
          members: members.map(m => ({
            userId: m.userId,
            role: m.role,
            status: m.status,
            addedById: m.invitedById ?? null,
            addedAt: m.acceptedAt?.toISOString() ?? new Date().toISOString(),
          })),
        },
      },
      ownerId: project?.ownerId ?? null,
      createdById: project?.createdById ?? null,
    });
  } catch (error) {
    if (isMissingTableError(error)) {
      return fallback;
    }
    throw error;
  }
}

/**
 * Verify project ownership before conversation operations.
 *
 * ── A check that could not RUN is not a denial (WO-15 finding 9) ─────────────
 * This used to end `catch { return false }`, unlogged. `false` is routed by
 * every caller to `sendError(res, 404, 'Project not found')` —
 * governance-ops.ts:44, artifacts.ts:378 and four more — and that 404 is
 * deliberately indistinguishable from a cross-tenant id. So a missing table, a
 * dropped connection or a cancelled statement produced the same answer as a
 * legitimate deny: a control that was completely broken looked exactly like a
 * control that was working, to the caller and to the operator both.
 *
 * Four situations were collapsed into one. Only the first two are denials:
 *
 *   genuine no-match    zero rows, no error              deny — correct
 *   caller garbage      unparseable project id           deny — correct
 *   SCHEMA failure      42P01 / 42703 / 42501 / 3F000    the check DID NOT RUN
 *   INFRASTRUCTURE      08006 / 53300 / 57014            the check DID NOT RUN
 *
 * The last two now log and propagate. Every caller already wraps its handler in
 * a try/catch that logs and returns 500, so the outcome is an operator-visible
 * failure rather than a false sentence about this caller's access. Deny-by-
 * default is the right DIRECTION for a tenant boundary; silence was never part
 * of it. `innovation-routes.ts` fixed the same defect in `guardQuery` on
 * 2026-09-10 (GuardUnavailableError) and `moduleEntitlementGate.ts:189` states
 * the rule this broke: **never silent.**
 *
 * Deliberately NOT treated as a denial-with-fallback the way
 * `loadProjectSharingState` treats `isMissingTableError` further up this file:
 * that one is reading sharing settings, where defaults are a defensible answer.
 * This one is the authorization decision, and there is no safe default for
 * "I could not tell whether you may see this".
 */
export async function verifyProjectAccess(
  req: Request,
  projectId: string | string[] | undefined
): Promise<boolean> {
  const organizationId = getOrganizationId(req);
  const userId = getUserId(req);
  const actorRole = getActorRole(req);
  const clientWorkspaceId = await resolveClientWorkspaceId(req);
  try {
    const scope = getProjectScope(projectId);
    if (!scope) {
      return false;
    }
    const projectAccess = await loadProjectAccessRow({
      organizationId,
      clientWorkspaceId,
      projectId: scope.numericId,
      userId,
      actorRole,
    });
    return !!projectAccess.project;
  } catch (error) {
    logger.error('project access check could not complete — not answering "no access"', {
      projectId: typeof projectId === 'string' ? projectId : String(projectId ?? ''),
      organizationId,
      code: (error as { code?: string })?.code ?? null,
      detail: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

export class ProjectAdmissionRefusal extends Error {
  constructor(readonly status: 403 | 404 | 409 | 503, readonly code: string, message: string) {
    super(message); this.name = 'ProjectAdmissionRefusal';
  }
}

/** Resolve current persisted membership rather than reuse a token's old role. */
export async function requireCurrentProjectActor(req: Request, forWrite = false) {
  let organizationId: number;
  try { organizationId = getOrganizationId(req); }
  catch { throw new ProjectAdmissionRefusal(403, 'PROJECT_MEMBERSHIP_REQUIRED', 'Current active organization membership is required.'); }
  try {
    // Read/export operations preserve the canonical offboarding data-return
    // window. This mode comes from the registered operation, never a payload.
    const actor = await readCsrProjectActor(pool, organizationId, getUserId(req), {allowReadOnlyTenant:!forWrite});
    const role = String(actor.role).toLowerCase();
    if (forWrite && !GOVERNED_WRITE_ROLES.has(role)) {
      throw new ProjectAdmissionRefusal(403, 'PROJECT_WRITE_PERMISSION_DENIED', 'Your current organization role cannot change this project record.');
    }
    req.userRole = role;
    return { userId: actor.userId, role };
  } catch (error) {
    if (error instanceof ProjectAdmissionRefusal) throw error;
    if ((error as { status?: number }).status === 403) {
      throw new ProjectAdmissionRefusal(403, 'PROJECT_MEMBERSHIP_REQUIRED', 'Current active organization membership is required.');
    }
    throw new ProjectAdmissionRefusal(503, 'PROJECT_ACCESS_UNAVAILABLE', 'Current project access could not be verified. Nothing was changed.');
  }
}

/** Add fresh write authority to the existing sharing/read-assignment policy. */
export async function requireProjectAdmission(req: Request, projectId: string | string[] | undefined, forWrite = false,
  pinned?: { executor: RequestSqlClient; programId?: string; forShare?: boolean }): Promise<AdmittedProject> {
  if (pinned) return requirePinnedProjectAdmission(req, projectId, forWrite, pinned);
  const actor = await requireCurrentProjectActor(req, forWrite);
  const scope = getProjectScope(projectId);
  if (!scope) throw new ProjectAdmissionRefusal(404, 'PROJECT_NOT_FOUND', 'Project not found.');
  try {
    const organizationId = getOrganizationId(req);
    const { project } = await loadProjectAccessRow({ organizationId, userId: actor.userId,
      actorRole: actor.role as ProjectActorRole, projectId: scope.numericId, clientWorkspaceId: await resolveClientWorkspaceId(req) });
    if (!project) throw new ProjectAdmissionRefusal(404, 'PROJECT_NOT_FOUND', 'Project not found.');
    if (forWrite) {
      const sharing = await loadProjectSharingState(project.id, organizationId, project);
      if (!GOVERNED_WRITE_ROLES.has(actor.role) || !canEditProject({ actor: { userId: actor.userId, orgRole: actor.role },
        project: { ownerId: project.ownerId, createdById: project.createdById,
          settings: applyProjectSharingState(normalizeProjectSettings(project.settings), sharing) } })) {
        throw new ProjectAdmissionRefusal(403, 'PROJECT_WRITE_PERMISSION_DENIED', 'Your current role and project permissions do not allow changes to this record.');
      }
      if (['archived', 'deleted'].includes(project.status)) {
        throw new ProjectAdmissionRefusal(409, 'PROJECT_ARCHIVED', 'This project is archived. Retained records can still be read.');
      }
    }
    return project;
  } catch (error) {
    if (error instanceof ProjectAdmissionRefusal) throw error;
    if (error instanceof Error && /Client workspace (does not belong|context)/.test(error.message)) {
      throw new ProjectAdmissionRefusal(403, 'PROJECT_WORKSPACE_PERMISSION_DENIED', 'A current workspace in this organization is required.');
    }
    throw new ProjectAdmissionRefusal(503, 'PROJECT_ACCESS_UNAVAILABLE', 'Current project access could not be verified. Nothing was changed.');
  }
}

export type AdmittedProject = NonNullable<Awaited<ReturnType<typeof loadProjectAccessRow>>['project']> & {
  clientWorkspaceId?: number | null; regulatoryProgramId?: string | null;
};

async function pinnedProjectRow(q: RequestSqlClient, projectId: number, org: number, forWrite: boolean): Promise<AdmittedProject> {
  const statement = forWrite
    ? `SELECT id,name,description,metadata,status,organization_id AS "organizationId",
      owner_id AS "ownerId",created_by_id AS "createdById",settings,created_at AS "createdAt",updated_at AS "updatedAt",
      client_workspace_id AS "clientWorkspaceId",regulatory_program_id AS "regulatoryProgramId"
      FROM projects WHERE id=$1 AND organization_id=$2 FOR UPDATE`
    : `SELECT id,name,description,metadata,status,organization_id AS "organizationId",
      owner_id AS "ownerId",created_by_id AS "createdById",settings,created_at AS "createdAt",updated_at AS "updatedAt",
      client_workspace_id AS "clientWorkspaceId",regulatory_program_id AS "regulatoryProgramId"
      FROM projects WHERE id=$1 AND organization_id=$2`;
  const result = await q.query(statement, [projectId, org]);
  if (result.rows.length !== 1) throw new ProjectAdmissionRefusal(404, 'PROJECT_NOT_FOUND', 'Project not found.');
  return result.rows[0] as AdmittedProject;
}

async function pinnedWorkspace(req: Request, q: RequestSqlClient, project: AdmittedProject, current: CurrentProgramAccess | null): Promise<void> {
  if (current && (current.projectId !== project.id || current.clientWorkspaceId !== project.clientWorkspaceId)) {
    throw new ProjectAdmissionRefusal(409, 'PROJECT_SCOPE_MISMATCH', 'The project does not identify the selected program. Nothing was changed.');
  }
  const claimed = (req.tenantContext as Record<string, unknown> | undefined)?.clientWorkspaceId;
  const workspace = current ? current.clientWorkspaceId : await resolveClientWorkspaceId(req, q);
  if (!workspace || project.clientWorkspaceId !== workspace || (current && claimed != null && Number(claimed) !== workspace)) {
    throw new ProjectAdmissionRefusal(403, 'PROJECT_WORKSPACE_PERMISSION_DENIED', 'The current client workspace does not match this project.');
  }
}

function pinnedWritePermission(project: AdmittedProject, role: string, forWrite: boolean): void {
  if (!forWrite) return;
  if (!GOVERNED_WRITE_ROLES.has(role)) throw new ProjectAdmissionRefusal(403, 'PROJECT_WRITE_PERMISSION_DENIED', 'Your current organization role cannot change this project record.');
  if (['archived', 'deleted'].includes(project.status)) throw new ProjectAdmissionRefusal(409, 'PROJECT_ARCHIVED', 'This project is archived. Retained records can still be read.');
}

/** Same current actor and sharing policy, enlisted on a caller's request client. */
async function requirePinnedProjectAdmission(req: Request, projectId: string | string[] | undefined, forWrite: boolean,
  options: { executor: RequestSqlClient; programId?: string; forShare?: boolean }): Promise<AdmittedProject> {
  const scope = getProjectScope(projectId);
  if (!scope) throw new ProjectAdmissionRefusal(404, 'PROJECT_NOT_FOUND', 'Project not found.');
  try {
    const q = options.executor;
    const organizationId = getOrganizationId(req);
    const userId = getUserId(req);
    if (options.programId && options.forShare && !await programInOrganization(q, options.programId, organizationId, { forShare: true })) {
      throw new ProjectAdmissionRefusal(404, 'PROJECT_NOT_FOUND', 'Project not found.');
    }
    const project = await pinnedProjectRow(q, scope.numericId, organizationId, forWrite);
    const current = options.programId ? await requireCurrentProgramAccess(q, { organizationId, userId,
      programId: options.programId, forShare: options.forShare }) : null;
    const actor = current?.actor ?? await readCsrProjectActor(q, organizationId, userId, { forShare: options.forShare });
    await pinnedWorkspace(req, q, project, current);
    if (!await canAccessReportProject(organizationId, actor, project.id, q, { forWrite })) {
      throw new ProjectAdmissionRefusal(forWrite ? 403 : 404, 'PROJECT_PERMISSION_DENIED', 'Current project permissions do not permit this operation.');
    }
    pinnedWritePermission(project, String(actor.role), forWrite);
    req.userRole = String(actor.role);
    req.userId = actor.userId;
    return project;
  } catch (error) {
    if (error instanceof ProjectAdmissionRefusal) throw error;
    if (error instanceof ProgramReadAccessError) throw new ProjectAdmissionRefusal(error.status, error.code, error.message);
    if (error instanceof CsrScopeError) throw new ProjectAdmissionRefusal(403, 'PROJECT_MEMBERSHIP_REQUIRED', 'Current active organization membership is required.');
    throw new ProjectAdmissionRefusal(503, 'PROJECT_ACCESS_UNAVAILABLE', 'Current project access could not be verified. Nothing was changed.');
  }
}

/** Run before route bodies, upload receivers or project-content reads. */
export function projectAdmissionMiddleware(options: { forWrite?: boolean } = {}): RequestHandler {
  return async (req, res, next) => {
    try {
      await requireProjectAdmission(req, req.params.projectId, options.forWrite ?? !['GET', 'HEAD'].includes(req.method));
      next();
    } catch (error) {
      const refusal = error instanceof ProjectAdmissionRefusal ? error : new ProjectAdmissionRefusal(503, 'PROJECT_ACCESS_UNAVAILABLE', 'Current project access could not be verified. Nothing was changed.');
      sendError(res, refusal.status, refusal.message, undefined, refusal.code);
    }
  };
}
