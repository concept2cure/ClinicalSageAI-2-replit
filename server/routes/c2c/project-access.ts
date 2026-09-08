/**
 * Project access for the Concept2Cure routers: who is asking (workspace,
 * role), which project they mean, and whether the sharing state lets them
 * use it. Every router that touches a project resolves access through
 * verifyProjectAccess or loadProjectAccessRow — nothing else decides.
 *
 * @module server/routes/c2c/project-access
 */

import type { Request } from 'express';
import { and, eq } from 'drizzle-orm';
import { db, pool } from '../../db';
import { projects, projectMembers, projectVisibilitySettings } from '../../../shared/schema';
import { parseIntegerProjectId } from '../../lib/project-id.js';
import {
  applyProjectSharingState,
  canUseProject,
  getProjectSharingState,
  type ProjectActorRole,
} from '../../services/project-sharing-access';
import { getOrganizationId, getUserId } from './shared';

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
export async function resolveClientWorkspaceId(req: Request): Promise<number> {
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
      const owned = await pool.query(
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
    const own = await pool.query(
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
  } catch {
    return false;
  }
}
