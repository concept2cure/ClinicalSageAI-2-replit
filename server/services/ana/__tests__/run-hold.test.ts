/**
 * createRunHold — the stream's while-paused wait, moved out of the stream so
 * everything that waits at a round boundary waits on ONE hold (row 74, S3).
 *
 * Two families of cases:
 *
 *  - expiry 'resume' is today's behaviour, moved verbatim: the frames, the
 *    wake ceiling, the clock that starts when the hold is entered, the
 *    abandoned-pause resume. The stream uses only this in S3.
 *  - the shared state a later slice needs when several waiters hold at once
 *    (the parent and its sub-agents): one pause clock for all of them, one
 *    paused/resumed frame pair, a signal that releases one waiter without
 *    the others, and expiry 'end', which ends the turn instead of resuming
 *    it — "Manual silently becomes Auto" is the trap it closes.
 */

import { describe, it, expect, vi } from 'vitest';

import { createRunHold, RUN_HOLD_WAKE_CEILING_MS, type RunHoldDeps } from '../run-hold.js';
import type { RunStatus } from '../run-status.js';

const MAX = 600_000;

/** Let every pending promise chain run. */
const flush = () => new Promise<void>(resolve => setTimeout(resolve, 0));

/**
 * A run row, a clock and a wake latch under the test's control. `wake` resolves
 * only when the test ticks the clock, the way the real latch resolves on a
 * control write or its ceiling.
 */
function world(expiry: 'resume' | 'end', start: RunStatus | null = 'paused') {
  const s = { t: 0, status: start as RunStatus | null, frames: [] as Array<Record<string, unknown>>, gone: false };
  const waiters = new Set<() => void>();
  const common = {
    readStatus: vi.fn(async () => s.status),
    wake: vi.fn((_ms: number) => new Promise<void>(resolve => waiters.add(resolve))),
    emit: (frame: Record<string, unknown>) => s.frames.push(frame),
    clientGone: () => s.gone,
    stopForDisconnect: vi.fn(async () => {
      s.status = 'cancelled';
    }),
    now: () => s.t,
    maxPauseMs: MAX,
  };
  const resumeAbandoned = vi.fn(async () => {
    if (s.status === 'paused') s.status = 'running';
  });
  const endHeld = vi.fn(async () => {
    if (s.status !== 'paused') return false;
    s.status = 'finished';
    return true;
  });
  const deps: RunHoldDeps =
    expiry === 'resume' ? { ...common, expiry, resumeAbandoned } : { ...common, expiry, endHeld };
  /** Advance the clock and fire the wake latch, as a ceiling or a control write would. */
  const tick = async (ms: number) => {
    s.t += ms;
    const ready = [...waiters];
    waiters.clear();
    for (const resolve of ready) resolve();
    await flush();
  };
  /** Tick in wake-ceiling steps until the clock passes `until`. */
  const runTo = async (until: number) => {
    while (s.t <= until) await tick(RUN_HOLD_WAKE_CEILING_MS);
  };
  return {
    s,
    deps,
    readStatus: common.readStatus,
    wake: common.wake,
    resumeAbandoned,
    endHeld,
    tick,
    runTo,
    hold: createRunHold(deps),
  };
}

/** Track a promise's settlement without awaiting it. */
function track<T>(p: Promise<T>) {
  const state: { done: boolean; value?: T } = { done: false };
  void p.then(v => {
    state.done = true;
    state.value = v;
  });
  return state;
}

