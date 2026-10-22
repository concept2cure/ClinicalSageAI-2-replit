/**
 * Restart honesty (AnA detach DT3, design §7; DT3 test 14, shutdown half).
 *
 * A turn whose page closed goes on in the process, with no socket the HTTP
 * drain could wait on. So a graceful shutdown ends every AnA run it owns —
 * failed/server_shutdown, aborted with that reason — BEFORE the drain, and
 * then waits, inside the same 10 s window, for the turns to record
 * themselves, before the pool is closed under them.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const order = vi.hoisted(() => [] as string[]);
const held = vi.hoisted(() => ({ settle: null as null | (() => void), hangRunWrites: false }));

vi.mock('../../middleware/redisRateLimiter', () => ({ closeRedisRateLimiter: vi.fn(async () => {}) }));
vi.mock('../../middleware/enterprise-performance.js', () => ({ cleanup: vi.fn() }));
vi.mock('../../services/ai-actions/index', () => ({
  drainActionQueue: vi.fn(async () => {}),
  closeAllSSEConnections: vi.fn(),
  closeRedis: vi.fn(async () => {}),
}));
vi.mock('../../services/audit/chainIntegrityMonitor.js', () => ({ stopChainMonitor: vi.fn() }));
vi.mock('../../services/ana/run-control.js', () => ({
  settleOwnedRunsForShutdown: vi.fn(async () => {
    // A slow database: the writes do not come back (DT3 review, INF-41).
    if (held.hangRunWrites) return new Promise<string[]>(() => {});
    order.push('ana:runs ended server_shutdown');
    return ['run_1'];
  }),
  abortOwnedRunsForShutdown: vi.fn(() => {
    order.push('ana:runs aborted locally');
    return 1;
  }),
  stopRunControlListener: vi.fn(() => order.push('ana:listener stopped')),
}));
vi.mock('../../services/ana/shutdown-hold.js', () => ({
  ownedWorkSettled: vi.fn(
    () =>
      new Promise<boolean>(resolve => {
        held.settle = () => {
          order.push('ana:turns recorded');
          resolve(true);
        };
      }),
  ),
}));

import { gracefulShutdown } from '../shutdown';

let exited: Promise<number>;
beforeEach(() => {
  order.length = 0;
  held.settle = null;
  held.hangRunWrites = false;
  let resolveExit!: (code: number) => void;
  exited = new Promise(r => { resolveExit = r; });
  vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
    resolveExit(code ?? 0);
    return undefined as never;
  }) as never);
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('graceful shutdown and the AnA runs this process owns', () => {
  it('ends them before the HTTP drain, and closes the pool only after the turns recorded themselves', async () => {
    const httpServer = {
      close: (cb?: () => void) => {
        order.push('http:close');
        setTimeout(() => { order.push('http:drained'); cb?.(); }, 5);
      },
    };
    const pool = { end: vi.fn(async () => { order.push('pool:end'); }) };
    void gracefulShutdown('SIGTERM', { getHttpServer: () => httpServer, pool: pool as never });
    await vi.waitFor(() => expect(order).toContain('http:drained'));
    expect(pool.end, 'the pool closed under turns still recording').not.toHaveBeenCalled();
    held.settle!();
    expect(await exited).toBe(0);
    // Ended at all (an absent step has index -1, which is "less than" anything).
    expect(order, 'the shutdown never ended the runs it owns').toContain('ana:runs ended server_shutdown');
    expect(order.indexOf('ana:runs ended server_shutdown')).toBeLessThan(order.indexOf('http:close'));
    expect(order.indexOf('ana:turns recorded')).toBeLessThan(order.indexOf('pool:end'));
    expect(order.indexOf('ana:listener stopped')).toBeLessThan(order.indexOf('pool:end'));
  });
});

/* DT3 review (INF-41): the runs' writes came before any timer, one
   organisation after another, under a 30 s statement timeout, so a slow
   database could take the whole SIGKILL window before the drain began. They
   now have a deadline; past it every owned turn is stopped locally anyway
   (nothing runs past the process), the drain begins, and the rows left live
   are ended by the reaper as orphaned. */
describe('the runs\' writes have a deadline', () => {
  it('a database that does not answer: the turns are stopped locally and the drain begins within the deadline', async () => {
    held.hangRunWrites = true;
    const httpServer = { close: (cb?: () => void) => { order.push('http:close'); cb?.(); } };
    const pool = { end: vi.fn(async () => { order.push('pool:end'); }) };
    const { SHUTDOWN_RUN_SETTLE_MS } = await import('../shutdown');
    expect(SHUTDOWN_RUN_SETTLE_MS).toBeLessThanOrEqual(3_000);
    const started = Date.now();
    void gracefulShutdown('SIGTERM', { getHttpServer: () => httpServer, pool: pool as never });
    await vi.waitFor(() => expect(order).toContain('http:close'), { timeout: SHUTDOWN_RUN_SETTLE_MS + 2_000 });
    expect(Date.now() - started).toBeLessThan(SHUTDOWN_RUN_SETTLE_MS + 1_500);
    expect(order.indexOf('ana:runs aborted locally')).toBeGreaterThan(-1);
    expect(order.indexOf('ana:runs aborted locally')).toBeLessThan(order.indexOf('http:close'));
    held.settle?.();
  }, 10_000);
});
