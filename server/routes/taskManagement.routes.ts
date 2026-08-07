import { Router, Request, Response } from 'express';
import { db } from '../db';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { and, eq, or, ne, lt, desc, asc, inArray, sql, count, avg } from 'drizzle-orm';
import {
  unifiedTasks,
  taskTemplates,
  taskAutomation,
  taskDependencies,
  users,
  organizationUsers,
} from '../../shared/schema';
import { getSecureOrgId } from '../utils/tenantContext';
import { auditTaskAction } from '../services/tasking/task-audit';
import { createNotification } from '../services/notifications/notification-service';
import {
  BUILTIN_WORKFLOW_TEMPLATES,
  getBuiltinWorkflowTemplate,
} from '../services/tasking/workflow-templates';

const router = Router();
const storage = { db };

function getActorUserId(req: Request): number | null {
  const raw = (req as any).userId ?? (req as any).user?.id;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

// ── Status state machine ────────────────────────────────────────────────────
//
// `unified_tasks.status` was free text: any string was accepted, statuses the
// board has no column for could be minted, and completed → pending was one
// PATCH away with no record of intent (assessment D4/D5/D23). The domain and
// its legal transitions are now explicit. Same-status writes (progress-only
// updates) always pass; completed → in-progress/review is a deliberate,
// audited reopen.

export const TASK_STATUSES = [
  'pending',
  'in-progress',
  'review',
  'completed',
  'blocked',
  'cancelled',
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

const TASK_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  pending: ['in-progress', 'review', 'blocked', 'cancelled'],
  'in-progress': ['pending', 'review', 'completed', 'blocked', 'cancelled'],
  review: ['in-progress', 'completed', 'blocked', 'cancelled'],
  completed: ['review', 'in-progress'], // audited reopen only
  blocked: ['pending', 'in-progress', 'review', 'cancelled'],
  cancelled: ['pending'],
};

const taskStatusSchema = z.enum(TASK_STATUSES);

export function isLegalTransition(from: string, to: string): boolean {
  if (from === to) return true;
  const allowed = TASK_TRANSITIONS[from as TaskStatus];
  // An unknown stored status (legacy row) may move to any known status so old
  // rows can be repaired through the UI rather than being stuck forever.
  if (!allowed) return (TASK_STATUSES as readonly string[]).includes(to);
  return allowed.includes(to as TaskStatus);
}

// ── Notifications ───────────────────────────────────────────────────────────
//
// Task events now produce real notifications (assessment D13/D14) through the
// shared notification service (mdx_notifications). Fire-and-forget: a failed
// notification never fails the mutation it describes.

function notifyTaskEvent(params: {
  organizationId: number;
  recipientUserId: number | null | undefined;
  category: 'task_assigned' | 'task_blocked' | 'task_completed' | 'task_update' | 'collaboration';
  severity?: 'info' | 'warning' | 'critical';
  title: string;
  body?: string | null;
  taskId?: string;
}): void {
  const recipient = Number(params.recipientUserId);
  if (!Number.isFinite(recipient) || recipient <= 0) return;
  void createNotification({
    organizationId: params.organizationId,
    recipientUserId: recipient,
    category: params.category,
    severity: params.severity ?? 'info',
    title: params.title,
    body: params.body ?? null,
    resourceType: params.taskId ? 'unified_task' : null,
    resourceId: params.taskId ?? null,
    actionUrl: null,
    metadata: {},
  }).catch(err => {
    console.warn('[tasking] notification failed (non-fatal):', err?.message ?? err);
  });
}

// ── Completion cascade ──────────────────────────────────────────────────────
//
// Completing a task now unblocks its dependents on THIS write path too — the
// cascade previously lived only behind /api/regulatory/tasks/:id/status, so
// board moves left dependents blocked forever (assessment D12). Org-scoped on
// every read and write; covers both linkage systems (the blockedBy[] arrays
// and the task_dependencies DAG).

async function cascadeUnblockOnCompletion(
  organizationId: number,
  completedTaskId: string
): Promise<void> {
  // 1. blockedBy[] arrays — remove the completed task; wake fully-unblocked rows.
  const blockedRows = await storage.db
    .select()
    .from(unifiedTasks)
    .where(
      and(
        eq(unifiedTasks.organizationId, organizationId),
        sql`${completedTaskId} = ANY(${unifiedTasks.blockedBy})`
      )
    );
  for (const row of blockedRows) {
    const remaining = (row.blockedBy ?? []).filter(id => id !== completedTaskId);
    await storage.db
      .update(unifiedTasks)
      .set({
        blockedBy: remaining,
        ...(remaining.length === 0 && row.status === 'blocked'
          ? { status: 'in-progress' as string }
          : {}),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(unifiedTasks.taskId, row.taskId),
          eq(unifiedTasks.organizationId, organizationId)
        )
      );
    if (remaining.length === 0 && row.status === 'blocked') {
      notifyTaskEvent({
        organizationId,
        recipientUserId: row.assigneeId,
        category: 'task_update',
        title: `Unblocked: ${row.title}`,
        body: 'Every task blocking this one is complete — it is ready to work.',
        taskId: row.taskId,
      });
    }
  }

  // 2. task_dependencies DAG — wake blocked successors whose predecessors are
  //    now all complete. Successor rows are re-checked org-scoped before write.
  const successorEdges = await storage.db
    .select({ successorTaskId: taskDependencies.successorTaskId })
    .from(taskDependencies)
    .where(eq(taskDependencies.predecessorTaskId, completedTaskId));
  for (const edge of successorEdges) {
    const [successor] = await storage.db
      .select()
      .from(unifiedTasks)
      .where(
        and(
          eq(unifiedTasks.taskId, edge.successorTaskId),
          eq(unifiedTasks.organizationId, organizationId)
        )
      )
      .limit(1);
    if (!successor || successor.status !== 'blocked') continue;

    const predecessorEdges = await storage.db
      .select({ predecessorTaskId: taskDependencies.predecessorTaskId })
      .from(taskDependencies)
      .where(eq(taskDependencies.successorTaskId, successor.taskId));
    const predecessorIds = predecessorEdges
      .map(e => e.predecessorTaskId)
      .filter(id => id !== completedTaskId);
    let allDone = true;
    if (predecessorIds.length) {
      const open = await storage.db
        .select({ taskId: unifiedTasks.taskId })
        .from(unifiedTasks)
        .where(
          and(
            eq(unifiedTasks.organizationId, organizationId),
            inArray(unifiedTasks.taskId, predecessorIds),
            ne(unifiedTasks.status, 'completed')
          )
        );
      allDone = open.length === 0;
    }
    if (allDone) {
      await storage.db
        .update(unifiedTasks)
        .set({ status: 'pending', updatedAt: new Date() })
        .where(
          and(
            eq(unifiedTasks.taskId, successor.taskId),
            eq(unifiedTasks.organizationId, organizationId)
          )
        );
      notifyTaskEvent({
        organizationId,
        recipientUserId: successor.assigneeId,
        category: 'task_update',
        title: `Unblocked: ${successor.title}`,
        body: 'All of its predecessor tasks are complete.',
        taskId: successor.taskId,
      });
    }
  }
}

// ── Dependency cycle guard ──────────────────────────────────────────────────
//
// The DAG had no acyclicity check (assessment D19): linking A→B and B→A was
// accepted, after which the critical-path walk relied on its visited-set to
// avoid spinning. Walk successors from the proposed edge's successor; if the
// predecessor is reachable, the edge closes a cycle. Bounded for safety.

async function wouldCreateDependencyCycle(
  predecessorTaskId: string,
  successorTaskId: string
): Promise<boolean> {
  if (predecessorTaskId === successorTaskId) return true;
  const seen = new Set<string>([successorTaskId]);
  let frontier = [successorTaskId];
  let hops = 0;
  while (frontier.length && hops < 2000) {
    const edges = await storage.db
      .select({ successorTaskId: taskDependencies.successorTaskId })
      .from(taskDependencies)
      .where(inArray(taskDependencies.predecessorTaskId, frontier));
    const next: string[] = [];
    for (const e of edges) {
      hops++;
      if (e.successorTaskId === predecessorTaskId) return true;
      if (!seen.has(e.successorTaskId)) {
        seen.add(e.successorTaskId);
        next.push(e.successorTaskId);
      }
    }
    frontier = next;
  }
  return false;
}

const jsonPrimitiveSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);
type JsonValue = z.infer<typeof jsonPrimitiveSchema> | { [key: string]: JsonValue } | JsonValue[];
const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([jsonPrimitiveSchema, z.array(jsonValueSchema), z.record(z.string(), jsonValueSchema)])
);
const stringArraySchema = z.array(z.string());
const taskDefinitionSchema = z.object({
  id: z.string().optional(),
  title: z.string().min(1),
  description: z.string().optional(),
  moduleType: z.string().optional(),
  category: z.string().optional(),
  taskType: z.string().optional(),
  priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  dayOffset: z.number().int().optional(),
  duration: z.number().int().positive().optional(),
  estimatedHours: z.number().positive().optional(),
});
const templateDependencySchema = z.object({
  predecessor: z.string().min(1),
  successor: z.string().min(1),
  type: z.enum(['finish-to-start', 'start-to-start', 'finish-to-finish', 'start-to-finish']).optional(),
  lag: z.number().int().optional(),
});

