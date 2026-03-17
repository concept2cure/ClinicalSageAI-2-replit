/**
 * Project Section Management API
 *
 * Full CRUD for per-project CTD section tracking: status transitions,
 * assignments, deadlines, comments, dependencies, and audit trail.
 *
 * Endpoints:
 *   POST   /api/project-sections/initialize      — Bootstrap all sections for a project
 *   GET    /api/project-sections                  — List sections for a project
 *   GET    /api/project-sections/:code            — Get single section
 *   PATCH  /api/project-sections/:code/status     — Transition section status
 *   PATCH  /api/project-sections/:code/assign     — Assign user to section
 *   PATCH  /api/project-sections/:code/deadline   — Set/update deadline
 *   PATCH  /api/project-sections/:code            — Bulk update section fields
 *   GET    /api/project-sections/summary          — Module-level progress summary
 *   GET    /api/project-sections/timeline          — Timeline with milestones
 *   POST   /api/project-sections/:code/comments   — Add comment
 *   GET    /api/project-sections/:code/comments   — Get comments
 *   GET    /api/project-sections/:code/history     — Status change audit trail
 *   POST   /api/project-sections/dependencies      — Add dependency
 *   GET    /api/project-sections/dependencies      — List dependencies
 *
 * @module server/routes/project-sections
 * @compliance FDA 21 CFR Part 11
 */

import { Router, Request, Response } from 'express';
import { pool } from '../db.js';
import {
  getAllINDSections,
  getSectionByCode,
  type INDSection,
  type SectionStatus,
} from '../../services/regulatory/ind-ectd-sections.js';

const router = Router();

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

function extractOrgId(req: Request): number {
  return (
    parseInt((req as any).tenantContext?.organizationId, 10) ||
    parseInt(req.headers['x-organization-id'] as string, 10) ||
    1
  );
}

function extractUserId(req: Request): number | null {
  return (req as any).userId || (req as any).user?.id || null;
}

/** Valid status transitions per 21 CFR Part 11 workflow */
const VALID_TRANSITIONS: Record<string, string[]> = {
  not_started: ['data_gathering', 'drafting'],
  data_gathering: ['drafting', 'not_started'],
  drafting: ['internal_review', 'revision', 'data_gathering'],
  internal_review: ['revision', 'qa_review', 'approved', 'drafting'],
  revision: ['internal_review', 'drafting'],
  qa_review: ['approved', 'revision', 'internal_review'],
  approved: ['signed', 'revision'],
  signed: ['locked', 'revision'],
  locked: [], // Terminal state — cannot be unlocked without admin override
};

function isValidTransition(from: string, to: string): boolean {
  const allowed = VALID_TRANSITIONS[from];
  return allowed ? allowed.includes(to) : false;
}

