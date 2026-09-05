/**
 * Project task management for Concept2Cure — the regulatory-aware task list
 * connected to submission milestones, the bulk generator over those
 * milestones, the summary and health score, the milestone catalogue, and
 * AnA's task assessment. The third domain carved out of routes/concept2cure.ts
 * (ledger L53, slice 5), mounted at the same prefix ahead of it with the same
 * middleware chain; the handlers moved verbatim.
 *
 * The CMC data, project-context and transform-context endpoints that shared
 * the old banner stay in the main file: they are project reads that happen to
 * include tasks, not task management.
 *
 * @module server/routes/c2c/tasks
 */

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '../../db';
import { projects, projectTasks } from '../../../shared/schema';
import { createScopedLogger } from '../../utils/logger';
import { authMiddleware } from '../../auth';
import { requireOrganizationContext, tenantContextMiddleware } from '../../middleware/tenantContext';
import {
  concept2cureRateLimiter,
  getOrganizationId,
  paramStr,
  sendError,
  sendSuccess,
} from './shared';

const logger = createScopedLogger('concept2cure-tasks');
const router = Router();

// The same chain the main router applies, in the same order.
router.use(concept2cureRateLimiter);
router.use(authMiddleware);
router.use(tenantContextMiddleware);
router.use(requireOrganizationContext);

/* ── Project tasks and submission milestones ────────────────────────────── */

const SUBMISSION_MILESTONES: Record<
  string,
  Array<{ name: string; category: string; order: number }>
