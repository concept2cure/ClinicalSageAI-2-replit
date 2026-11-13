import { Router } from 'express';
import { z } from 'zod';
import type { Request, Response } from 'express';
import { db, pool } from '../db';
import { auditEvents, projects } from '@shared/schema';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { getRequestActor, getTenantContext } from '../utils/tenantContext';
import { emitRuleEvent } from '../services/rules-engine';
import { createScopedLogger } from '../utils/logger.js';
import { queryableFromDrizzle } from '../db/drizzle-queryable';
import { projectDeleteBlockedRefusal, projectDeletionHolds, projectDeletionRefusal } from '../services/c2c/project-retention';
import { requireEditorAccess } from '../middleware/orgMembership';
import { authedUserId } from '../utils/authedActor';
import { ProgramReadAccessError, readCurrentProgramActor } from '../services/c2c/current-program-access';
import { canAccessReportProject, getAccessibleReportProjectIds, type ReportProjectActor } from '../services/report-os/project-access';

const log = createScopedLogger('projects-management');

// ── Why there is no `licenses` check in this router ────────────────────────
//
// Every handler here used to open with a lookup of
// `licenses WHERE organization_id = $1 AND status = 'active'` and answered
// 403 'No active license for this organization' when it found nothing. No
// writer in the platform produces that row: the licenses table is the
// consultant → client-workspace licence (keyed by client_id, reached through
// client_workspaces.organization_id), and the only writer it ever had — the
// license-management router, since removed because every one of its handlers
// threw — never set organization_id. So the check could only ever deny —
// on a fresh install, on a paying enterprise tenant, on every organization —
// and the V2 task board and collaboration launcher, which read /api/projects,
// showed the 403 as an error on day one. It was a third gate with its own dead
// rule set on top of the two that actually decide access:
//   · the tenant lifecycle guard on the /api boundary (organization status and
//     payment posture — server/middleware/tenantLifecycleGuard.ts), and
//   · the module entitlement gate mounted across every route family
//     (/api/projects belongs to the `projects` and `project-home` modules —
//     server/middleware/moduleEntitlementGate.ts).
// Project creation and quotas belong to POST /api/c2c/projects (A2.9). One
// decision per question; this router asks none of them twice.

// ── Which projects this router answers for ─────────────────────────────────
//
// Until 2026-11-13 every handler here resolved a project by its organisation
// alone. The organisation is the verified session's, so nothing crossed a
// tenant; but inside one organisation the list answered every project's whole
// row to any member, narrowed only by a client workspace id the caller chose
// to send, and one project could be read, renamed or deleted by a member who
// cannot open it. A CRO member working in one sponsor's workspace read the
// other sponsors' project names by leaving the header off.
//
// Each handler now asks the project sharing policy the canonical list and the
// reporting, tasks and at-risk reads already ask (readCurrentProgramActor,
// then getAccessibleReportProjectIds / canAccessReportProject): one mechanism.
// A project the person cannot open reads as missing, the same answer a project
// that does not exist gets. A failed access read is an error, never an empty
// list. Evidence: docs/evidence/F1/2026-11-13-projects-list-scope/.

/** The session's member of the organisation, as the project sharing policy reads them. */
function projectActor(req: Request, organizationId: number): Promise<ReportProjectActor> {
  return readCurrentProgramActor(pool, { organizationId, userId: authedUserId(req) ?? undefined });
}

function projectAccessFailure(res: Response, error: unknown): Response {
  if (error instanceof ProgramReadAccessError) return res.status(error.status).json({ error: error.message, code: error.code });
  log.error('Project access could not be read', { err: error instanceof Error ? error.message : String(error) });
  return res.status(503).json({ error: 'Current project access could not be verified. Nothing was read or changed.', code: 'PROJECT_ACCESS_UNAVAILABLE' });
}

/** What the person may do with one project of the organisation: nothing (it reads as missing), open it, or change it. */
async function projectAdmission(req: Request, organizationId: number, projectId: number): Promise<'none' | 'read' | 'write'> {
  const actor = await projectActor(req, organizationId);
  if (!(await canAccessReportProject(organizationId, actor, projectId, pool))) return 'none';
  return (await canAccessReportProject(organizationId, actor, projectId, pool, { forWrite: true })) ? 'write' : 'read';
}

const router = Router();

// Validation schemas
const updateProjectSchema = z.object({
  name: z.string().min(3, 'Project name must be at least 3 characters').optional(),
  description: z.string().optional(),
  status: z.enum(['planning', 'active', 'on-hold', 'completed', 'archived']).optional(),
  priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
});

/**
 * GET /api/projects
 * Get all projects for organization
 */
