/**
 * Unified Task Management API Routes
 * 
 * API endpoints for the comprehensive unified task management system
 * that connects ALL modules in the Regulatory Submission Center.
 */

import { Router, Request, Response } from 'express';
// Writes run on the request's tenant-scoped connection (RLS session variables
// set), not the shared pool: ci:requestdb-coverage requires it of a route that
// touches the database.
import { requestDb } from '../db/requestDb';
import unifiedTaskService, { MODULE_CONFIG, ModuleSyncUnavailableError } from '../services/unifiedTaskService';
import { z } from 'zod';
import { getSecureOrgId } from '../utils/tenantContext';
import { requireEditorAccess } from '../middleware/orgMembership';
import { auditTaskActionInTx, TaskAuditNotRecordedError } from '../services/tasking/task-audit';
import { governedWriter, auditWriteFailed, outcomeUnknown } from '../services/tasking/governed-task-write';
import {
  TASK_STATUSES,
  TASK_TRANSITIONS,
  isLegalTransition,
  type TaskStatus,
} from '../services/tasking/task-state-machine';
import { requireTaskSignoff } from '../services/tasking/task-signoff';
import {
  notifyTaskEvent,
  cascadeUnblockOnCompletionInTx,
  type TaskEventNotice,
} from '../services/tasking/task-side-effects';
import {
  calculateReadinessScore,
  getCriticalAlerts,
  getNextMilestones,
} from '../services/tasking/unified-dashboard-readiness';
import { serverError } from '../lib/api-response';
import { createScopedLogger } from '../utils/logger';

const router = Router();

const logger = createScopedLogger('unified-tasks');

/* Mounted twice (/api/regulatory/tasks, /api/unified-tasks) over the table
   /api/tasks writes, and held to its rules. Every write is ROLE-GATED with
   requireEditorAccess — an org `viewer` reads but does not write — and runs
   with its ledger row on ONE transaction (auditTaskActionInTx): a failed row
   rolls the write back and the answer is 500 AUDIT_WRITE_FAILED. Row locks are
   taken before the first ledger row, which takes the audit-chain lock. Reads
   stay open. */

/** The answer for a write that threw: a malformed body (400, nothing
 *  written), a ledger row that failed (rolled back), a COMMIT that was lost
 *  (unknown — never "failed", never "saved"), or a store failure (rolled back,
 *  its text kept in the log). */
