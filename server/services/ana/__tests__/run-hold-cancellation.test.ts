/** A Stop during a pending status read must release the hold without another wake. */
import { getEventListeners } from 'node:events';
import { setImmediate } from 'node:timers';
import { describe, expect, it, vi } from 'vitest';
import { createRunHold, type RunHoldOutcome } from '../run-hold.js';
import type { RunStatus } from '../run-status.js';
import { TurnPolicy, type TurnPolicyRun } from '../turn-run-policy.js';
import type { ToolCall } from '../agentic-loop.js';

const flush = () => new Promise<void>(resolve => setImmediate(resolve));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function track<T>(promise: Promise<T>) {
  const state: { done: boolean; value?: T; error?: unknown } = { done: false };
  void promise.then(
    value => { state.done = true; state.value = value; },
    error => { state.done = true; state.error = error; },
  );
  return state;
}

function controlledHold() {
  const state = { status: 'paused' as RunStatus | null, clock: 0, frames: [] as Array<Record<string, unknown>> };
  const reads: Array<ReturnType<typeof deferred<RunStatus | null>>> = [];
  const wakes: Array<ReturnType<typeof deferred<void>>> = [];
  const readStatus = vi.fn(async () => state.status);
  const blockRead = () => {
    const read = deferred<RunStatus | null>();
    reads.push(read);
    readStatus.mockImplementationOnce(() => read.promise);
    return read;
  };
  const wake = vi.fn(() => {
    const wait = deferred<void>();
    wakes.push(wait);
    return wait.promise;
  });
  const endHeld = vi.fn(async () => true);
  const hold = createRunHold({
    readStatus, wake, emit: frame => state.frames.push(frame),
    clientGone: () => false, stopForDisconnect: async () => {},
    now: () => state.clock, maxPauseMs: 100,
    expiry: 'end', endHeld,
  });
  const finish = () => {
    state.status = 'cancelled';
    for (const read of reads) read.resolve('cancelled');
    for (const wait of wakes) wait.resolve();
  };
  return { state, readStatus, blockRead, wake, wakes, endHeld, hold, finish };
}

describe('cancellation while a status read is unresolved', () => {
  it('releases immediately, cleans its listener, and observes a later query rejection', async () => {
    const world = controlledHold();
    const read = world.blockRead();
    const controller = new AbortController();
    const unhandled: unknown[] = [];
    const onUnhandled = (error: unknown) => unhandled.push(error);
    process.on('unhandledRejection', onUnhandled);
    const pending = world.hold.hold(2, undefined, controller.signal);
    const result = track(pending);
    try {
      await flush();
      expect(world.readStatus).toHaveBeenCalledTimes(1);
      controller.abort();
      await flush();
      expect(result).toEqual({ done: true, value: 'cancelled' });
      expect(world.state.frames).toEqual([]);
      expect(world.wake).not.toHaveBeenCalled();
      expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0);
      read.reject(new Error('The abandoned status query failed later.'));
      await flush();
      expect(result).toEqual({ done: true, value: 'cancelled' });
      expect(unhandled).toEqual([]);
      expect(world.endHeld).not.toHaveBeenCalled();
    } finally {
      world.finish();
      await pending.catch(() => {});
      process.removeListener('unhandledRejection', onUnhandled);
    }
  });

  it('also releases during a later read and closes the held-time interval', async () => {
    const world = controlledHold();
    const controller = new AbortController();
    const pending = world.hold.hold(2, undefined, controller.signal);
    const result = track(pending);
    try {
      await flush();
      world.blockRead();
      world.state.clock = 25;
      world.wakes[0].resolve();
      await flush();
      expect(world.readStatus).toHaveBeenCalledTimes(2);
      controller.abort();
      await flush();
      expect(result).toEqual({ done: true, value: 'cancelled' });
      expect(world.wake).toHaveBeenCalledTimes(1);
      expect(world.hold.heldMs()).toBe(25);
      world.state.clock = 70;
      expect(world.hold.heldMs()).toBe(25);
      expect(world.state.frames).toEqual([{ type: 'paused', round: 2 }]);
      expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0);
    } finally {
      world.finish();
      await pending;
    }
  });

  it('throws the original query error while the signal is live and removes its listener', async () => {
    const world = controlledHold();
    const read = world.blockRead();
    const controller = new AbortController();
    const error = new Error('The live status query failed.');
    const pending = world.hold.hold(2, undefined, controller.signal);
    const rejected = expect(pending).rejects.toBe(error);
    read.reject(error);
    await rejected;
    expect(controller.signal.aborted).toBe(false);
    expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0);
    expect(world.state.frames).toEqual([]);
    expect(world.wake).not.toHaveBeenCalled();
    expect(world.endHeld).not.toHaveBeenCalled();
    expect(world.hold.expired()).toBe(false);
  });
});

