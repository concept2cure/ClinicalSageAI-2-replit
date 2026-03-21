/**
 * Async Action Queue
 *
 * Uses Bull (Redis-backed) for durable, retryable async action processing.
 * Long-running actions (AI refinement, bulk exports) are enqueued rather
 * than executed inline, enabling:
 * - Horizontal scaling (multiple workers)
 * - Durable retry with backoff
 * - Dead letter queue for failed actions
 * - Progress tracking via SSE
 * - Graceful shutdown (drain before exit)
 *
 * Falls back to synchronous execution when Redis is unavailable.
 */

import Queue from 'bull';
import { getRedisClient, isRedisAvailable } from './redis-manager';
import { dispatchAction } from './action-registry';
import type { AIActionRequest, AIActionResponse } from '../../../shared/types/ai-actions';
import type { DispatchOptions } from './action-registry';
import { createScopedLogger } from '../../utils/logger';

const logger = createScopedLogger('action-queue');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface QueuedAction {
  request: AIActionRequest;
  options: DispatchOptions;
  enqueuedAt: string;
  priority: number;
}

export interface QueuedActionResult {
  jobId: string;
  status: 'queued' | 'active' | 'completed' | 'failed';
  response?: AIActionResponse;
  error?: string;
  progress?: number;
}

// ---------------------------------------------------------------------------
// Action types that should be queued (long-running)
// ---------------------------------------------------------------------------

const ASYNC_ACTION_TYPES = new Set([
  'refine_with_validation',
  'export_document',
]);

export function shouldQueueAction(actionType: string): boolean {
  return ASYNC_ACTION_TYPES.has(actionType);
}

// ---------------------------------------------------------------------------
// Queue instance
// ---------------------------------------------------------------------------

let actionQueue: Queue.Queue<QueuedAction> | null = null;
let initialized = false;

// In-flight tracking for graceful shutdown
const inFlightJobs = new Set<string>();

/**
 * Initialize the action queue. Call during server startup.
 */
export async function initializeActionQueue(): Promise<boolean> {
  if (initialized) return actionQueue !== null;
  initialized = true;

  if (!isRedisAvailable()) {
    logger.warn('Redis unavailable — async actions will execute synchronously');
    return false;
  }

  const redisUrl = process.env.REDIS_URL || process.env.REDIS_TLS_URL;
  if (!redisUrl) return false;

  try {
    actionQueue = new Queue<QueuedAction>('ai-action-queue', redisUrl, {
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
        removeOnComplete: {
          count: 500,      // Keep last 500 completed jobs
          age: 3600,       // ...or 1 hour
        },
        removeOnFail: {
          count: 200,      // Keep last 200 failed jobs for debugging
          age: 86400,      // ...or 24 hours
        },
        timeout: 180_000,  // 3 minutes max per job
      },
      settings: {
        stalledInterval: 30_000,    // Check for stalled jobs every 30s
        maxStalledCount: 2,         // Mark as failed after 2 stalls
      },
    });

    // Process jobs (concurrency = 3 per instance)
    actionQueue.process(3, async (job) => {
      const { request, options } = job.data;
      const jobId = String(job.id);
      inFlightJobs.add(jobId);

      try {
        logger.info(`Processing queued action`, { jobId, actionType: request.actionType });
        await job.progress(10);

        // Execute the action through the normal dispatcher
        // (forceExecution to bypass idempotency cache since this is a retry-safe queue)
        const response = await dispatchAction(request, { ...options, forceExecution: true });

        await job.progress(100);
        return response;
      } finally {
        inFlightJobs.delete(jobId);
      }
    });

    // Event handlers for monitoring
    actionQueue.on('completed', (job, result: AIActionResponse) => {
      logger.info(`Queued action completed`, {
        jobId: job.id,
        actionType: job.data.request.actionType,
        success: result?.success,
      });
      emitJobUpdate(String(job.id), 'completed', result);
    });

    actionQueue.on('failed', (job, err) => {
      logger.error(`Queued action failed`, {
        jobId: job.id,
        actionType: job.data.request.actionType,
        error: err.message,
        attempts: job.attemptsMade,
      });
      emitJobUpdate(String(job.id), 'failed', undefined, err.message);
    });

    actionQueue.on('stalled', (job) => {
      logger.warn(`Queued action stalled`, { jobId: job.id });
    });

    logger.info('Action queue initialized (Bull/Redis)');
    return true;
  } catch (err: any) {
    logger.error('Failed to initialize action queue', { error: err.message });
    actionQueue = null;
    return false;
  }
}

