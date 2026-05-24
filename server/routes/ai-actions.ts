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
import {
  shouldQueueAction,
  enqueueAction,
  getQueuedActionStatus,
  getQueueMetrics,
} from '../services/ai-actions/action-queue';
import { getConcurrencyMetrics } from '../services/ai-actions/concurrency-limiter';
import { getRedisHealth } from '../services/ai-actions/redis-manager';
import { handleSSEStream, getSSEConnectionCount } from '../services/ai-actions/sse-stream';
import type { AIActionRequest, AIActionResponse, AIActionSourceSurface } from '../../shared/types/ai-actions';

import { createScopedLogger } from '../utils/logger.js';

const logger = createScopedLogger('ai-actions');

const router = Router();

// ---------------------------------------------------------------------------
// Error helper
// ---------------------------------------------------------------------------

function buildRouteError(
  actionType: string,
  errors: { code: string; message: string }[],
  correlationId?: string
): AIActionResponse {
  return {
    success: false,
    actionType: actionType as any,
    status: 'failed',
    result: null,
    createdObjects: [],
    updatedObjects: [],
    warnings: correlationId ? [`correlation_id:${correlationId}`] : [],
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

function resolveCorrelationId(req: Request): string {
  return (
    String(req.headers['x-correlation-id'] || '').trim() ||
    `ai-actions-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  );
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
  if (req.user?.organizationId != null) {
    const orgId = typeof req.user.organizationId === 'number'
      ? req.user.organizationId
      : parseInt(String(req.user.organizationId), 10);
    if (!isNaN(orgId)) return orgId;
  }
  throw new Error('Organization context required');
}

function getUserId(req: Request): number {
  if (req.userId != null) {
    const id = typeof req.userId === 'number' ? req.userId : parseInt(String(req.userId), 10);
    if (!isNaN(id)) return id;
  }
  if (req.user?.id != null) {
    const id = typeof req.user.id === 'number' ? req.user.id : parseInt(String(req.user.id), 10);
    if (!isNaN(id)) return id;
  }
  throw new Error('Authentication required');
}

function getUserName(req: Request): string {
  return (req.user as { name?: string } | undefined)?.name || req.user?.email || `user-${getUserId(req)}`;
}

function getUserRole(req: Request): string {
  return req.user?.role || 'user';
}

// ---------------------------------------------------------------------------
// POST /api/ai-actions/execute
// ---------------------------------------------------------------------------

router.post('/execute', async (req: Request, res: Response) => {
  const correlationId = resolveCorrelationId(req);
  res.setHeader('x-correlation-id', correlationId);
  try {
    // 1. Auth
    let organizationId: number;
    let userId: number;
    try {
      organizationId = getOrganizationId(req);
      userId = getUserId(req);
    } catch (err: any) {
      return res.status(401).json(
        buildRouteError(
          req.body?.actionType || 'unknown',
          [{ code: 'AUTH_REQUIRED', message: err.message }],
          correlationId
        )
      );
    }

    // 2. Validate request body
    const body = req.body;
    if (!body || !body.actionType) {
      return res.status(400).json(
        buildRouteError(
          'unknown',
          [{ code: 'INVALID_REQUEST', message: 'actionType is required' }],
          correlationId
        )
      );
    }

    // 2a. Validate actionType against known types
    if (!isValidActionType(body.actionType)) {
      return res.status(400).json(
        buildRouteError(
          body.actionType,
          [{ code: 'INVALID_ACTION_TYPE', message: `Unknown actionType: '${body.actionType}'` }],
          correlationId
        )
      );
    }

    if (!body.targetType) {
      return res.status(400).json(
        buildRouteError(
          body.actionType,
          [{ code: 'INVALID_REQUEST', message: 'targetType is required' }],
          correlationId
        )
      );
    }

    if (body.projectId === undefined || body.projectId === null) {
      return res.status(400).json(
        buildRouteError(
          body.actionType,
          [{ code: 'INVALID_REQUEST', message: 'projectId is required' }],
          correlationId
        )
      );
    }

    // 2b. Validate sourceSurface if provided
    if (body.sourceSurface && !isValidSourceSurface(body.sourceSurface)) {
      return res.status(400).json(
        buildRouteError(
          body.actionType,
          [{ code: 'INVALID_SOURCE_SURFACE', message: `Unknown sourceSurface: '${body.sourceSurface}'` }],
          correlationId
        )
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

    const dispatchOptions = {
      ipAddress: req.ip || req.socket.remoteAddress || '0.0.0.0',
      sessionId: req.sessionId,
      user: actionRequest.requestedBy!,
    };

    // 4. Route long-running actions to async queue if available
    const async = body.async === true || shouldQueueAction(actionRequest.actionType);
    if (async && body.async !== false) {
      const { jobId, queued, response: syncResponse } = await enqueueAction(actionRequest, dispatchOptions);

      if (!queued && syncResponse) {
        // Queue unavailable — fell back to sync execution; signal this to client
        return res.status(syncResponse.success ? 200 : 400).json({
          ...syncResponse,
          _meta: {
            ...(syncResponse as any)._meta,
            correlationId,
            fallback: true,
            reason: 'Async queue unavailable — executed synchronously',
          },
        });
      }

      return res.status(202).json({
        success: true,
        queued: true,
        jobId,
        statusUrl: `/api/ai-actions/jobs/${jobId}`,
        streamUrl: `/api/ai-actions/stream?jobId=${jobId}`,
        message: `Action '${actionRequest.actionType}' enqueued for async processing`,
        _meta: { correlationId },
      });
    }

    // 5. Synchronous dispatch
    const response = await dispatchAction(actionRequest, dispatchOptions);

    // 6. Return with appropriate HTTP status
    const httpStatus = response.success
      ? 200
      : response.errors.some(e => e.code === 'UNKNOWN_ACTION') ? 404
      : response.errors.some(e => e.code === 'PERMISSION_DENIED') ? 403
      : response.errors.some(e => e.code === 'CIRCUIT_OPEN') ? 503
      : response.errors.some(e => e.code === 'ACTION_TIMEOUT') ? 504
      : response.errors.some(e => e.code === 'CONCURRENCY_LIMIT') ? 429
      : response.errors.some(e => e.code === 'LOCK_CONTENTION') ? 409
      : 400;
    return res.status(httpStatus).json({
      ...response,
      _meta: { ...(response as any)._meta, correlationId },
    });
  } catch (err: any) {
    logger.error('Unhandled error', { err: err instanceof Error ? err.message : String(err) });
    return res.status(500).json(
      buildRouteError(
        req.body?.actionType || 'unknown',
        [{ code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' }],
        correlationId
      )
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
// GET /api/ai-actions/jobs/:jobId — Poll async job status
// ---------------------------------------------------------------------------

router.get('/jobs/:jobId', async (req: Request, res: Response) => {
  try {
    getUserId(req);
  } catch {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const result = await getQueuedActionStatus(String(req.params.jobId));
  const httpStatus = result.status === 'completed' ? 200
    : result.status === 'failed' ? 422
    : result.status === 'active' ? 200
    : 200;

  return res.status(httpStatus).json(result);
});

// ---------------------------------------------------------------------------
// DELETE /api/ai-actions/jobs/:jobId — Cancel a queued job
// ---------------------------------------------------------------------------

router.delete('/jobs/:jobId', async (req: Request, res: Response) => {
  try {
    getUserId(req);
  } catch {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const { cancelQueuedAction } = await import('../services/ai-actions/action-queue');
  const result = await cancelQueuedAction(String(req.params.jobId));

  if (!result.success) {
    return res.status(result.status === 'not_found' ? 404 : 409).json(result);
  }
  return res.json(result);
});

// ---------------------------------------------------------------------------
// GET /api/ai-actions/history — Query action audit history
// ---------------------------------------------------------------------------

router.get('/history', async (req: Request, res: Response) => {
  let organizationId: number;
  try {
    organizationId = getOrganizationId(req);
    getUserId(req);
  } catch (err: any) {
    return res.status(401).json({ error: err.message });
  }

  const { getActionHistory } = await import('../services/ai-actions/action-history');
  const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
  const offset = parseInt(req.query.offset as string) || 0;
  const actionType = req.query.actionType as string | undefined;
  const projectId = req.query.projectId ? Number(req.query.projectId) : undefined;

  const history = await getActionHistory(organizationId, { limit, offset, actionType, projectId });
  return res.json({ success: true, ...history });
});

// ---------------------------------------------------------------------------
// GET /api/ai-actions/stream — SSE stream for real-time job updates
// ---------------------------------------------------------------------------

router.get('/stream', handleSSEStream);

// ---------------------------------------------------------------------------
// GET /api/ai-actions/health — Deep health check with dependency probes
// ---------------------------------------------------------------------------

router.get('/health', async (req: Request, res: Response) => {
  const [dispatchMetrics, queueMetrics, concurrencyMetrics, redisHealth, dbHealth] = await Promise.all([
    Promise.resolve(getActionMetrics()),
    getQueueMetrics(),
    getConcurrencyMetrics(),
    getRedisHealth(),
    checkDatabaseHealth(),
  ]);

  const avgLatency = dispatchMetrics.totalExecutions > 0
    ? Math.round(dispatchMetrics.totalDurationMs / dispatchMetrics.totalExecutions)
    : 0;

  // Derive health status from dependency checks
  const dbOk = dbHealth.available;
  const redisOk = redisHealth.available;
  const status = !dbOk ? 'unhealthy' : !redisOk ? 'degraded' : 'healthy';
  const httpStatus = status === 'unhealthy' ? 503 : 200;

  // Require auth for detailed metrics (unauthenticated gets basic health only)
  let isAuthenticated = false;
  try { getUserId(req); isAuthenticated = true; } catch { /* ok */ }

  const basicHealth = {
    status,
    registeredActions: getRegisteredActions().length,
    uptime: Math.round(process.uptime()),
    dependencies: {
      database: { available: dbOk, latencyMs: dbHealth.latencyMs },
      redis: { available: redisOk, latencyMs: redisHealth.latencyMs },
    },
    timestamp: new Date().toISOString(),
  };

  if (!isAuthenticated) {
    return res.status(httpStatus).json(basicHealth);
  }

  // Authenticated: return full metrics
  return res.status(httpStatus).json({
    ...basicHealth,
    dispatcher: {
      totalExecutions: dispatchMetrics.totalExecutions,
      successRate: dispatchMetrics.totalExecutions > 0
        ? `${((dispatchMetrics.successCount / dispatchMetrics.totalExecutions) * 100).toFixed(1)}%`
        : 'N/A',
      avgLatencyMs: avgLatency,
      circuitBreakerTrips: dispatchMetrics.circuitBreakerTrips,
      idempotentHits: dispatchMetrics.idempotentHits,
      timeouts: dispatchMetrics.timeouts,
      retries: dispatchMetrics.retries,
      byAction: dispatchMetrics.byAction,
    },
    queue: queueMetrics || { status: 'unavailable (no Redis)' },
    concurrency: concurrencyMetrics,
    redis: {
      available: redisHealth.available,
      latencyMs: redisHealth.latencyMs,
      ...(redisHealth.info || {}),
    },
    sse: {
      activeConnections: getSSEConnectionCount(),
    },
  });
});

// ---------------------------------------------------------------------------
// Database health probe
// ---------------------------------------------------------------------------

async function checkDatabaseHealth(): Promise<{ available: boolean; latencyMs: number | null }> {
  try {
    const { db } = await import('../db');
    const start = Date.now();
    await (db as any).execute({ sql: 'SELECT 1' });
    return { available: true, latencyMs: Date.now() - start };
  } catch {
    return { available: false, latencyMs: null };
  }
}

export default router;
