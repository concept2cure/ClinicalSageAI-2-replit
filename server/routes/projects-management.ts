import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db';
import { auditEvents, projects } from '@shared/schema';
import { and, eq } from 'drizzle-orm';
import { getRequestActor, getTenantContext } from '../utils/tenantContext';
import { emitRuleEvent } from '../services/rules-engine';
import { createScopedLogger } from '../utils/logger.js';
import { queryableFromDrizzle } from '../db/drizzle-queryable';
import { projectDeleteBlockedRefusal, projectDeletionHolds, projectDeletionRefusal } from '../services/c2c/project-retention';
import { requireEditorAccess } from '../middleware/orgMembership';

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
// Project quotas are enforced where the project is created
// (atomicCreateProject reads the workspace and organization limits). One
// decision per question; this router asks none of them twice.

const router = Router();


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

    // Get projects from database
    const orgProjects = await db
      .select()
      .from(projects)
      .where(
        clientWorkspaceId
          ? and(
              eq(projects.organizationId, organizationId),
              eq(projects.clientWorkspaceId, clientWorkspaceId)
            )
          : eq(projects.organizationId, organizationId)
      );

    const filteredProjects = clientWorkspaceId
      ? orgProjects.filter(project => project.clientWorkspaceId === clientWorkspaceId)
      : orgProjects;

    log.debug('🔍 Retrieved projects for org', {
      organizationId,
      count: orgProjects.length,
    });
    log.debug('🔍 Projects data:', orgProjects);
    res.json(filteredProjects);
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

    // Check if project exists
    const [existingProject] = await db.select().from(projects).where(eq(projects.id, projectId));

    if (!existingProject) {
      return res.status(404).json({ error: 'Project not found' });
    }

    if (existingProject.organizationId !== organizationId) {
      return res.status(403).json({ error: 'Access denied to this project' });
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

    const [existingProject] = await db.select().from(projects).where(eq(projects.id, projectId));

    if (!existingProject) {
      return res.status(404).json({ error: 'Project not found' });
    }

    if (existingProject.organizationId !== organizationId) {
      return res.status(403).json({ error: 'Access denied to this project' });
    }

    const [updatedProject] = await db
      .update(projects)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(eq(projects.id, projectId))
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
      return res.status(400).json({ error: 'Invalid project data', details: error.errors });
    }
    res.status(500).json({ error: 'Failed to update project' });
  }
});

export default router;