/** Create a notification record */
async function createNotification(params: {
  orgId: number;
  projectId: number;
  userId: number;
  type: string;
  title: string;
  body?: string;
  sectionCode?: string;
  actionUrl?: string;
}) {
  try {
    await pool.query(
      `INSERT INTO project_notifications
         (organization_id, project_id, user_id, type, title, body, section_code, action_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        params.orgId,
        params.projectId,
        params.userId,
        params.type,
        params.title,
        params.body || null,
        params.sectionCode || null,
        params.actionUrl || null,
      ]
    );
  } catch (err) {
    console.warn('[ProjectSections] Failed to create notification:', err);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// INITIALIZE — Bootstrap all CTD sections for a project
// ═══════════════════════════════════════════════════════════════════════════════

router.post('/initialize', async (req: Request, res: Response) => {
  try {
    const { project_id } = req.body;
    const orgId = extractOrgId(req);

    if (!project_id) {
      return res.status(400).json({ error: 'project_id is required' });
    }

    const projectId = parseInt(String(project_id), 10);
    if (!projectId) {
      return res.status(400).json({ error: 'Invalid project_id' });
    }

    // Get all leaf sections from the canonical map
    const allSections = getAllINDSections();

    // Check if already initialized
    const existing = await pool.query(
      'SELECT COUNT(*) as cnt FROM project_sections WHERE project_id = $1 AND organization_id = $2',
      [projectId, orgId]
    );
    if (parseInt(existing.rows[0].cnt, 10) > 0) {
      return res.status(409).json({
        error: 'Sections already initialized for this project',
        count: parseInt(existing.rows[0].cnt, 10),
      });
    }

    // Insert all sections in a transaction
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      let inserted = 0;
      for (const section of allSections) {
        await client.query(
          `INSERT INTO project_sections
             (organization_id, project_id, section_code, module, title, status, estimated_hours, priority, metadata)
           VALUES ($1, $2, $3, $4, $5, 'not_started', $6, $7, $8)`,
          [
            orgId,
            projectId,
            section.code,
            section.module,
            section.title,
            section.estimatedHours,
            section.required ? 'high' : 'medium',
            JSON.stringify({
              required: section.required,
              requiredForAmendment: section.requiredForAmendment,
              aiDraftable: section.aiDraftable,
              authoringMode: section.authoringMode,
              role: section.role,
              regulatoryRef: section.regulatoryRef,
              format: section.format,
              parentCode: section.parentCode,
              depth: section.depth,
            }),
          ]
        );
        inserted++;
      }

      await client.query('COMMIT');
      res.json({ success: true, sectionsInitialized: inserted, projectId });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (error: any) {
    console.error('[ProjectSections] Initialize error:', error.message);
    res.status(500).json({ error: 'Failed to initialize sections' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// LIST — Get all sections for a project
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/', async (req: Request, res: Response) => {
  try {
    const projectId = parseInt(req.query.project_id as string, 10);
    const orgId = extractOrgId(req);
    const module = req.query.module as string;
    const status = req.query.status as string;
    const assignedTo = req.query.assigned_to as string;

    if (!projectId) {
      return res.status(400).json({ error: 'project_id is required' });
    }

    let query = `
      SELECT ps.*,
             u_assigned.name as assigned_to_name,
             u_reviewer.name as reviewer_name,
             (SELECT COUNT(*) FROM section_comments sc
              WHERE sc.project_id = ps.project_id AND sc.section_code = ps.section_code AND NOT sc.resolved) as open_comments,
             (SELECT COUNT(*) FROM concept2cure_artifacts ca
              WHERE ca.project_id = ps.project_id AND ca.ctd_section = ps.section_code AND ca.organization_id = ps.organization_id) as artifact_count
      FROM project_sections ps
      LEFT JOIN users u_assigned ON u_assigned.id = ps.assigned_to
      LEFT JOIN users u_reviewer ON u_reviewer.id = ps.reviewer_id
      WHERE ps.project_id = $1 AND ps.organization_id = $2
    `;
    const params: any[] = [projectId, orgId];
    let paramIdx = 3;

    if (module) {
      query += ` AND ps.module = $${paramIdx++}`;
      params.push(module);
    }
    if (status) {
      query += ` AND ps.status = $${paramIdx++}`;
      params.push(status);
    }
    if (assignedTo) {
      query += ` AND ps.assigned_to = $${paramIdx++}`;
      params.push(parseInt(assignedTo, 10));
    }

    query += ' ORDER BY ps.section_code ASC';

    const result = await pool.query(query, params);

    res.json({
      sections: result.rows,
      total: result.rows.length,
      projectId,
    });
  } catch (error: any) {
    console.error('[ProjectSections] List error:', error.message);
    res.status(500).json({ error: 'Failed to list sections' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// GET SINGLE SECTION
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/:code', async (req: Request, res: Response) => {
  try {
    const code = req.params.code;
    const projectId = parseInt(req.query.project_id as string, 10);
    const orgId = extractOrgId(req);

    if (!projectId) {
      return res.status(400).json({ error: 'project_id is required' });
    }

    const result = await pool.query(
      `SELECT ps.*,
              u_assigned.name as assigned_to_name,
              u_reviewer.name as reviewer_name
       FROM project_sections ps
       LEFT JOIN users u_assigned ON u_assigned.id = ps.assigned_to
       LEFT JOIN users u_reviewer ON u_reviewer.id = ps.reviewer_id
       WHERE ps.project_id = $1 AND ps.organization_id = $2 AND ps.section_code = $3`,
      [projectId, orgId, code]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: `Section ${code} not found for project ${projectId}` });
    }

    // Also get related artifacts
    const artifacts = await pool.query(
      `SELECT artifact_id, title, status, version, updated_at
       FROM concept2cure_artifacts
       WHERE project_id = $1 AND organization_id = $2 AND ctd_section = $3
       ORDER BY updated_at DESC`,
      [projectId, orgId, code]
    );

    // Get dependencies
    const deps = await pool.query(
      `SELECT depends_on_code, dependency_type
       FROM section_dependencies
       WHERE project_id = $1 AND section_code = $2`,
      [projectId, code]
    );

    const blockedBy = await pool.query(
      `SELECT section_code, dependency_type
       FROM section_dependencies
       WHERE project_id = $1 AND depends_on_code = $2`,
      [projectId, code]
    );

    res.json({
      section: result.rows[0],
      artifacts: artifacts.rows,
      dependencies: deps.rows,
      blockedBy: blockedBy.rows,
    });
  } catch (error: any) {
    console.error('[ProjectSections] Get error:', error.message);
    res.status(500).json({ error: 'Failed to get section' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// STATUS TRANSITION — enforces valid workflow transitions
// ═══════════════════════════════════════════════════════════════════════════════

router.patch('/:code/status', async (req: Request, res: Response) => {
  try {
    const code = req.params.code;
    const { project_id, new_status, reason } = req.body;
    const orgId = extractOrgId(req);
    const userId = extractUserId(req);

    if (!project_id || !new_status) {
      return res.status(400).json({ error: 'project_id and new_status are required' });
    }

    const projectId = parseInt(String(project_id), 10);

    // Get current status
    const current = await pool.query(
      'SELECT status, assigned_to, title FROM project_sections WHERE project_id = $1 AND organization_id = $2 AND section_code = $3',
      [projectId, orgId, code]
    );

    if (current.rows.length === 0) {
      return res.status(404).json({ error: `Section ${code} not found` });
    }

    const currentStatus = current.rows[0].status;
    const sectionTitle = current.rows[0].title;

    // Validate transition
    if (!isValidTransition(currentStatus, new_status)) {
      return res.status(422).json({
        error: `Invalid status transition: ${currentStatus} → ${new_status}`,
        allowed: VALID_TRANSITIONS[currentStatus] || [],
      });
    }

    // Update status
    const updateFields: string[] = ['status = $4', 'updated_at = NOW()'];
    const updateParams: any[] = [projectId, orgId, code, new_status];
    let idx = 5;

    if (new_status === 'drafting' || new_status === 'data_gathering') {
      updateFields.push(`started_at = COALESCE(started_at, NOW())`);
    }
    if (new_status === 'approved' || new_status === 'locked') {
      updateFields.push(`completed_at = NOW()`);
    }
    if (new_status === 'locked') {
      updateFields.push(`locked_at = NOW()`, `locked_by = $${idx++}`);
      updateParams.push(userId);
    }

    await pool.query(
      `UPDATE project_sections SET ${updateFields.join(', ')}
       WHERE project_id = $1 AND organization_id = $2 AND section_code = $3`,
      updateParams
    );

    // Log status change with reason
    await pool.query(
      `INSERT INTO section_status_log
         (organization_id, project_id, section_code, old_status, new_status, changed_by, change_reason, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        orgId,
        projectId,
        code,
        currentStatus,
        new_status,
        userId,
        reason || null,
        JSON.stringify({ timestamp: new Date().toISOString(), source: 'api' }),
      ]
    );

    // Notify assignee if review requested
    if (new_status === 'internal_review' || new_status === 'qa_review') {
      const assignee = current.rows[0].assigned_to;
      if (assignee) {
        await createNotification({
          orgId,
          projectId,
          userId: assignee,
          type: 'review_requested',
          title: `Review requested: ${sectionTitle}`,
          body: `Section ${code} has been moved to ${new_status.replace('_', ' ')}`,
          sectionCode: code,
        });
      }
    }

    // Notify on lock
    if (new_status === 'locked') {
      const projectResult = await pool.query('SELECT owner_id FROM projects WHERE id = $1', [
        projectId,
      ]);
      const ownerId = projectResult.rows[0]?.owner_id;
      if (ownerId) {
        await createNotification({
          orgId,
          projectId,
          userId: ownerId,
          type: 'section_locked',
          title: `Section locked: ${sectionTitle}`,
          body: `Section ${code} has been locked for submission`,
          sectionCode: code,
        });
      }
    }

    // Recalculate project progress
    await recalculateProjectProgress(projectId, orgId);

    res.json({
      success: true,
      sectionCode: code,
      oldStatus: currentStatus,
      newStatus: new_status,
    });
  } catch (error: any) {
    console.error('[ProjectSections] Status transition error:', error.message);
    res.status(500).json({ error: 'Failed to transition status' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// ASSIGN — Assign a user to a section
// ═══════════════════════════════════════════════════════════════════════════════

router.patch('/:code/assign', async (req: Request, res: Response) => {
  try {
    const code = req.params.code;
    const { project_id, assigned_to, reviewer_id } = req.body;
    const orgId = extractOrgId(req);

    if (!project_id) {
      return res.status(400).json({ error: 'project_id is required' });
    }

    const projectId = parseInt(String(project_id), 10);
    const updates: string[] = [];
    const params: any[] = [projectId, orgId, code];
    let idx = 4;

    if (assigned_to !== undefined) {
      updates.push(`assigned_to = $${idx++}`);
      params.push(assigned_to ? parseInt(String(assigned_to), 10) : null);
    }
    if (reviewer_id !== undefined) {
      updates.push(`reviewer_id = $${idx++}`);
      params.push(reviewer_id ? parseInt(String(reviewer_id), 10) : null);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No assignment fields provided' });
    }

    updates.push('updated_at = NOW()');

    const result = await pool.query(
      `UPDATE project_sections SET ${updates.join(', ')}
       WHERE project_id = $1 AND organization_id = $2 AND section_code = $3
       RETURNING *`,
      params
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: `Section ${code} not found` });
    }

    // Notify the new assignee
    if (assigned_to) {
      await createNotification({
        orgId,
        projectId,
        userId: parseInt(String(assigned_to), 10),
        type: 'section_assigned',
        title: `You've been assigned: ${result.rows[0].title}`,
        body: `Section ${code} has been assigned to you`,
        sectionCode: code,
      });
    }

    res.json({ success: true, section: result.rows[0] });
  } catch (error: any) {
    console.error('[ProjectSections] Assign error:', error.message);
    res.status(500).json({ error: 'Failed to assign section' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// DEADLINE — Set/update section deadline
// ═══════════════════════════════════════════════════════════════════════════════

router.patch('/:code/deadline', async (req: Request, res: Response) => {
  try {
    const code = req.params.code;
    const { project_id, deadline, priority } = req.body;
    const orgId = extractOrgId(req);

    if (!project_id) {
      return res.status(400).json({ error: 'project_id is required' });
    }

    const projectId = parseInt(String(project_id), 10);
    const updates: string[] = ['updated_at = NOW()'];
    const params: any[] = [projectId, orgId, code];
    let idx = 4;

    if (deadline !== undefined) {
      updates.push(`deadline = $${idx++}`);
      params.push(deadline ? new Date(deadline) : null);
    }
    if (priority !== undefined) {
      updates.push(`priority = $${idx++}`);
      params.push(priority);
    }

    const result = await pool.query(
      `UPDATE project_sections SET ${updates.join(', ')}
       WHERE project_id = $1 AND organization_id = $2 AND section_code = $3
       RETURNING *`,
      params
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: `Section ${code} not found` });
    }

    // Notify assignee of deadline
    const section = result.rows[0];
    if (section.assigned_to && deadline) {
      await createNotification({
        orgId,
        projectId,
        userId: section.assigned_to,
        type: 'deadline_set',
        title: `Deadline set: ${section.title}`,
        body: `Section ${code} is due ${new Date(deadline).toLocaleDateString()}`,
        sectionCode: code,
      });
    }

    res.json({ success: true, section });
  } catch (error: any) {
    console.error('[ProjectSections] Deadline error:', error.message);
    res.status(500).json({ error: 'Failed to update deadline' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// BULK UPDATE — Update multiple fields on a section
// ═══════════════════════════════════════════════════════════════════════════════

router.patch('/:code', async (req: Request, res: Response) => {
  try {
    const code = req.params.code;
    const { project_id, notes, actual_hours, estimated_hours, priority, metadata } = req.body;
    const orgId = extractOrgId(req);

    if (!project_id) {
      return res.status(400).json({ error: 'project_id is required' });
    }

    const projectId = parseInt(String(project_id), 10);
    const updates: string[] = ['updated_at = NOW()'];
    const params: any[] = [projectId, orgId, code];
    let idx = 4;

    if (notes !== undefined) {
      updates.push(`notes = $${idx++}`);
      params.push(notes);
    }
    if (actual_hours !== undefined) {
      updates.push(`actual_hours = $${idx++}`);
      params.push(actual_hours);
    }
    if (estimated_hours !== undefined) {
      updates.push(`estimated_hours = $${idx++}`);
      params.push(estimated_hours);
    }
    if (priority !== undefined) {
      updates.push(`priority = $${idx++}`);
      params.push(priority);
    }
    if (metadata !== undefined) {
      updates.push(`metadata = metadata || $${idx++}::jsonb`);
      params.push(JSON.stringify(metadata));
    }

    if (updates.length === 1) {
      return res.status(400).json({ error: 'No update fields provided' });
    }

    const result = await pool.query(
      `UPDATE project_sections SET ${updates.join(', ')}
       WHERE project_id = $1 AND organization_id = $2 AND section_code = $3
       RETURNING *`,
      params
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: `Section ${code} not found` });
    }

    res.json({ success: true, section: result.rows[0] });
  } catch (error: any) {
    console.error('[ProjectSections] Update error:', error.message);
    res.status(500).json({ error: 'Failed to update section' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// SUMMARY — Module-level progress + deadline overview
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/summary', async (req: Request, res: Response) => {
  try {
    const projectId = parseInt(req.query.project_id as string, 10);
    const orgId = extractOrgId(req);

    if (!projectId) {
      return res.status(400).json({ error: 'project_id is required' });
    }

    // Module-level aggregation
    const moduleSummary = await pool.query(
      `SELECT
         module,
         COUNT(*) as total_sections,
         COUNT(*) FILTER (WHERE status IN ('approved', 'signed', 'locked')) as completed,
         COUNT(*) FILTER (WHERE status IN ('drafting', 'internal_review', 'revision', 'qa_review', 'data_gathering')) as in_progress,
         COUNT(*) FILTER (WHERE status = 'not_started') as not_started,
         COUNT(*) FILTER (WHERE deadline IS NOT NULL AND deadline < NOW() AND status NOT IN ('approved', 'signed', 'locked')) as overdue,
         MIN(deadline) FILTER (WHERE deadline > NOW() AND status NOT IN ('approved', 'signed', 'locked')) as next_deadline,
         SUM(estimated_hours) as total_estimated_hours,
         SUM(actual_hours) as total_actual_hours
       FROM project_sections
       WHERE project_id = $1 AND organization_id = $2
       GROUP BY module
       ORDER BY module`,
      [projectId, orgId]
    );

    // Overall stats
    const overall = await pool.query(
      `SELECT
         COUNT(*) as total,
         COUNT(*) FILTER (WHERE status IN ('approved', 'signed', 'locked')) as completed,
         COUNT(*) FILTER (WHERE status IN ('drafting', 'internal_review', 'revision', 'qa_review', 'data_gathering')) as active,
         COUNT(*) FILTER (WHERE assigned_to IS NOT NULL) as assigned,
         COUNT(*) FILTER (WHERE deadline IS NOT NULL AND deadline < NOW() AND status NOT IN ('approved', 'signed', 'locked')) as overdue,
         COUNT(*) FILTER (WHERE metadata->>'required' = 'true') as required_total,
         COUNT(*) FILTER (WHERE metadata->>'required' = 'true' AND status IN ('approved', 'signed', 'locked')) as required_completed,
         SUM(estimated_hours) as total_hours,
         SUM(actual_hours) as actual_hours
       FROM project_sections
       WHERE project_id = $1 AND organization_id = $2`,
      [projectId, orgId]
    );

    // Team workload
    const workload = await pool.query(
      `SELECT
         u.id as user_id,
         u.name as user_name,
         COUNT(*) as assigned_sections,
         COUNT(*) FILTER (WHERE ps.status NOT IN ('approved', 'signed', 'locked')) as active_sections,
         SUM(ps.estimated_hours) FILTER (WHERE ps.status NOT IN ('approved', 'signed', 'locked')) as pending_hours
       FROM project_sections ps
       JOIN users u ON u.id = ps.assigned_to
       WHERE ps.project_id = $1 AND ps.organization_id = $2 AND ps.assigned_to IS NOT NULL
       GROUP BY u.id, u.name
       ORDER BY active_sections DESC`,
      [projectId, orgId]
    );

    const stats = overall.rows[0] || {};
    const totalSections = parseInt(stats.total, 10) || 0;
    const completedSections = parseInt(stats.completed, 10) || 0;

    res.json({
      projectId,
      progress: totalSections > 0 ? Math.round((completedSections / totalSections) * 100) : 0,
      overall: {
        total: totalSections,
        completed: completedSections,
        active: parseInt(stats.active, 10) || 0,
        assigned: parseInt(stats.assigned, 10) || 0,
        overdue: parseInt(stats.overdue, 10) || 0,
        requiredTotal: parseInt(stats.required_total, 10) || 0,
        requiredCompleted: parseInt(stats.required_completed, 10) || 0,
        estimatedHours: parseFloat(stats.total_hours) || 0,
        actualHours: parseFloat(stats.actual_hours) || 0,
      },
      modules: moduleSummary.rows.map((m: any) => ({
        module: m.module,
        total: parseInt(m.total_sections, 10),
        completed: parseInt(m.completed, 10),
        inProgress: parseInt(m.in_progress, 10),
        notStarted: parseInt(m.not_started, 10),
        overdue: parseInt(m.overdue, 10),
        nextDeadline: m.next_deadline,
        estimatedHours: parseFloat(m.total_estimated_hours) || 0,
        actualHours: parseFloat(m.total_actual_hours) || 0,
        progress:
          parseInt(m.total_sections, 10) > 0
            ? Math.round((parseInt(m.completed, 10) / parseInt(m.total_sections, 10)) * 100)
            : 0,
      })),
      teamWorkload: workload.rows,
    });
  } catch (error: any) {
    console.error('[ProjectSections] Summary error:', error.message);
    res.status(500).json({ error: 'Failed to get summary' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// COMMENTS — Per-section discussion threads
// ═══════════════════════════════════════════════════════════════════════════════

router.post('/:code/comments', async (req: Request, res: Response) => {
  try {
    const code = req.params.code;
    const { project_id, content, parent_id } = req.body;
    const orgId = extractOrgId(req);
    const userId = extractUserId(req);

    if (!project_id || !content) {
      return res.status(400).json({ error: 'project_id and content are required' });
    }
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const projectId = parseInt(String(project_id), 10);

    const result = await pool.query(
      `INSERT INTO section_comments
         (organization_id, project_id, section_code, author_id, content, parent_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [orgId, projectId, code, userId, content, parent_id || null]
    );

    // Notify section assignee about new comment
    const section = await pool.query(
      'SELECT assigned_to, title FROM project_sections WHERE project_id = $1 AND section_code = $2',
      [projectId, code]
    );
    if (section.rows[0]?.assigned_to && section.rows[0].assigned_to !== userId) {
      await createNotification({
        orgId,
        projectId,
        userId: section.rows[0].assigned_to,
        type: 'comment_added',
        title: `New comment on ${section.rows[0].title}`,
        body: content.substring(0, 200),
        sectionCode: code,
      });
    }

    res.json({ success: true, comment: result.rows[0] });
  } catch (error: any) {
    console.error('[ProjectSections] Comment error:', error.message);
    res.status(500).json({ error: 'Failed to add comment' });
  }
});

router.get('/:code/comments', async (req: Request, res: Response) => {
  try {
    const code = req.params.code;
    const projectId = parseInt(req.query.project_id as string, 10);
    const orgId = extractOrgId(req);

    if (!projectId) {
      return res.status(400).json({ error: 'project_id is required' });
    }

    const result = await pool.query(
      `SELECT sc.*, u.name as author_name
       FROM section_comments sc
       JOIN users u ON u.id = sc.author_id
       WHERE sc.project_id = $1 AND sc.organization_id = $2 AND sc.section_code = $3
       ORDER BY sc.created_at ASC`,
      [projectId, orgId, code]
    );

    res.json({ comments: result.rows });
  } catch (error: any) {
    console.error('[ProjectSections] Get comments error:', error.message);
    res.status(500).json({ error: 'Failed to get comments' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// HISTORY — Audit trail for a section
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/:code/history', async (req: Request, res: Response) => {
  try {
    const code = req.params.code;
    const projectId = parseInt(req.query.project_id as string, 10);
    const orgId = extractOrgId(req);

    if (!projectId) {
      return res.status(400).json({ error: 'project_id is required' });
    }

    const result = await pool.query(
      `SELECT ssl.*, u.name as changed_by_name
       FROM section_status_log ssl
       LEFT JOIN users u ON u.id = ssl.changed_by
       WHERE ssl.project_id = $1 AND ssl.organization_id = $2 AND ssl.section_code = $3
       ORDER BY ssl.created_at DESC`,
      [projectId, orgId, code]
    );

    res.json({ history: result.rows });
  } catch (error: any) {
    console.error('[ProjectSections] History error:', error.message);
    res.status(500).json({ error: 'Failed to get history' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// DEPENDENCIES — Section dependency management
// ═══════════════════════════════════════════════════════════════════════════════

router.post('/dependencies', async (req: Request, res: Response) => {
  try {
    const { project_id, section_code, depends_on_code, dependency_type } = req.body;
    const orgId = extractOrgId(req);

    if (!project_id || !section_code || !depends_on_code) {
      return res
        .status(400)
        .json({ error: 'project_id, section_code, and depends_on_code are required' });
    }

    // Prevent self-dependency
    if (section_code === depends_on_code) {
      return res.status(422).json({ error: 'A section cannot depend on itself' });
    }

    const projectId = parseInt(String(project_id), 10);

    const result = await pool.query(
      `INSERT INTO section_dependencies
         (organization_id, project_id, section_code, depends_on_code, dependency_type)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (project_id, section_code, depends_on_code) DO UPDATE SET dependency_type = $5
       RETURNING *`,
      [orgId, projectId, section_code, depends_on_code, dependency_type || 'blocks']
    );

    res.json({ success: true, dependency: result.rows[0] });
  } catch (error: any) {
    console.error('[ProjectSections] Dependency error:', error.message);
    res.status(500).json({ error: 'Failed to manage dependency' });
  }
});

router.get('/dependencies', async (req: Request, res: Response) => {
  try {
    const projectId = parseInt(req.query.project_id as string, 10);
    const orgId = extractOrgId(req);

    if (!projectId) {
      return res.status(400).json({ error: 'project_id is required' });
    }

    const result = await pool.query(
      `SELECT sd.*,
              ps_from.title as section_title,
              ps_from.status as section_status,
              ps_to.title as depends_on_title,
              ps_to.status as depends_on_status
       FROM section_dependencies sd
       LEFT JOIN project_sections ps_from ON ps_from.project_id = sd.project_id AND ps_from.section_code = sd.section_code
       LEFT JOIN project_sections ps_to ON ps_to.project_id = sd.project_id AND ps_to.section_code = sd.depends_on_code
       WHERE sd.project_id = $1 AND sd.organization_id = $2
       ORDER BY sd.section_code`,
      [projectId, orgId]
    );

    res.json({ dependencies: result.rows });
  } catch (error: any) {
    console.error('[ProjectSections] Get dependencies error:', error.message);
    res.status(500).json({ error: 'Failed to get dependencies' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// NOTIFICATIONS — User notifications
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/notifications', async (req: Request, res: Response) => {
  try {
    const orgId = extractOrgId(req);
    const userId = extractUserId(req);
    const unreadOnly = req.query.unread === 'true';

    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    let query = `SELECT id, user_id, organization_id, project_id, section_code, type, title, message, read, read_at, created_at FROM project_notifications WHERE user_id = $1 AND organization_id = $2`;
    const params: any[] = [userId, orgId];

    if (unreadOnly) {
      query += ' AND read = FALSE';
    }

    query += ' ORDER BY created_at DESC LIMIT 50';

    const result = await pool.query(query, params);

    const unreadCount = await pool.query(
      'SELECT COUNT(*) as cnt FROM project_notifications WHERE user_id = $1 AND organization_id = $2 AND read = FALSE',
      [userId, orgId]
    );

    res.json({
      notifications: result.rows,
      unreadCount: parseInt(unreadCount.rows[0].cnt, 10) || 0,
    });
  } catch (error: any) {
    console.error('[ProjectSections] Notifications error:', error.message);
    res.status(500).json({ error: 'Failed to get notifications' });
  }
});

router.patch('/notifications/:id/read', async (req: Request, res: Response) => {
  try {
    const notifId = parseInt(req.params.id, 10);
    const userId = extractUserId(req);

    await pool.query(
      'UPDATE project_notifications SET read = TRUE, read_at = NOW() WHERE id = $1 AND user_id = $2',
      [notifId, userId]
    );

    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to mark notification read' });
  }
});

router.post('/notifications/read-all', async (req: Request, res: Response) => {
  try {
    const orgId = extractOrgId(req);
    const userId = extractUserId(req);

    await pool.query(
      'UPDATE project_notifications SET read = TRUE, read_at = NOW() WHERE user_id = $1 AND organization_id = $2 AND read = FALSE',
      [userId, orgId]
    );

    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to mark all notifications read' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// MILESTONES — Project timeline management
// ═══════════════════════════════════════════════════════════════════════════════

router.post('/milestones', async (req: Request, res: Response) => {
  try {
    const { project_id, name, description, target_date, linked_sections } = req.body;
    const orgId = extractOrgId(req);
    const userId = extractUserId(req);

    if (!project_id || !name || !target_date) {
      return res.status(400).json({ error: 'project_id, name, and target_date are required' });
    }

    const projectId = parseInt(String(project_id), 10);

    const result = await pool.query(
      `INSERT INTO project_milestones
         (organization_id, project_id, name, description, target_date, linked_sections, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        orgId,
        projectId,
        name,
        description || null,
        new Date(target_date),
        JSON.stringify(linked_sections || []),
        userId,
      ]
    );

    res.json({ success: true, milestone: result.rows[0] });
  } catch (error: any) {
    console.error('[ProjectSections] Milestone create error:', error.message);
    res.status(500).json({ error: 'Failed to create milestone' });
  }
});

router.get('/milestones', async (req: Request, res: Response) => {
  try {
    const projectId = parseInt(req.query.project_id as string, 10);
    const orgId = extractOrgId(req);

    if (!projectId) {
      return res.status(400).json({ error: 'project_id is required' });
    }

    const result = await pool.query(
      `SELECT pm.*,
              u.name as created_by_name,
              CASE
                WHEN pm.completed_at IS NOT NULL THEN 'completed'
                WHEN pm.target_date < NOW() THEN 'overdue'
                WHEN pm.target_date < NOW() + INTERVAL '7 days' THEN 'approaching'
                ELSE 'on_track'
              END as status_label
       FROM project_milestones pm
       LEFT JOIN users u ON u.id = pm.created_by
       WHERE pm.project_id = $1 AND pm.organization_id = $2
       ORDER BY pm.target_date ASC`,
      [projectId, orgId]
    );

    res.json({ milestones: result.rows });
  } catch (error: any) {
    console.error('[ProjectSections] Milestones list error:', error.message);
    res.status(500).json({ error: 'Failed to list milestones' });
  }
});

router.patch('/milestones/:id', async (req: Request, res: Response) => {
  try {
    const milestoneId = parseInt(req.params.id, 10);
    const { name, description, target_date, status, linked_sections } = req.body;
    const orgId = extractOrgId(req);

    const updates: string[] = ['updated_at = NOW()'];
    const params: any[] = [milestoneId, orgId];
    let idx = 3;

    if (name !== undefined) {
      updates.push(`name = $${idx++}`);
      params.push(name);
    }
    if (description !== undefined) {
      updates.push(`description = $${idx++}`);
      params.push(description);
    }
    if (target_date !== undefined) {
      updates.push(`target_date = $${idx++}`);
      params.push(new Date(target_date));
    }
    if (status === 'completed') {
      updates.push(`completed_at = NOW()`);
    }
    if (linked_sections !== undefined) {
      updates.push(`linked_sections = $${idx++}`);
      params.push(JSON.stringify(linked_sections));
    }

    const result = await pool.query(
      `UPDATE project_milestones SET ${updates.join(', ')}
       WHERE id = $1 AND organization_id = $2
       RETURNING *`,
      params
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Milestone not found' });
    }

    res.json({ success: true, milestone: result.rows[0] });
  } catch (error: any) {
    console.error('[ProjectSections] Milestone update error:', error.message);
    res.status(500).json({ error: 'Failed to update milestone' });
  }
});

router.delete('/milestones/:id', async (req: Request, res: Response) => {
  try {
    const milestoneId = parseInt(req.params.id, 10);
    const orgId = extractOrgId(req);

    await pool.query('DELETE FROM project_milestones WHERE id = $1 AND organization_id = $2', [
      milestoneId,
      orgId,
    ]);

    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to delete milestone' });
  }
});

// GET /api/project-sections/timeline — Full timeline view
router.get('/timeline', async (req: Request, res: Response) => {
  try {
    const projectId = parseInt(req.query.project_id as string, 10);
    const orgId = extractOrgId(req);

    if (!projectId) {
      return res.status(400).json({ error: 'project_id is required' });
    }

    // Sections with deadlines
    const sections = await pool.query(
      `SELECT section_code, title, module, status, deadline, assigned_to,
              u.name as assigned_to_name
       FROM project_sections ps
       LEFT JOIN users u ON u.id = ps.assigned_to
       WHERE ps.project_id = $1 AND ps.organization_id = $2 AND ps.deadline IS NOT NULL
       ORDER BY ps.deadline ASC`,
      [projectId, orgId]
    );

    // Milestones
    const milestones = await pool.query(
      `SELECT id, name, target_date, completed_at, linked_sections,
              CASE
                WHEN completed_at IS NOT NULL THEN 'completed'
                WHEN target_date < NOW() THEN 'overdue'
                WHEN target_date < NOW() + INTERVAL '7 days' THEN 'approaching'
                ELSE 'on_track'
              END as status_label
       FROM project_milestones
       WHERE project_id = $1 AND organization_id = $2
       ORDER BY target_date ASC`,
      [projectId, orgId]
    );

    // Combine into timeline events
    type TimelineEvent = {
      date: string;
      type: 'section_deadline' | 'milestone';
      title: string;
      status: string;
      metadata: Record<string, any>;
    };

    const events: TimelineEvent[] = [];

    for (const s of sections.rows) {
      events.push({
        date: s.deadline,
        type: 'section_deadline',
        title: `${s.section_code}: ${s.title}`,
        status: s.status,
        metadata: {
          sectionCode: s.section_code,
          module: s.module,
          assignedTo: s.assigned_to_name,
        },
      });
    }

    for (const m of milestones.rows) {
      events.push({
        date: m.target_date,
        type: 'milestone',
        title: m.name,
        status: m.status_label,
        metadata: {
          milestoneId: m.id,
          linkedSections: m.linked_sections,
          completedAt: m.completed_at,
        },
      });
    }

    // Sort by date
    events.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    res.json({
      projectId,
      events,
      totalSectionDeadlines: sections.rows.length,
      totalMilestones: milestones.rows.length,
    });
  } catch (error: any) {
    console.error('[ProjectSections] Timeline error:', error.message);
    res.status(500).json({ error: 'Failed to get timeline' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER: Recalculate project progress based on section completion
// ═══════════════════════════════════════════════════════════════════════════════

async function recalculateProjectProgress(projectId: number, orgId: number) {
  try {
    const stats = await pool.query(
      `SELECT
         COUNT(*) as total,
         COUNT(*) FILTER (WHERE status IN ('approved', 'signed', 'locked')) as completed
       FROM project_sections
       WHERE project_id = $1 AND organization_id = $2`,
      [projectId, orgId]
    );

    const total = parseInt(stats.rows[0].total, 10) || 0;
    const completed = parseInt(stats.rows[0].completed, 10) || 0;
    const progress = total > 0 ? Math.round((completed / total) * 100) : 0;

    await pool.query('UPDATE projects SET progress = $1, updated_at = NOW() WHERE id = $2', [
      progress,
      projectId,
    ]);
  } catch (err) {
    console.warn('[ProjectSections] Failed to recalculate progress:', err);
  }
}

export default router;
