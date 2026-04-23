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
 *  - unhandledRejection counter (exit after 10)
 *  - uncaughtException fatal exit
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

  let unhandledRejectionCount = 0;
  process.on('unhandledRejection', (reason, promise) => {
    console.error('🚨 Unhandled Rejection at:', promise, 'reason:', reason);
    unhandledRejectionCount++;
    if (unhandledRejectionCount >= 10) {
      console.error('🚨 Too many unhandled rejections — shutting down');
      process.exit(1);
    }
  });

  process.on('uncaughtException', error => {
    console.error('UNCAUGHT EXCEPTION:', error);
    process.exit(1);
  });
}
