/**
 * Project Hierarchy Routes
 *
 * Endpoints for managing the 4-level project hierarchy:
 *   Level 0 — Program (CRO → biotech client)
 *   Level 1 — Project (a specific study program)
 *   Level 2 — Study (individual clinical trial / submission)
 *   Level 3 — Sub-project (work-package, site, or protocol arm)
 *
 * All endpoints are tenant-scoped via organizationId header/query.
 *
 * @module server/routes/project-hierarchy.ts
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { db, getPool } from '../db';
import { projects, auditEvents } from '@shared/schema';
import { and, eq, isNull, sql, asc, desc } from 'drizzle-orm';
import { getTenantContext, getRequestActor } from '../utils/tenantContext';
import { ProjectRollupService } from '../services/project-rollup-service';

const router = Router();
const pool = getPool();
const rollupService = new ProjectRollupService(pool);

const MAX_DEPTH = 3; // 0-indexed: 0=Program, 1=Project, 2=Study, 3=Sub-project

// ─────────────────────────────────────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────────────────────────────────────

const createChildSchema = z.object({
  name: z.string().min(3, 'Name must be at least 3 characters'),
  description: z.string().optional(),
  type: z
    .enum(['clinical_trial', 'regulatory_submission', 'medical_device', 'literature_review'])
    .default('clinical_trial'),
  priority: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  startDate: z.string().optional(),
  targetEndDate: z.string().optional(),
  budget: z.number().optional(),
  ownerId: z.number().optional(),
  metadata: z.record(z.unknown()).optional(),
});

const moveSchema = z.object({
  newParentId: z.number().nullable(),
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/project-hierarchy/programs
// List root-level programs (depth = 0, no parent)
// ─────────────────────────────────────────────────────────────────────────────

router.get('/programs', async (req: Request, res: Response) => {
  try {
    const tenantContext = getTenantContext(req);
    if ('error' in tenantContext) return res.status(400).json({ error: tenantContext.error });
    const { organizationId, clientWorkspaceId } = tenantContext;

    const conditions = [
      eq(projects.organizationId, organizationId),
      isNull(projects.parentProjectId),
    ];
    if (clientWorkspaceId) {
      conditions.push(eq(projects.clientWorkspaceId, clientWorkspaceId));
    }

    const programs = await db
      .select()
      // Cast required: Drizzle ORM type inference limitation with large (13K-line) schema
      .from(projects as any)
      .where(and(...conditions))
      .orderBy(asc((projects as any).name));

    // Attach child counts
    const programsWithCounts = await Promise.all(
      programs.map(async (program: any) => {
        const countResult = await pool.query(
          `SELECT COUNT(*)::int as child_count FROM projects WHERE parent_project_id = $1`,
          [program.id]
        );
        return {
          ...program,
          childCount: countResult.rows[0]?.child_count || 0,
        };
      })
    );

    res.json({
      programs: programsWithCounts,
      total: programsWithCounts.length,
    });
  } catch (error) {
    console.error('[HierarchyRoutes] Error fetching programs:', error);
    res.status(500).json({ error: 'Failed to fetch programs' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/project-hierarchy/:projectId/tree
// Full subtree with rollup metrics (bottom-up aggregation)
// ─────────────────────────────────────────────────────────────────────────────

router.get('/:projectId/tree', async (req: Request, res: Response) => {
  try {
    const projectId = parseInt(req.params.projectId, 10);
    if (Number.isNaN(projectId)) return res.status(400).json({ error: 'Invalid project ID' });

    const tenantContext = getTenantContext(req);
    if ('error' in tenantContext) return res.status(400).json({ error: tenantContext.error });
    const { organizationId } = tenantContext;

    const tree = await rollupService.getTree(projectId, organizationId);
    if (!tree) return res.status(404).json({ error: 'Project not found' });

    res.json(tree);
  } catch (error) {
    console.error('[HierarchyRoutes] Error fetching tree:', error);
    res.status(500).json({ error: 'Failed to fetch project tree' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/project-hierarchy/:projectId/ancestors
// Breadcrumb chain from project up to root
// ─────────────────────────────────────────────────────────────────────────────

router.get('/:projectId/ancestors', async (req: Request, res: Response) => {
  try {
    const projectId = parseInt(req.params.projectId, 10);
    if (Number.isNaN(projectId)) return res.status(400).json({ error: 'Invalid project ID' });

    const tenantContext = getTenantContext(req);
    if ('error' in tenantContext) return res.status(400).json({ error: tenantContext.error });
    const { organizationId } = tenantContext;

    const ancestors = await rollupService.getAncestors(projectId, organizationId);
    if (ancestors.length === 0) return res.status(404).json({ error: 'Project not found' });

    res.json({
      breadcrumb: ancestors,
      depth: ancestors.length - 1,
    });
  } catch (error) {
    console.error('[HierarchyRoutes] Error fetching ancestors:', error);
    res.status(500).json({ error: 'Failed to fetch ancestor chain' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/project-hierarchy/:projectId/children
// Direct children of a project
// ─────────────────────────────────────────────────────────────────────────────

router.get('/:projectId/children', async (req: Request, res: Response) => {
  try {
    const projectId = parseInt(req.params.projectId, 10);
    if (Number.isNaN(projectId)) return res.status(400).json({ error: 'Invalid project ID' });

    const tenantContext = getTenantContext(req);
    if ('error' in tenantContext) return res.status(400).json({ error: tenantContext.error });
    const { organizationId } = tenantContext;

    const children = await pool.query(
      `SELECT p.*, u.name as owner_name,
              (SELECT COUNT(*)::int FROM projects c WHERE c.parent_project_id = p.id) as child_count
       FROM projects p
       LEFT JOIN users u ON p.owner_id = u.id
       WHERE p.parent_project_id = $1 AND p.organization_id = $2
       ORDER BY p.priority DESC, p.name ASC`,
      [projectId, organizationId]
    );

    res.json({
      parentId: projectId,
      children: children.rows,
      total: children.rows.length,
    });
  } catch (error) {
    console.error('[HierarchyRoutes] Error fetching children:', error);
    res.status(500).json({ error: 'Failed to fetch child projects' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/project-hierarchy/:projectId/children
// Create a child project (validates depth ≤ 3, inherits org/workspace)
// ─────────────────────────────────────────────────────────────────────────────

router.post('/:projectId/children', async (req: Request, res: Response) => {
  try {
    const parentId = parseInt(req.params.projectId, 10);
    if (Number.isNaN(parentId)) return res.status(400).json({ error: 'Invalid parent project ID' });

    const tenantContext = getTenantContext(req);
    if ('error' in tenantContext) return res.status(400).json({ error: tenantContext.error });
    const { organizationId } = tenantContext;

    const validatedData = createChildSchema.parse(req.body);

    // Get the parent project
    const parentResult = await pool.query(
      `SELECT id, depth, path, organization_id, client_workspace_id, name FROM projects WHERE id = $1 AND organization_id = $2`,
      [parentId, organizationId]
    );

    if (parentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Parent project not found' });
    }

    const parent = parentResult.rows[0];
    const childDepth = parent.depth + 1;

    if (childDepth > MAX_DEPTH) {
      return res.status(400).json({
        error: `Cannot create child: maximum hierarchy depth is ${
          MAX_DEPTH + 1
        } levels (Program → Project → Study → Sub-project)`,
        currentDepth: parent.depth,
        maxDepth: MAX_DEPTH,
      });
    }

    // Compute materialized path
    const childPath = parent.path ? `${parent.path}/${parentId}` : String(parentId);

    // Enforce project quota before insert (same logic as atomicCreateProject)
    const quotaResult = await pool.query(
      `SELECT l.max_projects
       FROM licenses l
       INNER JOIN client_workspaces cw ON CAST(l.client_id AS INTEGER) = cw.id
       WHERE cw.organization_id = $1 AND l.status = 'active'
       LIMIT 1`,
      [organizationId]
    );
    if (quotaResult.rows.length > 0) {
      const maxProjects = quotaResult.rows[0].max_projects || 20;
      const countResult = await pool.query(
        `SELECT COUNT(*)::int as count FROM projects WHERE organization_id = $1`,
        [organizationId]
      );
      const currentCount = countResult.rows[0].count;
      if (currentCount >= maxProjects) {
        return res.status(403).json({
          error: 'QUOTA_EXCEEDED',
          message: `Project quota exceeded. Current: ${currentCount}, Maximum: ${maxProjects}`,
          details: { current: currentCount, maximum: maxProjects, remaining: 0 },
        });
      }
    }

    // Insert child project
    const insertResult = await pool.query(
      `INSERT INTO projects (
         name, description, type, priority, status,
         organization_id, client_workspace_id,
         parent_project_id, depth, path,
         start_date, target_end_date, budget,
         owner_id, metadata, created_at, updated_at
       ) VALUES (
         $1, $2, $3, $4, 'planning',
         $5, $6,
         $7, $8, $9,
         $10, $11, $12,
         $13, $14, NOW(), NOW()
       ) RETURNING *`,
      [
        validatedData.name,
        validatedData.description || null,
        validatedData.type,
        validatedData.priority,
        parent.organization_id,
        parent.client_workspace_id,
        parentId,
        childDepth,
        childPath,
        validatedData.startDate ? new Date(validatedData.startDate) : null,
        validatedData.targetEndDate ? new Date(validatedData.targetEndDate) : null,
        validatedData.budget || null,
        validatedData.ownerId || null,
        JSON.stringify(validatedData.metadata || {}),
      ]
    );

    const newProject = insertResult.rows[0];

    // Update the path to include the new project's own ID
    const finalPath = `${childPath}/${newProject.id}`;
    await pool.query(`UPDATE projects SET path = $1 WHERE id = $2`, [finalPath, newProject.id]);
    newProject.path = finalPath;

    // Audit trail
    try {
      const now = new Date();
      const { userName, userRole } = getRequestActor(req);
      await pool.query(
        `INSERT INTO audit_events (organization_id, event_type, entity_type, entity_id, user_name, user_role, ip_address, user_agent, timestamp, timestamp_utc, old_values, new_values, changed_fields, reason, regulatory_significant, gxp_relevant, metadata)
         VALUES ($1, 'project_create', 'project', $2, $3, $4, $5, $6, $7, $7, NULL, $8, $9, $10, true, true, $11)`,
        [
          organizationId,
          newProject.id,
          userName,
          userRole,
          req.ip,
          req.get('user-agent') || null,
          now,
          JSON.stringify(newProject),
          JSON.stringify(Object.keys(validatedData)),
          `Child project created under "${parent.name}" (depth ${childDepth})`,
          JSON.stringify({
            source: 'project-hierarchy',
            parentProjectId: parentId,
            depth: childDepth,
          }),
        ]
      );
    } catch (auditError) {
      console.error('[HierarchyRoutes] Audit trail creation failed (non-blocking):', auditError);
    }

    console.log(
      `[HierarchyRoutes] Created child project ${newProject.id} "${newProject.name}" under parent ${parentId} at depth ${childDepth}`
    );
    res.status(201).json(newProject);
  } catch (error) {
    console.error('[HierarchyRoutes] Error creating child project:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid project data', details: error.errors });
    }
    res.status(500).json({ error: 'Failed to create child project' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/project-hierarchy/:projectId/move
// Re-parent a project (validates no circular references, respects depth limit)
// ─────────────────────────────────────────────────────────────────────────────

router.patch('/:projectId/move', async (req: Request, res: Response) => {
  try {
    const projectId = parseInt(req.params.projectId, 10);
    if (Number.isNaN(projectId)) return res.status(400).json({ error: 'Invalid project ID' });

    const tenantContext = getTenantContext(req);
    if ('error' in tenantContext) return res.status(400).json({ error: tenantContext.error });
    const { organizationId } = tenantContext;

    const { newParentId } = moveSchema.parse(req.body);

    // Verify project exists and belongs to org
    const projResult = await pool.query(
      `SELECT id, organization_id, client_workspace_id, parent_project_id, depth, path,
              name, code, description, status, priority, type,
              start_date, target_end_date, actual_end_date, progress,
              budget, budget_currency, budget_status,
              created_by_id, owner_id, sponsors, tags,
              critical_to_quality_factors, risk_level, risk_assessment,
              quality_targets, module_references, settings, metadata,
              created_at, updated_at
       FROM projects WHERE id = $1 AND organization_id = $2`,
      [projectId, organizationId]
    );
    if (projResult.rows.length === 0) return res.status(404).json({ error: 'Project not found' });

    const project = projResult.rows[0];

    // Validate the move
    const validation = await rollupService.validateMove(projectId, newParentId, MAX_DEPTH);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.reason });
    }

    // If moving to root
    if (newParentId === null) {
      await pool.query(
        `UPDATE projects SET parent_project_id = NULL, depth = 0, path = $1::text, updated_at = NOW() WHERE id = $2`,
        [String(projectId), projectId]
      );
    } else {
      // Verify new parent belongs to same org
      const newParentResult = await pool.query(
        `SELECT id, organization_id, client_workspace_id, parent_project_id, depth, path,
                name, code, description, status, priority, type,
                start_date, target_end_date, actual_end_date, progress,
                budget, budget_currency, budget_status,
                created_by_id, owner_id, sponsors, tags,
                critical_to_quality_factors, risk_level, risk_assessment,
                quality_targets, module_references, settings, metadata,
                created_at, updated_at
         FROM projects WHERE id = $1 AND organization_id = $2`,
        [newParentId, organizationId]
      );
      if (newParentResult.rows.length === 0) {
        return res
          .status(400)
          .json({ error: 'Target parent project not found in this organization' });
      }

      const newParent = newParentResult.rows[0];
      const newDepth = newParent.depth + 1;
      const newPath = newParent.path
        ? `${newParent.path}/${projectId}`
        : `${newParentId}/${projectId}`;

      await pool.query(
        `UPDATE projects SET parent_project_id = $1, depth = $2, path = $3, updated_at = NOW() WHERE id = $4`,
        [newParentId, newDepth, newPath, projectId]
      );
    }

    // Recompute paths for all descendants
    await rollupService.recomputePaths(projectId);

    // Audit trail
    try {
      const now = new Date();
      const { userName, userRole } = getRequestActor(req);
      await pool.query(
        `INSERT INTO audit_events (organization_id, event_type, entity_type, entity_id, user_name, user_role, ip_address, user_agent, timestamp, timestamp_utc, old_values, new_values, changed_fields, reason, regulatory_significant, gxp_relevant, metadata)
         VALUES ($1, 'project_move', 'project', $2, $3, $4, $5, $6, $7, $7, $8, $9, $10, $11, true, true, $12)`,
        [
          organizationId,
          projectId,
          userName,
          userRole,
          req.ip,
          req.get('user-agent') || null,
          now,
          JSON.stringify({ parentProjectId: project.parent_project_id, depth: project.depth }),
          JSON.stringify({ parentProjectId: newParentId }),
          JSON.stringify(['parentProjectId', 'depth', 'path']),
          `Project moved from parent ${project.parent_project_id || 'root'} to ${
            newParentId || 'root'
          }`,
          JSON.stringify({
            source: 'project-hierarchy',
            previousParent: project.parent_project_id,
            newParent: newParentId,
          }),
        ]
      );
    } catch (auditError) {
      console.error('[HierarchyRoutes] Audit trail creation failed (non-blocking):', auditError);
    }

    // Return updated project
    const updated = await pool.query(
      `SELECT id, organization_id, client_workspace_id, parent_project_id, depth, path,
              name, code, description, status, priority, type,
              start_date, target_end_date, actual_end_date, progress,
              budget, budget_currency, budget_status,
              created_by_id, owner_id, sponsors, tags,
              critical_to_quality_factors, risk_level, risk_assessment,
              quality_targets, module_references, settings, metadata,
              created_at, updated_at
       FROM projects WHERE id = $1`,
      [projectId]
    );
    console.log(`[HierarchyRoutes] Moved project ${projectId} to parent ${newParentId || 'root'}`);
    res.json(updated.rows[0]);
  } catch (error) {
    console.error('[HierarchyRoutes] Error moving project:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid move data', details: error.errors });
    }
    res.status(500).json({ error: 'Failed to move project' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/project-hierarchy/:projectId/rollup
// Just the rollup metrics for a project (without full tree)
// ─────────────────────────────────────────────────────────────────────────────

router.get('/:projectId/rollup', async (req: Request, res: Response) => {
  try {
    const projectId = parseInt(req.params.projectId, 10);
    if (Number.isNaN(projectId)) return res.status(400).json({ error: 'Invalid project ID' });

    const tenantContext = getTenantContext(req);
    if ('error' in tenantContext) return res.status(400).json({ error: tenantContext.error });
    const { organizationId } = tenantContext;

    const tree = await rollupService.getTree(projectId, organizationId);
    if (!tree) return res.status(404).json({ error: 'Project not found' });

    res.json({
      projectId,
      projectName: tree.name,
      rollup: tree.rollup,
    });
  } catch (error) {
    console.error('[HierarchyRoutes] Error computing rollup:', error);
    res.status(500).json({ error: 'Failed to compute rollup metrics' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/project-hierarchy/flat
// Flat list with hierarchy metadata (for table-view with indentation)
// ─────────────────────────────────────────────────────────────────────────────

router.get('/flat', async (req: Request, res: Response) => {
  try {
    const tenantContext = getTenantContext(req);
    if ('error' in tenantContext) return res.status(400).json({ error: tenantContext.error });
    const { organizationId, clientWorkspaceId } = tenantContext;

    let query = `
      SELECT p.*,
             u.name as owner_name,
             parent.name as parent_name,
             (SELECT COUNT(*)::int FROM projects c WHERE c.parent_project_id = p.id) as child_count
      FROM projects p
      LEFT JOIN users u ON p.owner_id = u.id
      LEFT JOIN projects parent ON p.parent_project_id = parent.id
      WHERE p.organization_id = $1
    `;
    const params: any[] = [organizationId];

    if (clientWorkspaceId) {
      query += ` AND p.client_workspace_id = $2`;
      params.push(clientWorkspaceId);
    }

    query += ` ORDER BY COALESCE(p.path, p.id::text), p.depth ASC, p.name ASC`;

    const result = await pool.query(query, params);

    res.json({
      projects: result.rows,
      total: result.rows.length,
      hierarchyLevels: ['Program', 'Project', 'Study', 'Sub-project'],
    });
  } catch (error) {
    console.error('[HierarchyRoutes] Error fetching flat list:', error);
    res.status(500).json({ error: 'Failed to fetch project hierarchy' });
  }
});

export default router;
