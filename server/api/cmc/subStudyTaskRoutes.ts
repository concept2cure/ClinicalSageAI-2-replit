/**
 * CMC Sub-Study Task & Approval Routes
 *
 * Provides CRUD for sub-study tasks (individual CMC data entry activities)
 * and a multi-level approval workflow. Each task is project-scoped, tied to
 * a specific data category, and must be approved before its data is "merged"
 * (pushed) into the project's Module 3 pipeline.
 */

import express from 'express';
import { getPool } from '../../db';
import { z } from 'zod';
import { impactedSectionsForSourceType, type CmcSourceType } from '../../services/module3Composer';

const router = express.Router();

function getOrgId(req: express.Request): number {
  const orgId = parseInt(
    String(
      (req as any).tenantId ||
        (req as any).tenantContext?.organizationId ||
        req.headers['x-organization-id'] ||
        0,
    ),
    10,
  );
  if (!orgId || Number.isNaN(orgId)) throw new Error('Organization context required');
  return orgId;
}

// ── Validation schemas ─────────────────────────────────────────────────────

const createTaskSchema = z.object({
  projectId: z.string().uuid(),
  dataCategory: z.enum([
    'drug_substance', 'drug_product', 'method', 'stability', 'specification',
    'batch', 'change_control', 'comparability', 'process_validation',
    'excipient', 'container_closure', 'reference_standard',
  ]),
  title: z.string().min(1),
  description: z.string().optional(),
  sourceRecordId: z.string().optional(),
  priority: z.enum(['low', 'medium', 'high', 'critical']).optional().default('medium'),
  assignedTo: z.string().optional(),
  dueDate: z.string().optional(),
  metadata: z.record(z.any()).optional(),
});

const updateTaskSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  sourceRecordId: z.string().optional(),
  status: z.enum(['draft', 'in_progress', 'data_entered', 'pending_review', 'approved', 'merged', 'rejected']).optional(),
  priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  assignedTo: z.string().optional(),
  dueDate: z.string().optional(),
  metadata: z.record(z.any()).optional(),
});

const submitApprovalSchema = z.object({
  decision: z.enum(['approved', 'rejected', 'returned_for_revision']),
  decisionNote: z.string().optional(),
});

const addApprovalLevelSchema = z.object({
  approvalLevel: z.number().int().min(1).max(5),
  approvalLevelLabel: z.string().min(1),
  approverUserId: z.string().optional(),
  approverName: z.string().optional(),
});

// ── Task CRUD ──────────────────────────────────────────────────────────────

// GET /api/cmc/sub-study-tasks/:projectId — list tasks for a project
router.get('/:projectId', async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const { projectId } = req.params;
    const pool = getPool();

    const { rows } = await pool.query(
      `SELECT t.*,
              (SELECT json_agg(a ORDER BY a.approval_level)
               FROM cmc_sub_study_approvals a
               WHERE a.task_id = t.id) AS approvals
       FROM cmc_sub_study_tasks t
       WHERE t.organization_id = $1 AND t.project_id = $2
       ORDER BY
         CASE t.priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
         t.created_at DESC`,
      [orgId, projectId],
    );

    return res.json({ success: true, data: rows });
  } catch (error) {
    if (String((error as any)?.message || '').includes('Organization context required')) {
      return res.status(401).json({ success: false, error: 'Organization context required' });
    }
    console.error('[CMC SubStudy] Error listing tasks:', error);
    return res.status(500).json({ success: false, error: 'Failed to list sub-study tasks' });
  }
});

// POST /api/cmc/sub-study-tasks — create a new task
router.post('/', async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const data = createTaskSchema.parse(req.body);
    const pool = getPool();

    // Auto-compute impacted Module 3 sections
    const impactedSections = impactedSectionsForSourceType(data.dataCategory as CmcSourceType);
    const userId = (req as any).user?.id || 'system';

    const { rows } = await pool.query(
      `INSERT INTO cmc_sub_study_tasks (
        organization_id, project_id, data_category, title, description,
        source_record_id, impacted_sections, status, priority,
        assigned_to, due_date, metadata, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, 'draft', $8, $9, $10, $11::jsonb, $12)
      RETURNING *`,
      [
        orgId,
        data.projectId,
        data.dataCategory,
        data.title,
        data.description || null,
        data.sourceRecordId || null,
        JSON.stringify(impactedSections),
        data.priority,
        data.assignedTo || null,
        data.dueDate || null,
        data.metadata ? JSON.stringify(data.metadata) : null,
        userId,
      ],
    );

    return res.status(201).json({ success: true, data: rows[0] });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: 'Invalid input', details: error.errors });
    }
    if (String((error as any)?.message || '').includes('Organization context required')) {
      return res.status(401).json({ success: false, error: 'Organization context required' });
    }
    console.error('[CMC SubStudy] Error creating task:', error);
    return res.status(500).json({ success: false, error: 'Failed to create sub-study task' });
  }
});

