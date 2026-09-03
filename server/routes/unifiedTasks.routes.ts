/**
 * Unified Task Management API Routes
 * 
 * API endpoints for the comprehensive unified task management system
 * that connects ALL modules in the Regulatory Submission Center.
 */

import { Router, Request, Response } from 'express';
import unifiedTaskService, { MODULE_CONFIG } from '../services/unifiedTaskService';
import { z } from 'zod';
import { getSecureOrgId } from '../utils/tenantContext';
import { auditTaskAction } from '../services/tasking/task-audit';
import {
  TASK_STATUSES,
  TASK_TRANSITIONS,
  isLegalTransition,
  type TaskStatus,
} from '../services/tasking/task-state-machine';
import { requireTaskSignoff } from '../services/tasking/task-signoff';
import {
  notifyTaskEvent,
  cascadeUnblockOnCompletion,
} from '../services/tasking/task-side-effects';
import { serverError } from '../lib/api-response';
import { createScopedLogger } from '../utils/logger';

const router = Router();

const logger = createScopedLogger('unified-tasks');

// Request validation schemas
const createTaskSchema = z.object({
  moduleType: z.enum(['CMC', 'IND', 'MedicalDevice', 'eCTD', 'Vault', 'ProtocolDesign']),
  title: z.string().min(1),
  description: z.string().optional(),
  category: z.string().optional(),
  taskType: z.string().optional(),
  assigneeId: z.number().optional(),
  assigneeName: z.string().optional(),
  priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  dueDate: z.string().optional(),
  estimatedHours: z.number().optional(),
  sourceEntityId: z.string().optional(),
  sourceEntityType: z.string().optional(),
  tags: z.array(z.string()).optional(),
  metadata: z.any().optional(),
  organizationId: z.number(),
  clientWorkspaceId: z.number().optional(),
  projectId: z.number().optional(),
});

const linkTaskSchema = z.object({
  sourceTaskId: z.string(),
  targetTaskId: z.string(),
  linkType: z.enum(['dependency', 'reference', 'parent-child', 'related']),
  dependencyType: z.enum(['finish-to-start', 'start-to-start', 'finish-to-finish', 'start-to-finish']).optional(),
  isBlocking: z.boolean().optional(),
  impactDescription: z.string().optional(),
  riskLevel: z.enum(['low', 'medium', 'high']).optional(),
});

/**
 * Resolve the tenant org id from the verified JWT (never from client-supplied
 * headers / query / body). Writes a 401 and returns null when there is no org
 * context. Every handler in this router scopes to this value — historically the
 * router trusted a client `organizationId`, which was a cross-tenant IDOR.
 */
function requireOrgId(req: Request, res: Response): number | null {
  const raw = getSecureOrgId(req);
  const org = raw ? Number(raw) : NaN;
  if (!Number.isFinite(org) || org <= 0) {
    res.status(401).json({ success: false, error: 'Organization context required' });
    return null;
  }
  return org;
}

/**
 * Find a single task by taskId/id, scoped to the caller's org, so the by-id
 * read/mutation paths cannot touch another tenant's task. Returns null when the
 * id is not present in the caller's org (the caller then responds 404).
 * Single indexed lookup — previously fetched up to 2000 rows and .find()'d.
 */
async function findOrgTask(org: number, id: string) {
  return unifiedTaskService.getOrgTaskById(org, id);
}

/**
 * POST /api/regulatory/tasks/unified
 * Create tasks from any module
 */
router.post('/unified', async (req: Request, res: Response) => {
  try {
    const org = requireOrgId(req, res);
    if (org == null) return;
    const validatedData = createTaskSchema.parse(req.body);

    // Convert dueDate string to Date object if present. The org id is taken
    // from the verified JWT, never the client-supplied body value.
    const taskData = {
      ...validatedData,
      organizationId: org,
      dueDate: validatedData.dueDate ? new Date(validatedData.dueDate) : undefined,
    };
    
    const task = await unifiedTaskService.createUnifiedTask(taskData);

    await auditTaskAction({
      orgId: org,
      userId: (req as any).user?.id,
      command: 'task.create',
      taskId: task?.taskId ?? String(task?.id ?? ''),
      payload: {
        moduleType: validatedData.moduleType,
        title: validatedData.title,
        priority: validatedData.priority ?? 'medium',
        status: 'pending',
      },
      reason: typeof req.body?.reason === 'string' ? req.body.reason : undefined,
    });
    
    res.status(201).json({
      success: true,
      task,
      message: `Task created successfully in ${validatedData.moduleType} module`,
    });
  } catch (error: any) {
    console.error('Error creating unified task:', error);
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to create unified task',
    });
  }
});

