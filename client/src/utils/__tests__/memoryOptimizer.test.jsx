// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { memoryOptimizer } from '../memoryOptimizer';

// Regression guard for the P0 defect: the memoryOptimizer previously
// brute-force cancelled EVERY timer id on the page (auth refresh, polling,
// debounces, toasts) via window.clearInterval(i)/window.clearTimeout(i) for
// i in 1..99998, and startPeriodicCleanup ran that every 60s. A utility must
// never cancel timers it did not create.

describe('memoryOptimizer', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('exposes the expected export shape', () => {
    expect(typeof memoryOptimizer.clearIntervals).toBe('function');
    expect(typeof memoryOptimizer.clearTimeouts).toBe('function');
    expect(typeof memoryOptimizer.cleanup).toBe('function');
    expect(typeof memoryOptimizer.startPeriodicCleanup).toBe('function');
  });

  it('clearIntervals / clearTimeouts / cleanup never cancel arbitrary timers', () => {
    const clearIntervalSpy = vi.spyOn(window, 'clearInterval');
    const clearTimeoutSpy = vi.spyOn(window, 'clearTimeout');

    memoryOptimizer.clearIntervals();
    memoryOptimizer.clearTimeouts();
    memoryOptimizer.cleanup();

    expect(clearIntervalSpy).not.toHaveBeenCalled();
    expect(clearTimeoutSpy).not.toHaveBeenCalled();
  });

  it('does not cancel a live timer it did not create', () => {
    vi.useFakeTimers();
    const cb = vi.fn();
    setInterval(cb, 1000);

    memoryOptimizer.cleanup();

    vi.advanceTimersByTime(3000);
    // The timer survives cleanup and keeps firing.
    expect(cb).toHaveBeenCalledTimes(3);
  });

  it('startPeriodicCleanup does not schedule a destructive interval', () => {
    const setIntervalSpy = vi.spyOn(window, 'setInterval');
    memoryOptimizer.startPeriodicCleanup();
    expect(setIntervalSpy).not.toHaveBeenCalled();
  });
});