router.get('/', async (req, res) => {
  try {
    const tenantContext = getTenantContext(req);
    if ('error' in tenantContext) {
      return res.status(400).json({ error: tenantContext.error });
    }
    const { organizationId, clientWorkspaceId } = tenantContext;

    log.debug('🔍 GET projects request', {
      organizationId,
      // security-allow: source-telemetry
      from: req.headers['x-organization-id'] ? 'header' : 'query',
    });

    let readable: number[];
    try {
      readable = await getAccessibleReportProjectIds(organizationId, await projectActor(req, organizationId), pool);
    } catch (error) {
      return projectAccessFailure(res, error);
    }
    if (readable.length === 0) return res.json([]);

    // The projects the person can open, and only the fields the task board and the collaboration launcher read
    // (TaskBoard.tsx ProjectOpt, CollabLauncher.tsx ProjectRow). The client workspace a caller names narrows the
    // list; it never widens it.
    const listed = await db
      .select({ id: projects.id, name: projects.name, code: projects.code, status: projects.status,
        regulatoryProgramId: projects.regulatoryProgramId })
      .from(projects)
      .where(and(
        eq(projects.organizationId, organizationId),
        inArray(projects.id, readable),
        ...(clientWorkspaceId ? [eq(projects.clientWorkspaceId, clientWorkspaceId)] : []),
      ))
      .orderBy(asc(projects.id));

    log.debug('Listed projects', { organizationId, count: listed.length });
    res.json(listed);
  } catch (error) {
    log.error('Error fetching projects:', error);
    res.status(500).json({ error: 'Failed to fetch projects' });
  }
});

/**
 * GET /api/projects/:projectId
 * Get a specific project
 */
router.get('/:projectId', async (req, res) => {
  try {
    const projectId = parseInt(req.params.projectId, 10);
    const tenantContext = getTenantContext(req);
    if ('error' in tenantContext) {
      return res.status(400).json({ error: tenantContext.error });
    }
    const { organizationId, clientWorkspaceId } = tenantContext;

    if (Number.isNaN(projectId)) {
      return res.status(400).json({ error: 'Invalid project ID' });
    }

    const whereClause = clientWorkspaceId
      ? and(
          eq(projects.id, projectId),
          eq(projects.organizationId, organizationId),
          eq(projects.clientWorkspaceId, clientWorkspaceId)
        )
      : and(eq(projects.id, projectId), eq(projects.organizationId, organizationId));

    try {
      if ((await projectAdmission(req, organizationId, projectId)) === 'none') {
        return res.status(404).json({ error: 'Project not found' });
      }
    } catch (error) {
      return projectAccessFailure(res, error);
    }

    const [project] = await db.select().from(projects).where(whereClause);

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    res.json(project);
  } catch (error) {
    log.error('Error fetching project:', error);
    res.status(500).json({ error: 'Failed to fetch project' });
  }
});

/**
 * DELETE /api/projects/:projectId
 * Delete a specific project
 */
/* A writing role deletes (PF-08). The route answered any member of the
   organization, viewer included. */