describe("expiry 'resume' — today's pause, moved unchanged", () => {
  it('a run that is not paused passes straight through: no frame, no wait', async () => {
    const w = world('resume', 'running');
    expect(await w.hold.hold(3)).toBe('running');
    expect(w.s.frames).toEqual([]);
    expect(w.deps.wake).not.toHaveBeenCalled();
  });

  it('a run already cancelled reports cancelled, with no frame', async () => {
    const w = world('resume', 'cancelled');
    expect(await w.hold.hold(3)).toBe('cancelled');
    expect(w.s.frames).toEqual([]);
  });

  it('paused then resumed: one paused frame, one resumed frame, both carrying the round and nothing else', async () => {
    const w = world('resume');
    const out = track(w.hold.hold(4));
    await flush();
    expect(w.s.frames).toEqual([{ type: 'paused', round: 4 }]);
    expect(w.deps.wake).toHaveBeenLastCalledWith(RUN_HOLD_WAKE_CEILING_MS);
    w.s.status = 'running';
    await w.tick(10);
    expect(out).toEqual({ done: true, value: 'running' });
    expect(w.s.frames).toEqual([
      { type: 'paused', round: 4 },
      { type: 'resumed', round: 4 },
    ]);
  });

  it('paused then cancelled: cancelled, and no resumed frame', async () => {
    const w = world('resume');
    const out = track(w.hold.hold(2));
    await flush();
    w.s.status = 'cancelled';
    await w.tick(10);
    expect(out.value).toBe('cancelled');
    expect(w.s.frames).toEqual([{ type: 'paused', round: 2 }]);
  });

  it('paused then ended some other way: the turn carries on, with no resumed frame (as the stream did)', async () => {
    const w = world('resume');
    const out = track(w.hold.hold(2));
    await flush();
    w.s.status = 'finished';
    await w.tick(10);
    expect(out.value).toBe('running');
    expect(w.s.frames).toEqual([{ type: 'paused', round: 2 }]);
  });

  it('nobody comes back: resumed as abandoned once, at the ceiling, and the resumed frame is sent', async () => {
    const w = world('resume');
    const out = track(w.hold.hold(5));
    await w.runTo(MAX - 1);
    expect(out.done).toBe(false);
    expect(w.resumeAbandoned).not.toHaveBeenCalled();
    await w.runTo(MAX + RUN_HOLD_WAKE_CEILING_MS);
    expect(out.value).toBe('running');
    expect(w.resumeAbandoned).toHaveBeenCalledTimes(1);
    expect(w.s.frames.at(-1)).toEqual({ type: 'resumed', round: 5 });
    expect(w.hold.expired()).toBe(false);
  });

  it('the pause clock starts when the hold is entered, before the first read (as pauseStart did)', async () => {
    const w = world('resume');
    // A read that takes most of the ceiling: the old loop took Date.now() first.
    w.readStatus.mockImplementationOnce(async () => {
      w.s.t += MAX - 1_000;
      return w.s.status;
    });
    const out = track(w.hold.hold(1));
    await flush();
    await w.tick(RUN_HOLD_WAKE_CEILING_MS);
    await w.tick(RUN_HOLD_WAKE_CEILING_MS);
    expect(out.value).toBe('running');
    expect(w.resumeAbandoned).toHaveBeenCalledTimes(1);
  });

  it('a dropped client stops the run and reports disconnected', async () => {
    const w = world('resume');
    w.s.gone = true;
    expect(await w.hold.hold(2)).toBe('disconnected');
    expect(w.deps.stopForDisconnect).toHaveBeenCalledTimes(1);
    expect(w.s.frames).toEqual([{ type: 'paused', round: 2 }]);
  });

  it('two separate pauses each get their own clock', async () => {
    const w = world('resume');
    const first = track(w.hold.hold(2));
    await w.runTo(MAX - 100_000);
    w.s.status = 'running';
    await w.tick(10);
    expect(first.value).toBe('running');
    w.s.status = 'paused';
    const second = track(w.hold.hold(3));
    await w.runTo(w.s.t + MAX - 100_000);
    expect(second.done, 'the second pause inherited the first one’s clock').toBe(false);
    expect(w.resumeAbandoned).not.toHaveBeenCalled();
  });
});