// Task creation schema
const createTaskSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  moduleType: z.string(),
  moduleSource: z.string().optional(),
  moduleData: jsonValueSchema.optional(),
  projectId: z.number().optional(),
  category: z.string().optional(),
  taskType: z.string().optional(),
  priority: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  // Initial board column chosen in the create form (real column). Defaults to
  // 'pending' when omitted; constrained to the status domain (free text let a
  // create mint a status no view could render — assessment D23).
  status: taskStatusSchema.optional(),
  assigneeId: z.number().optional(),
  startDate: z.string().optional(),
  dueDate: z.string().optional(),
  estimatedHours: z.number().optional(),
  // Polymorphic origin — the entity this task was raised from (a section, a
  // safety case, a filing). Real unified_tasks columns; the launcher captures
  // them and they now persist instead of being dropped.
  sourceEntityType: z.string().max(80).optional(),
  sourceEntityId: z.string().max(200).optional(),
  // Governance flags collected by the ui-v2 create form — real unified_tasks
  // columns, so the form's inputs persist instead of being silently dropped.
  impactScore: z.number().min(0).max(10).optional(),
  criticalPath: z.boolean().optional(),
  regulatoryImpact: z.boolean().optional(),
  approvalRequired: z.boolean().optional(),
  dependencies: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  automationRules: jsonValueSchema.optional(),
  escalationPath: jsonValueSchema.optional(),
});

// Bulk task creation schema
const bulkCreateTasksSchema = z.object({
  tasks: z.array(createTaskSchema),
  linkDependencies: z.boolean().default(true),
});

// Task dependency schema
const createDependencySchema = z.object({
  predecessorTaskId: z.string(),
  successorTaskId: z.string(),
  dependencyType: z.enum([
    'finish-to-start',
    'start-to-start',
    'finish-to-finish',
    'start-to-finish',
  ]),
  lagTime: z.number().default(0),
  isBlocking: z.boolean().default(true),
});

// Task template creation schema
const createTemplateSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  category: z.string(),
  submissionType: z.string().optional(),
  milestone: z.string().optional(),
  tasks: z.array(taskDefinitionSchema),
  dependencies: z.array(templateDependencySchema).optional(),
  milestones: z.array(z.string()).optional(),
  defaultDuration: z.number().optional(),
  bestPractices: z.string().optional(),
  regulatoryRequirements: stringArraySchema.optional(),
  riskFactors: stringArraySchema.optional(),
});

// Automation rule schema
const createAutomationSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  ruleType: z.enum(['event-based', 'schedule-based', 'condition-based']),
  triggerModule: z.string().optional(),
  triggerEvent: z.string(),
  triggerConditions: jsonValueSchema.optional(),
  actionType: z.string(),
  taskTemplate: taskDefinitionSchema.optional(),
  taskDefaults: jsonValueSchema.optional(),
  delayMinutes: z.number().optional(),
  recurringSchedule: jsonValueSchema.optional(),
  workloadBalancing: z.boolean().default(true),
  smartAssignment: jsonValueSchema.optional(),
});

