/**
 * Graceful shutdown + process error handlers.
 *
 * Extracted from server/index.ts. Preserves:
 *  - AnA's live runs ended as `server_shutdown` BEFORE the drain, and the
 *    turns' own unwinding (their stopped answers and records) drained with
 *    the HTTP connections, in the same 10s window (AnA detach DT3)
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

/**
 * The drain window, shared by the HTTP drain and AnA's turns. ECS sends
 * SIGKILL `stopTimeout` after SIGTERM — 30 s on Fargate when the task
 * definition sets none, as terraform/modules/ecs-fargate/main.tf does not —
 * and this drain plus the AI action queue's (10 s) must finish inside it.
 */
const SHUTDOWN_DRAIN_MS = 10_000;

/**
 * How long ending AnA's owned runs may take before the drain begins (DT3
 * review, INF-41). The writes go one organisation after another under the
 * pool's 30 s statement timeout, so a slow database could otherwise use the
 * whole SIGKILL window before the drain started. Past it, every owned turn is
 * stopped locally anyway — nothing runs past the process — and a row left live
 * is ended by the reaper as `orphaned`.
 */
export const SHUTDOWN_RUN_SETTLE_MS = 3_000;

interface ShutdownContext {
  getHttpServer: () => AnyServer;
  pool: Pool;
}

/**
 * Drain, then exit with `exitCode`: 0 for a requested stop (SIGTERM, SIGINT),
 * non-zero for a crash. The drain is the same either way; what the process
 * reports about itself must not be. ECS records an essential container's exit
 * code as the task's stop reason, and a crash reported as 0 reads as success.
 */
export async function gracefulShutdown(
  signal: string,
  ctx: ShutdownContext,
  exitCode = 0,
): Promise<never> {
  console.log(`🔄 Graceful shutdown initiated (${signal})...`);

  // AnA (detach DT3, docs/design/ANA_DETACH_2026-10-08.md §7): a turn whose
  // page closed goes on in this process, with no socket the HTTP drain could
  // wait on. Every run this process owns is ended honestly FIRST —
  // failed/server_shutdown on its row, in its own tenant, then aborted with
  // that reason — so a turn that finishes in the drain records
  // stopped/server_shutdown to match its row, never `answered`. The turns
  // then unwind inside the same window as the HTTP drain.
  let anaTurnsSettled: Promise<boolean> = Promise.resolve(true);
  try {
    const { settleOwnedRunsForShutdown, abortOwnedRunsForShutdown } = await import('../services/ana/run-control.js');
    const { ownedWorkSettled } = await import('../services/ana/shutdown-hold.js');
    let deadline: ReturnType<typeof setTimeout> | null = null;
    const ended = await Promise.race([
      settleOwnedRunsForShutdown(ctx.pool).then(() => true),
      new Promise<false>(resolve => {
        deadline = setTimeout(() => resolve(false), SHUTDOWN_RUN_SETTLE_MS);
      }),
    ]);
    if (deadline) clearTimeout(deadline);
    if (!ended) {
      const stopped = abortOwnedRunsForShutdown();
      console.warn(
        `⚠️ AnA runs were not all written as ended within ${SHUTDOWN_RUN_SETTLE_MS} ms; ${stopped} turn(s) stopped locally (the reaper ends their rows)`,
      );
    }
    anaTurnsSettled = ownedWorkSettled(SHUTDOWN_DRAIN_MS);
  } catch (error: any) {
    console.warn('⚠️ AnA runs could not be ended before the drain:', error.message);
  }

  const httpServer = ctx.getHttpServer();
  const httpDrained = !httpServer
    ? Promise.resolve()
    : new Promise<void>(resolve => {
        console.log('🔄 Draining HTTP connections...');
        httpServer.close(() => {
          console.log('✅ HTTP server closed — all connections drained');
          resolve();
        });
        setTimeout(() => {
          console.log('⚠️ Force closing after 10s timeout');
          resolve();
        }, SHUTDOWN_DRAIN_MS);
      });
  const [, turnsSettled] = await Promise.all([httpDrained, anaTurnsSettled]);
  if (!turnsSettled) console.warn('⚠️ Some AnA turns had not recorded themselves within the drain window');

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

  // Stop the audit chain integrity monitor before closing the DB pool —
  // it queries through the pool on its 5-min cycle and would error if a
  // check happened to fire mid-shutdown.
  try {
    const { stopChainMonitor } = await import('../services/audit/chainIntegrityMonitor.js');
    stopChainMonitor();
  } catch (error: any) {
    console.warn('⚠️ Chain integrity monitor stop failed:', error.message);
  }

  // AnA's run-control LISTEN connection is checked out for the life of the
  // process, and pool.end() waits for every checked-out client — so without
  // this the drain hung at the line below and never reached process.exit.
  try {
    const { stopRunControlListener } = await import('../services/ana/run-control.js');
    stopRunControlListener();
  } catch (error: any) {
    console.warn('⚠️ AnA run-control listener stop failed:', error.message);
  }

  try {
    if (ctx.pool) await ctx.pool.end();
    console.log('✅ Database connections closed');
  } catch (error: any) {
    console.error('❌ Error closing database:', error.message);
  }

  process.exit(exitCode);
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
    // open connections are flushed/closed. The drain exits 1 when it finishes
    // (it used to exit 0, reporting every crash as a clean stop); a bounded
    // timer guarantees exit(1) even if the drain wedges. We never *skip* the
    // exit — only try to drain first.
    const FORCE_EXIT_MS = 12_000;
    const forceExit = setTimeout(() => {
      console.error('⚠️ Graceful drain timed out after uncaughtException — forcing exit');
      process.exit(1);
    }, FORCE_EXIT_MS);
    // Do not keep the event loop alive solely for this timer.
    if (typeof forceExit.unref === 'function') forceExit.unref();
    gracefulShutdown('uncaughtException', ctx, 1).catch(drainError => {
      console.error('❌ Graceful drain failed after uncaughtException:', drainError);
      process.exit(1);
    });
  });
}