describe('several waiters share one hold', () => {
  it('three concurrent callers: one paused frame and one resumed frame', async () => {
    const w = world('resume');
    const outs = [track(w.hold.hold(2)), track(w.hold.hold(2)), track(w.hold.hold(2))];
    await flush();
    w.s.status = 'running';
    await w.tick(10);
    expect(outs.map(o => o.value)).toEqual(['running', 'running', 'running']);
    expect(w.s.frames.filter(f => f.type === 'paused')).toHaveLength(1);
    expect(w.s.frames.filter(f => f.type === 'resumed')).toHaveLength(1);
  });

  it('heldMs is the one interval the run was held, not the sum of every waiter’s', async () => {
    const w = world('resume');
    const a = track(w.hold.hold(2));
    await w.tick(1_000);
    const b = track(w.hold.hold(2));
    await w.tick(1_000);
    const c = track(w.hold.hold(2));
    await w.tick(8_000);
    w.s.status = 'running';
    await w.tick(0);
    expect([a.value, b.value, c.value]).toEqual(['running', 'running', 'running']);
    expect(w.hold.heldMs()).toBe(10_000);
    await w.tick(50_000);
    expect(w.hold.heldMs(), 'held time grew after the run resumed').toBe(10_000);
  });

  it("the abandoned-pause resume runs once however many are waiting", async () => {
    const w = world('resume');
    const outs = [track(w.hold.hold(2)), track(w.hold.hold(2))];
    await w.runTo(MAX + RUN_HOLD_WAKE_CEILING_MS);
    expect(outs.map(o => o.value)).toEqual(['running', 'running']);
    expect(w.resumeAbandoned).toHaveBeenCalledTimes(1);
  });

  it('an aborted signal releases its own waiter as cancelled while the others keep waiting', async () => {
    const w = world('resume');
    const ctl = new AbortController();
    const mine = track(w.hold.hold(2, undefined, ctl.signal));
    const other = track(w.hold.hold(2));
    await flush();
    ctl.abort();
    await flush();
    expect(mine.value).toBe('cancelled');
    expect(other.done).toBe(false);
    w.s.status = 'running';
    await w.tick(10);
    expect(other.value).toBe('running');
  });

  it('a waiter whose read was issued before another saw the resume does not announce a second pause', async () => {
    const w = world('resume');
    const a = track(w.hold.hold(2));
    const b = track(w.hold.hold(2));
    await flush();
    w.s.status = 'running';
    // A's next read was taken while the run was still paused, and answers late.
    let answerLate!: () => void;
    w.readStatus.mockImplementationOnce(
      () => new Promise<RunStatus | null>(resolve => (answerLate = () => resolve('paused'))),
    );
    await w.tick(10);
    expect(b.value).toBe('running');
    answerLate();
    await w.tick(10);
    expect(a.value).toBe('running');
    expect(w.s.frames).toEqual([
      { type: 'paused', round: 2 },
      { type: 'resumed', round: 2 },
    ]);
  });

  it('an announcement rides the paused frame', async () => {
    const w = world('resume');
    const out = track(w.hold.hold(2, { reason: 'manual', next: ['Searching PubMed'] }));
    await flush();
    expect(w.s.frames).toEqual([{ type: 'paused', round: 2, reason: 'manual', next: ['Searching PubMed'] }]);
    w.s.status = 'running';
    await w.tick(10);
    expect(out.value).toBe('running');
  });
});

describe("expiry 'end' — an unanswered hold ends the turn, it never resumes it", () => {
  it('ends the held run once, reports expired, aborts expiredSignal, sends one hold_expired frame, and never resumes', async () => {
    const w = world('end');
    const out = track(w.hold.hold(3, { reason: 'manual', next: ['Running an agent'] }));
    await w.runTo(MAX + RUN_HOLD_WAKE_CEILING_MS);
    expect(out.value).toBe('expired');
    expect(w.endHeld).toHaveBeenCalledTimes(1);
    expect(w.hold.expired()).toBe(true);
    expect(w.hold.expiredSignal.aborted).toBe(true);
    expect(w.s.frames.filter(f => f.type === 'hold_expired')).toEqual([
      { type: 'hold_expired', round: 3, next: ['Running an agent'] },
    ]);
    expect(w.s.frames.filter(f => f.type === 'resumed')).toEqual([]);
    expect(w.s.status).toBe('finished');
  });

  it('two callers entering 60s apart both return expired by the FIRST caller’s deadline', async () => {
    const w = world('end');
    const first = track(w.hold.hold(2));
    await w.runTo(60_000);
    const second = track(w.hold.hold(2));
    await w.runTo(MAX + RUN_HOLD_WAKE_CEILING_MS);
    expect(first.value).toBe('expired');
    expect(second.value, 'the second caller started its own clock').toBe('expired');
    expect(w.s.t).toBeLessThan(MAX + 60_000);
    expect(w.endHeld).toHaveBeenCalledTimes(1);
  });

  it('a caller entering after expiry returns expired at once, without reading the row', async () => {
    const w = world('end');
    const first = track(w.hold.hold(2));
    await w.runTo(MAX + RUN_HOLD_WAKE_CEILING_MS);
    expect(first.value).toBe('expired');
    const reads = w.readStatus.mock.calls.length;
    expect(await w.hold.hold(3)).toBe('expired');
    expect(w.readStatus.mock.calls.length).toBe(reads);
  });

  it('when a Continue wins the race (endHeld writes nothing), it re-reads and carries on', async () => {
    const w = world('end');
    w.endHeld.mockImplementationOnce(async () => {
      w.s.status = 'running'; // the person's resume landed first
      return false;
    });
    const out = track(w.hold.hold(2));
    await w.runTo(MAX + RUN_HOLD_WAKE_CEILING_MS);
    expect(out.value).toBe('running');
    expect(w.hold.expired()).toBe(false);
    expect(w.hold.expiredSignal.aborted).toBe(false);
    expect(w.s.frames.at(-1)).toEqual({ type: 'resumed', round: 2 });
  });

  it('a waiter held on its wake is released the moment the hold expires', async () => {
    const w = world('end');
    const a = track(w.hold.hold(2));
    await w.runTo(30_000);
    const b = track(w.hold.hold(2));
    await w.runTo(MAX + 1);
    expect(a.value).toBe('expired');
    expect(b.value).toBe('expired');
  });
});

