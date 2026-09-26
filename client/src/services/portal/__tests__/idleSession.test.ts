// @vitest-environment jsdom
/** The client's inactivity clock (P1-1): warn, end, extend, and what counts as activity. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { startIdleWatch } from '../idleSession';

const MINUTE = 60_000;

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function watch(overrides: Partial<Parameters<typeof startIdleWatch>[0]> = {}) {
  const onWarn = vi.fn();
  const onIdle = vi.fn();
  const handle = startIdleWatch({ idleMs: 15 * MINUTE, warnMs: MINUTE, onWarn, onIdle, ...overrides });
  return { handle, onWarn, onIdle };
}

describe('startIdleWatch', () => {
  it('warns a minute before the window ends and ends the session at the window', () => {
    const { onWarn, onIdle } = watch();
    vi.advanceTimersByTime(14 * MINUTE - 1);
    expect(onWarn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onWarn).toHaveBeenCalledTimes(1);
    expect(onWarn.mock.calls[0][0]).toBe(MINUTE);
    expect(onIdle).not.toHaveBeenCalled();
    vi.advanceTimersByTime(MINUTE);
    expect(onIdle).toHaveBeenCalledTimes(1);
  });

  it('activity before the warning starts the window again', () => {
    const { onWarn, onIdle } = watch();
    vi.advanceTimersByTime(10 * MINUTE);
    window.dispatchEvent(new Event('keydown'));
    vi.advanceTimersByTime(13 * MINUTE);
    expect(onWarn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(MINUTE);
    expect(onWarn).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(MINUTE);
    expect(onIdle).toHaveBeenCalledTimes(1);
  });

  it('while the warning stands, ordinary activity does not extend the session; extend() does', () => {
    const { handle, onWarn, onIdle } = watch();
    vi.advanceTimersByTime(14 * MINUTE);
    expect(onWarn).toHaveBeenCalledTimes(1);
    window.dispatchEvent(new Event('pointerdown'));
    vi.advanceTimersByTime(MINUTE);
    expect(onIdle, 'a pointer under the dialog cancelled the warning').toHaveBeenCalledTimes(1);

    const second = watch();
    vi.advanceTimersByTime(14 * MINUTE);
    expect(second.onWarn).toHaveBeenCalledTimes(1);
    second.handle.extend();
    expect(second.handle.warned()).toBe(false);
    vi.advanceTimersByTime(14 * MINUTE);
    expect(second.onIdle).not.toHaveBeenCalled();
    expect(second.onWarn).toHaveBeenCalledTimes(2);
    handle.stop();
    second.handle.stop();
  });

  it('the tab becoming visible is activity; stop() ends the watch silently', () => {
    const { handle, onWarn, onIdle } = watch();
    vi.advanceTimersByTime(10 * MINUTE);
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(handle.lastActivityAt()).toBe(Date.now());
    handle.stop();
    vi.advanceTimersByTime(30 * MINUTE);
    expect(onWarn).not.toHaveBeenCalled();
    expect(onIdle).not.toHaveBeenCalled();
  });

  it('throttles activity to once a second', () => {
    const { handle } = watch({ idleMs: MINUTE, warnMs: 5000 });
    vi.advanceTimersByTime(500);
    window.dispatchEvent(new Event('scroll'));
    expect(handle.lastActivityAt()).toBe(Date.now() - 500); // inside the throttle: not counted
    vi.advanceTimersByTime(600);
    window.dispatchEvent(new Event('scroll'));
    expect(handle.lastActivityAt()).toBe(Date.now());
    handle.stop();
  });

  it('a warning longer than the window is clamped to it: the warning stands from the start', () => {
    const { handle, onWarn, onIdle } = watch({ idleMs: 2000, warnMs: 5000 });
    vi.advanceTimersByTime(1);
    expect(onWarn).toHaveBeenCalledTimes(1);
    expect(handle.warned()).toBe(true);
    vi.advanceTimersByTime(2000);
    expect(onIdle).toHaveBeenCalledTimes(1);
  });
});
