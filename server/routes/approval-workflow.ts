/**
 * Approval Workflow API Routes
 *
 * Full CRUD for approval workflows:
 *   POST   /api/approval-workflows/start              Start a workflow on a document
 *   POST   /api/approval-workflows/:id/approve         Approve current step
 *   POST   /api/approval-workflows/:id/reject          Reject at current step
 *   POST   /api/approval-workflows/:id/delegate        Delegate to another user
 *   GET    /api/approval-workflows/pending              Get pending approvals for current user
 *   GET    /api/approval-workflows/:workflowId/status   Full workflow status + history
 *   GET    /api/approval-workflows/templates            List available workflow templates
 *
 * @module server/routes/approval-workflow
 */

import { Router, Request, Response } from 'express';
import { approvalOrchestrator } from '../services/workflow/ApprovalOrchestrator';
import { db } from '../db';
import { eq, and } from 'drizzle-orm';
import { workflowTemplates, workflowSteps } from '../../shared/schema/unified_workflow';

import { createScopedLogger } from '../utils/logger.js';
import { verifyJwtWithRotation } from '../utils/jwtVerify.js';

const logger = createScopedLogger('approval-workflow');

const router = Router();

const isDev = process.env.NODE_ENV === 'development';

// ── Auth helper ────────────────────────────────────────────────────────────

function getUser(req: Request): { userId: string; organizationId: string } | null {
  const authHeader = req.headers.authorization;
  const token = authHeader?.replace('Bearer ', '');

  if (isDev && !token) {
    return { userId: '1', organizationId: '2' };
  }

  if (!token) return null;

  try {
    const decoded = verifyJwtWithRotation(token) as {
      userId: string;
      organizationId?: string;
    };
    return {
      userId: decoded.userId,
      organizationId: decoded.organizationId,
    };
  } catch {
    return null;
  }
}

function requireAuth(req: Request, res: Response): { userId: string; organizationId: string } | null {
  const user = getUser(req);
  if (!user) {
    res.status(401).json({ error: 'Authentication required' });
    return null;
  }
  return user;
}

// ============================================================================
// POST /api/approval-workflows/start — Start a new workflow
// ============================================================================