> = {
  IND: [
    { name: 'Pre-IND Meeting Request', category: 'regulatory', order: 1 },
    { name: 'Pre-IND Briefing Document', category: 'document-prep', order: 2 },
    { name: 'Pre-IND Meeting', category: 'meeting', order: 3 },
    { name: 'Module 1 Administrative', category: 'document-prep', order: 4 },
    { name: 'Module 2 Summaries', category: 'document-prep', order: 5 },
    { name: 'Module 3 Quality (CMC)', category: 'document-prep', order: 6 },
    { name: 'Module 4 Nonclinical', category: 'document-prep', order: 7 },
    { name: 'Module 5 Clinical', category: 'document-prep', order: 8 },
    { name: 'IND Compilation & QC', category: 'quality', order: 9 },
    { name: 'IND Submission to FDA', category: 'submission', order: 10 },
    { name: '30-Day Safety Review', category: 'regulatory', order: 11 },
    { name: 'Study May Proceed', category: 'milestone', order: 12 },
  ],
  NDA: [
    { name: 'Pre-NDA Meeting', category: 'meeting', order: 1 },
    { name: 'Module 1 Administrative', category: 'document-prep', order: 2 },
    { name: 'Module 2.5 Clinical Overview', category: 'document-prep', order: 3 },
    { name: 'Module 2.7 Clinical Summary', category: 'document-prep', order: 4 },
    { name: 'Module 3 Quality', category: 'document-prep', order: 5 },
    { name: 'Module 4 Nonclinical Reports', category: 'document-prep', order: 6 },
    { name: 'Module 5 Clinical Study Reports', category: 'document-prep', order: 7 },
    { name: 'NDA Compilation & Publishing', category: 'quality', order: 8 },
    { name: 'NDA Submission', category: 'submission', order: 9 },
    { name: 'Filing Review (60 days)', category: 'regulatory', order: 10 },
    { name: 'Mid-Cycle Review', category: 'regulatory', order: 11 },
    { name: 'Advisory Committee', category: 'meeting', order: 12 },
    { name: 'PDUFA Date / Action', category: 'milestone', order: 13 },
  ],
  BLA: [
    { name: 'Pre-BLA Meeting', category: 'meeting', order: 1 },
    { name: 'Module 1 Administrative', category: 'document-prep', order: 2 },
    { name: 'Module 2 CTD Summaries', category: 'document-prep', order: 3 },
    { name: 'Module 3 Quality (CMC)', category: 'document-prep', order: 4 },
    { name: 'Module 4 Nonclinical', category: 'document-prep', order: 5 },
    { name: 'Module 5 Clinical', category: 'document-prep', order: 6 },
    { name: 'BLA Compilation & Publishing', category: 'quality', order: 7 },
    { name: 'BLA Submission', category: 'submission', order: 8 },
    { name: 'PDUFA Date / Action', category: 'milestone', order: 9 },
  ],
  '510K': [
    { name: 'Device Classification & Pathway', category: 'regulatory', order: 1 },
    { name: 'Predicate Device Selection', category: 'analysis', order: 2 },
    { name: 'Pre-Submission Meeting (Q-Sub)', category: 'meeting', order: 3 },
    { name: 'SE Comparison & Testing Plan', category: 'document-prep', order: 4 },
    { name: 'Bench Testing & Biocompatibility', category: 'testing', order: 5 },
    { name: 'Software Documentation (if applicable)', category: 'document-prep', order: 6 },
    { name: 'Sterilization Validation', category: 'testing', order: 7 },
    { name: 'Clinical Data / Literature Review', category: 'analysis', order: 8 },
    { name: '510(k) Summary / Statement', category: 'document-prep', order: 9 },
    { name: 'Labeling & IFU', category: 'document-prep', order: 10 },
    { name: 'eSTAR Submission Assembly', category: 'submission', order: 11 },
    { name: '510(k) Submission to FDA', category: 'submission', order: 12 },
    { name: 'FDA Review (90-day target)', category: 'regulatory', order: 13 },
    { name: 'Clearance Decision', category: 'milestone', order: 14 },
  ],
  PMA: [
    { name: 'Pre-Submission Meeting', category: 'meeting', order: 1 },
    { name: 'Device Description & IFU', category: 'document-prep', order: 2 },
    { name: 'Manufacturing & Quality System', category: 'document-prep', order: 3 },
    { name: 'Nonclinical Testing', category: 'testing', order: 4 },
    { name: 'Clinical Study Design & Protocol', category: 'document-prep', order: 5 },
    { name: 'Clinical Data & Analysis', category: 'analysis', order: 6 },
    { name: 'PMA Assembly & QC', category: 'quality', order: 7 },
    { name: 'PMA Submission', category: 'submission', order: 8 },
    { name: 'FDA Panel Meeting', category: 'meeting', order: 9 },
    { name: 'Approval Decision', category: 'milestone', order: 10 },
  ],
  CER: [
    { name: 'Define Scope & Device Description', category: 'document-prep', order: 1 },
    { name: 'Literature Search Strategy', category: 'analysis', order: 2 },
    { name: 'Equivalence Assessment', category: 'analysis', order: 3 },
    { name: 'Clinical Data Appraisal', category: 'analysis', order: 4 },
    { name: 'Clinical Evaluation Report Draft', category: 'document-prep', order: 5 },
    { name: 'CER Internal Review', category: 'quality', order: 6 },
    { name: 'PMCF Plan', category: 'document-prep', order: 7 },
    { name: 'SSCP Preparation', category: 'document-prep', order: 8 },
    { name: 'Notified Body Review', category: 'regulatory', order: 9 },
    { name: 'CE Mark Decision', category: 'milestone', order: 10 },
  ],
  DE_NOVO: [
    { name: 'Risk-Based Classification', category: 'analysis', order: 1 },
    { name: 'Pre-Submission Meeting', category: 'meeting', order: 2 },
    { name: 'Performance Testing', category: 'testing', order: 3 },
    { name: 'Clinical Evidence', category: 'analysis', order: 4 },
    { name: 'De Novo Request Assembly', category: 'document-prep', order: 5 },
    { name: 'De Novo Submission', category: 'submission', order: 6 },
    { name: 'FDA Review & Classification', category: 'regulatory', order: 7 },
  ],
};

