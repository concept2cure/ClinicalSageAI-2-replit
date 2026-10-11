/** Completed tool waits must release their own run-signal listeners. */
import { getEventListeners } from 'node:events';
import { setImmediate } from 'node:timers';
import { describe, expect, it, vi } from 'vitest';
import { abortRace, ToolRunCancelled } from '../agentic-loop.js';

type CompatibleWait = Promise<never> & { dispose?: () => void };
const flush = () => new Promise<void>(resolve => setImmediate(resolve));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

/** Same work-first ordering as both callers; optional cleanup lets baseline expose its leak. */
async function toolWait<T>(work: Promise<T>, signal?: AbortSignal): Promise<T> {
  const waiting: CompatibleWait = abortRace(signal);
  try {
    return await Promise.race([work, waiting]);
  } finally {
    waiting.dispose?.();
  }
}

describe('listeners after a tool completes', () => {
  it('does not accumulate listeners across sixteen successful tools on one live run', async () => {
    const controller = new AbortController();
    const counts: number[] = [];
    for (let index = 0; index < 16; index++) {
      expect(await toolWait(Promise.resolve(`Evidence ${index}`), controller.signal)).toBe(`Evidence ${index}`);
      counts.push(getEventListeners(controller.signal, 'abort').length);
    }
    expect(controller.signal.aborted).toBe(false);
    expect(counts).toEqual(Array.from({ length: 16 }, () => 0));
  });

  it('releases the listener while retaining the handler original error', async () => {
    const controller = new AbortController();
    const failure = new Error('The tool failed.');
    await expect(toolWait(Promise.reject(failure), controller.signal)).rejects.toBe(failure);
    expect(controller.signal.aborted).toBe(false);
    expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0);
  });

  it('does not create a cancellation wait before a synchronously throwing handler', async () => {
    const controller = new AbortController();
    const failure = new Error('The handler threw before returning a promise.');
    const handler = vi.fn((): Promise<string> => { throw failure; });
    expect(() => toolWait(handler(), controller.signal)).toThrow(failure);
    expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0);
    expect(controller.signal.aborted).toBe(false);
  });
});

describe('one tool wait owns one listener', () => {
  it('disposes a completed sibling without removing active or unrelated listeners', async () => {
    const controller = new AbortController();
    const external = vi.fn();
    controller.signal.addEventListener('abort', external, { once: true });
    const first = deferred<string>();
    const second = deferred<string>();
    const firstWait = toolWait(first.promise, controller.signal);
    const secondWait = toolWait(second.promise, controller.signal);
    const cancelled = expect(secondWait).rejects.toBeInstanceOf(ToolRunCancelled);
    expect(getEventListeners(controller.signal, 'abort')).toHaveLength(3);
    first.resolve('First result');
    expect(await firstWait).toBe('First result');
    expect(getEventListeners(controller.signal, 'abort')).toHaveLength(2);
    controller.abort();
    await cancelled;
    expect(external).toHaveBeenCalledTimes(1);
    expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0);
    second.resolve('Unobserved late result');
  });

  it('is idempotent and disposal does not abort the signal or another wait', async () => {
    const controller = new AbortController();
    const disposed: CompatibleWait = abortRace(controller.signal);
    const sibling: CompatibleWait = abortRace(controller.signal);
    const rejected = expect(sibling).rejects.toBeInstanceOf(ToolRunCancelled);
    let disposedSettled = false;
    void disposed.then(() => { disposedSettled = true; }, () => { disposedSettled = true; });
    expect(disposed.dispose).toBeTypeOf('function');
    disposed.dispose?.();
    disposed.dispose?.();
    expect(getEventListeners(controller.signal, 'abort')).toHaveLength(1);
    expect(controller.signal.aborted).toBe(false);
    controller.abort();
    await rejected;
    await flush();
    expect(disposedSettled).toBe(false);
    expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0);
    sibling.dispose?.();
  });
});

describe('the existing cancellation promise contract', () => {
  it('remains assignable to Promise and rejects with the existing cancellation class', async () => {
    const controller = new AbortController();
    const legacy: Promise<never> = abortRace(controller.signal);
    expect(legacy).toBeInstanceOf(Promise);
    const rejected = expect(legacy).rejects.toBeInstanceOf(ToolRunCancelled);
    controller.abort();
    await rejected;
    expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0);
  });

  it('rejects an already-aborted signal without registering a listener', async () => {
    const controller = new AbortController();
    controller.abort();
    const wait: CompatibleWait = abortRace(controller.signal);
    await expect(wait).rejects.toBeInstanceOf(ToolRunCancelled);
    wait.dispose?.();
    expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0);
  });

  it('retains never-settling no-signal behavior after disposal', async () => {
    const wait: CompatibleWait = abortRace(undefined);
    wait.dispose?.();
    expect(await Promise.race([wait, Promise.resolve('still pending')])).toBe('still pending');
    expect(await toolWait(Promise.resolve('Uncontrolled result'))).toBe('Uncontrolled result');
  });

  it('observes a late handler rejection after Stop and cleans the listener', async () => {
    const controller = new AbortController();
    const work = deferred<string>();
    const unhandled: unknown[] = [];
    const onUnhandled = (error: unknown) => unhandled.push(error);
    process.on('unhandledRejection', onUnhandled);
    try {
      const waiting = toolWait(work.promise, controller.signal);
      const rejected = expect(waiting).rejects.toBeInstanceOf(ToolRunCancelled);
      controller.abort();
      await rejected;
      expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0);
      work.reject(new Error('The abandoned tool failed later.'));
      await flush();
      expect(unhandled).toEqual([]);
    } finally {
      process.removeListener('unhandledRejection', onUnhandled);
    }
  });
});
