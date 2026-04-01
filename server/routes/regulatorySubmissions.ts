/**
 * Regulatory Submissions API Routes
 *
 * Compatibility bridge for the original hierarchical API:
 * - projects => regulatory submissions
 * - sequences => stage gates
 * - modules => regulatory tasks
 * - granules => task deliverables JSON entries
 */
import crypto from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import { and, eq, or } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db';
import { requireFeature } from '../middleware/featureToggleMiddleware';
import { regulatorySubmissions, regulatoryTasks, stageGates } from '../../shared/schema';
import { getSecureOrgId } from '../utils/tenantContext';

const router = Router();

router.use(requireFeature('UNIFIED_REGULATORY_SUBMISSIONS'));

function validationError(res: Response, error: z.ZodError) {
  return res.status(400).json({
    error: {
      code: 'VALIDATION_ERROR',
      message: 'Request validation failed',
      details: error.errors.map(e => ({
        path: e.path.join('.'),
        message: e.message,
      })),
    },
  });
}

const createSubmissionSchema = z.object({
  submissionId: z.string().min(3).max(120).optional(),
  submissionType: z.string().min(2).default('IND'),
  drugName: z.string().min(1),
  indication: z.string().min(1),
  sponsor: z.string().min(1),
  targetMarket: z.string().optional(),
  targetSubmissionDate: z.coerce.date().optional(),
  status: z.string().optional(),
  currentGate: z.string().optional(),
  priorityLevel: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const createStageGateSchema = z.object({
  gateId: z.string().min(3).max(120).optional(),
  gateName: z.string().min(2),
  gateOrder: z.coerce.number().int().positive(),
  description: z.string().optional(),
  status: z.enum(['pending', 'in-progress', 'completed', 'blocked']).optional(),
  plannedDate: z.coerce.date().optional(),
  requiredTasks: z.array(z.string()).optional(),
  requiredDocuments: z.array(z.string()).optional(),
  requiredApprovals: z.array(z.string()).optional(),
  exitCriteria: z.record(z.string(), z.unknown()).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const createTaskSchema = z.object({
  taskId: z.string().min(3).max(120).optional(),
  title: z.string().min(1),
  description: z.string().optional(),
  taskType: z.string().min(2).default('document-preparation'),
  category: z.string().optional(),
  assignedTo: z.coerce.number().int().positive().optional(),
  dueDate: z.coerce.date().optional(),
  priority: z.enum(['low', 'normal', 'high', 'urgent', 'critical']).optional(),
  estimatedHours: z.coerce.number().positive().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const createGranuleSchema = z.object({
  granuleName: z.string().min(1),
  description: z.string().optional(),
  status: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

function getTenantContext(req: Request, res: Response) {
  const orgRaw = getSecureOrgId(req as any);
  const organizationId = orgRaw ? Number(orgRaw) : NaN;
  if (!Number.isFinite(organizationId) || organizationId <= 0) {
    res.status(401).json({ error: 'Organization context required' });
    return null;
  }

  const workspaceRaw =
    (req as any).tenantContext?.clientWorkspaceId ||
    req.headers['x-client-workspace-id'] ||
    req.query.clientWorkspaceId ||
    req.query.client_workspace_id;
  const clientWorkspaceId = workspaceRaw ? Number(workspaceRaw) : undefined;
  const safeClientWorkspaceId =
    Number.isFinite(clientWorkspaceId) && (clientWorkspaceId as number) > 0
      ? (clientWorkspaceId as number)
      : undefined;
  const userIdRaw = (req as any).userId ?? (req as any).user?.id ?? 0;
  const userId = Number.isFinite(Number(userIdRaw)) ? Number(userIdRaw) : 0;

  return { organizationId, clientWorkspaceId: safeClientWorkspaceId, userId };
}

async function loadSubmissionByParam(
  idParam: string,
  organizationId: number,
  clientWorkspaceId?: number
) {
  const idAsNumber = Number(idParam);
  const matcher = Number.isFinite(idAsNumber)
    ? or(eq(regulatorySubmissions.id, idAsNumber), eq(regulatorySubmissions.submissionId, idParam))
    : eq(regulatorySubmissions.submissionId, idParam);
  const conditions = [eq(regulatorySubmissions.organizationId, organizationId), matcher];
  if (clientWorkspaceId) {
    conditions.push(eq(regulatorySubmissions.clientWorkspaceId, clientWorkspaceId));
  }
  const rows = await db
    .select()
    .from(regulatorySubmissions)
    .where(and(...conditions))
    .limit(1);
  return rows[0];
}

async function loadStageGateByParam(idParam: string, organizationId: number) {
  const idAsNumber = Number(idParam);
  const matcher = Number.isFinite(idAsNumber)
    ? or(eq(stageGates.id, idAsNumber), eq(stageGates.gateId, idParam))
    : eq(stageGates.gateId, idParam);
  const rows = await db
    .select()
    .from(stageGates)
    .where(and(eq(stageGates.organizationId, organizationId), matcher))
    .limit(1);
  return rows[0];
}

async function loadTaskByParam(idParam: string, organizationId: number) {
  const idAsNumber = Number(idParam);
  const matcher = Number.isFinite(idAsNumber)
    ? or(eq(regulatoryTasks.id, idAsNumber), eq(regulatoryTasks.taskId, idParam))
    : eq(regulatoryTasks.taskId, idParam);
  const rows = await db
    .select()
    .from(regulatoryTasks)
    .where(and(eq(regulatoryTasks.organizationId, organizationId), matcher))
    .limit(1);
  return rows[0];
}

router.get('/projects', async (req, res) => {
  try {
    const tenant = getTenantContext(req, res);
    if (!tenant) return;

    const conditions = [eq(regulatorySubmissions.organizationId, tenant.organizationId)];
    if (tenant.clientWorkspaceId) {
      conditions.push(eq(regulatorySubmissions.clientWorkspaceId, tenant.clientWorkspaceId));
    }
    const submissions = await db
      .select()
      .from(regulatorySubmissions)
      .where(and(...conditions));
    return res.json(submissions);
  } catch (error) {
    console.error('Error fetching submission projects:', error);
    return res.status(500).json({ error: 'Failed to fetch submission projects' });
  }
});

router.post('/projects', async (req, res) => {
  try {
    const tenant = getTenantContext(req, res);
    if (!tenant) return;
    const parsed = createSubmissionSchema.safeParse(req.body);
    if (!parsed.success) return validationError(res, parsed.error);
    const input = parsed.data;
    const now = new Date();
    const defaultTargetDate = new Date(now);
    defaultTargetDate.setDate(defaultTargetDate.getDate() + 90);

    const [created] = await db
      .insert(regulatorySubmissions)
      .values({
        submissionId: input.submissionId || `sub_${crypto.randomUUID()}`,
        organizationId: tenant.organizationId,
        clientWorkspaceId: tenant.clientWorkspaceId ?? null,
        submissionType: input.submissionType,
        drugName: input.drugName,
        indication: input.indication,
        sponsor: input.sponsor,
        targetMarket: input.targetMarket ?? null,
        targetSubmissionDate: input.targetSubmissionDate ?? defaultTargetDate,
        status: input.status ?? 'planning',
        currentGate: input.currentGate ?? 'initiation',
        priorityLevel: input.priorityLevel ?? 'normal',
        metadata: input.metadata ?? {},
        createdById: tenant.userId || null,
        lastModifiedBy: tenant.userId || null,
      })
      .returning();

    return res.status(201).json(created);
  } catch (error) {
    console.error('Error creating submission project:', error);
    return res.status(500).json({ error: 'Failed to create submission project' });
  }
});

router.get('/projects/:id', async (req, res) => {
  try {
    const tenant = getTenantContext(req, res);
    if (!tenant) return;
    const submission = await loadSubmissionByParam(
      req.params.id,
      tenant.organizationId,
      tenant.clientWorkspaceId
    );
    if (!submission) {
      return res.status(404).json({ error: 'Submission project not found' });
    }
    return res.json(submission);
  } catch (error) {
    console.error('Error fetching submission project:', error);
    return res.status(500).json({ error: 'Failed to fetch submission project' });
  }
});

router.get('/projects/:id/sequences', async (req, res) => {
  try {
    const tenant = getTenantContext(req, res);
    if (!tenant) return;
    const submission = await loadSubmissionByParam(
      req.params.id,
      tenant.organizationId,
      tenant.clientWorkspaceId
    );
    if (!submission) {
      return res.status(404).json({ error: 'Submission project not found' });
    }

    const gates = await db
      .select()
      .from(stageGates)
      .where(
        and(
          eq(stageGates.organizationId, tenant.organizationId),
          eq(stageGates.submissionId, submission.submissionId)
        )
      );
    return res.json(gates);
  } catch (error) {
    console.error('Error fetching submission sequences:', error);
    return res.status(500).json({ error: 'Failed to fetch submission sequences' });
  }
});

router.post('/projects/:id/sequences', async (req, res) => {
  try {
    const tenant = getTenantContext(req, res);
    if (!tenant) return;
    const submission = await loadSubmissionByParam(
      req.params.id,
      tenant.organizationId,
      tenant.clientWorkspaceId
    );
    if (!submission) {
      return res.status(404).json({ error: 'Submission project not found' });
    }
    const parsed = createStageGateSchema.safeParse(req.body);
    if (!parsed.success) return validationError(res, parsed.error);
    const input = parsed.data;
    const [created] = await db
      .insert(stageGates)
      .values({
        gateId: input.gateId || `gate_${crypto.randomUUID()}`,
        submissionId: submission.submissionId,
        organizationId: tenant.organizationId,
        gateName: input.gateName,
        gateOrder: input.gateOrder,
        description: input.description ?? null,
        status: input.status ?? 'pending',
        plannedDate: input.plannedDate ?? null,
        requiredTasks: input.requiredTasks ?? [],
        requiredDocuments: input.requiredDocuments ?? [],
        requiredApprovals: input.requiredApprovals ?? [],
        exitCriteria: input.exitCriteria ?? {},
        metadata: input.metadata ?? {},
      })
      .returning();
    return res.status(201).json(created);
  } catch (error) {
    console.error('Error creating submission sequence:', error);
    return res.status(500).json({ error: 'Failed to create submission sequence' });
  }
});

router.get('/sequences/:id/modules', async (req, res) => {
  try {
    const tenant = getTenantContext(req, res);
    if (!tenant) return;
    const gate = await loadStageGateByParam(req.params.id, tenant.organizationId);
    if (!gate) {
      return res.status(404).json({ error: 'Submission sequence not found' });
    }
    const tasks = await db
      .select()
      .from(regulatoryTasks)
      .where(
        and(
          eq(regulatoryTasks.organizationId, tenant.organizationId),
          eq(regulatoryTasks.submissionId, gate.submissionId),
          eq(regulatoryTasks.stageGate, gate.gateId)
        )
      );
    return res.json(tasks);
  } catch (error) {
    console.error('Error fetching document modules:', error);
    return res.status(500).json({ error: 'Failed to fetch document modules' });
  }
});

router.post('/sequences/:id/modules', async (req, res) => {
  try {
    const tenant = getTenantContext(req, res);
    if (!tenant) return;
    const gate = await loadStageGateByParam(req.params.id, tenant.organizationId);
    if (!gate) {
      return res.status(404).json({ error: 'Submission sequence not found' });
    }
    const parsed = createTaskSchema.safeParse(req.body);
    if (!parsed.success) return validationError(res, parsed.error);
    const input = parsed.data;
    const now = new Date();
    const defaultDueDate = new Date(now);
    defaultDueDate.setDate(defaultDueDate.getDate() + 14);

    const [created] = await db
      .insert(regulatoryTasks)
      .values({
        taskId: input.taskId || `task_${crypto.randomUUID()}`,
        submissionId: gate.submissionId,
        organizationId: tenant.organizationId,
        title: input.title,
        description: input.description ?? null,
        taskType: input.taskType,
        category: input.category ?? null,
        assignedTo: input.assignedTo ?? null,
        assignedBy: tenant.userId || null,
        assignedAt: input.assignedTo ? now : null,
        status: 'pending',
        priority: input.priority ?? 'normal',
        estimatedHours: input.estimatedHours ?? null,
        dueDate: input.dueDate ?? defaultDueDate,
        stageGate: gate.gateId,
        metadata: input.metadata ?? {},
        createdById: tenant.userId || null,
        lastModifiedBy: tenant.userId || null,
      })
      .returning();
    return res.status(201).json(created);
  } catch (error) {
    console.error('Error creating document module:', error);
    return res.status(500).json({ error: 'Failed to create document module' });
  }
});

router.get('/modules/:id/granules', async (req, res) => {
  try {
    const tenant = getTenantContext(req, res);
    if (!tenant) return;
    const task = await loadTaskByParam(req.params.id, tenant.organizationId);
    if (!task) {
      return res.status(404).json({ error: 'Document module not found' });
    }
    const granules = Array.isArray(task.deliverables) ? task.deliverables : [];
    return res.json(granules);
  } catch (error) {
    console.error('Error fetching document granules:', error);
    return res.status(500).json({ error: 'Failed to fetch document granules' });
  }
});

router.post('/modules/:id/granules', async (req, res) => {
  try {
    const tenant = getTenantContext(req, res);
    if (!tenant) return;
    const task = await loadTaskByParam(req.params.id, tenant.organizationId);
    if (!task) {
      return res.status(404).json({ error: 'Document module not found' });
    }
    const parsed = createGranuleSchema.safeParse(req.body);
    if (!parsed.success) return validationError(res, parsed.error);
    const input = parsed.data;
    const existingGranules = Array.isArray(task.deliverables) ? task.deliverables : [];
    const granule = {
      id: `granule_${crypto.randomUUID()}`,
      granuleName: input.granuleName,
      description: input.description || '',
      status: input.status || 'pending',
      metadata: input.metadata || {},
      createdAt: new Date().toISOString(),
      createdById: tenant.userId || null,
    };
    const updatedGranules = [...existingGranules, granule];

    const [updated] = await db
      .update(regulatoryTasks)
      .set({
        deliverables: updatedGranules,
        lastModifiedBy: tenant.userId || null,
        updatedAt: new Date(),
      })
      .where(and(eq(regulatoryTasks.id, task.id), eq(regulatoryTasks.organizationId, tenant.organizationId)))
      .returning();

    return res.status(201).json({
      granule,
      moduleTaskId: updated.taskId,
      granuleCount: updatedGranules.length,
    });
  } catch (error) {
    console.error('Error creating document granule:', error);
    return res.status(500).json({ error: 'Failed to create document granule' });
  }
});

export default router;