describe('cancellation at the status-read boundary', () => {
  it.each(['paused', 'running'] as const)('does not apply a stale %s result after Stop', async status => {
    const world = controlledHold();
    const read = world.blockRead();
    const controller = new AbortController();
    const pending = world.hold.hold(2, undefined, controller.signal);
    try {
      await flush();
      world.state.clock = 101;
      read.resolve(status);
      controller.abort();
      expect(await pending).toBe('cancelled');
      expect(world.state.frames).toEqual([]);
      expect(world.endHeld).not.toHaveBeenCalled();
      expect(world.hold.expired()).toBe(false);
      expect(world.wake).not.toHaveBeenCalled();
      expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0);
    } finally {
      world.finish();
      await pending;
    }
  });

  it('cancels one pending reader while another waiter can still resume normally', async () => {
    const world = controlledHold();
    const read = world.blockRead();
    const controller = new AbortController();
    const mine = world.hold.hold(2, undefined, controller.signal);
    const other = world.hold.hold(2);
    const mineResult = track(mine);
    const otherResult = track(other);
    try {
      await flush();
      controller.abort();
      await flush();
      expect(mineResult).toEqual({ done: true, value: 'cancelled' });
      expect(otherResult.done).toBe(false);
      read.resolve('paused');
      world.state.status = 'running';
      world.wakes[0].resolve();
      expect(await other).toBe('running');
      expect(world.state.frames).toEqual([{ type: 'paused', round: 2 }, { type: 'resumed', round: 2 }]);
      expect(world.endHeld).not.toHaveBeenCalled();
    } finally {
      world.finish();
      await Promise.all([mine, other]);
    }
  });

  it('removes read listeners after an uninterrupted status read completes', async () => {
    const world = controlledHold();
    const read = world.blockRead();
    const controller = new AbortController();
    const pending = world.hold.hold(2, undefined, controller.signal);
    read.resolve('running');
    expect(await pending).toBe('running');
    expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0);
    expect(world.state.frames).toEqual([]);
  });
});

describe('Stop between the inner read and its outer consumer', () => {
  it.each(['paused', 'running'] as const)('does not consume a settled %s read after Stop', async status => {
    const world = controlledHold();
    world.state.status = status;
    const controller = new AbortController();
    // Retain the actual read race; inject Stop only at its consumer handoff.
    const internal = world.hold as unknown as {
      read(signal?: AbortSignal): Promise<{ status: RunStatus | null; mark: number; at: number } | null>;
    };
    const original = internal.read.bind(internal);
    const read = vi.spyOn(internal, 'read').mockImplementation(async signal => {
      const seen = await original(signal);
      controller.abort();
      return seen;
    });
    try {
      world.state.clock = 101;
      expect(await world.hold.hold(2, undefined, controller.signal)).toBe('cancelled');
      expect(world.state.frames).toEqual([]);
      expect(world.wake).not.toHaveBeenCalled();
      expect(world.endHeld).not.toHaveBeenCalled();
      expect(world.hold.expired()).toBe(false);
      expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0);
    } finally {
      read.mockRestore();
    }
  });
});

const step: ToolCall = { id: 'waiting-step', name: 'search_literature', input: { query: 'endpoint' } };