/**
 * GET /api/regulatory/tasks/all
 * Get ALL tasks across ALL modules
 */
router.get('/all', async (req: Request, res: Response) => {
  try {
    const org = requireOrgId(req, res);
    if (org == null) return;
    const {
      clientWorkspaceId,
      projectId,
      status,
      moduleType,
      assigneeId,
      limit = '50',
      offset = '0',
    } = req.query;

    // Org id is always the verified JWT org — the client-supplied
    // organizationId query param is ignored (was a cross-tenant IDOR where an
    // absent param returned every tenant's tasks).
    const tasks = await unifiedTaskService.getAllUnifiedTasks({
      organizationId: org,
      clientWorkspaceId: clientWorkspaceId ? parseInt(clientWorkspaceId as string) : undefined,
      projectId: projectId ? parseInt(projectId as string) : undefined,
      status: status as string,
      moduleType: moduleType as string,
      assigneeId: assigneeId ? parseInt(assigneeId as string) : undefined,
      limit: parseInt(limit as string),
      offset: parseInt(offset as string),
    });

    // Group tasks by module for better visualization
    const tasksByModule: Record<string, any[]> = {};
    tasks.forEach((task) => {
      if (!tasksByModule[task.moduleType]) {
        tasksByModule[task.moduleType] = [];
      }
      tasksByModule[task.moduleType].push(task);
    });

    res.json({
      success: true,
      tasks,
      tasksByModule,
      totalCount: tasks.length,
      moduleBreakdown: Object.keys(tasksByModule).map((module) => ({
        module,
        count: tasksByModule[module].length,
        color: MODULE_CONFIG[module as keyof typeof MODULE_CONFIG]?.color,
        icon: MODULE_CONFIG[module as keyof typeof MODULE_CONFIG]?.icon,
      })),
    });
  } catch (error: any) {
    console.error('Error fetching all tasks:', error);
    return serverError(res, logger, 'loading all', error);
  }
});

/**
 * GET /api/regulatory/tasks/by-module/:module
 * Get tasks by module type
 */
router.get('/by-module/:module', async (req: Request, res: Response) => {
  try {
    const module = String(req.params.module);
    const { status, limit = '50' } = req.query;

    if (!['CMC', 'IND', 'MedicalDevice', 'eCTD', 'Vault', 'ProtocolDesign'].includes(module)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid module type',
      });
    }

    const org = requireOrgId(req, res);
    if (org == null) return;
    const tasks = await unifiedTaskService.getTasksByModule(
      module as keyof typeof MODULE_CONFIG,
      {
        organizationId: org,
        status: status as string,
        limit: parseInt(limit as string),
      }
    );

    const moduleConfig = MODULE_CONFIG[module as keyof typeof MODULE_CONFIG];

    res.json({
      success: true,
      module,
      moduleConfig,
      tasks,
      count: tasks.length,
      statistics: {
        pending: tasks.filter((t) => t.status === 'pending').length,
        inProgress: tasks.filter((t) => t.status === 'in-progress').length,
        review: tasks.filter((t) => t.status === 'review').length,
        completed: tasks.filter((t) => t.status === 'completed').length,
        blocked: tasks.filter((t) => t.status === 'blocked').length,
      },
    });
  } catch (error: any) {
    console.error('Error fetching module tasks:', error);
    return serverError(res, logger, 'loading by module', error);
  }
});

/**
 * POST /api/regulatory/tasks/:id/link
 * Link tasks across modules
 */
router.post('/:id/link', async (req: Request, res: Response) => {
  try {
    const org = requireOrgId(req, res);
    if (org == null) return;
    const { id } = req.params as { id: string };
    const linkData = linkTaskSchema.parse({
      ...req.body,
      sourceTaskId: id,
    });

    // Both endpoints of the link must belong to the caller's org.
    const [source, target] = await Promise.all([
      findOrgTask(org, linkData.sourceTaskId),
      findOrgTask(org, linkData.targetTaskId),
    ]);
    if (!source || !target) {
      return res.status(404).json({ success: false, error: 'Task not found' });
    }

    const link = await unifiedTaskService.linkTasks(linkData);

    await auditTaskAction({
      orgId: org,
      userId: (req as any).user?.id,
      command: 'task.link',
      taskId: linkData.sourceTaskId,
      payload: { targetTaskId: linkData.targetTaskId, linkType: linkData.linkType },
    });

    res.json({
      success: true,
      link,
      message: `Tasks linked successfully: ${linkData.linkType} relationship created`,
    });
  } catch (error: any) {
    console.error('Error linking tasks:', error);
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to link tasks',
    });
  }
});

/**
 * GET /api/regulatory/dashboard/unified
 * Get unified dashboard metrics
 */