// Helper function to calculate critical path
async function calculateCriticalPath(projectId: number, organizationId: number) {
  try {
    // Get all tasks and dependencies for the project
    const tasks = await storage.db
      .select()
      .from(unifiedTasks)
      .where(
        and(
          eq(unifiedTasks.organizationId, organizationId),
          eq(unifiedTasks.projectId, projectId)
        )
      );

    const taskIds = tasks.map((t) => t.taskId);
    const dependencies = taskIds.length
      ? await storage.db
          .select()
          .from(taskDependencies)
          .where(
            or(
              inArray(taskDependencies.predecessorTaskId, taskIds),
              inArray(taskDependencies.successorTaskId, taskIds)
            )
          )
      : [];

    // Build adjacency list
    const graph: Record<string, { task: any; successors: string[]; duration: number }> = {};
    tasks.forEach((task: any) => {
      const duration = task.estimatedHours || 8; // Default 8 hours
      graph[task.taskId] = {
        task,
        successors: [],
        duration,
      };
    });

    dependencies.forEach((dep: any) => {
      if (graph[dep.predecessorTaskId]) {
        graph[dep.predecessorTaskId].successors.push(dep.successorTaskId);
      }
    });

    // Topological sort with longest path calculation
    const visited = new Set<string>();
    const criticalPath: string[] = [];
    let maxDuration = 0;

    function dfs(nodeId: string, path: string[], totalDuration: number) {
      if (!graph[nodeId]) return;

      visited.add(nodeId);
      const node = graph[nodeId];
      const currentDuration = totalDuration + node.duration;

      if (node.successors.length === 0) {
        if (currentDuration > maxDuration) {
          maxDuration = currentDuration;
          criticalPath.length = 0;
          criticalPath.push(...path, nodeId);
        }
        return;
      }

      node.successors.forEach(successor => {
        if (!visited.has(successor)) {
          dfs(successor, [...path, nodeId], currentDuration);
        }
      });
    }

    // Find all root nodes (no predecessors)
    const rootNodes = tasks.filter(
      (task: any) => !dependencies.some((dep: any) => dep.successorTaskId === task.taskId)
    );

    rootNodes.forEach((root: any) => {
      visited.clear();
      dfs(root.taskId, [], 0);
    });

    return {
      criticalPath,
      totalDuration: maxDuration,
      tasks: criticalPath.map(taskId => graph[taskId]?.task),
    };
  } catch (error) {
    console.error('Error calculating critical path:', error);
    throw error;
  }
}

// Helper function for workload balancing
async function getOptimalAssignee(organizationId: number, _taskData: any) {
  try {
    // Get all users in the organization and their current active workload.
    // Users belong to an org via organizationUsers; the left join to
    // unifiedTasks only counts active (pending/in-progress) assignments.
    const workloadQuery = await storage.db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        activeTaskCount: count(unifiedTasks.id),
        totalHours: sql<number>`coalesce(sum(coalesce(${unifiedTasks.estimatedHours}, 8)), 0)`,
      })
      .from(users)
      .innerJoin(organizationUsers, eq(organizationUsers.userId, users.id))
      .leftJoin(
        unifiedTasks,
        and(
          eq(unifiedTasks.assigneeId, users.id),
          inArray(unifiedTasks.status, ['pending', 'in-progress'])
        )
      )
      .where(eq(organizationUsers.organizationId, organizationId))
      .groupBy(users.id, users.name, users.email);

    // Sort by workload (ascending)
    const sortedByWorkload = workloadQuery.sort((a, b) => {
      const aHours = Number(a.totalHours || 0);
      const bHours = Number(b.totalHours || 0);
      return aHours - bHours;
    });

    // Return user with lowest workload
    return sortedByWorkload[0];
  } catch (error) {
    console.error('Error finding optimal assignee:', error);
    return null;
  }
}

// Create single task
router.post('/tasks', async (req: Request, res: Response) => {
  try {
    const validatedData = createTaskSchema.parse(req.body);
    const actorUserId = getActorUserId(req);
    const organizationIdRaw = getSecureOrgId(req);
    const organizationId = organizationIdRaw ? Number(organizationIdRaw) : NaN;
    if (!Number.isFinite(organizationId) || organizationId <= 0) {
      return res.status(401).json({ success: false, error: 'Organization context required' });
    }
    const taskId = `TASK-${Date.now()}-${uuidv4().substr(0, 8)}`;

    // Auto-assign if not specified
    let assigneeId = validatedData.assigneeId;
    let assigneeName = null;

    if (!assigneeId) {
      const optimalAssignee = await getOptimalAssignee(organizationId, validatedData);
      if (optimalAssignee) {
        assigneeId = optimalAssignee.id;
        assigneeName = optimalAssignee.name;
      }
    }

    const { startDate, dueDate, ...taskFields } = validatedData;
    const [newTask] = await storage.db
      .insert(unifiedTasks)
      .values({
        taskId,
        organizationId,
        ...taskFields,
        startDate: startDate ? new Date(startDate) : undefined,
        dueDate: dueDate ? new Date(dueDate) : undefined,
        assigneeId,
        assigneeName,
        status: validatedData.status ?? 'pending',
        progress: 0,
        completionPercentage: 0,
        createdById: actorUserId ?? undefined,
      })
      .returning();

    // Part 11 lineage — the create is written to the governed ledger on THIS
    // path too, not only on /api/regulatory/tasks (assessment D11).
    await auditTaskAction({
      orgId: organizationId,
      userId: actorUserId,
      command: 'task.create',
      taskId,
      payload: {
        moduleType: validatedData.moduleType,
        title: validatedData.title,
        priority: validatedData.priority,
        status: validatedData.status ?? 'pending',
        assigneeId: assigneeId ?? null,
        sourceEntityType: validatedData.sourceEntityType ?? null,
        sourceEntityId: validatedData.sourceEntityId ?? null,
      },
      reason: typeof req.body?.reason === 'string' ? req.body.reason : undefined,
    });

    // Tell the assignee (unless they created it themselves).
    if (assigneeId && assigneeId !== actorUserId) {
      notifyTaskEvent({
        organizationId,
        recipientUserId: assigneeId,
        category: 'task_assigned',
        title: `Task assigned: ${validatedData.title}`,
        body: validatedData.description ?? null,
        taskId,
      });
    }

    res.json({
      success: true,
      data: newTask,
    });
  } catch (error) {
    console.error('Error creating task:', error);
    res.status(400).json({
      success: false,
      error: error instanceof z.ZodError ? error.errors : 'Failed to create task',
    });
  }
});

