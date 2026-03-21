/**
 * AI Actions API Route
 *
 * POST /api/ai-actions/execute — Unified AI action execution endpoint
 * GET  /api/ai-actions/types   — List registered action types
 *
 * All requests require authentication and organization context.
 * All mutations are audit-logged via the action registry.
 */

import { Router, Request, Response } from 'express';
import { dispatchAction, getRegisteredActions } from '../services/ai-actions';
import type { AIActionRequest, AIActionSourceSurface } from '../../shared/types/ai-actions';

const router = Router();

// ---------------------------------------------------------------------------
// Helpers — mirror concept2cure.ts patterns for auth extraction
// ---------------------------------------------------------------------------

function getOrganizationId(req: Request): number {
  // tenantContext (from tenantContextMiddleware)
  if ((req as any).tenantContext?.organizationId) {
    const orgId = typeof (req as any).tenantContext.organizationId === 'number'
      ? (req as any).tenantContext.organizationId
      : parseInt((req as any).tenantContext.organizationId as string, 10);
    if (!isNaN(orgId)) return orgId;
  }
  // Direct middleware injection
  if ((req as any).organizationId) {
    return typeof (req as any).organizationId === 'number'
      ? (req as any).organizationId
      : parseInt((req as any).organizationId as string, 10);
  }
  // From authenticated user
  if (req.user?.organizationId) return req.user.organizationId;
  throw new Error('Organization context required');
}

function getUserId(req: Request): number {
  if (req.userId) return req.userId;
  if (req.user?.id) return req.user.id;
  throw new Error('Authentication required');
}

function getUserName(req: Request): string {
  return req.user?.name || req.user?.email || `user-${getUserId(req)}`;
}

function getUserRole(req: Request): string {
  return req.user?.role || 'user';
}

// ---------------------------------------------------------------------------
// POST /api/ai-actions/execute
// ---------------------------------------------------------------------------

router.post('/execute', async (req: Request, res: Response) => {
  try {
    // 1. Auth extraction
    let organizationId: number;
    let userId: number;
    try {
      organizationId = getOrganizationId(req);
      userId = getUserId(req);
    } catch (err: any) {
      return res.status(401).json({
        success: false,
        actionType: req.body?.actionType || 'unknown',
        status: 'failed',
        errors: [{ code: 'AUTH_REQUIRED', message: err.message }],
      });
    }

    // 2. Validate request body shape
    const body = req.body;
    if (!body || !body.actionType) {
      return res.status(400).json({
        success: false,
        actionType: 'unknown',
        status: 'failed',
        errors: [{ code: 'INVALID_REQUEST', message: 'actionType is required in request body' }],
      });
    }

    if (!body.targetType) {
      return res.status(400).json({
        success: false,
        actionType: body.actionType,
        status: 'failed',
        errors: [{ code: 'INVALID_REQUEST', message: 'targetType is required' }],
      });
    }

    if (!body.projectId && body.projectId !== 0) {
      return res.status(400).json({
        success: false,
        actionType: body.actionType,
        status: 'failed',
        errors: [{ code: 'INVALID_REQUEST', message: 'projectId is required' }],
      });
    }

    // 3. Build canonical request
    const actionRequest: AIActionRequest = {
      actionType: body.actionType,
      targetType: body.targetType,
      targetId: body.targetId ?? null,
      projectId: Number(body.projectId),
      module: body.module,
      context: body.context || {},
      payload: body.payload || {},
      sourceSurface: (body.sourceSurface as AIActionSourceSurface) || 'api',
      conversationId: body.conversationId,
      threadId: body.threadId,
      requestedBy: {
        userId,
        userName: getUserName(req),
        userRole: getUserRole(req),
        organizationId,
      },
    };

    // 4. Dispatch
    const response = await dispatchAction(actionRequest, {
      ipAddress: req.ip || req.socket.remoteAddress || '0.0.0.0',
      sessionId: req.sessionId,
      user: actionRequest.requestedBy!,
    });

    // 5. Return with appropriate HTTP status
    const httpStatus = response.success ? 200 : response.errors.some(e => e.code === 'UNKNOWN_ACTION') ? 404 : 400;
    return res.status(httpStatus).json(response);
  } catch (err: any) {
    console.error('[AI Actions Route] Unhandled error:', err);
    return res.status(500).json({
      success: false,
      actionType: req.body?.actionType || 'unknown',
      status: 'failed',
      result: null,
      createdObjects: [],
      updatedObjects: [],
      warnings: [],
      errors: [{ code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' }],
      provenance: { timestamp: new Date().toISOString() },
      nextSuggestedActions: [],
    });
  }
});

// ---------------------------------------------------------------------------
// GET /api/ai-actions/types
// ---------------------------------------------------------------------------

router.get('/types', (_req: Request, res: Response) => {
  const actions = getRegisteredActions();
  return res.json({
    success: true,
    actions: actions.map(actionType => ({
      actionType,
      endpoint: 'POST /api/ai-actions/execute',
    })),
  });
});

export default router;
