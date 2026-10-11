import { afterEach, describe, expect, it, vi } from 'vitest';
import { setImmediate } from 'node:timers';
import { Semaphore } from '../concurrency';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

function observe<T>(promise: Promise<T>) {
  const state: { settled: boolean; error?: unknown } = { settled: false };
  const done = promise.then(
    () => { state.settled = true; },
    error => { state.settled = true; state.error = error; },
  );
  return { state, done };
}

const checkpoint = () => new Promise<void>(resolve => setImmediate(resolve));

async function expectOnePermit(limiter: Semaphore) {
  const held = deferred();
  const started = deferred();
  const first = limiter.run(() => { started.resolve(); return held.promise; });
  await started.promise;
  const nextWork = vi.fn(async () => 'next');
  const next = limiter.run(nextWork);
  try {
    await checkpoint();
    expect(nextWork, 'permit accounting allowed extra concurrent work').not.toHaveBeenCalled();
  } finally {
    held.resolve();
    await Promise.all([first, next]);
  }
  expect(nextWork).toHaveBeenCalledTimes(1);
}

afterEach(() => vi.restoreAllMocks());

describe('Semaphore cancellation before dispatch', () => {
  it('rejects an already aborted signal without spending a free permit', async () => {
    const limiter = new Semaphore(1);
    const controller = new AbortController();
    const reason = new Error('run stopped');
    controller.abort(reason);
    const canceledWork = vi.fn(async () => undefined);
    const canceled = observe(limiter.run(canceledWork, controller.signal));
    await canceled.done;
    expect(canceled.state.error).toBe(reason);
    expect(canceledWork).not.toHaveBeenCalled();
    await expectOnePermit(limiter);
  });

  it('settles a queued abort while the current caller still holds its permit', async () => {
    const limiter = new Semaphore(1);
    const held = deferred();
    const started = deferred();
    const first = limiter.run(() => { started.resolve(); return held.promise; });
    await started.promise;
    const controller = new AbortController();
    const reason = new Error('queued run stopped');
    const canceledWork = vi.fn(async () => undefined);
    const canceled = observe(limiter.run(canceledWork, controller.signal));
    controller.abort(reason);
    try {
      await checkpoint();
      expect(canceled.state.settled, 'cancel waited for the occupied permit').toBe(true);
      expect(canceled.state.error).toBe(reason);
      expect(canceledWork).not.toHaveBeenCalled();
    } finally {
      held.resolve();
      await Promise.all([first, canceled.done]);
    }
    expect(canceledWork).not.toHaveBeenCalled();
    await expectOnePermit(limiter);
  });

  it('checks cancellation between permit handoff and the callback microtask', async () => {
    const limiter = new Semaphore(1);
    const held = deferred();
    const started = deferred();
    const first = limiter.run(() => { started.resolve(); return held.promise; });
    await started.promise;
    const controller = new AbortController();
    const reason = new Error('stopped during handoff');
    const canceledWork = vi.fn(async () => undefined);
    const canceled = observe(limiter.run(canceledWork, controller.signal));
    // First's await reaction releases the permit; this later reaction aborts
    // before the newly admitted caller's continuation can invoke its callback.
    const aborted = held.promise.then(() => controller.abort(reason));
    held.resolve();
    await Promise.all([first, canceled.done, aborted]);
    expect(canceled.state.error).toBe(reason);
    expect(canceledWork).not.toHaveBeenCalled();
    await expectOnePermit(limiter);
  });
});