function writeFailed(res: Response, error: unknown, commitInFlight: boolean, what: string, where: string) {
  if (error instanceof z.ZodError) return res.status(400).json({ success: false, error: error.errors });
  if (error instanceof TaskAuditNotRecordedError) return auditWriteFailed(res, what);
  if (commitInFlight) {
    logger.error(`${where}: COMMIT lost, outcome unknown`, { err: error instanceof Error ? error.message : String(error) });
    return outcomeUnknown(res);
  }
  return serverError(res, logger, where, error);
}

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
router.post('/unified', requireEditorAccess, async (req: Request, res: Response) => {
  let commitInFlight = false;
  try {
    const ctx = governedWriter(req, res);
    if (!ctx) return;
    const { organizationId: org, actorUserId } = ctx;
    const validatedData = createTaskSchema.parse(req.body);

    // Convert dueDate string to Date object if present. The org id is the
    // verified one, never the client-supplied body value; the creator is the
    // session actor.
    const taskData = {
      ...validatedData,
      organizationId: org,
      createdById: actorUserId,
      dueDate: validatedData.dueDate ? new Date(validatedData.dueDate) : undefined,
    };

    const task = await requestDb(req).transaction(async (tx) => {
      const row = await unifiedTaskService.createUnifiedTask(taskData, tx);
      await auditTaskActionInTx(tx, {
        orgId: org,
        userId: actorUserId,
        command: 'task.create',
        taskId: row.taskId,
        payload: {
          moduleType: validatedData.moduleType,
          title: validatedData.title,
          priority: validatedData.priority ?? 'medium',
          status: 'pending',
          assigneeId: validatedData.assigneeId ?? null,
          sourceEntityType: validatedData.sourceEntityType ?? null,
          sourceEntityId: validatedData.sourceEntityId ?? null,
        },
        reason: typeof req.body?.reason === 'string' ? req.body.reason : undefined,
      });
      commitInFlight = true;
      return row;
    });
    commitInFlight = false;

    res.status(201).json({
      success: true,
      task,
      message: `Task created successfully in ${validatedData.moduleType} module`,
    });
  } catch (error) {
    return writeFailed(res, error, commitInFlight, 'The task', 'creating the task');
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
router.post('/:id/link', requireEditorAccess, async (req: Request, res: Response) => {
  let commitInFlight = false;
  try {
    const ctx = governedWriter(req, res);
    if (!ctx) return;
    const { organizationId: org, actorUserId } = ctx;
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

    // Either id may be a numeric primary key; the link, the blocking arrays
    // and the ledger row are keyed on the resolved business keys.
    const link = await requestDb(req).transaction(async (tx) => {
      const row = await unifiedTaskService.linkTasks(
        { ...linkData, sourceTaskId: source.taskId, targetTaskId: target.taskId, organizationId: org },
        tx
      );
      // An endpoint archived since the read above: nothing linked, nothing recorded.
      if (!row) return null;
      await auditTaskActionInTx(tx, {
        orgId: org,
        userId: actorUserId,
        command: 'task.link',
        taskId: source.taskId,
        payload: {
          targetTaskId: target.taskId,
          linkType: linkData.linkType,
          isBlocking: linkData.isBlocking ?? false,
          dependencyType: linkData.dependencyType ?? null,
        },
        reason: typeof req.body?.reason === 'string' ? req.body.reason : undefined,
      });
      commitInFlight = true;
      return row;
    });
    commitInFlight = false;
    if (!link) {
      return res.status(404).json({ success: false, error: 'Task not found' });
    }

    res.json({
      success: true,
      link,
      message: `Tasks linked successfully: ${linkData.linkType} relationship created`,
    });
  } catch (error) {
    return writeFailed(res, error, commitInFlight, 'The link', 'linking tasks');
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
router.post('/sync/:module', requireEditorAccess, async (req: Request, res: Response) => {
  let commitInFlight = false;
  try {
    const module = String(req.params.module);

    if (!['CMC', 'IND', 'MedicalDevice', 'eCTD', 'Vault', 'ProtocolDesign'].includes(module)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid module type',
      });
    }

    const ctx = governedWriter(req, res);
    if (!ctx) return;
    const { organizationId: org, actorUserId } = ctx;

    // One transaction: every task the sync creates, then one task.create row
    // each (every INSERT before the first ledger row). A row that fails rolls
    // the whole sync back — never a task on the board with no creation record.
    // The session actor is each task's creator, on the row as in the ledger.
    const result = await requestDb(req).transaction(async (tx) => {
      const synced = await unifiedTaskService.syncTasksFromModule(
        module as keyof typeof MODULE_CONFIG,
        { organizationId: org, createdById: actorUserId },
        tx
      );
      for (const task of synced.createdTasks) {
        await auditTaskActionInTx(tx, {
          orgId: org,
          userId: actorUserId,
          command: 'task.create',
          taskId: task.taskId,
          payload: {
            moduleType: task.moduleType,
            title: task.title,
            priority: task.priority,
            status: task.status,
            assigneeId: task.assigneeId ?? null,
            sourceEntityType: task.sourceEntityType ?? null,
            sourceEntityId: task.sourceEntityId ?? null,
            sync: true,
          },
          reason: `Synced from the ${module} module`,
        });
      }
      commitInFlight = true;
      return synced;
    });
    commitInFlight = false;

    res.json({
      success: true,
      module,
      syncResult: { synced: result.synced, created: result.created, updated: result.updated },
      message: `Successfully synced ${result.synced} tasks from ${module} module (${result.created} new, ${result.updated} updated)`,
    });
  } catch (error) {
    // Refused before any read (see ModuleSyncUnavailableError) and rolled
    // back: not a failure to retry, and never an empty sync.
    if (error instanceof ModuleSyncUnavailableError) {
      return res.status(501).json({
        success: false,
        error: 'SYNC_NOT_AVAILABLE',
        message: `Syncing tasks from the ${error.module} module is not available, so nothing was synced.`,
      });
    }
    return writeFailed(res, error, commitInFlight, 'The sync', 'syncing');
  }
});

/**
 * PATCH /api/regulatory/tasks/:id/status
 * Update task status
 */
router.patch('/:id/status', requireEditorAccess, async (req: Request, res: Response) => {
  // Set while the transaction's COMMIT is in flight: a failure then leaves the
  // change — a signed completion and its cascade included — neither confirmed
  // nor refuted, and the answer must say so rather than guess.
  let commitInFlight = false;
  try {
    const ctx = governedWriter(req, res);
    if (!ctx) return;
    const { organizationId: org, actorUserId } = ctx;
    const id = String(req.params.id);
    // A body `userId` is ignored: the change is attributed to the session.
    const { status } = req.body;

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

    const reason = typeof req.body?.reason === 'string' ? req.body.reason : undefined;
    const signoff = await requireTaskSignoff({
      organizationId: org,
      task: existing,
      toStatus: String(status),
      actor: {
        userId: actorUserId,
        email:
          typeof (req as any).userEmail === 'string'
            ? (req as any).userEmail
            : ((req as any).user?.email ?? null),
        name: (req as any).userName ?? (req as any).user?.name ?? null,
      },
      signature: req.body?.signature,
      reason,
    });
    if (signoff.required && !signoff.ok) {
      return res.status(signoff.status).json({
        success: false,
        code: signoff.code,
        error: signoff.error,
      });
    }
    const manifestation = signoff.required && signoff.ok ? signoff.manifestation : null;

    // isLegalTransition passes from === to. With no signature to attach, a
    // same-status request is a stale view (a board still showing a task someone
    // else moved), and re-running the UPDATE would rewrite a signed record's
    // completion time and last editor with nothing to record. Refused, as on
    // /api/tasks: the change this caller asked for did not happen.
    const statusChanges = existing.status !== String(status);
    if (!statusChanges && !manifestation) {
      return res.status(409).json({
        success: false,
        code: 'CONFLICT_STALE',
        error: `This task is already "${existing.status}", so nothing was changed. Reload to see its current state.`,
        from: existing.status,
      });
    }
    const completes = String(status) === 'completed' && statusChanges;

    // `id` may be the numeric primary key — findOrgTask resolves either form —
    // but every write and ledger row below is keyed on the resolved business
    // key. The transition, its ledger row and, for a completion, the
    // dependents it unblocks with theirs are ONE transaction; the unblock
    // notifications wait for COMMIT.
    const outcome = await requestDb(req).transaction(async (tx) => {
      const row = await unifiedTaskService.updateTaskStatus(
        existing.taskId,
        String(status),
        actorUserId,
        { manifestation, organizationId: org, expectedStatus: existing.status },
        tx
      );
      // The compare-and-set lost (or the task was archived): nothing changed,
      // so nothing is recorded.
      if (!row) return { row, unblocked: [] as TaskEventNotice[] };
      // Before any ledger row: this task's row lock, then its dependents',
      // then the audit-chain lock the first ledger row takes.
      const cascade = completes
        ? await cascadeUnblockOnCompletionInTx(org, existing.taskId, { tx, actorUserId })
        : null;
      await auditTaskActionInTx(tx, {
        orgId: org,
        userId: actorUserId,
        command: 'task.transition',
        taskId: existing.taskId,
        payload: {
          from: existing.status,
          to: String(status),
          // Signature manifestation (never the credentials) rides the governed record.
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
        reason,
      });
      // The dependents' rows follow the completion that caused them.
      for (const entry of cascade?.ledger ?? []) await auditTaskActionInTx(tx, entry);
      commitInFlight = true;
      return { row, unblocked: cascade?.notices ?? [] };
    });
    commitInFlight = false;
    const updatedTask = outcome.row;

    // A lost compare-and-set lands here too: a concurrent transition that beat
    // us leaves no row, and reporting that as 404 would misread a lost race as
    // a missing task.
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

    // Completion wakes dependents and tells the people affected — the same
    // side-effects the /api/tasks path runs, sent only now it has committed.
    if (completes) {
      for (const notice of outcome.unblocked) notifyTaskEvent(notice);
      if (existing.createdById && existing.createdById !== actorUserId) {
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
  } catch (error) {
    return writeFailed(res, error, commitInFlight, 'The status change', 'updating status');
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

export default router;