// ---------------------------------------------------------------------------
// Enqueue
// ---------------------------------------------------------------------------

/**
 * Enqueue an action for async processing.
 * Returns a job ID that can be polled for status.
 * Falls back to synchronous execution if queue unavailable.
 */
export async function enqueueAction(
  request: AIActionRequest,
  options: DispatchOptions
): Promise<{ jobId: string; queued: boolean; response?: AIActionResponse }> {
  if (!actionQueue) {
    // Fallback: execute synchronously
    const response = await dispatchAction(request, options);
    return { jobId: `sync-${Date.now()}`, queued: false, response };
  }

  const priority = request.actionType === 'refine_with_validation' ? 2 : 1; // Lower = higher priority

  const job = await actionQueue.add(
    {
      request,
      options,
      enqueuedAt: new Date().toISOString(),
      priority,
    },
    { priority }
  );

  logger.info(`Action enqueued`, { jobId: job.id, actionType: request.actionType });
  return { jobId: String(job.id), queued: true };
}

// ---------------------------------------------------------------------------
// Status polling
// ---------------------------------------------------------------------------

/**
 * Get the status of a queued action by job ID.
 */
export async function getQueuedActionStatus(jobId: string): Promise<QueuedActionResult> {
  if (!actionQueue) {
    return { jobId, status: 'failed', error: 'Queue not available' };
  }

  const job = await actionQueue.getJob(jobId);
  if (!job) {
    return { jobId, status: 'failed', error: 'Job not found' };
  }

  const state = await job.getState();
  const progress = job.progress();

  switch (state) {
    case 'completed':
      return { jobId, status: 'completed', response: job.returnvalue, progress: 100 };
    case 'failed':
      return { jobId, status: 'failed', error: job.failedReason || 'Unknown error', progress: typeof progress === 'number' ? progress : 0 };
    case 'active':
      return { jobId, status: 'active', progress: typeof progress === 'number' ? progress : 0 };
    default:
      return { jobId, status: 'queued', progress: 0 };
  }
}

// ---------------------------------------------------------------------------
// Queue metrics
// ---------------------------------------------------------------------------

export async function getQueueMetrics(): Promise<{
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
} | null> {
  if (!actionQueue) return null;

  try {
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      actionQueue.getWaitingCount(),
      actionQueue.getActiveCount(),
      actionQueue.getCompletedCount(),
      actionQueue.getFailedCount(),
      actionQueue.getDelayedCount(),
    ]);
    return { waiting, active, completed, failed, delayed };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// SSE event emission (job status updates)
// ---------------------------------------------------------------------------

type JobUpdateHandler = (jobId: string, status: string, result?: AIActionResponse, error?: string) => void;
const jobUpdateListeners = new Set<JobUpdateHandler>();

export function onJobUpdate(handler: JobUpdateHandler): () => void {
  jobUpdateListeners.add(handler);
  return () => jobUpdateListeners.delete(handler);
}

function emitJobUpdate(jobId: string, status: string, result?: AIActionResponse, error?: string): void {
  for (const handler of jobUpdateListeners) {
    try {
      handler(jobId, status, result, error);
    } catch { /* listener errors must not break queue */ }
  }
}

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------

/**
 * Drain the queue and wait for in-flight jobs to complete.
 * Call during server shutdown.
 */
export async function drainActionQueue(timeoutMs = 15_000): Promise<void> {
  if (!actionQueue) return;

  logger.info('Draining action queue...', { inFlight: inFlightJobs.size });

  try {
    // Stop accepting new jobs
    await actionQueue.pause(true);

    // Wait for in-flight jobs (with timeout)
    const deadline = Date.now() + timeoutMs;
    while (inFlightJobs.size > 0 && Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 500));
    }

    if (inFlightJobs.size > 0) {
      logger.warn(`Shutdown timeout — ${inFlightJobs.size} jobs still in flight`);
    }

    await actionQueue.close();
    actionQueue = null;
    logger.info('Action queue drained and closed');
  } catch (err: any) {
    logger.error('Error draining action queue', { error: err.message });
  }
}