describe('TurnPolicy passes the existing cancellation signal into the shared hold', () => {
  it.each([null, 'auto', 'manual'] as const)('releases a pending %s policy hold when Stop lands', async runPolicy => {
    const world = controlledHold();
    const read = world.blockRead();
    const controller = new AbortController();
    const frames: Array<Record<string, unknown>> = [];
    const notRun: Array<{ id: string; why: string }> = [];
    const run: TurnPolicyRun = {
      hold: world.hold, cancelSignal: controller.signal, cancelled: () => controller.signal.aborted,
      heartbeat: () => {}, drainSteers: async () => [], holdForPerson: async () => true,
      status: async () => world.state.status,
    };
    const policy = new TurnPolicy({ runPolicy, holdable: true, startedAt: 0, now: () => world.state.clock });
    const checkpoint = policy.checkpoint({
      run, demo: () => false, isUngoverned: () => true, label: call => call.name,
      emit: frame => frames.push(frame), notRun: (call, _round, why) => notRun.push({ id: call.id, why }),
    });
    const pending = checkpoint(2, [step]);
    const result = track(pending);
    try {
      await flush();
      expect(world.readStatus).toHaveBeenCalledTimes(1);
      controller.abort();
      await flush();
      expect(result).toEqual({ done: true, value: 'abort' });
      expect(frames).toEqual([{ type: 'cancelled', round: 2 }]);
      expect(world.wake).not.toHaveBeenCalled();
      expect(world.state.frames).toEqual([]);
      if (runPolicy === 'manual') {
        expect(notRun).toEqual([{ id: step.id, why: expect.stringContaining('run was stopped') }]);
        expect(policy.policyHolds).toMatchObject([{ outcome: 'stopped', next: [step.name] }]);
      }
      read.resolve('paused');
      await flush();
      expect(frames).toEqual([{ type: 'cancelled', round: 2 }]);
      expect(world.wake).not.toHaveBeenCalled();
    } finally {
      world.finish();
      await pending;
    }
  });
});

const settlements = [
  ['person', 'outcome'], ['person', 'signal'], ['manual', 'outcome'], ['manual', 'signal'],
] as const;

describe('a cancelled hold settles before further status or queue reads', () => {
  it.each(settlements)('%s hold cancelled by %s does not start another drain', async (kind, cause) => {
    const controller = new AbortController();
    const drain = deferred<string[]>();
    const drainSteers = vi.fn(() => drain.promise);
    if (kind === 'manual') drainSteers.mockResolvedValueOnce([]);
    const status = vi.fn(async (): Promise<RunStatus> => 'running');
    const frames: Array<Record<string, unknown>> = [];
    const notRun = vi.fn();
    const policy = new TurnPolicy({ runPolicy: kind === 'manual' ? 'manual' : null, holdable: true, startedAt: 0 });
    const checkpoint = policy.checkpoint({
      run: {
        hold: {
          hold: async (): Promise<RunHoldOutcome> => {
            if (cause === 'signal') controller.abort();
            return cause === 'outcome' ? 'cancelled' : 'running';
          },
          expired: () => false, expiredSignal: new AbortController().signal, heldMs: () => 0,
        },
        cancelSignal: controller.signal, cancelled: () => controller.signal.aborted,
        heartbeat: () => {}, drainSteers, holdForPerson: async () => true, status,
      },
      demo: () => false, isUngoverned: () => true, label: call => call.name,
      emit: frame => frames.push(frame), notRun,
    });
    const pending = checkpoint(2, [step]);
    const result = track(pending);
    try {
      await flush();
      expect(result).toEqual({ done: true, value: 'abort' });
      expect(drainSteers).toHaveBeenCalledTimes(kind === 'manual' ? 1 : 0);
      expect(status).not.toHaveBeenCalled();
      expect(frames).toEqual([{ type: 'cancelled', round: 2 }]);
      if (kind === 'manual') {
        expect(notRun).toHaveBeenCalledWith(step, 2, expect.stringContaining('run was stopped'));
        expect(policy.policyHolds).toMatchObject([{ outcome: 'stopped', next: [step.name] }]);
      }
    } finally {
      drain.resolve([]);
      await pending;
    }
  });
});