// Update a task's board column / progress — backs the ui-v2 board's move
// between columns. Org-scoped (taskId + organizationId), so no cross-org task
// can be moved. Transitions run the state machine, write the Part 11 ledger,
// cascade the unblock on completion, and notify the people affected.
const updateTaskStatusSchema = z.object({
  status: taskStatusSchema,
  progress: z.number().min(0).max(100).optional(),
  reason: z.string().max(1000).optional(),
});
router.patch('/tasks/:taskId', async (req: Request, res: Response) => {
  try {
    const taskId = String(req.params.taskId);
    const parsed = updateTaskStatusSchema.parse(req.body);
    const actorUserId = getActorUserId(req);
    const organizationIdRaw = getSecureOrgId(req);
    const organizationId = organizationIdRaw ? Number(organizationIdRaw) : NaN;
    if (!Number.isFinite(organizationId) || organizationId <= 0) {
      return res.status(401).json({ success: false, error: 'Organization context required' });
    }

    // Fetch-first: the transition is validated against the task's REAL current
    // status, and a cross-org id 404s before anything is written.
    const [existing] = await storage.db
      .select()
      .from(unifiedTasks)
      .where(and(eq(unifiedTasks.taskId, taskId), eq(unifiedTasks.organizationId, organizationId)))
      .limit(1);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Task not found' });
    }

    if (!isLegalTransition(existing.status, parsed.status)) {
      return res.status(409).json({
        success: false,
        error: `A task in "${existing.status}" cannot move to "${parsed.status}".`,
        from: existing.status,
        allowed: TASK_TRANSITIONS[existing.status as TaskStatus] ?? [],
      });
    }

    const isDone = parsed.status === 'completed';
    const progress = parsed.progress ?? (isDone ? 100 : undefined);
    const [updated] = await storage.db
      .update(unifiedTasks)
      .set({
        status: parsed.status,
        progress,
        completionPercentage: progress,
        completedAt: isDone ? new Date() : existing.status === 'completed' ? null : undefined,
        lastModifiedBy: actorUserId ?? undefined,
        updatedAt: new Date(),
      })
      .where(and(eq(unifiedTasks.taskId, taskId), eq(unifiedTasks.organizationId, organizationId)))
      .returning();

    if (!updated) {
      return res.status(404).json({ success: false, error: 'Task not found' });
    }

    if (existing.status !== parsed.status) {
      await auditTaskAction({
        orgId: organizationId,
        userId: actorUserId,
        command: 'task.transition',
        taskId,
        payload: { from: existing.status, to: parsed.status, progress: progress ?? null },
        reason: parsed.reason,
      });

      if (isDone) {
        await cascadeUnblockOnCompletion(organizationId, taskId);
        if (existing.createdById && existing.createdById !== actorUserId) {
          notifyTaskEvent({
            organizationId,
            recipientUserId: existing.createdById,
            category: 'task_completed',
            title: `Completed: ${existing.title}`,
            taskId,
          });
        }
      } else if (parsed.status === 'blocked') {
        notifyTaskEvent({
          organizationId,
          recipientUserId: existing.assigneeId,
          category: 'task_blocked',
          severity: 'warning',
          title: `Blocked: ${existing.title}`,
          body: parsed.reason ?? null,
          taskId,
        });
      }
    }

    return res.json({ success: true, data: updated });
  } catch (error) {
    return res.status(400).json({
      success: false,
      error: error instanceof z.ZodError ? error.errors : 'Failed to update task',
    });
  }
});

// Bulk create tasks
router.post('/tasks/bulk-create', async (req: Request, res: Response) => {
  try {
    const validatedData = bulkCreateTasksSchema.parse(req.body);
    const actorUserId = getActorUserId(req);
    const organizationIdRaw = getSecureOrgId(req);
    const organizationId = organizationIdRaw ? Number(organizationIdRaw) : NaN;
    if (!Number.isFinite(organizationId) || organizationId <= 0) {
      return res.status(401).json({ success: false, error: 'Organization context required' });
    }
    const createdTasks = [];
    const taskIdMapping: Record<string, string> = {};

    // Create all tasks
    for (const taskData of validatedData.tasks) {
      const taskId = `TASK-${Date.now()}-${uuidv4().substr(0, 8)}`;

      // Store temporary ID mapping for dependencies
      if (taskData.title) {
        taskIdMapping[taskData.title] = taskId;
      }

      // Auto-assign if needed
      let assigneeId = taskData.assigneeId;
      let assigneeName = null;

      if (!assigneeId) {
        const optimalAssignee = await getOptimalAssignee(organizationId, taskData);
        if (optimalAssignee) {
          assigneeId = optimalAssignee.id;
          assigneeName = optimalAssignee.name;
        }
      }

      const { startDate, dueDate, ...taskFields } = taskData;
      const [newTask] = await storage.db
        .insert(unifiedTasks)
        .values({
          taskId,
          organizationId,
          ...taskFields,
          startDate: startDate ? new Date(startDate) : undefined,
          dueDate: dueDate ? new Date(dueDate) : undefined,
          assigneeId,
          assigneeName,
          status: 'pending',
          progress: 0,
          completionPercentage: 0,
          createdById: actorUserId ?? undefined,
        })
        .returning();

      if (newTask) {
        createdTasks.push(newTask);
        await auditTaskAction({
          orgId: organizationId,
          userId: actorUserId,
          command: 'task.create',
          taskId,
          payload: {
            moduleType: taskData.moduleType,
            title: taskData.title,
            priority: taskData.priority,
            status: 'pending',
            bulk: true,
          },
        });
        if (assigneeId && assigneeId !== actorUserId) {
          notifyTaskEvent({
            organizationId,
            recipientUserId: assigneeId,
            category: 'task_assigned',
            title: `Task assigned: ${taskData.title}`,
            body: taskData.description ?? null,
            taskId,
          });
        }
      }
    }

    // Create dependencies if requested
    if (validatedData.linkDependencies) {
      for (let i = 0; i < validatedData.tasks.length; i++) {
        const task = validatedData.tasks[i];
        if (task.dependencies && task.dependencies.length > 0) {
          for (const depTitle of task.dependencies) {
            if (taskIdMapping[depTitle] && taskIdMapping[task.title]) {
              await storage.db.insert(taskDependencies).values({
                dependencyId: `DEP-${Date.now()}-${uuidv4().substr(0, 8)}`,
                predecessorTaskId: taskIdMapping[depTitle],
                successorTaskId: taskIdMapping[task.title],
                dependencyType: 'finish-to-start',
                status: 'active',
              });
            }
          }
        }
      }
    }

    res.json({
      success: true,
      data: createdTasks,
      count: createdTasks.length,
    });
  } catch (error) {
    console.error('Error bulk creating tasks:', error);
    res.status(400).json({
      success: false,
      error: error instanceof z.ZodError ? error.errors : 'Failed to bulk create tasks',
    });
  }
});