// GET /api/concept2cure/projects/:projectId/tasks
router.get('/projects/:projectId/tasks', async (req: Request, res: Response) => {
  try {
    const projectId = parseInt(paramStr(req.params.projectId), 10);
    if (isNaN(projectId)) return sendError(res, 400, 'Invalid project ID');

    const { status, priority, category } = req.query;

    const query = db.select().from(projectTasks).where(eq(projectTasks.projectId, projectId));

    const tasks = await query.orderBy(projectTasks.dueDate).limit(500);

    // Filter in application layer for optional params
    let filtered = tasks;
    if (status) filtered = filtered.filter((t: any) => t.status === status);
    if (priority) filtered = filtered.filter((t: any) => t.priority === priority);
    if (category) filtered = filtered.filter((t: any) => t.moduleType === category);

    return sendSuccess(res, filtered, { total: filtered.length });
  } catch (error: any) {
    logger.error('Failed to fetch project tasks', { error: error.message });
    return sendError(res, 500, 'Failed to fetch tasks');
  }
});

// POST /api/concept2cure/projects/:projectId/tasks
router.post('/projects/:projectId/tasks', async (req: Request, res: Response) => {
  try {
    const projectId = parseInt(paramStr(req.params.projectId), 10);
    if (isNaN(projectId)) return sendError(res, 400, 'Invalid project ID');

    const taskSchema = z.object({
      name: z.string().min(1),
      description: z.string().optional(),
      status: z.enum(['todo', 'in_progress', 'blocked', 'done']).default('todo'),
      priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
      moduleType: z.string().optional(),
      dueDate: z.string().optional(),
      assigneeId: z.number().optional(),
      parentTaskId: z.number().optional(),
      estimatedHours: z.number().optional(),
      dependsOn: z.array(z.string()).optional(),
      metadata: z.any().optional(),
    });

    const data = taskSchema.parse(req.body);

    // Resolve organizationId from the project
    const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
    if (!project) return sendError(res, 404, 'Project not found');

    const inserted = (await db
      .insert(projectTasks)
      .values({
        organizationId: project.organizationId,
        projectId,
        name: data.name,
        description: data.description || null,
        status: data.status,
        priority: data.priority,
        moduleType: data.moduleType || null,
        dueDate: data.dueDate ? new Date(data.dueDate) : null,
        assigneeId: data.assigneeId || null,
        parentTaskId: data.parentTaskId || null,
        estimatedHours: data.estimatedHours || null,
        dependsOn: data.dependsOn || null,
        metadata: data.metadata || null,
      })
      .returning()) as any[];
    const task = inserted[0];

    return sendSuccess(res, task);
  } catch (error: any) {
    if (error instanceof z.ZodError) return sendError(res, 400, 'Validation error', error.errors);
    logger.error('Failed to create task', { error: error.message });
    return sendError(res, 500, 'Failed to create task');
  }
});

