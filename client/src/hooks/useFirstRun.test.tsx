import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import useFirstRun from './useFirstRun';

// simple localStorage shim guard (jsdom has it, but be explicit)
beforeEach(() => {
  localStorage.clear();
});

describe('useFirstRun', () => {
  it('returns isFirst=true on first run (no keys set)', () => {
    const { result } = renderHook(() => useFirstRun('stability.firstRun.global', 'study.abc'));
    // initial effect will run and compute first-run
    // wait a tick for effect to update
    expect(result.current.isFirst).toBe(true);
  });

  it('markSeen() flips isFirst to false and persists keys', () => {
    const { result } = renderHook(() => useFirstRun('stability.firstRun.global', 'study.abc'));
    act(() => result.current.markSeen());
    expect(result.current.isFirst).toBe(false);
    expect(localStorage.getItem('stability.firstRun.global')).toBe('1');
    expect(localStorage.getItem('stability.firstRun.global.study.abc')).toBe('1');
  });

  it('reset() sets isFirst=true again and clears keys', () => {
    const { result } = renderHook(() => useFirstRun('stability.firstRun.global', 'study.abc'));
    act(() => result.current.markSeen());
    act(() => result.current.reset());
    expect(result.current.isFirst).toBe(true);
    expect(localStorage.getItem('stability.firstRun.global')).toBeNull();
    expect(localStorage.getItem('stability.firstRun.global.study.abc')).toBeNull();
  });

  it('works in global-only mode (no entityKey)', () => {
    const { result } = renderHook(() => useFirstRun('stability.firstRun.global'));
    expect(result.current.isFirst).toBe(true);
    act(() => result.current.markSeen());
    expect(result.current.isFirst).toBe(false);
    expect(localStorage.getItem('stability.firstRun.global')).toBe('1');
  });
});
