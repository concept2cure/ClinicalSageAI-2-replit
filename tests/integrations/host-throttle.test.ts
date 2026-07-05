/**
 * Per-host admission control — unit tests for the shared throttle primitive.
 *
 * These exercise the limiter directly (env-independent) rather than through
 * fetchWithRetry, whose integration is intentionally a no-op under the test
 * runner. We verify: the concurrency cap is respected under contention, the
 * min-interval spaces successive starts, all results pass through in order
 * without loss, and misconfiguration degrades to pass-through (never hangs).
 */
import { describe, it, expect } from 'vitest';
import { HostThrottle, hostOf } from '../../server/services/integrations/host-throttle';

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

describe('hostOf', () => {
  it('extracts the lowercased host, or "" on garbage', () => {
    expect(hostOf('https://API.FDA.gov/drug/label.json?x=1')).toBe('api.fda.gov');
    expect(hostOf('not a url')).toBe('');
  });
});

describe('HostThrottle concurrency cap', () => {
  it('never runs more than N tasks in flight given M queued', async () => {
    const t = new HostThrottle();
    t.configure('h', { concurrency: 2, minIntervalMs: 0 });

    let inFlight = 0;
    let maxInFlight = 0;
    const task = (i: number) =>
      t.run('h', async () => {
        inFlight++;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await sleep(20);
        inFlight--;
        return i;
      });

    const results = await Promise.all([0, 1, 2, 3, 4].map(task));

    expect(maxInFlight).toBeLessThanOrEqual(2);
    // Results pass through without loss, mapped 1:1 to inputs.
    expect(results).toEqual([0, 1, 2, 3, 4]);
    // All slots released.
    expect(t.activeFor('h')).toBe(0);
  });

  it('hands the slot directly to a queued waiter on release (no over-admit window)', async () => {
    // Regression: release() used to decrement `active` and THEN wake the queued
    // waiter, which re-incremented only when its continuation resumed. A fresh
    // run() landing in that microtask window saw a free slot and over-admitted.
    const t = new HostThrottle();
    t.configure('h', { concurrency: 1, minIntervalMs: 0 });

    let inFlight = 0;
    let maxInFlight = 0;
    const tracked = () => async () => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await sleep(10);
      inFlight--;
    };

    const gate = sleep(10);
    const a = t.run('h', () => gate); // occupies the only slot
    const b = t.run('h', tracked()); // queued waiter
    // Let run(a) reach `await fn()` so its continuation (which runs release())
    // is subscribed to `gate` ahead of ours…
    await Promise.resolve();
    // …then subscribe c's start to the same promise: it executes after
    // release() but before the queued waiter resumes — the historical
    // over-admit window.
    const c = gate.then(() => t.run('h', tracked()));

    await Promise.all([a, b, c]);
    expect(maxInFlight).toBe(1);
    expect(t.activeFor('h')).toBe(0);
  });
});

describe('HostThrottle min-interval', () => {
  it('spaces successive request starts by at least the interval', async () => {
    const t = new HostThrottle();
    t.configure('h', { concurrency: 10, minIntervalMs: 50 });

    const starts: number[] = [];
    await Promise.all(
      [0, 1, 2].map(() =>
        t.run('h', async () => {
          starts.push(Date.now());
          await sleep(1);
        })
      )
    );

    starts.sort((a, b) => a - b);
    // Allow a little scheduler slack below the 50ms target.
    expect(starts[1] - starts[0]).toBeGreaterThanOrEqual(45);
    expect(starts[2] - starts[1]).toBeGreaterThanOrEqual(45);
  });
});

describe('HostThrottle degradation & safety', () => {
  it('passes through immediately when limits are inert (unlimited + unspaced)', async () => {
    const t = new HostThrottle();
    t.configure('h', { concurrency: 0, minIntervalMs: 0 });
    const r = await t.run('h', async () => 'ok');
    expect(r).toBe('ok');
  });

  it('treats misconfigured (NaN/negative) limits as pass-through, does not hang', async () => {
    const t = new HostThrottle();
    t.configure('h', { concurrency: Number.NaN, minIntervalMs: -100 });
    const results = await Promise.all([1, 2, 3].map(i => t.run('h', async () => i)));
    expect(results).toEqual([1, 2, 3]);
    expect(t.activeFor('h')).toBe(0);
  });

  it('releases the slot even when the task throws', async () => {
    const t = new HostThrottle();
    t.configure('h', { concurrency: 1, minIntervalMs: 0 });
    await expect(t.run('h', async () => { throw new Error('boom'); })).rejects.toThrow('boom');
    // A subsequent task must still be admitted (no deadlock).
    await expect(t.run('h', async () => 'after')).resolves.toBe('after');
    expect(t.activeFor('h')).toBe(0);
  });

  it('isolates hosts from one another', async () => {
    const t = new HostThrottle();
    t.configure('a', { concurrency: 1, minIntervalMs: 0 });
    t.configure('b', { concurrency: 1, minIntervalMs: 0 });
    let aActive = false;
    let bRanWhileAActive = false;
    await Promise.all([
      t.run('a', async () => { aActive = true; await sleep(20); aActive = false; }),
      t.run('b', async () => { if (aActive) bRanWhileAActive = true; }),
    ]);
    // Different hosts do not block each other.
    expect(bRanWhileAActive).toBe(true);
  });
});
