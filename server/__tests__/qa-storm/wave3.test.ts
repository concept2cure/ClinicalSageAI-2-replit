import { describe, it, expect } from 'vitest';
import { SentinelScheduler } from '../../services/sentinel/scheduler';

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
    await Promise.all([(sched as any).runScan(1), (sched as any).runScan(1)]);
    expect(state.maxActive).toBe(1); // never overlapped
    expect(state.calls).toBe(1); // the second concurrent call was skipped
  });

  it('allows a subsequent scan once the prior one finished', async () => {
    const { sched, state } = makeScheduler();
    await (sched as any).runScan(1);
    await (sched as any).runScan(1);
    expect(state.calls).toBe(2); // sequential runs are fine; guard is released
  });

  it('scans different orgs independently', async () => {
    const { sched, state } = makeScheduler();
    await Promise.all([(sched as any).runScan(1), (sched as any).runScan(2)]);
    expect(state.calls).toBe(2);
  });
});