router.delete('/:projectId', requireEditorAccess, async (req, res) => {
  try {
    const projectId = parseInt(req.params.projectId);
    const tenantContext = getTenantContext(req);
    if ('error' in tenantContext) {
      return res.status(400).json({ error: tenantContext.error });
    }
    const { organizationId } = tenantContext;

    if (Number.isNaN(projectId)) {
      return res.status(400).json({ error: 'Invalid project ID' });
    }

    // A project the person cannot open reads as missing; one they can open but not change is refused.
    try {
      const admission = await projectAdmission(req, organizationId, projectId);
      if (admission === 'none') return res.status(404).json({ error: 'Project not found' });
      if (admission === 'read') return res.status(403).json({ error: 'You can open this project but not change it.', code: 'PROJECT_WRITE_DENIED' });
    } catch (error) {
      return projectAccessFailure(res, error);
    }

    const [existingProject] = await db.select().from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.organizationId, organizationId)));

    if (!existingProject) {
      return res.status(404).json({ error: 'Project not found' });
    }

    /* A program's anchor row, and a project holding documents past draft, is
       never hard-deleted here (PF-08; PF-13 founder decision 2026-09-26): the
       delete cascades them away. The check reads, and locks, what this delete
       would destroy, in the same transaction as the delete. */
    const refusal = await db.transaction(async (tx) => {
      const refused = projectDeletionRefusal(
        await projectDeletionHolds(queryableFromDrizzle(tx), { projectIds: [projectId] }),
        'project',
      );
      if (refused) return refused;
      await tx.delete(projects).where(and(eq(projects.id, projectId), eq(projects.organizationId, organizationId)));
      return null;
    });
    if (refusal) {
      return res.status(refusal.status).json(refusal.body);
    }

    try {
      const now = new Date();
      const { userName, userRole } = getRequestActor(req);

      await db.insert(auditEvents).values({
        organizationId,
        eventType: 'project_delete',
        entityType: 'project',
        entityId: existingProject.id,
        userId: null,
        userName,
        userRole,
        ipAddress: req.ip,
        userAgent: req.get('user-agent') || null,
        timestamp: now,
        timestampUtc: now,
        oldValues: existingProject,
        newValues: null,
        changedFields: Object.keys(existingProject || {}),
        reason: 'Project deleted',
        comments: null,
        requiresSignature: false,
        regulatorySignificant: true,
        gxpRelevant: true,
        metadata: {
          source: 'projects-management',
          clientWorkspaceId: existingProject.clientWorkspaceId,
        },
      });
    } catch (auditError) {
      log.error('Audit trail creation failed (non-blocking):', auditError);
    }

    log.debug(`Deleted project ${projectId} (${existingProject.name})`);
    res.json({ message: 'Project deleted successfully', projectId });
  } catch (error) {
    // Another store keeps a record under the project; the delete rolled back (PF-13).
    const blocked = projectDeleteBlockedRefusal(error, 'project');
    if (blocked) {
      log.warn('Project delete refused by the database: a store keeps records under it', blocked.heldBy);
      return res.status(blocked.status).json(blocked.body);
    }
    log.error('Error deleting project:', error);
    res.status(500).json({ error: 'Failed to delete project' });
  }
});

/**
 * PATCH /api/projects/:projectId
 * Update a specific project
 */
router.patch('/:projectId', async (req, res) => {
  try {
    const projectId = parseInt(req.params.projectId, 10);
    const tenantContext = getTenantContext(req);
    if ('error' in tenantContext) {
      return res.status(400).json({ error: tenantContext.error });
    }
    const { organizationId } = tenantContext;

    if (Number.isNaN(projectId)) {
      return res.status(400).json({ error: 'Invalid project ID' });
    }

    const updates = updateProjectSchema.parse(req.body);
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No valid fields provided for update' });
    }

    // A project the person cannot open reads as missing; one they can open but not change is refused.
    try {
      const admission = await projectAdmission(req, organizationId, projectId);
      if (admission === 'none') return res.status(404).json({ error: 'Project not found' });
      if (admission === 'read') return res.status(403).json({ error: 'You can open this project but not change it.', code: 'PROJECT_WRITE_DENIED' });
    } catch (error) {
      return projectAccessFailure(res, error);
    }

    const [existingProject] = await db.select().from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.organizationId, organizationId)));

    if (!existingProject) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const [updatedProject] = await db
      .update(projects)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(and(eq(projects.id, projectId), eq(projects.organizationId, organizationId)))
      .returning();

    try {
      const now = new Date();
      const { userName, userRole } = getRequestActor(req);

      await db.insert(auditEvents).values({
        organizationId,
        eventType: 'project_update',
        entityType: 'project',
        entityId: projectId,
        userId: null,
        userName,
        userRole,
        ipAddress: req.ip,
        userAgent: req.get('user-agent') || null,
        timestamp: now,
        timestampUtc: now,
        oldValues: existingProject,
        newValues: updatedProject,
        changedFields: Object.keys(updates),
        reason: 'Project updated',
        comments: null,
        requiresSignature: false,
        regulatorySignificant: true,
        gxpRelevant: true,
        metadata: {
          source: 'projects-management',
          clientWorkspaceId: existingProject.clientWorkspaceId,
        },
      });
    } catch (auditError) {
      log.error('Audit trail creation failed (non-blocking):', auditError);
    }

    // Emit rules engine events for project updates
    try {
      await emitRuleEvent('project_updated', organizationId, projectId, {
        project: updatedProject,
        previousValues: existingProject,
        changedFields: Object.keys(updates),
      });
      // Detect status change specifically
      if (updates.status && updates.status !== existingProject.status) {
        await emitRuleEvent('project_status_changed', organizationId, projectId, {
          project: updatedProject,
          previousStatus: existingProject.status,
          newStatus: updates.status,
        });
      }
    } catch (ruleError) {
      log.error('Rules engine event emission failed (non-blocking):', ruleError);
    }

    res.json(updatedProject);
  } catch (error) {
    log.error('Error updating project:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid project data', details: error.issues });
    }
    res.status(500).json({ error: 'Failed to update project' });
  }
});

export default router;