/** Track a promise's settlement, rejection included, without awaiting it. */
function settle<T>(p: Promise<T>) {
  const state: { done: boolean; value?: T; error?: string } = { done: false };
  void p.then(
    v => {
      state.done = true;
      state.value = v;
    },
    (e: unknown) => {
      state.done = true;
      state.error = e instanceof Error ? e.message : String(e);
    },
  );
  return state;
}

describe('a waiter that leaves while the run is still paused', () => {
  // The stream's old loop took a fresh `pauseStart` on every checkpoint call,
  // so nothing it measured outlived the call. A hold shared by several waiters
  // keeps one clock while ANYONE is waiting; when the last one leaves by any
  // path — its own signal, a dropped client, an error — the clock must stop
  // with it, or held time grows with nobody holding and the next hold starts
  // already at its deadline.

  it('the last waiter leaving by its own signal closes the pause, and a later hold starts its own clock', async () => {
    const w = world('resume');
    const ctl = new AbortController();
    const first = track(w.hold.hold(2, undefined, ctl.signal));
    await w.runTo(MAX - 100_000);
    ctl.abort();
    await flush();
    expect(first.value).toBe('cancelled');
    const heldAtLeave = w.hold.heldMs();
    await w.tick(50_000);
    expect(w.hold.heldMs(), 'held time grew with nobody holding').toBe(heldAtLeave);
    const second = track(w.hold.hold(3));
    await w.runTo(w.s.t + MAX - 100_000);
    expect(second.done, 'the later hold inherited the clock of a pause nobody was waiting on').toBe(false);
    expect(w.resumeAbandoned).not.toHaveBeenCalled();
  });

  it('a dropped client closes the pause: held time stops at the disconnect', async () => {
    const w = world('resume');
    const out = track(w.hold.hold(2));
    await w.tick(5_000);
    await w.tick(5_000);
    w.s.gone = true;
    await w.tick(5_000);
    expect(out.value).toBe('disconnected');
    const held = w.hold.heldMs();
    await w.tick(60_000);
    expect(w.hold.heldMs(), 'held time grew after the client went').toBe(held);
  });

  it('one waiter leaving by its signal does NOT close the pause the others are still waiting on', async () => {
    const w = world('resume');
    const ctl = new AbortController();
    const mine = track(w.hold.hold(2, undefined, ctl.signal));
    const other = track(w.hold.hold(2));
    await w.runTo(300_000);
    ctl.abort();
    await flush();
    expect(mine.value).toBe('cancelled');
    await w.runTo(MAX + RUN_HOLD_WAKE_CEILING_MS);
    expect(other.value, 'the remaining waiter restarted the shared clock').toBe('running');
    expect(w.resumeAbandoned).toHaveBeenCalledTimes(1);
  });

  it('a wake that rejects is thrown out of the hold, as `await runHandle.wake()` threw out of the checkpoint', async () => {
    const w = world('resume');
    w.wake.mockImplementationOnce(() => Promise.reject(new Error('latch broke')));
    const out = settle(w.hold.hold(2));
    await flush();
    await flush();
    expect(out, 'a failed wake was read as a wake').toEqual({ done: true, error: 'latch broke' });
    const held = w.hold.heldMs();
    await w.tick(60_000);
    expect(w.hold.heldMs(), 'held time grew after the hold threw').toBe(held);
  });

  it("expiry 'end': a failed end write is thrown, not read as a Continue; the turn is not expired and the pause closes", async () => {
    const w = world('end');
    w.endHeld.mockImplementationOnce(async () => {
      throw new Error('db down');
    });
    const out = settle(w.hold.hold(2));
    await w.runTo(MAX + RUN_HOLD_WAKE_CEILING_MS);
    expect(out).toEqual({ done: true, error: 'db down' });
    expect(w.endHeld).toHaveBeenCalledTimes(1);
    expect(w.hold.expired()).toBe(false);
    expect(w.s.frames.filter(f => f.type === 'hold_expired')).toEqual([]);
    const held = w.hold.heldMs();
    await w.tick(60_000);
    expect(w.hold.heldMs()).toBe(held);
  });
});