// Create tasks from template
router.post('/tasks/from-template/:templateId', async (req: Request, res: Response) => {
  try {
    const templateId = String(req.params.templateId);
    const { projectId, startDate, adjustDates } = req.body;
    const actorUserId = getActorUserId(req);
    const organizationIdRaw = getSecureOrgId(req);
    const organizationId = organizationIdRaw ? Number(organizationIdRaw) : NaN;
    if (!Number.isFinite(organizationId) || organizationId <= 0) {
      return res.status(401).json({ success: false, error: 'Organization context required' });
    }

    // Get template — the org's own row wins; a built-in catalog entry serves
    // when the org has none, so "Start workflow" works with zero seeding
    // (assessment D9/D10). Built-ins carry no DB row, so usage stats are only
    // bumped for stored templates below.
    const [storedTemplate] = await storage.db
      .select()
      .from(taskTemplates)
      .where(
        and(
          eq(taskTemplates.templateId, templateId),
          eq(taskTemplates.organizationId, organizationId)
        )
      )
      .limit(1);

    const builtin = storedTemplate ? null : getBuiltinWorkflowTemplate(templateId);
    const template = storedTemplate ?? builtin;
    if (!template) {
      return res.status(404).json({
        success: false,
        error: 'Template not found',
      });
    }

    const taskDefinitions = template.tasks as any[];
    const createdTasks = [];
    const taskIdMapping: Record<string, string> = {};

    // Create tasks from template
    for (let i = 0; i < taskDefinitions.length; i++) {
      const taskDef = taskDefinitions[i];
      const taskId = `TASK-${Date.now()}-${uuidv4().substr(0, 8)}`;

      taskIdMapping[taskDef.id || i.toString()] = taskId;

      // Calculate dates if needed
      let taskStartDate = startDate;
      let taskDueDate = null;

      // `taskDef.dayOffset` was truthiness-tested, so the workflow's day-0
      // tasks never got dates even when adjustDates was requested.
      if (adjustDates && startDate && taskDef.dayOffset != null) {
        const start = new Date(startDate);
        start.setDate(start.getDate() + taskDef.dayOffset);
        taskStartDate = start.toISOString();

        if (taskDef.duration) {
          const due = new Date(start);
          due.setDate(due.getDate() + taskDef.duration);
          taskDueDate = due.toISOString();
        }
      }

      const [newTask] = await storage.db
        .insert(unifiedTasks)
        .values({
          taskId,
          organizationId,
          projectId: projectId != null ? Number(projectId) : undefined,
          title: taskDef.title,
          description: taskDef.description,
          moduleType: taskDef.moduleType || 'general',
          category: taskDef.category,
          taskType: taskDef.taskType,
          priority: taskDef.priority || 'medium',
          startDate: taskStartDate ? new Date(taskStartDate) : undefined,
          dueDate: taskDueDate ? new Date(taskDueDate) : undefined,
          estimatedHours: taskDef.estimatedHours,
          status: 'pending',
          progress: 0,
          completionPercentage: 0,
          // unifiedTasks has no template foreign key; record the originating
          // template via the generic source-entity fields instead.
          sourceEntityType: 'taskTemplate',
          sourceEntityId: template.templateId,
          createdById: actorUserId ?? undefined,
        })
        .returning();

      if (newTask) {
        createdTasks.push(newTask);
        await auditTaskAction({
          orgId: organizationId,
          userId: actorUserId,
          command: 'task.create',
          taskId,
          payload: {
            moduleType: taskDef.moduleType || 'general',
            title: taskDef.title,
            priority: taskDef.priority || 'medium',
            status: 'pending',
            templateId: template.templateId,
          },
          reason: `Created from workflow template "${template.name}"`,
        });
      }
    }

    // Create dependencies from template
    if (template.dependencies) {
      const dependencies = template.dependencies as any[];
      for (const dep of dependencies) {
        if (taskIdMapping[dep.predecessor] && taskIdMapping[dep.successor]) {
          await storage.db.insert(taskDependencies).values({
            dependencyId: `DEP-${Date.now()}-${uuidv4().substr(0, 8)}`,
            predecessorTaskId: taskIdMapping[dep.predecessor],
            successorTaskId: taskIdMapping[dep.successor],
            dependencyType: dep.type || 'finish-to-start',
            lagTime: dep.lag || 0,
            status: 'active',
          });
        }
      }
    }

    // Update template usage statistics (stored templates only — built-ins have
    // no row to bump).
    if (storedTemplate) {
      await storage.db
        .update(taskTemplates)
        .set({
          usageCount: sql`${taskTemplates.usageCount} + 1`,
          lastUsedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(taskTemplates.templateId, templateId),
            eq(taskTemplates.organizationId, organizationId)
          )
        );
    }

    res.json({
      success: true,
      data: createdTasks,
      count: createdTasks.length,
      template: template.name,
    });
  } catch (error) {
    console.error('Error creating tasks from template:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create tasks from template',
    });
  }
});

// Get tasks by module
router.get('/tasks/by-module/:moduleId', async (req: Request, res: Response) => {
  try {
    const moduleId = String(req.params.moduleId);
    const organizationIdRaw = getSecureOrgId(req);
    const organizationId = organizationIdRaw ? Number(organizationIdRaw) : NaN;
    if (!Number.isFinite(organizationId) || organizationId <= 0) {
      return res.status(401).json({ success: false, error: 'Organization context required' });
    }
    const status = req.query.status as string;
    const priority = req.query.priority as string;

    const conditions = [
      eq(unifiedTasks.organizationId, organizationId),
      eq(unifiedTasks.moduleType, moduleId),
    ];
    if (status) {
      conditions.push(eq(unifiedTasks.status, status));
    }
    if (priority) {
      conditions.push(eq(unifiedTasks.priority, priority));
    }

    const tasks = await storage.db
      .select()
      .from(unifiedTasks)
      .where(and(...conditions))
      .orderBy(asc(unifiedTasks.dueDate), desc(unifiedTasks.priority));

    res.json({
      success: true,
      data: tasks,
      count: tasks.length,
    });
  } catch (error) {
    console.error('Error fetching tasks by module:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch tasks by module',
    });
  }
});

// List workflow templates — the org's stored templates plus the built-in
// catalog (org rows win on id collision). This endpoint is what makes the
// from-template flow reachable end-to-end: without it no client could know
// what to instantiate (assessment D10).
router.get('/templates', async (req: Request, res: Response) => {
  try {
    const organizationIdRaw = getSecureOrgId(req);
    const organizationId = organizationIdRaw ? Number(organizationIdRaw) : NaN;
    if (!Number.isFinite(organizationId) || organizationId <= 0) {
      return res.status(401).json({ success: false, error: 'Organization context required' });
    }

    let stored: Array<Record<string, unknown>> = [];
    try {
      stored = await storage.db
        .select()
        .from(taskTemplates)
        .where(
          and(
            eq(taskTemplates.organizationId, organizationId),
            eq(taskTemplates.isActive, true)
          )
        )
        .orderBy(desc(taskTemplates.usageCount));
    } catch (err: any) {
      // Unprovisioned table degrades to the built-ins, never to a 500.
      if (err?.code !== '42P01') throw err;
    }

    const storedIds = new Set(stored.map(t => String((t as any).templateId)));
    const builtins = BUILTIN_WORKFLOW_TEMPLATES.filter(t => !storedIds.has(t.templateId));
    const data = [
      ...stored.map(t => ({ ...t, builtin: false })),
      ...builtins,
    ];
    return res.json({ success: true, data, total: data.length });
  } catch (error) {
    console.error('Error listing templates:', error);
    return res.status(500).json({ success: false, error: 'Failed to list templates' });
  }
});

