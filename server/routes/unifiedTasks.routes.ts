/**
 * Unified Task Management API Routes
 * 
 * API endpoints for the comprehensive unified task management system
 * that connects ALL modules in the Regulatory Submission Center.
 */

import { Router, Request, Response } from 'express';
import unifiedTaskService, { MODULE_CONFIG } from '../services/unifiedTaskService';
import { storage } from '../storage';
import { z } from 'zod';

const router = Router();

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
 * POST /api/regulatory/tasks/unified
 * Create tasks from any module
 */
router.post('/unified', async (req: Request, res: Response) => {
  try {
    const validatedData = createTaskSchema.parse(req.body);
    
    // Convert dueDate string to Date object if present
    const taskData = {
      ...validatedData,
      dueDate: validatedData.dueDate ? new Date(validatedData.dueDate) : undefined,
    };
    
    const task = await unifiedTaskService.createUnifiedTask(taskData);
    
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
    const {
      organizationId,
      clientWorkspaceId,
      projectId,
      status,
      moduleType,
      assigneeId,
      limit = '50',
      offset = '0',
    } = req.query;

    const tasks = await unifiedTaskService.getAllUnifiedTasks({
      organizationId: organizationId ? parseInt(organizationId as string) : undefined,
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
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch tasks',
    });
  }
});

/**
 * GET /api/regulatory/tasks/by-module/:module
 * Get tasks by module type
 */
router.get('/by-module/:module', async (req: Request, res: Response) => {
  try {
    const module = String(req.params.module);
    const { organizationId, status, limit = '50' } = req.query;

    if (!['CMC', 'IND', 'MedicalDevice', 'eCTD', 'Vault', 'ProtocolDesign'].includes(module)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid module type',
      });
    }

    const tasks = await unifiedTaskService.getTasksByModule(
      module as keyof typeof MODULE_CONFIG,
      {
        organizationId: organizationId ? parseInt(organizationId as string) : undefined,
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
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch module tasks',
    });
  }
});

/**
 * POST /api/regulatory/tasks/:id/link
 * Link tasks across modules
 */
router.post('/:id/link', async (req: Request, res: Response) => {
  try {
    const { id } = req.params as { id: string };
    const linkData = linkTaskSchema.parse({
      ...req.body,
      sourceTaskId: id,
    });

    const link = await unifiedTaskService.linkTasks(linkData);

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
    const { organizationId, projectId } = req.query;

    if (!organizationId) {
      return res.status(400).json({
        success: false,
        error: 'organizationId is required',
      });
    }

    const metrics = await unifiedTaskService.getUnifiedDashboardMetrics(
      parseInt(organizationId as string),
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
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch dashboard metrics',
    });
  }
});

/**
 * POST /api/regulatory/tasks/sync/:module
 * Sync tasks from specific module
 */
router.post('/sync/:module', async (req: Request, res: Response) => {
  try {
    const module = String(req.params.module);
    const { organizationId } = req.body;

    if (!['CMC', 'IND', 'MedicalDevice', 'eCTD', 'Vault', 'ProtocolDesign'].includes(module)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid module type',
      });
    }

    if (!organizationId) {
      return res.status(400).json({
        success: false,
        error: 'organizationId is required',
      });
    }

    const result = await unifiedTaskService.syncTasksFromModule(
      module as keyof typeof MODULE_CONFIG,
      parseInt(organizationId)
    );

    res.json({
      success: true,
      module,
      syncResult: result,
      message: `Successfully synced ${result.synced} tasks from ${module} module (${result.created} new, ${result.updated} updated)`,
    });
  } catch (error: any) {
    console.error('Error syncing module tasks:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to sync module tasks',
    });
  }
});

/**
 * PATCH /api/regulatory/tasks/:id/status
 * Update task status
 */
router.patch('/:id/status', async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const { status, userId } = req.body;

    if (!status) {
      return res.status(400).json({
        success: false,
        error: 'status is required',
      });
    }

    const updatedTask = await unifiedTaskService.updateTaskStatus(id, status, userId);

    res.json({
      success: true,
      task: updatedTask,
      message: `Task status updated to ${status}`,
    });
  } catch (error: any) {
    console.error('Error updating task status:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to update task status',
    });
  }
});

/**
 * GET /api/regulatory/tasks/:id
 * Get single task details with all relationships
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);

    const tasks = await unifiedTaskService.getAllUnifiedTasks({
      limit: 1,
    });

    const task = tasks.find((t) => t.taskId === id || t.id === parseInt(id));

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
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch task',
    });
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