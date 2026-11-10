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
import { projects } from '@shared/schema';
import { and, eq, isNull, asc } from 'drizzle-orm';
import { getTenantContext, getRequestActor, getSecureOrgId } from '../utils/tenantContext';
import { ProjectRollupService } from '../services/project-rollup-service';
import { requestPgClient } from '../db/requestDb';
import { requireCurrentProgramAccess, ProgramReadAccessError } from '../services/c2c/current-program-access';
import { requireProjectAdmission, ProjectAdmissionRefusal } from './c2c/project-access';
import { WorkProjectRefusal, isWithinProgramAnchor } from '../services/c2c/program-project-anchor';

// People are named through public.actor_name, not a join on users: since users
// took row-level security (D3, 2026-09-28) a tenant scope reads only current
// members, so the join dropped the name of anyone who had left
// (docs/evidence/D3/2026-09-29-actor-names/).
const router = Router();
const pool = getPool();
const rollupService = new ProjectRollupService(pool);

const MAX_DEPTH = 3; // 0-indexed: 0=Program, 1=Project, 2=Study, 3=Sub-project

// ─────────────────────────────────────────────────────────────────────────────
// Validation for existing hierarchy records; new projects use canonical intake (A2.9).
// ─────────────────────────────────────────────────────────────────────────────

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
          `SELECT COUNT(*)::int as child_count FROM projects WHERE parent_project_id = $1 AND organization_id = $2`,
          [program.id, organizationId]
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
    const projectId = parseInt(String(req.params.projectId), 10);
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
    const projectId = parseInt(String(req.params.projectId), 10);
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
// GET /api/project-hierarchy/:projectId/children?programId=<uuid>
// A program's project's direct children: its work projects (S12). Admitted as the project page is: the program's
// admission and the project's read admission, then the project proven to be the program's anchor or below it, on
// the request's tenant-scoped connection. It read any project's children in the organization on the shared pool,
// with no project admission and no caller (S12 inventory, 2026-11-08); the project page is its first caller.
// ─────────────────────────────────────────────────────────────────────────────

type Failure = { status: number; code: string; message: string };

/** The refusals the work-project read says as themselves; anything else is said once, without detail. */
function workProjectFailure(error: unknown): Failure {
  const e = error as { status?: unknown; code?: unknown; message?: unknown };
  const known = error instanceof WorkProjectRefusal || error instanceof ProgramReadAccessError || error instanceof ProjectAdmissionRefusal;
  if (known && typeof e.status === 'number' && typeof e.code === 'string') return { status: e.status, code: e.code, message: String(e.message) };
  console.error('[HierarchyRoutes] Work projects not read:', error instanceof Error ? error.message : String(error));
  return { status: 500, code: 'WORK_PROJECTS_NOT_READ', message: 'The work projects could not be read.' };
}

const fail = (res: Response, f: Failure) => res.status(f.status).json({ success: false, error: { code: f.code, message: f.message } });

const childrenQuery = z.object({ programId: z.string().uuid() });

router.get('/:projectId/children', async (req: Request, res: Response) => {
  const projectId = Number(req.params.projectId);
  const query = childrenQuery.safeParse(req.query ?? {});
  if (!Number.isSafeInteger(projectId) || projectId <= 0 || !query.success) {
    return fail(res, { status: 400, code: 'INVALID_CHILDREN_READ', message: 'Name the project and its program.' });
  }
  const organizationId = Number(getSecureOrgId(req));
  const rawUserId = (req as Request & { user?: { id?: unknown } }).user?.id;
  const userId = typeof rawUserId === 'string' && /^\d+$/.test(rawUserId) ? Number(rawUserId) : Number(rawUserId);
  if (!Number.isSafeInteger(organizationId) || organizationId <= 0 || !Number.isSafeInteger(userId) || userId <= 0) {
    return fail(res, { status: 401, code: 'ACTOR_REQUIRED', message: 'A signed-in member of the organization is required.' });
  }
  const { programId } = query.data;
  try {
    const client = requestPgClient(req);
    const access = await requireCurrentProgramAccess(client, { organizationId, userId, programId });
    await requireProjectAdmission(req, String(access.projectId), false, { executor: client, programId });
    if (!(await isWithinProgramAnchor(client, organizationId, access.projectId, projectId))) {
      throw new WorkProjectRefusal(404, 'PARENT_NOT_IN_PROGRAM', 'The project is not this program\'s project or one of its work projects.');
    }
    const rows = (await client.query(
      `SELECT p.id, p.name, p.status, p.depth, p.path, p.metadata->>'workKind' AS work_kind, p.created_at,
              u.name AS owner_name,
              (SELECT COUNT(*)::int FROM projects c WHERE c.parent_project_id = p.id AND c.organization_id = p.organization_id) AS child_count
         FROM projects p
         LEFT JOIN LATERAL public.actor_name(p.owner_id) u ON TRUE
        WHERE p.parent_project_id = $1 AND p.organization_id = $2
        ORDER BY p.name ASC, p.id ASC`, [projectId, organizationId])).rows;
    const children = rows.map((r) => ({ id: Number(r.id), name: String(r.name), status: r.status ?? null,
      depth: Number(r.depth), path: r.path ?? null, workKind: r.work_kind ?? null, ownerName: r.owner_name ?? null,
      childCount: Number(r.child_count) || 0, createdAt: r.created_at ? new Date(r.created_at as string).toISOString() : null }));
    return res.json({ success: true, data: { parentId: projectId, programId, anchorProjectId: access.projectId, children, total: children.length } });
  } catch (error) {
    return fail(res, workProjectFailure(error));
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/project-hierarchy/:projectId/move
// Re-parent a project (validates no circular references, respects depth limit)
// ─────────────────────────────────────────────────────────────────────────────

router.patch('/:projectId/move', async (req: Request, res: Response) => {
  try {
    const projectId = parseInt(String(req.params.projectId), 10);
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
    const validation = await rollupService.validateMove(projectId, newParentId, MAX_DEPTH, organizationId);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.reason });
    }

    // If moving to root
    if (newParentId === null) {
      await pool.query(
        `UPDATE projects SET parent_project_id = NULL, depth = 0, path = $1::text, updated_at = NOW() WHERE id = $2 AND organization_id = $3`,
        [String(projectId), projectId, organizationId]
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
        `UPDATE projects SET parent_project_id = $1, depth = $2, path = $3, updated_at = NOW() WHERE id = $4 AND organization_id = $5`,
        [newParentId, newDepth, newPath, projectId, organizationId]
      );
    }

    // Recompute paths for all descendants
    await rollupService.recomputePaths(projectId, organizationId);

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
      return res.status(400).json({ error: 'Invalid move data', details: error.issues });
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
    const projectId = parseInt(String(req.params.projectId), 10);
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
      LEFT JOIN LATERAL public.actor_name(p.owner_id) u ON TRUE
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