router.get('/dashboard/unified', async (req: Request, res: Response) => {
  try {
    const { projectId } = req.query;
    const org = requireOrgId(req, res);
    if (org == null) return;

    const metrics = await unifiedTaskService.getUnifiedDashboardMetrics(
      org,
      projectId ? parseInt(projectId as string) : undefined
    );

    // Calculate overall submission progress
    const overallProgress = Object.values(metrics.moduleProgress).reduce((sum, progress) => sum + progress, 0) / Object.keys(metrics.moduleProgress).length;

    res.json({
      success: true,
      metrics: {
        ...metrics,
        overallProgress,
        readinessScore: calculateReadinessScore(metrics),
        criticalAlerts: getCriticalAlerts(metrics),
        nextMilestones: getNextMilestones(metrics),
      },
    });
  } catch (error: any) {
    console.error('Error fetching dashboard metrics:', error);
    return serverError(res, logger, 'loading unified', error);
  }
});

/**
 * POST /api/regulatory/tasks/sync/:module
 * Sync tasks from specific module
 */
router.post('/sync/:module', async (req: Request, res: Response) => {
  try {
    const module = String(req.params.module);

    if (!['CMC', 'IND', 'MedicalDevice', 'eCTD', 'Vault', 'ProtocolDesign'].includes(module)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid module type',
      });
    }

    const org = requireOrgId(req, res);
    if (org == null) return;
    const result = await unifiedTaskService.syncTasksFromModule(
      module as keyof typeof MODULE_CONFIG,
      org
    );

    res.json({
      success: true,
      module,
      syncResult: result,
      message: `Successfully synced ${result.synced} tasks from ${module} module (${result.created} new, ${result.updated} updated)`,
    });
  } catch (error: any) {
    console.error('Error syncing module tasks:', error);
    return serverError(res, logger, 'syncing', error);
  }
});

/**
 * PATCH /api/regulatory/tasks/:id/status
 * Update task status
 */
router.patch('/:id/status', async (req: Request, res: Response) => {
  try {
    const org = requireOrgId(req, res);
    if (org == null) return;
    const id = String(req.params.id);
    const { status, userId } = req.body;

    if (!status || !(TASK_STATUSES as readonly string[]).includes(String(status))) {
      return res.status(400).json({
        success: false,
        error: `status is required and must be one of: ${TASK_STATUSES.join(', ')}`,
      });
    }

    // The task must belong to the caller's org before it can be mutated.
    const existing = await findOrgTask(org, id);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Task not found' });
    }

    // Same gates as /api/tasks — this router previously accepted any string
    // and completed approval-gated tasks with no signature, so the ceremony
    // was one URL away from being optional (GA bypass closure).
    if (!isLegalTransition(existing.status, String(status))) {
      return res.status(409).json({
        success: false,
        error: `A task in "${existing.status}" cannot move to "${status}".`,
        from: existing.status,
        allowed: TASK_TRANSITIONS[existing.status as TaskStatus] ?? [],
      });
    }

    const actorId = Number((req as any).user?.id);
    const signoff = await requireTaskSignoff({
      organizationId: org,
      task: existing,
      toStatus: String(status),
      actor: {
        userId: Number.isFinite(actorId) && actorId > 0 ? actorId : null,
        email:
          typeof (req as any).userEmail === 'string'
            ? (req as any).userEmail
            : ((req as any).user?.email ?? null),
        name: (req as any).userName ?? (req as any).user?.name ?? null,
      },
      signature: req.body?.signature,
      reason: typeof req.body?.reason === 'string' ? req.body.reason : undefined,
    });
    if (signoff.required && !signoff.ok) {
      return res.status(signoff.status).json({
        success: false,
        code: signoff.code,
        error: signoff.error,
      });
    }
    const manifestation = signoff.required && signoff.ok ? signoff.manifestation : null;

    // `id` may be the numeric primary key — findOrgTask resolves either form —
    // but the write is keyed on task_id, so passing the path param through
    // matched ZERO rows while the audit entry, the cascade and the 200 all
    // still fired: a governed ledger record asserting a transition that never
    // happened. Always write with the resolved business key.
    const updatedTask = await unifiedTaskService.updateTaskStatus(existing.taskId, status, userId, {
      manifestation,
      organizationId: org,
      expectedStatus: existing.status,
    });

    // Nothing below may run unless the row actually changed. The expectedStatus
    // compare-and-set also lands here: a concurrent transition that beat us
    // leaves updatedTask undefined, and reporting that as 404 would misread a
    // lost race as a missing task.
    if (!updatedTask) {
      const stillThere = await findOrgTask(org, id);
      if (!stillThere) {
        return res.status(404).json({ success: false, error: 'Task not found' });
      }
      return res.status(409).json({
        success: false,
        code: 'CONFLICT_STALE',
        error: 'This task changed while your request was in flight. Reload and try again.',
        from: stillThere.status,
      });
    }

    await auditTaskAction({
      orgId: org,
      userId: (req as any).user?.id,
      command: 'task.transition',
      // The resolved business key, so this entry chains to the task's other
      // lineage records rather than landing under `task:<numeric pk>`.
      taskId: existing.taskId,
      payload: {
        from: (existing as any).status,
        to: status,
        ...(manifestation
          ? {
              signature: {
                signedByName: manifestation.signedByName,
                meaning: manifestation.meaning,
                signedAt: manifestation.signedAt,
                method: manifestation.method,
              },
            }
          : {}),
      },
      reason: typeof req.body?.reason === 'string' ? req.body.reason : undefined,
    });

    // Completion wakes dependents and tells the people affected — the same
    // side-effects the /api/tasks path runs.
    if (String(status) === 'completed' && existing.status !== 'completed') {
      await cascadeUnblockOnCompletion(org, existing.taskId);
      if (existing.createdById && existing.createdById !== actorId) {
        notifyTaskEvent({
          organizationId: org,
          recipientUserId: existing.createdById,
          category: 'task_completed',
          title: `Completed: ${existing.title}`,
          taskId: existing.taskId,
        });
      }
    }

    res.json({
      success: true,
      task: updatedTask,
      message: `Task status updated to ${status}`,
    });
  } catch (error: any) {
    console.error('Error updating task status:', error);
    return serverError(res, logger, 'updating status', error);
  }
});

