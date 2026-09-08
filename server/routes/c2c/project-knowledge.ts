/**
 * A project's knowledge base and its neighbourhood — the knowledge-base state
 * and its metadata update, the project activity feed, and linked projects.
 * Ledger L53, slice 13: moved verbatim out of routes/concept2cure.ts and
 * mounted at the same prefix ahead of it with the same middleware chain; the
 * knowledge shapes and their normaliser live in c2c/shared because the
 * project reads and the connected-apps routes use them too.
 *
 * @module server/routes/c2c/project-knowledge
 */

import { Router, type Request, type Response } from 'express';
import { projects } from '../../../shared/schema';
import { db, pool } from '../../db';
import { cacheResponse } from '../../middleware/enterprise-performance';
import { getProjectRetrievalMode } from '../../services/projects/retrieval-mode.js';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { parseIntegerProjectId } from '../../lib/project-id.js';
import { createScopedLogger } from '../../utils/logger';
import { authMiddleware } from '../../auth';
import { requireOrganizationContext, tenantContextMiddleware } from '../../middleware/tenantContext';
import {
  type ProjectKnowledge,
  concept2cureRateLimiter,
  getOrganizationId,
  getUserId,
  logAuditEntry,
  normalizeKnowledge,
  sanitizeContent,
  sendError,
  sendSuccess,
} from './shared';
import { getActorRole, getProjectScope, loadProjectAccessRow, normalizeProjectSettings, resolveClientWorkspaceId, verifyProjectAccess } from './project-access';

const logger = createScopedLogger('concept2cure-project-knowledge');
const router = Router();

// The same chain the main router applies, in the same order.
router.use(concept2cureRateLimiter);
router.use(authMiddleware);
router.use(tenantContextMiddleware);
router.use(requireOrganizationContext);

const updateKnowledgeSchema = z
  .object({
    customInstructions: z.string().max(5000).optional(),
    context: z.string().max(20000).optional(),
    memoryEnabled: z.boolean().optional(),
  })
  .partial();

/**
 * GET /api/concept2cure/projects/:projectId/knowledge
 * Retrieve knowledge base state for a project.
 */
router.get('/projects/:projectId/knowledge', async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const userId = getUserId(req);
    const actorRole = getActorRole(req);
    const scope = getProjectScope(req.params.projectId);
    if (!scope) {
      return sendError(res, 400, 'Invalid project ID format', undefined, 'INVALID_ID');
    }

    const projectAccess = await loadProjectAccessRow({
      organizationId,
      clientWorkspaceId: await resolveClientWorkspaceId(req),
      projectId: scope.numericId,
      userId,
      actorRole,
    });
    const project = projectAccess.project;

    if (!project) {
      return sendError(res, 404, 'Project not found');
    }

    const settings = normalizeProjectSettings(project.settings);
    const knowledge = normalizeKnowledge(settings);
    // A2: surface the retrieval mode (read-through compute when not yet set) so
    // the UI can show the in-context vs retrieval indicator.
    const modeState = await getProjectRetrievalMode(scope.numericId, organizationId);
    return sendSuccess(res, {
      ...knowledge,
      retrievalMode: modeState.mode,
      knowledgeTokenEstimate: modeState.tokenEstimate,
    });
  } catch (error: any) {
    logger.error('Failed to fetch project knowledge', { error: error.message });
    return sendError(res, 500, 'Failed to fetch project knowledge');
  }
});

/**
 * GET /api/concept2cure/projects/:projectId/activity
 * Returns a merged activity feed: explicit project_activities + recent artifact updates.
 */
