/**
 * AI Actions API Route
 *
 * POST /api/ai-actions/execute  — Unified AI action execution endpoint
 * GET  /api/ai-actions/types    — List registered action types (auth required)
 * GET  /api/ai-actions/health   — Health check + metrics
 *
 * All mutation requests require authentication and organization context.
 * Rate limited via Redis (ai category, 30 req/min default).
 */

import { Router, Request, Response } from 'express';
import {
  dispatchAction,
  getRegisteredActions,
  getActionMetrics,
  isValidActionType,
  isValidSourceSurface,
} from '../services/ai-actions';
import type { AIActionRequest, AIActionResponse, AIActionSourceSurface } from '../../shared/types/ai-actions';

const router = Router();

// ---------------------------------------------------------------------------
// Error helper
// ---------------------------------------------------------------------------

function buildRouteError(actionType: string, errors: { code: string; message: string }[]): AIActionResponse {
  return {
    success: false,
    actionType: actionType as any,
    status: 'failed',
    result: null,
    createdObjects: [],
    updatedObjects: [],
    warnings: [],
    errors,
    provenance: {
      actionId: 'none',
      timestamp: new Date().toISOString(),
      userId: 0,
      organizationId: 0,
      projectId: 0,
      sourceSurface: 'api',
    },
    nextSuggestedActions: [],
  };
}

// ---------------------------------------------------------------------------
// Auth extraction helpers
// ---------------------------------------------------------------------------

function getOrganizationId(req: Request): number {
  if ((req as any).tenantContext?.organizationId) {
    const orgId = typeof (req as any).tenantContext.organizationId === 'number'
      ? (req as any).tenantContext.organizationId
      : parseInt((req as any).tenantContext.organizationId as string, 10);
    if (!isNaN(orgId)) return orgId;
  }
  if ((req as any).organizationId) {
    return typeof (req as any).organizationId === 'number'
      ? (req as any).organizationId
      : parseInt((req as any).organizationId as string, 10);
  }
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
    // 1. Auth
    let organizationId: number;
    let userId: number;
    try {
      organizationId = getOrganizationId(req);
      userId = getUserId(req);
    } catch (err: any) {
      return res.status(401).json(
        buildRouteError(req.body?.actionType || 'unknown', [{ code: 'AUTH_REQUIRED', message: err.message }])
      );
    }

    // 2. Validate request body
    const body = req.body;
    if (!body || !body.actionType) {
      return res.status(400).json(
        buildRouteError('unknown', [{ code: 'INVALID_REQUEST', message: 'actionType is required' }])
      );
    }

    // 2a. Validate actionType against known types
    if (!isValidActionType(body.actionType)) {
      return res.status(400).json(
        buildRouteError(body.actionType, [{ code: 'INVALID_ACTION_TYPE', message: `Unknown actionType: '${body.actionType}'` }])
      );
    }

    if (!body.targetType) {
      return res.status(400).json(
        buildRouteError(body.actionType, [{ code: 'INVALID_REQUEST', message: 'targetType is required' }])
      );
    }

    if (body.projectId === undefined || body.projectId === null) {
      return res.status(400).json(
        buildRouteError(body.actionType, [{ code: 'INVALID_REQUEST', message: 'projectId is required' }])
      );
    }

    // 2b. Validate sourceSurface if provided
    if (body.sourceSurface && !isValidSourceSurface(body.sourceSurface)) {
      return res.status(400).json(
        buildRouteError(body.actionType, [{ code: 'INVALID_SOURCE_SURFACE', message: `Unknown sourceSurface: '${body.sourceSurface}'` }])
      );
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
    const httpStatus = response.success
      ? 200
      : response.errors.some(e => e.code === 'UNKNOWN_ACTION') ? 404
      : response.errors.some(e => e.code === 'PERMISSION_DENIED') ? 403
      : response.errors.some(e => e.code === 'CIRCUIT_OPEN') ? 503
      : response.errors.some(e => e.code === 'ACTION_TIMEOUT') ? 504
      : 400;
    return res.status(httpStatus).json(response);
  } catch (err: any) {
    console.error('[AI Actions Route] Unhandled error:', err);
    return res.status(500).json(
      buildRouteError(req.body?.actionType || 'unknown', [{ code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' }])
    );
  }
});

// ---------------------------------------------------------------------------
// GET /api/ai-actions/types (requires auth)
// ---------------------------------------------------------------------------

router.get('/types', (req: Request, res: Response) => {
  // Require authentication for action type enumeration
  try {
    getUserId(req);
  } catch {
    return res.status(401).json({ success: false, error: 'Authentication required' });
  }

  const actions = getRegisteredActions();
  return res.json({
    success: true,
    actions: actions.map(actionType => ({
      actionType,
      endpoint: 'POST /api/ai-actions/execute',
    })),
  });
});

// ---------------------------------------------------------------------------
// GET /api/ai-actions/health — Health check + metrics
// ---------------------------------------------------------------------------

router.get('/health', (_req: Request, res: Response) => {
  const metrics = getActionMetrics();
  const avgLatency = metrics.totalExecutions > 0
    ? Math.round(metrics.totalDurationMs / metrics.totalExecutions)
    : 0;

  return res.json({
    status: 'healthy',
    registeredActions: getRegisteredActions().length,
    metrics: {
      totalExecutions: metrics.totalExecutions,
      successRate: metrics.totalExecutions > 0
        ? `${((metrics.successCount / metrics.totalExecutions) * 100).toFixed(1)}%`
        : 'N/A',
      avgLatencyMs: avgLatency,
      circuitBreakerTrips: metrics.circuitBreakerTrips,
      idempotentHits: metrics.idempotentHits,
      timeouts: metrics.timeouts,
      retries: metrics.retries,
      byAction: metrics.byAction,
    },
    timestamp: new Date().toISOString(),
  });
});

export default router;
