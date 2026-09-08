import { Router, Request, Response } from 'express';
import { db } from '../db';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { and, eq, desc, asc, inArray, isNull, sql } from 'drizzle-orm';
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
import { loadTaskAnalytics } from '../services/tasking/task-analytics';
import { listTemplatesForOrg } from '../services/tasking/task-template-catalog';
import { createNotification } from '../services/notifications/notification-service';
import {
  getBuiltinWorkflowTemplate,
} from '../services/tasking/workflow-templates';
import {
  TASK_STATUSES,
  TASK_TRANSITIONS,
  CREATABLE_TASK_STATUSES,
  isLegalTransition,
  type TaskStatus,
} from '../services/tasking/task-state-machine';
import {
  notifyTaskEvent,
  cascadeUnblockOnCompletion,
  wouldCreateDependencyCycle,
} from '../services/tasking/task-side-effects';
import { requireTaskSignoff } from '../services/tasking/task-signoff';
import {
  calculateCriticalPath,
  getOptimalAssignee,
} from '../services/tasking/task-planning';

const router = Router();
const storage = { db };

function getActorUserId(req: Request): number | null {
  const raw = (req as any).userId ?? (req as any).user?.id;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

const taskStatusSchema = z.enum(TASK_STATUSES);
// Creation cannot mint a terminal status — see CREATABLE_TASK_STATUSES.
const creatableStatusSchema = z.enum(CREATABLE_TASK_STATUSES);

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
  // 'pending' when omitted; constrained to the CREATABLE domain — free text let
  // a create mint a status no view could render (assessment D23), and a
  // terminal status let it mint an already-completed approval-gated task
  // without the sign-off ceremony (the gate only runs on transitions).
  status: creatableStatusSchema.optional(),
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

// Critical-path + workload-balancing helpers live in
// services/tasking/task-planning (extracted for the repo-health line gate).
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
  // The e-signature ceremony for approval-gated completion. The PIN is used
  // for verification only — it is never logged, audited, or echoed back.
  signature: z
    .object({
      pin: z.string().min(4).max(64),
      meaning: z.string().max(40),
    })
    .optional(),
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
      .where(
        and(
          eq(unifiedTasks.taskId, taskId),
          eq(unifiedTasks.organizationId, organizationId),
          isNull(unifiedTasks.deletedAt)
        )
      )
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

    // Approval-gated completion demands the §11.50 signature ceremony —
    // PIN-verified identity, stated meaning, reason. 428 tells the client to
    // run the ceremony; nothing is written until it verifies.
    const signoff = await requireTaskSignoff({
      organizationId,
      task: existing,
      toStatus: parsed.status,
      actor: {
        userId: actorUserId,
        email: typeof (req as any).userEmail === 'string'
          ? (req as any).userEmail
          : ((req as any).user?.email ?? null),
        name: (req as any).userName ?? (req as any).user?.name ?? null,
      },
      signature: parsed.signature,
      reason: parsed.reason,
    });
    if (signoff.required && !signoff.ok) {
      return res.status(signoff.status).json({
        success: false,
        code: signoff.code,
        error: signoff.error,
      });
    }
    const manifestation = signoff.required && signoff.ok ? signoff.manifestation : null;

    const isDone = parsed.status === 'completed';
    const progress = parsed.progress ?? (isDone ? 100 : undefined);
    const isReopen = existing.status === 'completed' && parsed.status !== 'completed';
    const [updated] = await storage.db
      .update(unifiedTasks)
      .set({
        status: parsed.status,
        progress,
        completionPercentage: progress,
        completedAt: isDone ? new Date() : isReopen ? null : undefined,
        // Reopening retires the signature. The stored manifestation attests to
        // the record as it stood at first completion; once the task is reopened
        // and worked on, that attestation is stale, so the gate has to close
        // again. Without this, a task signed once could be reopened, changed
        // and re-completed indefinitely with no new PIN, meaning or reason —
        // and it rendered "approved" the whole time it sat back in progress.
        ...(isReopen ? { approvalStatus: 'pending' as string } : {}),
        // Placed after the reopen reset so a real signature always wins.
        // Appended in SQL rather than read-then-written: two concurrent
        // sign-offs each reading the same prior array would write
        // [...same, mine] and silently drop one verified §11.50 manifestation
        // while its ledger entry persisted. approval_history is `json`, so the
        // concat casts through jsonb and back.
        ...(manifestation
          ? {
              approvalStatus: 'approved',
              approvalHistory: sql`(COALESCE(${unifiedTasks.approvalHistory}, '[]'::json)::jsonb || ${JSON.stringify([manifestation])}::jsonb)::json`,
            }
          : {}),
        lastModifiedBy: actorUserId ?? undefined,
        updatedAt: new Date(),
      })
      // Compare-and-set on the status we read above. The state machine
      // constrains what each request BELIEVES the row holds, not what it
      // actually holds, and the PIN bcrypt comparison sits between the read and
      // this write — a window of order-100ms. Without this predicate two
      // concurrent transitions both pass isLegalTransition and both commit.
      .where(
        and(
          eq(unifiedTasks.taskId, taskId),
          eq(unifiedTasks.organizationId, organizationId),
          eq(unifiedTasks.status, existing.status)
        )
      )
      .returning();

    if (!updated) {
      // The row was there a moment ago (we read it), so an empty result means
      // the status moved under us. Reporting that as 404 would misread a lost
      // race as a missing task.
      return res.status(409).json({
        success: false,
        code: 'CONFLICT_STALE',
        error: 'This task changed while your request was in flight. Reload and try again.',
      });
    }

    if (existing.status !== parsed.status) {
      await auditTaskAction({
        orgId: organizationId,
        userId: actorUserId,
        command: 'task.transition',
        taskId,
        payload: {
          from: existing.status,
          to: parsed.status,
          progress: progress ?? null,
          // Signature manifestation (never the PIN) rides the governed record.
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
                organizationId,
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
    // The table read is guarded the same way GET /templates guards it: on an
    // install where task_templates was never provisioned, an advertised
    // built-in must still instantiate rather than falling into the catch-all
    // 500 (the list endpoint offers built-ins in exactly that situation).
    // Shape shared by a stored row and a built-in catalog entry — the fields
    // the instantiation below reads.
    let storedTemplate:
      | {
          templateId: string;
          name: string;
          tasks: unknown;
          dependencies?: unknown;
        }
      | undefined;
    try {
      [storedTemplate] = await storage.db
        .select()
        .from(taskTemplates)
        .where(
          and(
            eq(taskTemplates.templateId, templateId),
            eq(taskTemplates.organizationId, organizationId)
          )
        )
        .limit(1);
    } catch (err: any) {
      if (err?.code !== '42P01') throw err;
    }

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
            organizationId,
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
      isNull(unifiedTasks.deletedAt),
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
        .select({ taskId: unifiedTasks.taskId, status: unifiedTasks.status })
        .from(unifiedTasks)
        .where(
          and(
            eq(unifiedTasks.taskId, validatedData.predecessorTaskId),
            eq(unifiedTasks.organizationId, organizationId),
            isNull(unifiedTasks.deletedAt)
          )
        )
        .limit(1),
      storage.db
        .select({
          taskId: unifiedTasks.taskId,
          status: unifiedTasks.status,
          title: unifiedTasks.title,
          assigneeId: unifiedTasks.assigneeId,
        })
        .from(unifiedTasks)
        .where(
          and(
            eq(unifiedTasks.taskId, validatedData.successorTaskId),
            eq(unifiedTasks.organizationId, organizationId),
            isNull(unifiedTasks.deletedAt)
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
        organizationId,
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

    // A blocking edge onto an unfinished predecessor means the successor IS
    // blocked — so say so. Without this the edge was recorded but no task ever
    // entered 'blocked', which made cascadeUnblockOnCompletion dead code: it
    // only wakes successors whose status is literally 'blocked', so completing
    // a predecessor never unblocked anything and never notified the dependents'
    // assignees. Guarded by the same state machine the routes use, so an
    // already-completed or cancelled successor is left alone.
    const isBlockingEdge = validatedData.isBlocking !== false;
    let successorBlocked = false;
    if (
      isBlockingEdge &&
      predecessorTask.status !== 'completed' &&
      successorTask.status !== 'blocked' &&
      isLegalTransition(successorTask.status, 'blocked')
    ) {
      const [blocked] = await storage.db
        .update(unifiedTasks)
        .set({ status: 'blocked', updatedAt: new Date() })
        .where(
          and(
            eq(unifiedTasks.taskId, successorTask.taskId),
            eq(unifiedTasks.organizationId, organizationId),
            // Compare-and-set: never stomp a status that moved under us.
            eq(unifiedTasks.status, successorTask.status)
          )
        )
        .returning({ taskId: unifiedTasks.taskId });
      if (blocked) {
        successorBlocked = true;
        await auditTaskAction({
          orgId: organizationId,
          userId: getActorUserId(req),
          command: 'task.transition',
          taskId: successorTask.taskId,
          payload: { from: successorTask.status, to: 'blocked' },
          reason: `Blocked by new dependency on ${validatedData.predecessorTaskId}`,
        });
        notifyTaskEvent({
          organizationId,
          recipientUserId: successorTask.assigneeId,
          category: 'task_blocked',
          title: `Blocked: ${successorTask.title}`,
          body: 'This task now depends on work that is not finished yet.',
          taskId: successorTask.taskId,
        });
      }
    }

    res.json({
      success: true,
      data: newDependency,
      /** So the client can say the successor moved, rather than the board
       *  silently re-rendering it in a different column. */
      successorBlocked,
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
    const data = await loadTaskAnalytics(organizationId, projectId);
    res.json({ success: true, data });
  } catch (error) {
    console.error('Error fetching task analytics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch task analytics',
    });
  }
});

/**
 * GET /api/task-management/templates — the org's workflow templates.
 *
 * The write half of this feature already existed and is thorough:
 * POST /tasks/from-template/:templateId inserts real unified_tasks with
 * server-generated ids, dates derived from each definition's dayOffset /
 * duration, task_dependencies from the template, provenance via
 * sourceEntityType 'taskTemplate', and createdById from the actor.
 *
 * Nothing could ENUMERATE templates, though, so the "Start a workflow" picker
 * on the TaskBoard was populated from a fixture constant and its instantiate
 * button fabricated the whole task set client-side — random ids
 * ('C2C-TASK-' + Math.random()), fixture assignees, and no persistence at all.
 * A template list is the one missing piece between that and the real route.
 *
 * Read-only, org-scoped, and returns the SHAPE the picker needs rather than the
 * whole row: `tasks` and `dependencies` are large json blobs the client does not
 * render, so only their counts are sent. Inactive templates are excluded —
 * is_active exists precisely so a template can be retired without deleting the
 * history of what it produced.
 */
router.get('/templates', async (req: Request, res: Response) => {
  try {
    const organizationIdRaw = getSecureOrgId(req);
    const organizationId = organizationIdRaw ? Number(organizationIdRaw) : NaN;
    if (!Number.isFinite(organizationId) || organizationId <= 0) {
      return res.status(401).json({ success: false, error: 'Organization context required' });
    }
    const data = await listTemplatesForOrg(organizationId);
    return res.json({ success: true, data, meta: { count: data.length } });
  } catch (error) {
    console.error('Error listing task templates:', error);
    return res.status(500).json({ success: false, error: 'Failed to list task templates' });
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
      .where(
        and(
          eq(unifiedTasks.taskId, taskId),
          eq(unifiedTasks.organizationId, organizationId),
          isNull(unifiedTasks.deletedAt)
        )
      )
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

// ── Archive (soft delete) ───────────────────────────────────────────────────
//
// The ONLY removal verb for a task — stamps deleted_at/deleted_by instead of
// destroying the row (Part 11 retention, assessment D24). Archived rows leave
// every read model; the tombstone and its governed ledger record remain.
const archiveTaskSchema = z.object({
  reason: z.string().max(1000).optional(),
});
router.delete('/tasks/:taskId', async (req: Request, res: Response) => {
  try {
    const taskId = String(req.params.taskId);
    const parsed = archiveTaskSchema.parse(req.body ?? {});
    const actorUserId = getActorUserId(req);
    const organizationIdRaw = getSecureOrgId(req);
    const organizationId = organizationIdRaw ? Number(organizationIdRaw) : NaN;
    if (!Number.isFinite(organizationId) || organizationId <= 0) {
      return res.status(401).json({ success: false, error: 'Organization context required' });
    }

    const [archived] = await storage.db
      .update(unifiedTasks)
      .set({
        deletedAt: new Date(),
        deletedBy: actorUserId ?? undefined,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(unifiedTasks.taskId, taskId),
          eq(unifiedTasks.organizationId, organizationId),
          isNull(unifiedTasks.deletedAt)
        )
      )
      .returning({ taskId: unifiedTasks.taskId, title: unifiedTasks.title });

    if (!archived) {
      return res.status(404).json({ success: false, error: 'Task not found' });
    }

    await auditTaskAction({
      orgId: organizationId,
      userId: actorUserId,
      command: 'task.delete',
      taskId,
      payload: { title: archived.title, softDelete: true },
      reason: parsed.reason,
    });

    return res.json({ success: true, archived: true, taskId });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: error.errors });
    }
    console.error('Error archiving task:', error);
    return res.status(500).json({ success: false, error: 'Failed to archive task' });
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
          inArray(unifiedTasks.status, ['pending', 'in-progress', 'review', 'blocked']),
          isNull(unifiedTasks.deletedAt)
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
          // Mirrors the gate's own definition (task-signoff.ts): anything
          // approval-gated that is not yet approved still needs a signature.
          // Testing === 'pending' made this structurally zero — approval_status
          // is nullable with no default and no write path ever sets 'pending'
          // (only 'approved'), so the count never left 0.
          i => i.approvalRequired && i.approvalStatus !== 'approved'
        ).length,
      },
    });
  } catch (error) {
    console.error('Error loading my work:', error);
    return res.status(500).json({ success: false, error: 'Failed to load my work' });
  }
});

export default router;