router.get(
  '/projects/:projectId/activity',
  cacheResponse({
    ttl: 30_000,
    // Organization prefix comes from cacheResponse; see /projects above.
    keyGenerator: req => `activity:${req.params.projectId}`,
  }),
  async (req: Request, res: Response) => {
    try {
      const organizationId = getOrganizationId(req);
      const numericProjectId = parseIntegerProjectId(req.params.projectId);

      if (numericProjectId === null) {
        return sendError(res, 400, 'Invalid project ID');
      }

      const hasAccess = await verifyProjectAccess(req, req.params.projectId);
      if (!hasAccess) {
        return sendError(res, 404, 'Project not found');
      }

      const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);

      // Fetch from projectActivities table
      const activities = await pool.query(
        `SELECT pa.id, pa.activity_type, pa.entity_type, pa.entity_id, pa.description, pa.details, pa.created_at,
              u.full_name as user_name, u.email as user_email
       FROM project_activities pa
       LEFT JOIN users u ON u.id = pa.user_id
       WHERE pa.project_id = $1 AND pa.organization_id = $2
       ORDER BY pa.created_at DESC
       LIMIT $3`,
        [numericProjectId, organizationId, limit]
      );

      // Also get recently modified artifacts as activity items
      const recentArtifacts = await pool.query(
        `SELECT id, artifact_id, title, status, category, type, updated_at, created_at, version
       FROM concept2cure_artifacts
       WHERE project_id = $1 AND organization_id = $2
       ORDER BY updated_at DESC
       LIMIT 10`,
        [numericProjectId, organizationId]
      );

      // Merge and sort by timestamp
      const feed = [
        ...activities.rows.map((a: any) => ({
          id: `act-${a.id}`,
          type: 'activity' as const,
          activityType: a.activity_type,
          entityType: a.entity_type,
          entityId: a.entity_id,
          description: a.description,
          details: a.details,
          userName: a.user_name || a.user_email || 'System',
          timestamp: a.created_at,
        })),
        ...recentArtifacts.rows.map((a: any) => ({
          id: `doc-${a.id}`,
          type: 'document_update' as const,
          activityType: a.version > 1 ? 'update' : 'create',
          entityType: 'document',
          entityId: a.artifact_id || a.id,
          description:
            a.version > 1
              ? `Updated "${a.title || 'Untitled'}" to v${a.version}`
              : `Created "${a.title || 'Untitled'}"`,
          details: { status: a.status, category: a.category, type: a.type },
          userName: null,
          timestamp: a.updated_at || a.created_at,
        })),
      ]
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, limit);

      return sendSuccess(res, feed);
    } catch (error: any) {
      logger.error('Failed to fetch project activity', { error: error.message });
      return sendError(res, 500, 'Failed to fetch project activity');
    }
  }
);

// ─── Linked Projects Routes ─────────────────────────────────────────────────

/**
 * GET /api/concept2cure/projects/:projectId/linked
 * Returns all typed link relationships for a project (both directions).
 * Joins with concept2cure_projects for name/type/status of the other project.
 * If the table doesn't exist yet (pre-migration deploy), returns [].
 */
router.get('/projects/:projectId/linked', async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const numericProjectId = parseIntegerProjectId(req.params.projectId);

    if (numericProjectId === null) {
      return sendError(res, 400, 'Invalid project ID');
    }

    const hasAccess = await verifyProjectAccess(req, req.params.projectId);
    if (!hasAccess) {
      return sendError(res, 404, 'Project not found');
    }

    let rows: any[] = [];
    try {
      const result = await pool.query(
        `SELECT
           lnk.id,
           lnk.kind,
           lnk.direction AS dir,
           lnk.created_at,
           CASE
             WHEN lnk.source_id = $1 THEN p.name
             ELSE sp.name
           END AS name,
           CASE
             WHEN lnk.source_id = $1 THEN p.metadata->>'submissionType'
             ELSE sp.metadata->>'submissionType'
           END AS type,
           CASE
             WHEN lnk.source_id = $1 THEN p.status
             ELSE sp.status
           END AS status
         FROM concept2cure_project_links lnk
         LEFT JOIN projects p  ON p.id  = lnk.target_id AND p.organization_id  = lnk.org_id
         LEFT JOIN projects sp ON sp.id = lnk.source_id AND sp.organization_id = lnk.org_id
         WHERE lnk.org_id = $2
           AND (lnk.source_id = $1 OR lnk.target_id = $1)
         ORDER BY lnk.created_at DESC`,
        [numericProjectId, organizationId]
      );
      rows = result.rows;
    } catch (tableErr: any) {
      // Table doesn't exist yet (pre-migration deploy) — return empty list.
      if (tableErr.code === '42P01') {
        return sendSuccess(res, []);
      }
      throw tableErr;
    }

    const kindVia: Record<string, string> = {
      predicate:  'Predicate device',
      parent_ind: 'Parent IND',
      child_nda:  'Child NDA',
      cross_ref:  'Cross-reference',
      supplier:   'Supplier',
    };

    const links = rows.map((r: any) => ({
      id:     r.id,
      kind:   r.kind,
      dir:    r.dir as 'in' | 'out',
      name:   r.name   || 'Unknown project',
      type:   r.type   || '',
      status: r.status || 'active',
      via:    kindVia[r.kind] || r.kind,
    }));

    return sendSuccess(res, links);
  } catch (error: any) {
    logger.error('Failed to fetch linked projects', { error: error.message });
    return sendError(res, 500, 'Failed to fetch linked projects');
  }
});