// PUT /api/concept2cure/projects/:projectId/tasks/:taskId
router.put('/projects/:projectId/tasks/:taskId', async (req: Request, res: Response) => {
  try {
    const taskId = parseInt(paramStr(req.params.taskId), 10);
    if (isNaN(taskId)) return sendError(res, 400, 'Invalid task ID');

    // Tenant scope, and an explicit field allowlist.
    //
    // This handler previously did `.set(req.body).where(eq(projectTasks.id, taskId))`
    // — a primary-key-only predicate with the raw request body applied verbatim.
    // `project_tasks.id` is a serial, so ids are enumerable across the whole
    // estate, and `organizationId` is a real column on the table: a PUT carrying
    // `{"organizationId": <mine>}` moved another tenant's task into the caller's
    // org permanently, while `.returning()` handed back the victim row. The
    // sibling POST already validated with zod and resolved the org from the
    // project; only the update/delete pair were unscoped. The static
    // tenant-isolation gate could not see it because it scans raw SQL literals
    // and this is a Drizzle query-builder call.
    const organizationId = getOrganizationId(req);

    const taskUpdateSchema = z.object({
      name: z.string().optional(),
      description: z.string().nullable().optional(),
      status: z.enum(['todo', 'in_progress', 'blocked', 'done']).optional(),
      priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
      moduleType: z.string().nullable().optional(),
      dueDate: z.string().nullable().optional(),
      assigneeId: z.number().nullable().optional(),
      parentTaskId: z.number().nullable().optional(),
      estimatedHours: z.number().nullable().optional(),
      dependsOn: z.array(z.string()).nullable().optional(),
      metadata: z.any().optional(),
    });
    const data = taskUpdateSchema.parse(req.body);

    const updates: Record<string, unknown> = { ...data, updatedAt: new Date() };
    if (data.dueDate) updates.dueDate = new Date(data.dueDate);

    const [updated] = await db
      .update(projectTasks)
      .set(updates)
      .where(and(eq(projectTasks.id, taskId), eq(projectTasks.organizationId, organizationId)))
      .returning();

    if (!updated) return sendError(res, 404, 'Task not found');
    return sendSuccess(res, updated);
  } catch (error: any) {
    logger.error('Failed to update task', { error: error.message });
    return sendError(res, 500, 'Failed to update task');
  }
});

// DELETE /api/concept2cure/projects/:projectId/tasks/:taskId
router.delete('/projects/:projectId/tasks/:taskId', async (req: Request, res: Response) => {
  try {
    const taskId = parseInt(paramStr(req.params.taskId), 10);
    if (isNaN(taskId)) return sendError(res, 400, 'Invalid task ID');

    // Tenant scope — see the PUT twin above. This was a primary-key-only delete
    // on a serial id, so any authenticated user could destroy any tenant's task
    // by counting up.
    const organizationId = getOrganizationId(req);

    // db's union return type isn't iterable; cast at the boundary then index
    // (matches the .returning() pattern used elsewhere in this file).
    const deletedRows = (await db
      .delete(projectTasks)
      .where(and(eq(projectTasks.id, taskId), eq(projectTasks.organizationId, organizationId)))
      .returning()) as any[];
    const deleted = deletedRows[0];
    if (!deleted) return sendError(res, 404, 'Task not found');
    return sendSuccess(res, { deleted: true });
  } catch (error: any) {
    logger.error('Failed to delete task', { error: error.message });
    return sendError(res, 500, 'Failed to delete task');
  }
});

// POST /api/concept2cure/projects/:projectId/tasks/bulk
// AI-powered bulk task generation from submission type milestones
router.post('/projects/:projectId/tasks/bulk', async (req: Request, res: Response) => {
  try {
    const projectId = parseInt(paramStr(req.params.projectId), 10);
    if (isNaN(projectId)) return sendError(res, 400, 'Invalid project ID');

    const { submissionType, targetDate } = req.body;
    const milestones = SUBMISSION_MILESTONES[submissionType?.toUpperCase()];
    if (!milestones) {
      return sendError(
        res,
        400,
        `Unknown submission type: ${submissionType}. Supported: ${Object.keys(
          SUBMISSION_MILESTONES
        ).join(', ')}`
      );
    }

    const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
    if (!project) return sendError(res, 404, 'Project not found');

    const target = targetDate
      ? new Date(targetDate)
      : new Date(Date.now() + 180 * 24 * 60 * 60 * 1000); // 6 months default
    const totalMilestones = milestones.length;

    // Distribute milestones evenly between now and target date
    const now = new Date();
    const timeSpan = target.getTime() - now.getTime();

    const taskValues = milestones.map((m, i) => {
      const dueDate = new Date(now.getTime() + (timeSpan * (i + 1)) / totalMilestones);
      return {
        organizationId: project.organizationId,
        projectId,
        name: m.name,
        description: `${submissionType.toUpperCase()} milestone: ${m.name}`,
        status: 'todo' as const,
        priority:
          m.category === 'submission' || m.category === 'milestone'
            ? ('high' as const)
            : ('medium' as const),
        moduleType: m.category,
        dueDate,
        metadata: {
          submissionType,
          milestoneOrder: m.order,
          category: m.category,
          autoGenerated: true,
        },
      };
    });

    const created = (await db.insert(projectTasks).values(taskValues).returning()) as any[];

    return sendSuccess(res, created, {
      total: created.length,
      submissionType,
      targetDate: target.toISOString(),
    });
  } catch (error: any) {
    logger.error('Failed to bulk create tasks', { error: error.message });
    return sendError(res, 500, 'Failed to generate submission tasks');
  }
});