/**
 * GET /api/regulatory/tasks/:id
 * Get single task details with all relationships
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const org = requireOrgId(req, res);
    if (org == null) return;
    const id = String(req.params.id);

    const task = await findOrgTask(org, id);

    if (!task) {
      return res.status(404).json({
        success: false,
        error: 'Task not found',
      });
    }

    res.json({
      success: true,
      task,
    });
  } catch (error: any) {
    console.error('Error fetching task:', error);
    return serverError(res, logger, 'loading the task', error);
  }
});

// Helper functions
function calculateReadinessScore(metrics: any): number {
  let score = 0;
  const weights = {
    progress: 0.4,
    overdue: 0.2,
    approvals: 0.2,
    priority: 0.2,
  };

  // Progress component - ensure type safety
  const progressValues = Object.values(metrics.moduleProgress || {}) as number[];
  const avgProgress = progressValues.length > 0 
    ? progressValues.reduce((sum, p) => sum + (typeof p === 'number' ? p : 0), 0) / progressValues.length
    : 0;
  score += (avgProgress / 100) * weights.progress * 100;

  // Overdue penalty
  const overduePenalty = Math.min(metrics.overdueTasks * 5, 20);
  score -= overduePenalty * weights.overdue;

  // Approval readiness
  const approvalReadiness = metrics.approvalRequired === 0 ? 100 : Math.max(0, 100 - metrics.approvalRequired * 10);
  score += approvalReadiness * weights.approvals;

  // Priority task completion
  const priorityCompletion = metrics.highPriorityTasks === 0 ? 100 : Math.max(0, 100 - metrics.highPriorityTasks * 5);
  score += priorityCompletion * weights.priority;

  return Math.max(0, Math.min(100, score));
}

function getCriticalAlerts(metrics: any): string[] {
  const alerts: string[] = [];

  if (metrics.overdueTasks > 0) {
    alerts.push(`${metrics.overdueTasks} tasks are overdue and require immediate attention`);
  }

  if (metrics.highPriorityTasks > 5) {
    alerts.push(`${metrics.highPriorityTasks} high-priority tasks pending completion`);
  }

  if (metrics.approvalRequired > 3) {
    alerts.push(`${metrics.approvalRequired} tasks awaiting approval`);
  }

  for (const [module, progress] of Object.entries(metrics.moduleProgress)) {
    if ((progress as number) < 25) {
      alerts.push(`${module} module is at ${Math.round(progress as number)}% - significant work needed`);
    }
  }

  return alerts;
}

function getNextMilestones(metrics: any): any[] {
  const milestones: any[] = [];

  for (const [module, progress] of Object.entries(metrics.moduleProgress)) {
    const moduleConfig = metrics.moduleConfig[module];
    if (!moduleConfig) continue;

    if ((progress as number) < 100) {
      milestones.push({
        module,
        name: `Complete ${moduleConfig.name}`,
        progress: Math.round(progress as number),
        color: moduleConfig.color,
        icon: moduleConfig.icon,
        remainingTasks: Math.round((100 - (progress as number)) / 10),
      });
    }
  }

  return milestones.sort((a, b) => b.progress - a.progress);
}

export default router;