/**
 * A process that dies of an uncaught exception must not exit 0.
 *
 * ── The defect ───────────────────────────────────────────────────────────────
 * The uncaughtException handler drained through gracefulShutdown(), which ends
 * in process.exit(0). Its own comment promised a "safety exit(1)"; that exit(1)
 * was only the fallback timer for a wedged drain. A drain that completed —
 * the normal case — reported the crash as a clean exit.
 *
 * Observed 2026-09-24 booting the production bundle against a pruned
 * dependency tree with the database unreachable: "UNCAUGHT EXCEPTION: Error:
 * connect ECONNREFUSED", a tidy drain, exit=0. ECS records an essential
 * container's exit code as the task's stop reason, so the one number an
 * operator reads first said the failed boot had succeeded.
 *
 * SIGTERM and SIGINT are requested stops and still exit 0.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../middleware/redisRateLimiter', () => ({ closeRedisRateLimiter: vi.fn(async () => {}) }));
vi.mock('../../middleware/enterprise-performance.js', () => ({ cleanup: vi.fn() }));
vi.mock('../../services/ai-actions/index', () => ({
  drainActionQueue: vi.fn(async () => {}),
  closeAllSSEConnections: vi.fn(),
  closeRedis: vi.fn(async () => {}),
}));
vi.mock('../../services/audit/chainIntegrityMonitor.js', () => ({ stopChainMonitor: vi.fn() }));

import { gracefulShutdown, registerShutdownHandlers } from '../shutdown';

const ctx = () => ({ getHttpServer: () => null, pool: { end: vi.fn(async () => {}) } as never });

let exit: ReturnType<typeof vi.spyOn>;
let exited: Promise<number>;
let listenersBefore: Record<string, Function[]>;
const EVENTS = ['uncaughtException', 'unhandledRejection', 'SIGTERM', 'SIGINT'] as const;

beforeEach(() => {
  listenersBefore = Object.fromEntries(EVENTS.map((e) => [e, process.listeners(e as never) as Function[]]));
  let resolveExit!: (code: number) => void;
  exited = new Promise((r) => { resolveExit = r; });
  exit = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
    resolveExit(code ?? 0);
    return undefined as never;
  }) as never);
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  // Remove only what registerShutdownHandlers added; vitest's own stay.
  for (const e of EVENTS) {
    for (const l of process.listeners(e as never) as Function[]) {
      if (!listenersBefore[e].includes(l)) process.removeListener(e, l as never);
    }
  }
  vi.restoreAllMocks();
});

describe('process exit codes', () => {
  it('an uncaught exception exits 1 after a drain that completes', async () => {
    registerShutdownHandlers(ctx());
    const handler = (process.listeners('uncaughtException') as Function[]).find(
      (l) => !listenersBefore.uncaughtException.includes(l),
    )!;
    handler(new Error('connect ECONNREFUSED 127.0.0.1:1'));
    expect(await exited).toBe(1);
  });

  it('a requested stop (SIGTERM) still exits 0', async () => {
    void gracefulShutdown('SIGTERM', ctx());
    expect(await exited).toBe(0);
    expect(exit).toHaveBeenCalledTimes(1);
  });
});
