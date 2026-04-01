import { Router, Request, Response } from 'express';
import { db } from '../db';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { and, eq, or, desc, asc, inArray, gte, lte, like, sql } from 'drizzle-orm';
import {
  unifiedTasks,
  taskTemplates,
  taskAutomation,
  taskDependencies,
  crossModuleTaskLinks,
  users,
  projects,
} from '../../shared/schema';
import { getSecureOrgId } from '../utils/tenantContext';

const router = Router();
const storage = { db };

// Task creation schema
const createTaskSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  moduleType: z.string(),
  moduleSource: z.string().optional(),
  moduleData: z.any().optional(),
  projectId: z.number().optional(),
  category: z.string().optional(),
  taskType: z.string().optional(),
  priority: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  assigneeId: z.number().optional(),
  startDate: z.string().optional(),
  dueDate: z.string().optional(),
  estimatedHours: z.number().optional(),
  dependencies: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  automationRules: z.any().optional(),
  escalationPath: z.any().optional(),
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
  tasks: z.array(z.any()),
  dependencies: z.any().optional(),
  milestones: z.any().optional(),
  defaultDuration: z.number().optional(),
  bestPractices: z.string().optional(),
  regulatoryRequirements: z.any().optional(),
  riskFactors: z.any().optional(),
});

// Automation rule schema
const createAutomationSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  ruleType: z.enum(['event-based', 'schedule-based', 'condition-based']),
  triggerModule: z.string().optional(),
  triggerEvent: z.string(),
  triggerConditions: z.any().optional(),
  actionType: z.string(),
  taskTemplate: z.any().optional(),
  taskDefaults: z.any().optional(),
  delayMinutes: z.number().optional(),
  recurringSchedule: z.any().optional(),
  workloadBalancing: z.boolean().default(true),
  smartAssignment: z.any().optional(),
});

