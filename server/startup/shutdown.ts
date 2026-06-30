/**
 * Graceful shutdown + process error handlers.
 *
 * Extracted from server/index.ts. Preserves:
 *  - HTTP drain (10s force-close timeout)
 *  - Python subprocess termination
 *  - Redis rate limiter teardown
 *  - AI action queue drain (10s) + SSE close + Redis close
 *  - Performance middleware cleanup
 *  - DB pool close
 *  - SIGTERM / SIGINT handlers
 *  - unhandledRejection circuit breaker (exit only on a burst within a rolling
 *    window; a slow trickle ages out and never trips)
 *  - uncaughtException: attempt a bounded graceful drain, then safety exit(1)
 */

import type { Pool } from 'pg';
import { closeRedisRateLimiter } from '../middleware/redisRateLimiter';
import { cleanup as cleanupPerformance } from '../middleware/enterprise-performance.js';

type AnyServer = { close: (cb?: () => void) => void } | null;

interface ShutdownContext {
  getHttpServer: () => AnyServer;
  getPythonProcess: () => { kill: (signal: string) => void } | null;
  pool: Pool;
}

export async function gracefulShutdown(signal: string, ctx: ShutdownContext): Promise<never> {
  console.log(`🔄 Graceful shutdown initiated (${signal})...`);

  const httpServer = ctx.getHttpServer();
  if (httpServer) {
    console.log('🔄 Draining HTTP connections...');
    await new Promise<void>(resolve => {
      httpServer.close(() => {
        console.log('✅ HTTP server closed — all connections drained');
        resolve();
      });
      setTimeout(() => {
        console.log('⚠️ Force closing after 10s timeout');
        resolve();
      }, 10000);
    });
  }

  const pythonProcess = ctx.getPythonProcess();
  if (pythonProcess) {
    console.log('🔄 Shutting down Python backend...');
    pythonProcess.kill('SIGTERM');
  }

  try {
    await closeRedisRateLimiter();
    console.log('✅ Redis rate limiter closed');
  } catch (error: any) {
    console.error('❌ Error closing Redis rate limiter:', error.message);
  }

  try {
    const { drainActionQueue, closeAllSSEConnections, closeRedis } = await import(
      '../services/ai-actions/index'
    );
    closeAllSSEConnections();
    await drainActionQueue(10_000);
    await closeRedis();
    console.log('AI Actions infrastructure shut down');
  } catch (error: any) {
    console.error('Error shutting down AI Actions:', error.message);
  }

  cleanupPerformance();

  // Stop all scheduled job timers before closing the DB pool — they
  // query through the pool on their cycles and would error if a tick
  // happened to fire mid-shutdown.
  try {
    const { stopChainMonitor } = await import('../services/audit/chainIntegrityMonitor.js');
    stopChainMonitor();
  } catch (error: any) {
    console.warn('⚠️ Chain integrity monitor stop failed:', error.message);
  }

  try {
    const { stopDriftSentinelSchedule } = await import('../jobs/driftSentinelSweep');
    stopDriftSentinelSchedule();
  } catch (error: any) {
    console.warn('⚠️ Drift sentinel schedule stop failed:', error.message);
  }

  try {
    const { stopScheduleOfEventsSweep } = await import('../jobs/scheduleOfEventsSweep');
    stopScheduleOfEventsSweep();
  } catch (error: any) {
    console.warn('⚠️ Schedule-of-events sweep stop failed:', error.message);
  }

  // Stop all node-cron scheduled tasks (audit chain check, corpus
  // ingestion, regulatory horizon scan, external intelligence sweep,
  // periodic review). node-cron's getTasks() returns a Map of all
  // registered tasks; stopping them prevents DB queries after pool close.
  try {
    const cron = await import('node-cron');
    const tasks = cron.getTasks();
    for (const [, task] of tasks) {
      task.stop();
    }
  } catch (error: any) {
    console.warn('⚠️ Cron task shutdown failed:', error.message);
  }

  try {
    if (ctx.pool) await ctx.pool.end();
    console.log('✅ Database connections closed');
  } catch (error: any) {
    console.error('❌ Error closing database:', error.message);
  }

  process.exit(0);
}

export function registerShutdownHandlers(ctx: ShutdownContext): void {
  process.on('SIGTERM', () => void gracefulShutdown('SIGTERM', ctx));
  process.on('SIGINT', () => void gracefulShutdown('SIGINT', ctx));

  // Unhandled-rejection circuit breaker. We only want to bail when rejections
  // arrive in a *burst* (a real cascade), not when a slow trickle accumulates
  // over the lifetime of the process. So the counter ages out: each rejection
  // is timestamped and we only count those within a rolling window. A handful
  // of unrelated rejections spread over hours will never trip the breaker.
  const REJECTION_WINDOW_MS = 60_000; // only rejections within the last minute count
  const REJECTION_BURST_LIMIT = 10; // ...and only a burst of this many trips exit
  let rejectionTimestamps: number[] = [];
  process.on('unhandledRejection', (reason, promise) => {
    console.error('🚨 Unhandled Rejection at:', promise, 'reason:', reason);
    const now = Date.now();
    rejectionTimestamps.push(now);
    // Age out anything older than the window so a slow trickle decays away.
    rejectionTimestamps = rejectionTimestamps.filter(ts => now - ts <= REJECTION_WINDOW_MS);
    if (rejectionTimestamps.length >= REJECTION_BURST_LIMIT) {
      console.error(
        `🚨 ${rejectionTimestamps.length} unhandled rejections within ${REJECTION_WINDOW_MS / 1000}s — shutting down`
      );
      process.exit(1);
    }
  });

  process.on('uncaughtException', error => {
    console.error('UNCAUGHT EXCEPTION:', error);
    // Attempt a graceful drain before the safety exit so in-flight work and
    // open connections are flushed/closed. gracefulShutdown ends in
    // process.exit(0); a bounded timer guarantees we still exit(1) even if the
    // drain wedges. We never *skip* the exit — only try to drain first.
    const FORCE_EXIT_MS = 12_000;
    const forceExit = setTimeout(() => {
      console.error('⚠️ Graceful drain timed out after uncaughtException — forcing exit');
      process.exit(1);
    }, FORCE_EXIT_MS);
    // Do not keep the event loop alive solely for this timer.
    if (typeof forceExit.unref === 'function') forceExit.unref();
    gracefulShutdown('uncaughtException', ctx).catch(drainError => {
      console.error('❌ Graceful drain failed after uncaughtException:', drainError);
      process.exit(1);
    });
  });
}