/**
 * POST /api/concept2cure/projects/:projectId/linked
 * Creates a new typed link from this project to another.
 * Body: { targetProjectId: string; kind: string; direction?: string }
 */
router.post('/projects/:projectId/linked', async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const numericProjectId = parseIntegerProjectId(req.params.projectId);

    if (numericProjectId === null) {
      return sendError(res, 400, 'Invalid project ID');
    }

    const hasAccess = await verifyProjectAccess(req, req.params.projectId);
    if (!hasAccess) {
      return sendError(res, 404, 'Project not found');
    }

    const { targetProjectId, kind, direction = 'out' } = req.body as {
      targetProjectId: string;
      kind: string;
      direction?: string;
    };

    if (!targetProjectId || !kind) {
      return sendError(res, 400, 'targetProjectId and kind are required');
    }

    const numericTargetId = parseIntegerProjectId(targetProjectId);
    if (numericTargetId === null) {
      return sendError(res, 400, 'Invalid targetProjectId');
    }

    const result = await pool.query(
      `INSERT INTO concept2cure_project_links (org_id, source_id, target_id, kind, direction)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, org_id, source_id, target_id, kind, direction, created_at`,
      [organizationId, numericProjectId, numericTargetId, kind, direction]
    );

    return res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error: any) {
    logger.error('Failed to create project link', { error: error.message });
    return sendError(res, 500, 'Failed to create project link');
  }
});

// ─── Client-Safe Governance Routes ──────────────────────────────────────────
// These expose governed fabric decisions via project-scoped paths,
// removing the dependency on admin-only /api/control-plane routes.

/**
 * PATCH /api/concept2cure/projects/:projectId/knowledge
 * Update knowledge base metadata (custom instructions, context).
 */
router.patch('/projects/:projectId/knowledge', async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const userId = getUserId(req);
    const actorRole = getActorRole(req);
    const scope = getProjectScope(req.params.projectId);
    if (!scope) {
      return sendError(res, 400, 'Invalid project ID format', undefined, 'INVALID_ID');
    }

    const data = updateKnowledgeSchema.parse(req.body);

    const projectAccess = await loadProjectAccessRow({
      organizationId,
      clientWorkspaceId: await resolveClientWorkspaceId(req),
      projectId: scope.numericId,
      userId,
      actorRole,
    });
    const project = projectAccess.project;

    if (!project) {
      return sendError(res, 404, 'Project not found');
    }

    const settings = normalizeProjectSettings(project.settings);
    const knowledge = normalizeKnowledge(settings);

    const updatedKnowledge: ProjectKnowledge = {
      ...knowledge,
      customInstructions:
        data.customInstructions !== undefined
          ? data.customInstructions
            ? sanitizeContent(data.customInstructions)
            : ''
          : knowledge.customInstructions,
      context:
        data.context !== undefined
          ? data.context
            ? sanitizeContent(data.context)
            : ''
          : knowledge.context,
      memoryEnabled:
        data.memoryEnabled !== undefined ? data.memoryEnabled : knowledge.memoryEnabled,
    };

    const updatedSettings = {
      ...settings,
      customInstructions: updatedKnowledge.customInstructions,
      knowledge: updatedKnowledge,
    };

    const [updated] = await db
      .update(projects)
      .set({ settings: updatedSettings, updatedAt: new Date() })
      .where(and(eq(projects.id, scope.numericId), eq(projects.organizationId, organizationId)))
      .returning();

    await logAuditEntry(req, 'UPDATE', 'project', req.params.projectId, project, updated);
    return sendSuccess(res, updatedKnowledge);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return sendError(res, 400, 'Validation failed', error.errors, 'VALIDATION_ERROR');
    }
    logger.error('Failed to update project knowledge', { error: error.message });
    return sendError(res, 500, 'Failed to update project knowledge');
  }
});

export default router;