// GET /api/concept2cure/projects/:projectId/tasks/summary
// Task summary with counts by status, overdue count, health score
router.get('/projects/:projectId/tasks/summary', async (req: Request, res: Response) => {
  try {
    const projectId = parseInt(paramStr(req.params.projectId), 10);
    if (isNaN(projectId)) return sendError(res, 400, 'Invalid project ID');

    const tasks = await db
      .select()
      .from(projectTasks)
      .where(eq(projectTasks.projectId, projectId))
      .limit(1000);

    const now = new Date();
    const byStatus: Record<string, number> = {};
    const byPriority: Record<string, number> = {};
    let overdue = 0;
    let completed = 0;
    const total = tasks.length;

    for (const task of tasks) {
      const s = (task as any).status || 'todo';
      const p = (task as any).priority || 'medium';
      byStatus[s] = (byStatus[s] || 0) + 1;
      byPriority[p] = (byPriority[p] || 0) + 1;
      if (s === 'done') completed++;
      if ((task as any).dueDate && new Date((task as any).dueDate) < now && s !== 'done') overdue++;
    }

    // Health score: 100 if all done, penalized by overdue and blocked tasks
    const completionRate = total > 0 ? (completed / total) * 100 : 100;
    const overdueRate = total > 0 ? (overdue / total) * 100 : 0;
    const blockedCount = byStatus['blocked'] || 0;
    const healthScore = Math.max(
      0,
      Math.round(completionRate - overdueRate * 1.5 - blockedCount * 5)
    );

    return sendSuccess(res, {
      total,
      completed,
      overdue,
      byStatus,
      byPriority,
      healthScore,
      completionRate: Math.round(completionRate),
    });
  } catch (error: any) {
    logger.error('Failed to compute task summary', { error: error.message });
    return sendError(res, 500, 'Failed to compute task summary');
  }
});

// GET /api/concept2cure/submission-milestones/:type
// Get available milestones for a submission type
router.get('/submission-milestones/:type', (req: Request, res: Response) => {
  const type = paramStr(req.params.type).toUpperCase();
  const milestones = SUBMISSION_MILESTONES[type];
  if (!milestones) {
    return sendError(
      res,
      404,
      `No milestones for type: ${type}. Supported: ${Object.keys(SUBMISSION_MILESTONES).join(', ')}`
    );
  }
  return sendSuccess(res, milestones);
});

// GET /api/concept2cure/submission-milestones
// Get all available submission types
router.get('/submission-milestones', (_req: Request, res: Response) => {
  const types = Object.keys(SUBMISSION_MILESTONES).map(type => ({
    type,
    milestoneCount: SUBMISSION_MILESTONES[type].length,
  }));
  return sendSuccess(res, types);
});

/* ── AI task assessment (AnA-powered task evaluation) ────────────────────── */

