import { describe, it, expect, vi } from 'vitest';

// The cross-process window claim (U19) has its own tests
// (sentinel/__tests__/scheduler-once-per-window.test.ts); this file pins the
// in-process overlap guard, so the claim passes every call through.
vi.mock('../../db/scheduledOnce', async (orig) => ({
  ...(await orig<typeof import('../../db/scheduledOnce')>()),
  runScheduledOncePerWindow: async (_job: string, _window: string, fn: () => Promise<unknown>) => ({ ran: true, value: await fn() }),
}));

import { SentinelScheduler } from '../../services/sentinel/scheduler';

const HOUR = 60 * 60 * 1000;

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

/**
 * Fix (wave 3): SentinelScheduler.runScan now skips overlapping scans for the
 * same org (setInterval fires regardless of prior-scan duration).
 */
describe('SentinelScheduler overlap guard', () => {
  function makeScheduler() {
    const sched = new SentinelScheduler({} as any);
    const state = { calls: 0, active: 0, maxActive: 0 };
    (sched as any).sentinel = {
      scan: async () => {
        state.calls++;
        state.active++;
        state.maxActive = Math.max(state.maxActive, state.active);
        await delay(15);
        state.active--;
        return []; // no findings -> no rule events / DB
      },
    };
    return { sched, state };
  }

  it('does not run two scans for the same org concurrently', async () => {
    const { sched, state } = makeScheduler();
    await Promise.all([(sched as any).runScan(1, HOUR), (sched as any).runScan(1, HOUR)]);
    expect(state.maxActive).toBe(1); // never overlapped
    expect(state.calls).toBe(1); // the second concurrent call was skipped
  });

  it('allows a subsequent scan once the prior one finished', async () => {
    const { sched, state } = makeScheduler();
    await (sched as any).runScan(1, HOUR);
    await (sched as any).runScan(1, HOUR);
    expect(state.calls).toBe(2); // sequential runs are fine; guard is released
  });

  it('scans different orgs independently', async () => {
    const { sched, state } = makeScheduler();
    await Promise.all([(sched as any).runScan(1, HOUR), (sched as any).runScan(2, HOUR)]);
    expect(state.calls).toBe(2);
  });
});