// Set task dependencies
router.post('/tasks/dependencies', async (req: Request, res: Response) => {
  try {
    const validatedData = createDependencySchema.parse(req.body);
    const organizationIdRaw = getSecureOrgId(req);
    const organizationId = organizationIdRaw ? Number(organizationIdRaw) : NaN;
    if (!Number.isFinite(organizationId) || organizationId <= 0) {
      return res.status(401).json({ success: false, error: 'Organization context required' });
    }

    const [predecessorRows, successorRows] = await Promise.all([
      storage.db
        .select({ taskId: unifiedTasks.taskId })
        .from(unifiedTasks)
        .where(
          and(
            eq(unifiedTasks.taskId, validatedData.predecessorTaskId),
            eq(unifiedTasks.organizationId, organizationId)
          )
        )
        .limit(1),
      storage.db
        .select({ taskId: unifiedTasks.taskId })
        .from(unifiedTasks)
        .where(
          and(
            eq(unifiedTasks.taskId, validatedData.successorTaskId),
            eq(unifiedTasks.organizationId, organizationId)
          )
        )
        .limit(1),
    ]);
    const predecessorTask = predecessorRows[0];
    const successorTask = successorRows[0];
    if (!predecessorTask || !successorTask) {
      return res.status(404).json({
        success: false,
        error: 'One or both tasks not found for organization',
      });
    }

    // Reject an edge that would close a cycle — the DAG previously accepted
    // A→B, B→A, after which the critical-path walk relied on its visited-set
    // to avoid spinning (assessment D19).
    if (
      await wouldCreateDependencyCycle(
        validatedData.predecessorTaskId,
        validatedData.successorTaskId
      )
    ) {
      return res.status(409).json({
        success: false,
        error: 'This dependency would create a cycle in the task graph.',
      });
    }

    const dependencyId = `DEP-${Date.now()}-${uuidv4().substr(0, 8)}`;

    const [newDependency] = await storage.db
      .insert(taskDependencies)
      .values({
        dependencyId,
        ...validatedData,
        status: 'active',
      })
      .returning();

    await auditTaskAction({
      orgId: organizationId,
      userId: getActorUserId(req),
      command: 'task.link',
      taskId: validatedData.predecessorTaskId,
      payload: {
        successorTaskId: validatedData.successorTaskId,
        dependencyType: validatedData.dependencyType,
        isBlocking: validatedData.isBlocking,
      },
    });

    res.json({
      success: true,
      data: newDependency,
    });
  } catch (error) {
    console.error('Error creating dependency:', error);
    res.status(400).json({
      success: false,
      error: error instanceof z.ZodError ? error.errors : 'Failed to create dependency',
    });
  }
});

// Calculate critical path for project
router.get('/tasks/critical-path/:projectId', async (req: Request, res: Response) => {
  try {
    const projectId = parseInt(String(req.params.projectId));
    const organizationIdRaw = getSecureOrgId(req);
    const organizationId = organizationIdRaw ? Number(organizationIdRaw) : NaN;
    if (!Number.isFinite(organizationId) || organizationId <= 0) {
      return res.status(401).json({ success: false, error: 'Organization context required' });
    }

    const criticalPath = await calculateCriticalPath(projectId, organizationId);

    res.json({
      success: true,
      data: criticalPath,
    });
  } catch (error) {
    console.error('Error calculating critical path:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to calculate critical path',
    });
  }
});

// Auto-assign tasks based on workload
router.post('/tasks/auto-assign', async (req: Request, res: Response) => {
  try {
    const { taskIds } = req.body;
    const actorUserId = getActorUserId(req);
    const organizationIdRaw = getSecureOrgId(req);
    const organizationId = organizationIdRaw ? Number(organizationIdRaw) : NaN;
    if (!Number.isFinite(organizationId) || organizationId <= 0) {
      return res.status(401).json({ success: false, error: 'Organization context required' });
    }
    const assignmentResults = [];

    for (const taskId of taskIds) {
      // Get task details
      const [task] = await storage.db
        .select()
        .from(unifiedTasks)
        .where(
          and(
            eq(unifiedTasks.taskId, taskId),
            eq(unifiedTasks.organizationId, organizationId)
          )
        )
        .limit(1);

      if (!task) continue;

      // Find optimal assignee
      const optimalAssignee = await getOptimalAssignee(organizationId, task);

      if (optimalAssignee) {
        // Update task assignment
        await storage.db
          .update(unifiedTasks)
          .set({
            assigneeId: optimalAssignee.id,
            assigneeName: optimalAssignee.name,
            assignedBy: actorUserId ?? undefined,
            assignedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(unifiedTasks.taskId, taskId),
              eq(unifiedTasks.organizationId, organizationId)
            )
          );

        assignmentResults.push({
          taskId,
          assignedTo: optimalAssignee.name,
          assigneeId: optimalAssignee.id,
        });

        await auditTaskAction({
          orgId: organizationId,
          userId: actorUserId,
          command: 'task.assign',
          taskId,
          payload: { assigneeId: optimalAssignee.id, method: 'workload-balanced' },
          reason: 'Workload-balanced auto-assign',
        });
        if (optimalAssignee.id !== actorUserId) {
          notifyTaskEvent({
            organizationId,
            recipientUserId: optimalAssignee.id,
            category: 'task_assigned',
            title: `Task assigned: ${task.title}`,
            taskId,
          });
        }
      }
    }

    res.json({
      success: true,
      data: assignmentResults,
      count: assignmentResults.length,
    });
  } catch (error) {
    console.error('Error auto-assigning tasks:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to auto-assign tasks',
    });
  }
});