router.post('/projects/:projectId/tasks/assess', async (req: Request, res: Response) => {
  try {
    const projectId = parseInt(paramStr(req.params.projectId), 10);
    if (isNaN(projectId)) return sendError(res, 400, 'Invalid project ID');

    const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
    if (!project) return sendError(res, 404, 'Project not found');

    const tasks = await db
      .select()
      .from(projectTasks)
      .where(eq(projectTasks.projectId, projectId))
      .orderBy(desc(projectTasks.createdAt));

    const totalTasks = tasks.length;
    const completedTasks = tasks.filter(t => (t as any).status === 'done').length;
    const blockedTasks = tasks.filter(t => (t as any).status === 'blocked').length;
    const overdueTasks = tasks.filter(t => {
      const dueDate = (t as any).dueDate;
      return dueDate && new Date(dueDate) < new Date() && (t as any).status !== 'done';
    }).length;
    const inProgressTasks = tasks.filter(t => (t as any).status === 'in-progress').length;

    // Compute health score (0-100)
    let healthScore = 100;
    if (totalTasks > 0) {
      const completionRate = (completedTasks / totalTasks) * 100;
      const overdueRate = (overdueTasks / totalTasks) * 100;
      const blockedRate = (blockedTasks / totalTasks) * 100;
      healthScore = Math.max(
        0,
        Math.min(
          100,
          Math.round(
            completionRate * 0.4 + (100 - overdueRate * 3) * 0.3 + (100 - blockedRate * 5) * 0.3
          )
        )
      );
    }

    // Generate risk assessment
    const risks: string[] = [];
    if (overdueTasks > 0)
      risks.push(`${overdueTasks} task${overdueTasks > 1 ? 's' : ''} overdue — review deadlines`);
    if (blockedTasks > 0)
      risks.push(
        `${blockedTasks} task${blockedTasks > 1 ? 's' : ''} blocked — resolve dependencies`
      );
    if (totalTasks > 0 && inProgressTasks === 0 && completedTasks < totalTasks) {
      risks.push('No tasks in progress — workflow may be stalled');
    }
    if (totalTasks === 0)
      risks.push('No tasks defined — generate milestones for this submission type');

    // Generate next recommended actions
    const nextActions: Array<{ action: string; priority: string; reason: string }> = [];

    if (totalTasks === 0) {
      nextActions.push({
        action: `Generate ${project.type || 'submission'} milestones`,
        priority: 'high',
        reason: 'No tasks exist yet. Auto-generate milestone-based tasks for your submission type.',
      });
    }

    if (overdueTasks > 0) {
      nextActions.push({
        action: 'Review overdue tasks',
        priority: 'urgent',
        reason: `${overdueTasks} task${overdueTasks > 1 ? 's have' : ' has'} passed ${
          overdueTasks > 1 ? 'their' : 'its'
        } due date.`,
      });
    }

    if (blockedTasks > 0) {
      nextActions.push({
        action: 'Resolve blocked tasks',
        priority: 'high',
        reason: `${blockedTasks} task${
          blockedTasks > 1 ? 's are' : ' is'
        } blocked and preventing progress.`,
      });
    }

    // Check CMC readiness
    const metadata = (project.metadata as Record<string, any>) || {};
    if (!metadata.cmcDrugSubstance?.substanceName) {
      nextActions.push({
        action: 'Enter Drug Substance data (CMC Module 3)',
        priority: 'medium',
        reason: 'Drug Substance information is required for Module 3 documentation.',
      });
    }
    if (!metadata.cmcDrugProduct?.productName) {
      nextActions.push({
        action: 'Enter Drug Product data (CMC Module 3)',
        priority: 'medium',
        reason: 'Drug Product information is required for Module 3 documentation.',
      });
    }

    return sendSuccess(res, {
      healthScore,
      summary: {
        total: totalTasks,
        completed: completedTasks,
        inProgress: inProgressTasks,
        blocked: blockedTasks,
        overdue: overdueTasks,
        completionRate: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0,
      },
      risks,
      nextActions: nextActions.slice(0, 5),
      assessedAt: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Failed to assess tasks', { error });
    return sendError(res, 500, 'Failed to assess tasks');
  }
});

export default router;
