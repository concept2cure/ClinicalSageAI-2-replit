/**
 * Server-Sent Events (SSE) Stream for Action Status
 *
 * Provides real-time updates to clients about queued action progress.
 * Clients connect to GET /api/ai-actions/stream?jobId=XXX and receive
 * status updates as they happen.
 */

import { Request, Response } from 'express';
import { onJobUpdate, isJobOwner } from './action-queue';
import type { AIActionResponse } from '../../../shared/types/ai-actions';
import { createScopedLogger } from '../../utils/logger';
import { openSseStream } from '../../utils/sse-stream';

const logger = createScopedLogger('sse-stream');
const allowedSseOrigins = new Set(
  (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean)
);

// ---------------------------------------------------------------------------
// Active SSE connections
// ---------------------------------------------------------------------------

interface SSEConnection {
  res: Response;
  jobId: string;
  userId: number;
  connectedAt: number;
  lastActivity: number;
}

const activeConnections = new Map<string, SSEConnection>();
const MAX_CONNECTIONS_PER_USER = 5;
// Idle window — measured from last event/keepalive write, not from connect.
// Long-running AI actions (multi-step generations, model-side queueing) can
// take well over the previous hard 5-minute cap, so we now only close
// connections that have been TRULY idle (no events, no keepalive ack) for
// this long. Default 30 minutes; tune via SSE_IDLE_TIMEOUT_MS env var.
const SSE_IDLE_TIMEOUT_MS = (() => {
  const raw = Number(process.env.SSE_IDLE_TIMEOUT_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : 30 * 60 * 1000;
})();
// Cadence of the idle-watchdog. Independent of the keepalive write cadence.
const SSE_IDLE_CHECK_MS = 30_000;

// ---------------------------------------------------------------------------
// SSE Handler
// ---------------------------------------------------------------------------

/**
 * SSE endpoint handler. Mount as GET /api/ai-actions/stream
 */
export function handleSSEStream(req: Request, res: Response): void {
  const jobId = req.query.jobId as string;
  const userId = (req as any).user?.id || (req as any).userId;
  const origin = req.headers.origin;

  if (origin && allowedSseOrigins.size > 0 && !allowedSseOrigins.has(origin)) {
    res.status(403).json({ error: 'SSE origin not allowed' });
    return;
  }

  if (!jobId) {
    res.status(400).json({ error: 'jobId query parameter required' });
    return;
  }

  if (!userId) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  // Verify job ownership — users can only stream their own jobs
  if (!isJobOwner(jobId, userId)) {
    res.status(403).json({ error: 'Not authorized to monitor this job' });
    return;
  }

  // Check connection limit per user
  let userConnCount = 0;
  for (const conn of activeConnections.values()) {
    if (conn.userId === userId) userConnCount++;
  }
  if (userConnCount >= MAX_CONNECTIONS_PER_USER) {
    res.status(429).json({ error: 'Too many SSE connections' });
    return;
  }

  const connectionId = `${userId}-${jobId}-${Date.now()}`;
  const conn: SSEConnection = {
    res,
    jobId,
    userId,
    connectedAt: Date.now(),
    lastActivity: Date.now(),
  };
  activeConnections.set(connectionId, conn);

  // SSE headers and a heartbeat every 15 s, which also counts as activity
  // for the idle watchdog below (server/utils/sse-stream.ts).
  const sse = openSseStream(req, res, {
    onHeartbeat: () => {
      conn.lastActivity = Date.now();
    },
  });

  // Send initial connection confirmation
  sendSSEEvent(res, 'connected', { jobId, connectionId });

  // Idle watchdog — fires periodically; only closes the connection when the
  // last activity (event OR keepalive write) is older than the idle window.
  // Long-running jobs that emit progress regularly never trip this. Stuck
  // connections that go truly silent get closed.
  const idleWatchdog = setInterval(() => {
    const idleFor = Date.now() - conn.lastActivity;
    if (idleFor < SSE_IDLE_TIMEOUT_MS) return;
    try {
      sendSSEEvent(res, 'timeout', {
        message: 'Connection idle timeout',
        idleMs: idleFor,
      });
      res.end();
    } catch { /* already closed */ }
    cleanup();
  }, SSE_IDLE_CHECK_MS);

  // Cleanup on disconnect
  const cleanup = () => {
    sse.end();
    clearInterval(idleWatchdog);
    activeConnections.delete(connectionId);
    logger.debug(`SSE connection closed`, { connectionId, jobId });
  };

  req.on('close', cleanup);
  req.on('error', cleanup);

  logger.debug(`SSE connection opened`, { connectionId, jobId, userId });
}

// ---------------------------------------------------------------------------
// Broadcast job updates to connected SSE clients
// ---------------------------------------------------------------------------

// Register global listener for job updates
let listenerRegistered = false;

export function initializeSSEBroadcaster(): void {
  if (listenerRegistered) return;
  listenerRegistered = true;

  onJobUpdate((jobId, status, result, error) => {
    for (const [, conn] of activeConnections) {
      if (conn.jobId === jobId) {
        try {
          sendSSEEvent(conn.res, 'job-update', {
            jobId,
            status,
            success: result?.success,
            result: result?.result || null,
            error: error || null,
            timestamp: new Date().toISOString(),
          });

          // Close connection after terminal states
          if (status === 'completed' || status === 'failed') {
            sendSSEEvent(conn.res, 'done', { jobId, status });
            conn.res.end();
          }
        } catch {
          // Connection already closed
        }
      }
    }
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sendSSEEvent(res: Response, event: string, data: unknown): void {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

/**
 * Get count of active SSE connections (for health check).
 */
export function getSSEConnectionCount(): number {
  return activeConnections.size;
}

/**
 * Close all SSE connections (for graceful shutdown).
 */
export function closeAllSSEConnections(): void {
  for (const [id, conn] of activeConnections) {
    try {
      sendSSEEvent(conn.res, 'shutdown', { message: 'Server shutting down' });
      conn.res.end();
    } catch { /* already closed */ }
    activeConnections.delete(id);
  }
}