// Helper function to calculate critical path
async function calculateCriticalPath(projectId: number) {
  try {
    // Get all tasks and dependencies for the project
    const tasks = await storage.db
      .selectFrom('unifiedTasks')
      .selectAll()
      .where('projectId', '=', projectId)
      .execute();

    const dependencies = await storage.db
      .selectFrom('taskDependencies')
      .selectAll()
      .where((eb: any) =>
        eb.or([
          eb(
            'predecessorTaskId',
            'in',
            tasks.map((t: any) => t.taskId)
          ),
          eb(
            'successorTaskId',
            'in',
            tasks.map((t: any) => t.taskId)
          ),
        ])
      )
      .execute();

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
    // Get all users and their current workload
    const workloadQuery = await storage.db
      .selectFrom('users')
      .leftJoin('unifiedTasks', (join: any) =>
        join
          .onRef('users.id', '=', 'unifiedTasks.assigneeId')
          .on('unifiedTasks.status', 'in', ['pending', 'in-progress'])
      )
      .select([
        'users.id',
        'users.name',
        'users.email',
        storage.db.fn.count('unifiedTasks.id').as('activeTaskCount'),
        storage.db.fn
          .sum(storage.db.fn.coalesce('unifiedTasks.estimatedHours', 8))
          .as('totalHours'),
      ])
      .where('users.organizationId', '=', organizationId)
      .groupBy(['users.id', 'users.name', 'users.email'])
      .execute();

    // Sort by workload (ascending)
    const sortedByWorkload = workloadQuery.sort((a: any, b: any) => {
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

    const newTask = await storage.db
      .insertInto('unifiedTasks')
      .values({
        taskId,
        organizationId,
        ...validatedData,
        assigneeId,
        assigneeName,
        status: 'pending',
        progress: 0,
        completionPercentage: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdById: req.userId ? Number(req.userId) : null,
      })
      .returningAll()
      .executeTakeFirst();

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

// Bulk create tasks
router.post('/tasks/bulk-create', async (req: Request, res: Response) => {
  try {
    const validatedData = bulkCreateTasksSchema.parse(req.body);
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

      const newTask = await storage.db
        .insertInto('unifiedTasks')
        .values({
          taskId,
          organizationId,
          ...taskData,
          assigneeId,
          assigneeName,
          status: 'pending',
          progress: 0,
          completionPercentage: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
          createdById: req.userId ? Number(req.userId) : null,
        })
        .returningAll()
        .executeTakeFirst();

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
              await storage.db
                .insertInto('taskDependencies')
                .values({
                  dependencyId: `DEP-${Date.now()}-${uuidv4().substr(0, 8)}`,
                  predecessorTaskId: taskIdMapping[depTitle],
                  successorTaskId: taskIdMapping[task.title],
                  dependencyType: 'finish-to-start',
                  status: 'active',
                  createdAt: new Date(),
                  updatedAt: new Date(),
                })
                .execute();
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
    const templateId = req.params.templateId;
    const { projectId, startDate, adjustDates } = req.body;
    const organizationId = req.body.organizationId;
    if (!organizationId) {
      return res.status(401).json({ success: false, error: 'Organization context required' });
    }

    // Get template
    const template = await storage.db
      .selectFrom('taskTemplates')
      .selectAll()
      .where('templateId', '=', templateId)
      .executeTakeFirst();

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

      const newTask = await storage.db
        .insertInto('unifiedTasks')
        .values({
          taskId,
          organizationId,
          projectId,
          title: taskDef.title,
          description: taskDef.description,
          moduleType: taskDef.moduleType || 'general',
          category: taskDef.category,
          taskType: taskDef.taskType,
          priority: taskDef.priority || 'medium',
          startDate: taskStartDate,
          dueDate: taskDueDate,
          estimatedHours: taskDef.estimatedHours,
          status: 'pending',
          progress: 0,
          completionPercentage: 0,
          templateId: template.id,
          createdAt: new Date(),
          updatedAt: new Date(),
          createdById: req.body.userId,
        })
        .returningAll()
        .executeTakeFirst();

      if (newTask) {
        createdTasks.push(newTask);
      }
    }

    // Create dependencies from template
    if (template.dependencies) {
      const dependencies = template.dependencies as any[];
      for (const dep of dependencies) {
        if (taskIdMapping[dep.predecessor] && taskIdMapping[dep.successor]) {
          await storage.db
            .insertInto('taskDependencies')
            .values({
              dependencyId: `DEP-${Date.now()}-${uuidv4().substr(0, 8)}`,
              predecessorTaskId: taskIdMapping[dep.predecessor],
              successorTaskId: taskIdMapping[dep.successor],
              dependencyType: dep.type || 'finish-to-start',
              lagTime: dep.lag || 0,
              status: 'active',
              createdAt: new Date(),
              updatedAt: new Date(),
            })
            .execute();
        }
      }
    }

    // Update template usage statistics
    await storage.db
      .updateTable('taskTemplates')
      .set({
        usageCount: sql`usage_count + 1`,
        lastUsedAt: new Date(),
        updatedAt: new Date(),
      })
      .where('templateId', '=', templateId)
      .execute();

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
    const moduleId = req.params.moduleId;
    const organizationId = req.query.organizationId
      ? parseInt(req.query.organizationId as string)
      : 1;
    const status = req.query.status as string;
    const priority = req.query.priority as string;

    let query = storage.db
      .selectFrom('unifiedTasks')
      .selectAll()
      .where('organizationId', '=', organizationId)
      .where('moduleType', '=', moduleId);

    if (status) {
      query = query.where('status', '=', status);
    }
    if (priority) {
      query = query.where('priority', '=', priority);
    }

    const tasks = await query.orderBy('dueDate', 'asc').orderBy('priority', 'desc').execute();

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
    const dependencyId = `DEP-${Date.now()}-${uuidv4().substr(0, 8)}`;

    const newDependency = await storage.db
      .insertInto('taskDependencies')
      .values({
        dependencyId,
        ...validatedData,
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returningAll()
      .executeTakeFirst();

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
    const projectId = parseInt(req.params.projectId);

    const criticalPath = await calculateCriticalPath(projectId);

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
    const { taskIds, organizationId = 1 } = req.body;
    const assignmentResults = [];

    for (const taskId of taskIds) {
      // Get task details
      const task = await storage.db
        .selectFrom('unifiedTasks')
        .selectAll()
        .where('taskId', '=', taskId)
        .executeTakeFirst();

      if (!task) continue;

      // Find optimal assignee
      const optimalAssignee = await getOptimalAssignee(organizationId, task);

      if (optimalAssignee) {
        // Update task assignment
        await storage.db
          .updateTable('unifiedTasks')
          .set({
            assigneeId: optimalAssignee.id,
            assigneeName: optimalAssignee.name,
            assignedBy: req.body.userId,
            assignedAt: new Date(),
            updatedAt: new Date(),
          })
          .where('taskId', '=', taskId)
          .execute();

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
    const organizationId = req.query.organizationId
      ? parseInt(req.query.organizationId as string)
      : 1;
    const projectId = req.query.projectId ? parseInt(req.query.projectId as string) : null;

    // Base query
    let baseCondition = storage.db.eb('organizationId', '=', organizationId);
    if (projectId) {
      baseCondition = storage.db.eb.and([
        baseCondition,
        storage.db.eb('projectId', '=', projectId),
      ]);
    }

    // Task statistics
    const taskStats = await storage.db
      .selectFrom('unifiedTasks')
      .select([
        storage.db.fn.count('id').as('totalTasks'),
        storage.db.fn
          .countAll()
          .filter(storage.db.eb('status', '=', 'completed'))
          .as('completedTasks'),
        storage.db.fn
          .countAll()
          .filter(storage.db.eb('status', '=', 'in-progress'))
          .as('inProgressTasks'),
        storage.db.fn
          .countAll()
          .filter(storage.db.eb('status', '=', 'blocked'))
          .as('blockedTasks'),
        storage.db.fn
          .countAll()
          .filter(storage.db.eb('status', '=', 'pending'))
          .as('pendingTasks'),
        storage.db.fn.avg('completionPercentage').as('avgCompletion'),
      ])
      .where(baseCondition)
      .executeTakeFirst();

    // Tasks by module
    const tasksByModule = await storage.db
      .selectFrom('unifiedTasks')
      .select(['moduleType', storage.db.fn.count('id').as('count')])
      .where(baseCondition)
      .groupBy('moduleType')
      .execute();

    // Tasks by priority
    const tasksByPriority = await storage.db
      .selectFrom('unifiedTasks')
      .select(['priority', storage.db.fn.count('id').as('count')])
      .where(baseCondition)
      .groupBy('priority')
      .execute();

    // Overdue tasks
    const overdueTasks = await storage.db
      .selectFrom('unifiedTasks')
      .select([storage.db.fn.count('id').as('count')])
      .where(baseCondition)
      .where('dueDate', '<', new Date())
      .where('status', '!=', 'completed')
      .executeTakeFirst();

    // Team productivity (top performers)
    const teamProductivity = await storage.db
      .selectFrom('unifiedTasks')
      .innerJoin('users', 'unifiedTasks.assigneeId', 'users.id')
      .select([
        'users.name',
        storage.db.fn.count('unifiedTasks.id').as('totalTasks'),
        storage.db.fn
          .countAll()
          .filter(storage.db.eb('unifiedTasks.status', '=', 'completed'))
          .as('completedTasks'),
        storage.db.fn.avg('unifiedTasks.completionPercentage').as('avgCompletion'),
      ])
      .where(baseCondition)
      .groupBy(['users.id', 'users.name'])
      .orderBy('completedTasks', 'desc')
      .limit(10)
      .execute();

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
    const organizationId = req.body.organizationId;
    if (!organizationId) {
      return res.status(401).json({ success: false, error: 'Organization context required' });
    }
    const templateId = `TMPL-${Date.now()}-${uuidv4().substr(0, 8)}`;

    const newTemplate = await storage.db
      .insertInto('taskTemplates')
      .values({
        templateId,
        organizationId,
        ...validatedData,
        isActive: true,
        version: 1,
        usageCount: 0,
        createdById: req.body.userId,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returningAll()
      .executeTakeFirst();

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
    const organizationId = req.body.organizationId;
    if (!organizationId) {
      return res.status(401).json({ success: false, error: 'Organization context required' });
    }
    const automationId = `AUTO-${Date.now()}-${uuidv4().substr(0, 8)}`;

    const newAutomation = await storage.db
      .insertInto('taskAutomation')
      .values({
        automationId,
        organizationId,
        ...validatedData,
        isActive: true,
        priority: 50,
        executionCount: 0,
        successCount: 0,
        failureCount: 0,
        createdById: req.body.userId,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returningAll()
      .executeTakeFirst();

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