describe('Semaphore FIFO and permit accounting', () => {
  it('removes canceled waiters and admits live callers in FIFO order at the same cap', async () => {
    const limiter = new Semaphore(1);
    const held = deferred();
    const thirdHeld = deferred();
    const started = deferred();
    const order: number[] = [];
    let active = 0;
    let peak = 0;
    const work = (id: number, wait = Promise.resolve()) => async () => {
      active++;
      peak = Math.max(peak, active);
      order.push(id);
      if (id === 1) started.resolve();
      try { await wait; } finally { active--; }
    };
    const first = limiter.run(work(1, held.promise));
    await started.promise;
    const secondController = new AbortController();
    const fourthController = new AbortController();
    const second = observe(limiter.run(work(2), secondController.signal));
    const third = limiter.run(work(3, thirdHeld.promise));
    const fourth = observe(limiter.run(work(4), fourthController.signal));
    let fifth: Promise<void> | undefined;
    secondController.abort();
    fourthController.abort();
    try {
      await checkpoint();
      expect(second.state.settled).toBe(true);
      expect(fourth.state.settled).toBe(true);
      fifth = limiter.run(work(5));
      await checkpoint();
      expect(order).toEqual([1]);
      held.resolve();
      await checkpoint();
      expect(order).toEqual([1, 3]);
      thirdHeld.resolve();
      await Promise.all([first, second.done, third, fourth.done, fifth]);
      expect(order).toEqual([1, 3, 5]);
      expect(peak).toBe(1);
    } finally {
      held.resolve();
      thirdHeld.resolve();
      await Promise.all([first, second.done, third, fourth.done, fifth]);
    }
    await expectOnePermit(limiter);
  });

  it('does not release an active callback early when its signal is aborted', async () => {
    const limiter = new Semaphore(1);
    const held = deferred();
    const started = deferred();
    const controller = new AbortController();
    const first = limiter.run(() => { started.resolve(); return held.promise; }, controller.signal);
    await started.promise;
    controller.abort();
    const nextWork = vi.fn(async () => 'next');
    const next = limiter.run(nextWork);
    try {
      await checkpoint();
      expect(nextWork).not.toHaveBeenCalled();
    } finally {
      held.resolve();
      await Promise.all([first, next]);
    }
    expect(nextWork).toHaveBeenCalledTimes(1);
  });

  it('releases a callback that throws and serves the next caller', async () => {
    const limiter = new Semaphore(1);
    const error = new Error('provider failed');
    const failed = observe(limiter.run(async () => { throw error; }));
    const next = limiter.run(async () => 'next');
    await failed.done;
    expect(failed.state.error).toBe(error);
    await expect(next).resolves.toBe('next');
  });
});

describe('Semaphore abort listener lifetime', () => {
  it('removes a queued listener on cancellation', async () => {
    const limiter = new Semaphore(1);
    const held = deferred();
    const started = deferred();
    const first = limiter.run(() => { started.resolve(); return held.promise; });
    await started.promise;
    const controller = new AbortController();
    const added = vi.spyOn(controller.signal, 'addEventListener');
    const removed = vi.spyOn(controller.signal, 'removeEventListener');
    const canceled = observe(limiter.run(async () => undefined, controller.signal));
    controller.abort();
    try {
      await checkpoint();
      expect(added).toHaveBeenCalledTimes(1);
      const [event, listener] = added.mock.calls[0];
      expect(event).toBe('abort');
      expect(removed).toHaveBeenCalledWith('abort', listener);
      expect(removed).toHaveBeenCalledTimes(1);
    } finally {
      held.resolve();
      await Promise.all([first, canceled.done]);
    }
  });

  it('removes the queued listener when a live waiter receives its permit', async () => {
    const limiter = new Semaphore(1);
    const held = deferred();
    const started = deferred();
    const first = limiter.run(() => { started.resolve(); return held.promise; });
    await started.promise;
    const controller = new AbortController();
    const added = vi.spyOn(controller.signal, 'addEventListener');
    const removed = vi.spyOn(controller.signal, 'removeEventListener');
    const work = vi.fn(async () => 'served');
    const next = limiter.run(work, controller.signal);
    held.resolve();
    await Promise.all([first, next]);
    expect(added).toHaveBeenCalledTimes(1);
    const [event, listener] = added.mock.calls[0];
    expect(event).toBe('abort');
    expect(removed).toHaveBeenCalledWith('abort', listener);
    expect(removed).toHaveBeenCalledTimes(1);
    controller.abort();
    expect(work).toHaveBeenCalledTimes(1);
    await expect(limiter.run(async () => 'next')).resolves.toBe('next');
  });
});
