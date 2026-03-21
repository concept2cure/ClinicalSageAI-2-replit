/**
 * Server-Sent Events (SSE) Stream for Action Status
 *
 * Provides real-time updates to clients about queued action progress.
 * Clients connect to GET /api/ai-actions/stream?jobId=XXX and receive
 * status updates as they happen.
 */

import { Request, Response } from 'express';
import { onJobUpdate } from './action-queue';
import type { AIActionResponse } from '../../../shared/types/ai-actions';
import { createScopedLogger } from '../../utils/logger';

const logger = createScopedLogger('sse-stream');

// ---------------------------------------------------------------------------
// Active SSE connections
// ---------------------------------------------------------------------------

interface SSEConnection {
  res: Response;
  jobId: string;
  userId: number;
  connectedAt: number;
}

const activeConnections = new Map<string, SSEConnection>();
const MAX_CONNECTIONS_PER_USER = 5;
const SSE_KEEPALIVE_MS = 15_000;
const SSE_IDLE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes max per connection

// ---------------------------------------------------------------------------
// SSE Handler
// ---------------------------------------------------------------------------

/**
 * SSE endpoint handler. Mount as GET /api/ai-actions/stream
 */
export function handleSSEStream(req: Request, res: Response): void {
  const jobId = req.query.jobId as string;
  const userId = (req as any).user?.id || (req as any).userId;

  if (!jobId) {
    res.status(400).json({ error: 'jobId query parameter required' });
    return;
  }

  if (!userId) {
    res.status(401).json({ error: 'Authentication required' });
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

  // Set SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no', // Disable nginx buffering
  });

  const connectionId = `${userId}-${jobId}-${Date.now()}`;
  activeConnections.set(connectionId, {
    res,
    jobId,
    userId,
    connectedAt: Date.now(),
  });

  // Send initial connection confirmation
  sendSSEEvent(res, 'connected', { jobId, connectionId });

  // Keepalive ping
  const keepalive = setInterval(() => {
    try {
      res.write(':ping\n\n');
    } catch {
      cleanup();
    }
  }, SSE_KEEPALIVE_MS);

  // Idle timeout — auto-close stale connections
  const idleTimeout = setTimeout(() => {
    try {
      sendSSEEvent(res, 'timeout', { message: 'Connection idle timeout' });
      res.end();
    } catch { /* already closed */ }
    cleanup();
  }, SSE_IDLE_TIMEOUT_MS);

  // Cleanup on disconnect
  const cleanup = () => {
    clearInterval(keepalive);
    clearTimeout(idleTimeout);
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