// PUT /api/cmc/sub-study-tasks/:taskId — update task fields
router.put('/:taskId', async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const { taskId } = req.params;
    const data = updateTaskSchema.parse(req.body);
    const pool = getPool();

    const updates: string[] = [];
    const values: any[] = [];
    let idx = 1;

    const fieldMap: Record<string, string> = {
      title: 'title',
      description: 'description',
      sourceRecordId: 'source_record_id',
      status: 'status',
      priority: 'priority',
      assignedTo: 'assigned_to',
      dueDate: 'due_date',
    };

    for (const [key, col] of Object.entries(fieldMap)) {
      const val = (data as any)[key];
      if (val !== undefined) {
        updates.push(`${col} = $${idx}`);
        values.push(val);
        idx++;
      }
    }

    if (data.metadata) {
      updates.push(`metadata = $${idx}::jsonb`);
      values.push(JSON.stringify(data.metadata));
      idx++;
    }

    if (updates.length === 0) {
      return res.status(400).json({ success: false, error: 'No updates provided' });
    }

    values.push(taskId, orgId);
    const query = `
      UPDATE cmc_sub_study_tasks
      SET ${updates.join(', ')}, updated_at = NOW()
      WHERE id = $${idx} AND organization_id = $${idx + 1}
      RETURNING *
    `;

    const { rows } = await pool.query(query, values);
    if (!rows[0]) {
      return res.status(404).json({ success: false, error: 'Task not found' });
    }

    return res.json({ success: true, data: rows[0] });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: 'Invalid input', details: error.errors });
    }
    console.error('[CMC SubStudy] Error updating task:', error);
    return res.status(500).json({ success: false, error: 'Failed to update sub-study task' });
  }
});

// ── Approval workflow ──────────────────────────────────────────────────────

// POST /api/cmc/sub-study-tasks/:taskId/approvals — add approval level requirement
router.post('/:taskId/approvals', async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const { taskId } = req.params;
    const data = addApprovalLevelSchema.parse(req.body);
    const pool = getPool();

    // Verify task exists and belongs to org
    const taskCheck = await pool.query(
      `SELECT id FROM cmc_sub_study_tasks WHERE id = $1 AND organization_id = $2`,
      [taskId, orgId],
    );
    if (taskCheck.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Task not found' });
    }

    const { rows } = await pool.query(
      `INSERT INTO cmc_sub_study_approvals (
        organization_id, task_id, approval_level, approval_level_label,
        approver_user_id, approver_name, decision
      ) VALUES ($1, $2, $3, $4, $5, $6, 'pending')
      ON CONFLICT DO NOTHING
      RETURNING *`,
      [
        orgId,
        taskId,
        data.approvalLevel,
        data.approvalLevelLabel,
        data.approverUserId || null,
        data.approverName || null,
      ],
    );

    return res.status(201).json({ success: true, data: rows[0] });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: 'Invalid input', details: error.errors });
    }
    console.error('[CMC SubStudy] Error adding approval level:', error);
    return res.status(500).json({ success: false, error: 'Failed to add approval level' });
  }
});

