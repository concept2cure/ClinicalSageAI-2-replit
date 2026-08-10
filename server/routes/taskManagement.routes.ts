import { Router, Request, Response } from 'express';
import { db } from '../db';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { and, eq, or, ne, lt, desc, asc, inArray, gte, lte, like, sql, count, avg } from 'drizzle-orm';
import {
  unifiedTasks,
  taskTemplates,
  taskAutomation,
  taskDependencies,
  crossModuleTaskLinks,
  users,
  organizationUsers,
  projects,
} from '../../shared/schema';
import { getSecureOrgId } from '../utils/tenantContext';

const router = Router();
const storage = { db };

function getActorUserId(req: Request): number | null {
  const raw = (req as any).userId ?? (req as any).user?.id;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
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
  // 'pending' when omitted; honored so the form's status picker isn't dropped.
  status: z.string().min(1).optional(),
  assigneeId: z.number().optional(),
  startDate: z.string().optional(),
  dueDate: z.string().optional(),
  estimatedHours: z.number().optional(),
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
async function getOptimalAssignee(organizationId: number, taskData: any) {
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

// Update a task's board column / progress — backs the ui-v2 board's drag-move
// between columns. Org-scoped (taskId + organizationId), so no cross-org task
// can be moved. Only status/progress change here; richer edits use other routes.
const updateTaskStatusSchema = z.object({
  status: z.string().min(1),
  progress: z.number().min(0).max(100).optional(),
});
router.patch('/tasks/:taskId', async (req: Request, res: Response) => {
  try {
    const taskId = String(req.params.taskId);
    const parsed = updateTaskStatusSchema.parse(req.body);
    const organizationIdRaw = getSecureOrgId(req);
    const organizationId = organizationIdRaw ? Number(organizationIdRaw) : NaN;
    if (!Number.isFinite(organizationId) || organizationId <= 0) {
      return res.status(401).json({ success: false, error: 'Organization context required' });
    }

    const isDone = parsed.status === 'completed';
    const progress = parsed.progress ?? (isDone ? 100 : undefined);
    const [updated] = await storage.db
      .update(unifiedTasks)
      .set({
        status: parsed.status,
        progress,
        completionPercentage: progress,
        updatedAt: new Date(),
      })
      .where(and(eq(unifiedTasks.taskId, taskId), eq(unifiedTasks.organizationId, organizationId)))
      .returning();

    if (!updated) {
      return res.status(404).json({ success: false, error: 'Task not found' });
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

    // Get template
    const [template] = await storage.db
      .select()
      .from(taskTemplates)
      .where(
        and(
          eq(taskTemplates.templateId, templateId),
          eq(taskTemplates.organizationId, organizationId)
        )
      )
      .limit(1);

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

      if (adjustDates && taskDef.dayOffset) {
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

    // Update template usage statistics
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

    const dependencyId = `DEP-${Date.now()}-${uuidv4().substr(0, 8)}`;

    const [newDependency] = await storage.db
      .insert(taskDependencies)
      .values({
        dependencyId,
        ...validatedData,
        status: 'active',
      })
      .returning();

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

/**
 * Cap on the per-template task preview returned by the list route. A template
 * is a workflow, not a dossier; anything past this is shown as a truncation
 * notice rather than silently dropped.
 */
const MAX_TEMPLATE_TASK_PREVIEW = 50;

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

    const rows = await storage.db
      .select()
      .from(taskTemplates)
      .where(
        and(
          eq(taskTemplates.organizationId, organizationId),
          eq(taskTemplates.isActive, true)
        )
      )
      .orderBy(taskTemplates.name);

    const data = rows.map(t => {
      const defs = Array.isArray(t.tasks) ? (t.tasks as any[]) : [];
      const deps = Array.isArray(t.dependencies) ? (t.dependencies as any[]) : [];
      // Span and effort are derived from the SAME fields the instantiate route
      // uses (dayOffset / duration / estimatedHours), so the preview cannot
      // disagree with what actually gets created.
      const span = defs.reduce(
        (max, d) => Math.max(max, Number(d?.dayOffset ?? 0) + Number(d?.duration ?? 0)),
        0,
      );
      const estimatedHours = defs.reduce((sum, d) => sum + Number(d?.estimatedHours ?? 0), 0);
      return {
        templateId: t.templateId,
        name: t.name,
        description: t.description ?? null,
        category: t.category,
        submissionType: t.submissionType ?? null,
        milestone: t.milestone ?? null,
        isDefault: t.isDefault ?? false,
        version: t.version ?? 1,
        usageCount: t.usageCount ?? 0,
        taskCount: defs.length,
        dependencyCount: deps.length,
        /** Days from start to the last task's end; 0 when no definition carries
         *  timing. Not fabricated — 0 means the template says nothing. */
        spanDays: span,
        /** Sum of estimatedHours across definitions; 0 when none carry it. */
        estimatedHours,
        /**
         * A TRIMMED preview of what instantiating creates — the fields the
         * picker renders, and nothing else. This matters because the route
         * below writes real unified_tasks rows: the user should be able to see
         * what is about to be created before it is. Descriptions and any custom
         * template payload are deliberately excluded to keep the list small.
         */
        tasks: defs.slice(0, MAX_TEMPLATE_TASK_PREVIEW).map(d => ({
          id: String(d?.id ?? ''),
          title: String(d?.title ?? ''),
          moduleType: String(d?.moduleType ?? 'general'),
          priority: String(d?.priority ?? 'medium'),
          dayOffset: Number(d?.dayOffset ?? 0),
          duration: Number(d?.duration ?? 0),
        })),
        /** True when the preview above was truncated, so the UI can say so
         *  rather than quietly showing fewer tasks than it will create. */
        tasksTruncated: defs.length > MAX_TEMPLATE_TASK_PREVIEW,
      };
    });

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

// WebSocket support for real-time updates (to be integrated with socket.io)
router.post('/tasks/:taskId/notify', async (req: Request, res: Response) => {
  try {
    const { taskId } = req.params;
    const { event, data } = req.body;

    // Emit WebSocket event (to be integrated with actual WebSocket server)
    // io.to('tasks').emit(event, { taskId, ...data });

    res.json({
      success: true,
      message: 'Notification sent',
      event,
      taskId,
    });
  } catch (error) {
    console.error('Error sending notification:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to send notification',
    });
  }
});

export default router;