// Get task analytics
router.get('/tasks/analytics', async (req: Request, res: Response) => {
  try {
    const organizationIdRaw = getSecureOrgId(req);
    const organizationId = organizationIdRaw ? Number(organizationIdRaw) : NaN;
    if (!Number.isFinite(organizationId) || organizationId <= 0) {
      return res.status(401).json({ success: false, error: 'Organization context required' });
    }
    const projectId = req.query.projectId ? parseInt(req.query.projectId as string) : null;

    // Base condition: scope to org, and optionally to a project.
    const baseCondition = projectId
      ? and(
          eq(unifiedTasks.organizationId, organizationId),
          eq(unifiedTasks.projectId, projectId)
        )
      : eq(unifiedTasks.organizationId, organizationId);

    // Task statistics
    const [taskStats] = await storage.db
      .select({
        totalTasks: count(unifiedTasks.id),
        completedTasks: sql<number>`count(*) filter (where ${unifiedTasks.status} = 'completed')`,
        inProgressTasks: sql<number>`count(*) filter (where ${unifiedTasks.status} = 'in-progress')`,
        blockedTasks: sql<number>`count(*) filter (where ${unifiedTasks.status} = 'blocked')`,
        pendingTasks: sql<number>`count(*) filter (where ${unifiedTasks.status} = 'pending')`,
        avgCompletion: avg(unifiedTasks.completionPercentage),
      })
      .from(unifiedTasks)
      .where(baseCondition);

    // Tasks by module
    const tasksByModule = await storage.db
      .select({ moduleType: unifiedTasks.moduleType, count: count(unifiedTasks.id) })
      .from(unifiedTasks)
      .where(baseCondition)
      .groupBy(unifiedTasks.moduleType);

    // Tasks by priority
    const tasksByPriority = await storage.db
      .select({ priority: unifiedTasks.priority, count: count(unifiedTasks.id) })
      .from(unifiedTasks)
      .where(baseCondition)
      .groupBy(unifiedTasks.priority);

    // Overdue tasks
    const [overdueTasks] = await storage.db
      .select({ count: count(unifiedTasks.id) })
      .from(unifiedTasks)
      .where(
        and(
          baseCondition,
          lt(unifiedTasks.dueDate, new Date()),
          ne(unifiedTasks.status, 'completed')
        )
      );

    // Team productivity (top performers)
    const teamProductivity = await storage.db
      .select({
        name: users.name,
        totalTasks: count(unifiedTasks.id),
        completedTasks: sql<number>`count(*) filter (where ${unifiedTasks.status} = 'completed')`,
        avgCompletion: avg(unifiedTasks.completionPercentage),
      })
      .from(unifiedTasks)
      .innerJoin(users, eq(unifiedTasks.assigneeId, users.id))
      .where(baseCondition)
      .groupBy(users.id, users.name)
      .orderBy(sql`count(*) filter (where ${unifiedTasks.status} = 'completed') desc`)
      .limit(10);

    res.json({
      success: true,
      data: {
        taskStats,
        tasksByModule,
        tasksByPriority,
        overdueTasks: overdueTasks?.count || 0,
        teamProductivity,
      },
    });
  } catch (error) {
    console.error('Error fetching task analytics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch task analytics',
    });
  }
});

// Create task template
router.post('/templates', async (req: Request, res: Response) => {
  try {
    const validatedData = createTemplateSchema.parse(req.body);
    const actorUserId = getActorUserId(req);
    const organizationIdRaw = getSecureOrgId(req);
    const organizationId = organizationIdRaw ? Number(organizationIdRaw) : NaN;
    if (!Number.isFinite(organizationId) || organizationId <= 0) {
      return res.status(401).json({ success: false, error: 'Organization context required' });
    }
    const templateId = `TMPL-${Date.now()}-${uuidv4().substr(0, 8)}`;

    const [newTemplate] = await storage.db
      .insert(taskTemplates)
      .values({
        templateId,
        organizationId,
        ...validatedData,
        isActive: true,
        version: 1,
        usageCount: 0,
        createdById: actorUserId ?? undefined,
      })
      .returning();

    res.json({
      success: true,
      data: newTemplate,
    });
  } catch (error) {
    console.error('Error creating template:', error);
    res.status(400).json({
      success: false,
      error: error instanceof z.ZodError ? error.errors : 'Failed to create template',
    });
  }
});

// Create automation rule
router.post('/automation', async (req: Request, res: Response) => {
  try {
    const validatedData = createAutomationSchema.parse(req.body);
    const actorUserId = getActorUserId(req);
    const organizationIdRaw = getSecureOrgId(req);
    const organizationId = organizationIdRaw ? Number(organizationIdRaw) : NaN;
    if (!Number.isFinite(organizationId) || organizationId <= 0) {
      return res.status(401).json({ success: false, error: 'Organization context required' });
    }
    const automationId = `AUTO-${Date.now()}-${uuidv4().substr(0, 8)}`;

    const [newAutomation] = await storage.db
      .insert(taskAutomation)
      .values({
        automationId,
        organizationId,
        ...validatedData,
        isActive: true,
        priority: 50,
        executionCount: 0,
        successCount: 0,
        failureCount: 0,
        createdById: actorUserId ?? undefined,
      })
      .returning();

    res.json({
      success: true,
      data: newAutomation,
    });
  } catch (error) {
    console.error('Error creating automation:', error);
    res.status(400).json({
      success: false,
      error: error instanceof z.ZodError ? error.errors : 'Failed to create automation',
    });
  }
});

// Notify about a task — a REAL persisted notification to the task's assignee
// (or an explicit same-org recipient). This endpoint previously returned
// "Notification sent" over a commented-out emit (assessment D13); it now
// writes the shared notification inbox and the governed ledger, or says no.
const notifyTaskSchema = z.object({
  message: z.string().min(1).max(2000),
  recipientUserId: z.number().int().positive().optional(),
  severity: z.enum(['info', 'warning', 'critical']).optional(),
});
router.post('/tasks/:taskId/notify', async (req: Request, res: Response) => {
  try {
    const taskId = String(req.params.taskId);
    const parsed = notifyTaskSchema.parse(req.body ?? {});
    const actorUserId = getActorUserId(req);
    const organizationIdRaw = getSecureOrgId(req);
    const organizationId = organizationIdRaw ? Number(organizationIdRaw) : NaN;
    if (!Number.isFinite(organizationId) || organizationId <= 0) {
      return res.status(401).json({ success: false, error: 'Organization context required' });
    }

    const [task] = await storage.db
      .select()
      .from(unifiedTasks)
      .where(and(eq(unifiedTasks.taskId, taskId), eq(unifiedTasks.organizationId, organizationId)))
      .limit(1);
    if (!task) {
      return res.status(404).json({ success: false, error: 'Task not found' });
    }

    let recipientUserId = parsed.recipientUserId ?? task.assigneeId ?? null;
    if (parsed.recipientUserId) {
      // An explicit recipient must be a member of the caller's org.
      const [member] = await storage.db
        .select({ userId: organizationUsers.userId })
        .from(organizationUsers)
        .where(
          and(
            eq(organizationUsers.organizationId, organizationId),
            eq(organizationUsers.userId, parsed.recipientUserId)
          )
        )
        .limit(1);
      if (!member) {
        return res.status(404).json({ success: false, error: 'Recipient not found in organization' });
      }
      recipientUserId = parsed.recipientUserId;
    }
    if (!recipientUserId) {
      return res.status(422).json({
        success: false,
        error: 'The task has no assignee; pass recipientUserId to notify someone.',
      });
    }

    await createNotification({
      organizationId,
      recipientUserId,
      category: 'collaboration',
      severity: parsed.severity ?? 'info',
      title: `About "${task.title}"`,
      body: parsed.message,
      resourceType: 'unified_task',
      resourceId: taskId,
      metadata: { fromUserId: actorUserId },
    });

    await auditTaskAction({
      orgId: organizationId,
      userId: actorUserId,
      command: 'task.notify',
      taskId,
      payload: { recipientUserId },
    });

    res.json({ success: true, taskId, recipientUserId });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: error.errors });
    }
    console.error('Error sending notification:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to send notification',
    });
  }
});