// PUT /api/cmc/sub-study-tasks/:taskId/approvals/:approvalId — submit decision
router.put('/:taskId/approvals/:approvalId', async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const { taskId, approvalId } = req.params;
    const data = submitApprovalSchema.parse(req.body);
    const pool = getPool();
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Record the decision
      const { rows: approvalRows } = await client.query(
        `UPDATE cmc_sub_study_approvals
         SET decision = $1, decision_note = $2, decided_at = NOW()
         WHERE id = $3 AND task_id = $4 AND organization_id = $5
         RETURNING *`,
        [data.decision, data.decisionNote || null, approvalId, taskId, orgId],
      );

      if (!approvalRows[0]) {
        await client.query('ROLLBACK');
        return res.status(404).json({ success: false, error: 'Approval record not found' });
      }

      // If rejected or returned, update task status accordingly
      if (data.decision === 'rejected') {
        await client.query(
          `UPDATE cmc_sub_study_tasks SET status = 'rejected', updated_at = NOW() WHERE id = $1`,
          [taskId],
        );
      } else if (data.decision === 'returned_for_revision') {
        await client.query(
          `UPDATE cmc_sub_study_tasks SET status = 'data_entered', updated_at = NOW() WHERE id = $1`,
          [taskId],
        );
      } else if (data.decision === 'approved') {
        // Check if ALL approval levels for this task are now approved
        const { rows: pendingApprovals } = await client.query(
          `SELECT id FROM cmc_sub_study_approvals
           WHERE task_id = $1 AND (decision IS NULL OR decision = 'pending')`,
          [taskId],
        );

        if (pendingApprovals.length === 0) {
          // All levels approved — mark task as approved
          await client.query(
            `UPDATE cmc_sub_study_tasks SET status = 'approved', updated_at = NOW() WHERE id = $1`,
            [taskId],
          );
        }
      }

      await client.query('COMMIT');

      // Re-fetch task with approvals
      const { rows: updatedTask } = await pool.query(
        `SELECT t.*,
                (SELECT json_agg(a ORDER BY a.approval_level)
                 FROM cmc_sub_study_approvals a
                 WHERE a.task_id = t.id) AS approvals
         FROM cmc_sub_study_tasks t
         WHERE t.id = $1`,
        [taskId],
      );

      return res.json({ success: true, data: updatedTask[0] });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: 'Invalid input', details: error.errors });
    }
    console.error('[CMC SubStudy] Error submitting approval:', error);
    return res.status(500).json({ success: false, error: 'Failed to submit approval decision' });
  }
});

// POST /api/cmc/sub-study-tasks/:taskId/merge — merge approved task data into Module 3
router.post('/:taskId/merge', async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const { taskId } = req.params;
    const pool = getPool();

    // Verify task is approved
    const { rows: taskRows } = await pool.query(
      `SELECT * FROM cmc_sub_study_tasks WHERE id = $1 AND organization_id = $2`,
      [taskId, orgId],
    );

    if (!taskRows[0]) {
      return res.status(404).json({ success: false, error: 'Task not found' });
    }

    const task = taskRows[0];

    if (task.status !== 'approved') {
      return res.status(400).json({
        success: false,
        error: `Cannot merge task with status '${task.status}'. Task must be approved first.`,
      });
    }

    // Mark as merged
    await pool.query(
      `UPDATE cmc_sub_study_tasks
       SET status = 'merged', merged_to_module3 = true, merged_at = NOW(), updated_at = NOW()
       WHERE id = $1`,
      [taskId],
    );

    // Record provenance
    await pool.query(
      `INSERT INTO cmc_provenance_events (
        organization_id, project_id, artifact_type, artifact_id,
        event_type, event_payload, created_by
      ) VALUES ($1, $2, 'sub_study_task', $3, 'merged_to_module3', $4::jsonb, $5)`,
      [
        orgId,
        task.project_id,
        taskId,
        JSON.stringify({
          dataCategory: task.data_category,
          title: task.title,
          sourceRecordId: task.source_record_id,
          sourceObjectId: task.source_object_id,
          impactedSections: task.impacted_sections,
        }),
        (req as any).user?.id || 'system',
      ],
    );

    return res.json({
      success: true,
      data: { taskId, status: 'merged', mergedAt: new Date().toISOString() },
    });
  } catch (error) {
    console.error('[CMC SubStudy] Error merging task:', error);
    return res.status(500).json({ success: false, error: 'Failed to merge sub-study task' });
  }
});

// GET /api/cmc/sub-study-tasks/:projectId/summary — approval status summary
router.get('/:projectId/summary', async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const { projectId } = req.params;
    const pool = getPool();

    const { rows } = await pool.query(
      `SELECT
        data_category,
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE status = 'draft') AS draft,
        COUNT(*) FILTER (WHERE status = 'in_progress') AS in_progress,
        COUNT(*) FILTER (WHERE status = 'data_entered') AS data_entered,
        COUNT(*) FILTER (WHERE status = 'pending_review') AS pending_review,
        COUNT(*) FILTER (WHERE status = 'approved') AS approved,
        COUNT(*) FILTER (WHERE status = 'merged') AS merged,
        COUNT(*) FILTER (WHERE status = 'rejected') AS rejected
       FROM cmc_sub_study_tasks
       WHERE organization_id = $1 AND project_id = $2
       GROUP BY data_category
       ORDER BY data_category`,
      [orgId, projectId],
    );

    return res.json({ success: true, data: rows });
  } catch (error) {
    console.error('[CMC SubStudy] Error fetching summary:', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch task summary' });
  }
});

export default router;