router.post('/start', async (req: Request, res: Response) => {
  const user = requireAuth(req, res);
  if (!user) return;

  try {
    const { documentId, templateId, metadata } = req.body;

    if (!documentId || !templateId) {
      return res.status(400).json({
        error: 'documentId and templateId are required',
      });
    }

    const result = await approvalOrchestrator.startWorkflow({
      documentId,
      templateId,
      startedBy: user.userId,
      organizationId: user.organizationId,
      metadata,
    });

    return res.status(201).json({
      success: true,
      workflowId: result.workflowId,
      approvalIds: result.approvals,
      message: 'Workflow started successfully',
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Start error', { err: message instanceof Error ? message.message : String(message) });
    return res.status(400).json({ error: message });
  }
});

// ============================================================================
// POST /api/approval-workflows/:id/approve — Approve current step
// ============================================================================

router.post('/:id/approve', async (req: Request, res: Response) => {
  const user = requireAuth(req, res);
  if (!user) return;

  try {
    const approvalId = parseInt(req.params.id);
    const { comments } = req.body;

    const result = await approvalOrchestrator.processApproval({
      approvalId,
      action: 'approve',
      performedBy: user.userId,
      comments,
    });

    return res.json({
      success: true,
      ...result,
      message: result.workflowCompleted
        ? 'Workflow completed — all steps approved'
        : result.workflowAdvanced
        ? `Step approved. Advanced to step ${result.nextStep}`
        : 'Step approved',
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Approve error', { err: message instanceof Error ? message.message : String(message) });
    return res.status(400).json({ error: message });
  }
});

// ============================================================================
// POST /api/approval-workflows/:id/reject — Reject at current step
// ============================================================================

router.post('/:id/reject', async (req: Request, res: Response) => {
  const user = requireAuth(req, res);
  if (!user) return;

  try {
    const approvalId = parseInt(req.params.id);
    const { comments } = req.body;

    if (!comments) {
      return res.status(400).json({
        error: 'Rejection reason is required',
      });
    }

    const result = await approvalOrchestrator.processApproval({
      approvalId,
      action: 'reject',
      performedBy: user.userId,
      comments,
    });

    return res.json({
      success: true,
      ...result,
      message: 'Workflow rejected',
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Reject error', { err: message instanceof Error ? message.message : String(message) });
    return res.status(400).json({ error: message });
  }
});

// ============================================================================
// POST /api/approval-workflows/:id/delegate — Delegate approval
// ============================================================================

router.post('/:id/delegate', async (req: Request, res: Response) => {
  const user = requireAuth(req, res);
  if (!user) return;

  try {
    const approvalId = parseInt(req.params.id);
    const { delegateTo, reason } = req.body;

    if (!delegateTo) {
      return res.status(400).json({
        error: 'delegateTo (user ID) is required',
      });
    }

    await approvalOrchestrator.delegateApproval({
      approvalId,
      delegatedBy: user.userId,
      delegateTo,
      reason,
    });

    return res.json({
      success: true,
      message: `Approval delegated to user ${delegateTo}`,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Delegate error', { err: message instanceof Error ? message.message : String(message) });
    return res.status(400).json({ error: message });
  }
});

// ============================================================================
// GET /api/approval-workflows/pending — Get pending approvals for current user
// ============================================================================

router.get('/pending', async (req: Request, res: Response) => {
  const user = requireAuth(req, res);
  if (!user) return;

  try {
    const pending = await approvalOrchestrator.getPendingApprovals(
      user.userId,
      user.organizationId,
    );

    return res.json({
      success: true,
      approvals: pending,
      total: pending.length,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Pending error', { err: message instanceof Error ? message.message : String(message) });
    return res.status(500).json({ error: 'Failed to fetch pending approvals' });
  }
});

// ============================================================================
// GET /api/approval-workflows/:workflowId/status — Full workflow status
// ============================================================================

router.get('/:workflowId/status', async (req: Request, res: Response) => {
  const user = requireAuth(req, res);
  if (!user) return;

  try {
    const workflowId = parseInt(req.params.workflowId);
    const status = await approvalOrchestrator.getWorkflowStatus(workflowId);

    if (!status) {
      return res.status(404).json({ error: 'Workflow not found' });
    }

    return res.json({ success: true, workflow: status });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Status error', { err: message instanceof Error ? message.message : String(message) });
    return res.status(500).json({ error: 'Failed to fetch workflow status' });
  }
});

// ============================================================================
// GET /api/approval-workflows/templates — List available workflow templates
// ============================================================================

router.get('/templates', async (req: Request, res: Response) => {
  const user = requireAuth(req, res);
  if (!user) return;

  try {
    const { moduleType } = req.query;

    let templates;
    if (moduleType) {
      templates = await db
        .select()
        .from(workflowTemplates)
        .where(
          and(
            eq(workflowTemplates.organizationId, user.organizationId),
            eq(workflowTemplates.isActive, true),
            eq(workflowTemplates.moduleType, moduleType as any),
          ),
        );
    } else {
      templates = await db
        .select()
        .from(workflowTemplates)
        .where(
          and(
            eq(workflowTemplates.organizationId, user.organizationId),
            eq(workflowTemplates.isActive, true),
          ),
        );
    }

    // Enrich with step counts
    const enriched = await Promise.all(
      templates.map(async t => {
        const steps = await db
          .select()
          .from(workflowSteps)
          .where(eq(workflowSteps.templateId, t.id))
          .orderBy(workflowSteps.order);

        return {
          ...t,
          steps: steps.map(s => ({
            id: s.id,
            name: s.name,
            order: s.order,
            approverType: s.approverType,
            approverIds: s.approverIds,
            requiredActions: s.requiredActions,
          })),
          stepCount: steps.length,
        };
      }),
    );

    return res.json({ success: true, templates: enriched });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Templates error', { err: message instanceof Error ? message.message : String(message) });
    return res.status(500).json({ error: 'Failed to fetch templates' });
  }
});

// ============================================================================
// POST /api/approval-workflows/templates — Create a workflow template
// ============================================================================

router.post('/templates', async (req: Request, res: Response) => {
  const user = requireAuth(req, res);
  if (!user) return;

  try {
    const { name, description, moduleType, documentTypes, steps } = req.body;

    if (!name || !moduleType || !steps?.length) {
      return res.status(400).json({
        error: 'name, moduleType, and steps are required',
      });
    }

    // Create template
    const [template] = await db
      .insert(workflowTemplates)
      .values({
        name,
        description: description || '',
        moduleType,
        organizationId: user.organizationId,
        createdBy: user.userId,
        documentTypes: documentTypes || [],
      })
      .returning();

    // Create steps
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      await db.insert(workflowSteps).values({
        templateId: template.id,
        name: step.name,
        description: step.description || '',
        order: i + 1,
        approverType: step.approverType || 'user',
        approverIds: step.approverIds || [],
        requiredActions: step.requiredActions || ['review'],
      });
    }

    return res.status(201).json({
      success: true,
      template: { id: template.id, name: template.name },
      message: `Template created with ${steps.length} steps`,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Create template error', { err: message instanceof Error ? message.message : String(message) });
    return res.status(400).json({ error: message });
  }
});

export default router;