// ── Direct collaboration message ────────────────────────────────────────────
//
// Backs the universal launcher's "Collaborate" tab, which previously composed
// a message and threw it away (assessment §2 P1). The message lands as a
// persisted notification in the recipient's inbox; recipient must be a member
// of the caller's organization.
const sendMessageSchema = z.object({
  recipientUserId: z.number().int().positive(),
  message: z.string().min(1).max(4000),
  about: z.string().max(300).optional(),
  sourceEntityType: z.string().max(80).optional(),
  sourceEntityId: z.string().max(200).optional(),
});
router.post('/messages', async (req: Request, res: Response) => {
  try {
    const parsed = sendMessageSchema.parse(req.body ?? {});
    const actorUserId = getActorUserId(req);
    const organizationIdRaw = getSecureOrgId(req);
    const organizationId = organizationIdRaw ? Number(organizationIdRaw) : NaN;
    if (!Number.isFinite(organizationId) || organizationId <= 0) {
      return res.status(401).json({ success: false, error: 'Organization context required' });
    }

    const [member] = await storage.db
      .select({ userId: organizationUsers.userId, name: users.name })
      .from(organizationUsers)
      .innerJoin(users, eq(users.id, organizationUsers.userId))
      .where(
        and(
          eq(organizationUsers.organizationId, organizationId),
          eq(organizationUsers.userId, parsed.recipientUserId)
        )
      )
      .limit(1);
    if (!member) {
      return res.status(404).json({ success: false, error: 'Recipient not found in organization' });
    }

    let senderName: string | null = null;
    if (actorUserId) {
      const [sender] = await storage.db
        .select({ name: users.name, email: users.email })
        .from(users)
        .where(eq(users.id, actorUserId))
        .limit(1);
      senderName = sender?.name || sender?.email || null;
    }

    const id = await createNotification({
      organizationId,
      recipientUserId: parsed.recipientUserId,
      category: 'collaboration',
      severity: 'info',
      title: senderName
        ? `Message from ${senderName}${parsed.about ? ` — ${parsed.about}` : ''}`
        : `New message${parsed.about ? ` — ${parsed.about}` : ''}`,
      body: parsed.message,
      resourceType: parsed.sourceEntityType ?? null,
      resourceId: parsed.sourceEntityId ?? null,
      metadata: { fromUserId: actorUserId },
    });

    res.status(201).json({ success: true, data: { id } });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: error.errors });
    }
    console.error('Error sending message:', error);
    res.status(500).json({ success: false, error: 'Failed to send message' });
  }
});

// ── My work — the Task Tray read-model ──────────────────────────────────────
//
// One org-scoped answer to "what is assigned to me right now" from the
// canonical store: open unified tasks for the caller, split into overdue /
// due-soon / open, plus the approvals awaiting them. The tray previously
// showed a hardcoded count (assessment D40).
router.get('/my-work', async (req: Request, res: Response) => {
  try {
    const actorUserId = getActorUserId(req);
    const organizationIdRaw = getSecureOrgId(req);
    const organizationId = organizationIdRaw ? Number(organizationIdRaw) : NaN;
    if (!Number.isFinite(organizationId) || organizationId <= 0) {
      return res.status(401).json({ success: false, error: 'Organization context required' });
    }
    if (!actorUserId) {
      return res.status(401).json({ success: false, error: 'User context required' });
    }

    const rows = await storage.db
      .select()
      .from(unifiedTasks)
      .where(
        and(
          eq(unifiedTasks.organizationId, organizationId),
          eq(unifiedTasks.assigneeId, actorUserId),
          inArray(unifiedTasks.status, ['pending', 'in-progress', 'review', 'blocked'])
        )
      )
      .orderBy(sql`${unifiedTasks.dueDate} asc nulls last`)
      .limit(200);

    const now = Date.now();
    const soonCutoff = now + 48 * 60 * 60 * 1000;
    const items = rows.map(row => {
      const dueMs = row.dueDate ? new Date(row.dueDate).getTime() : null;
      return {
        taskId: row.taskId,
        title: row.title,
        projectId: row.projectId ?? null,
        moduleType: row.moduleType,
        taskType: row.taskType ?? '',
        status: row.status,
        priority: row.priority,
        dueDate: row.dueDate ? new Date(row.dueDate).toISOString() : null,
        overdue: dueMs != null && dueMs < now,
        dueSoon: dueMs != null && dueMs >= now && dueMs <= soonCutoff,
        blocked: row.status === 'blocked' || (Array.isArray(row.blockedBy) && row.blockedBy.length > 0),
        approvalRequired: row.approvalRequired ?? false,
        approvalStatus: row.approvalStatus ?? 'not_started',
        criticalPath: row.criticalPath ?? false,
      };
    });

    return res.json({
      success: true,
      data: {
        items,
        total: items.length,
        overdue: items.filter(i => i.overdue).length,
        dueSoon: items.filter(i => i.dueSoon).length,
        blocked: items.filter(i => i.blocked).length,
        approvalsPending: items.filter(
          i => i.approvalRequired && i.approvalStatus === 'pending'
        ).length,
      },
    });
  } catch (error) {
    console.error('Error loading my work:', error);
    return res.status(500).json({ success: false, error: 'Failed to load my work' });
  }
});

export default router;
