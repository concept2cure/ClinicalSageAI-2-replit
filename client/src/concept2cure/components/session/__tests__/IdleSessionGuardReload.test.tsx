// @vitest-environment jsdom
/**
 * QA 2026-10-08, walk 2, j9: signed in, left alone for 17 minutes, still
 * signed in. The page reloaded once while nobody touched it (13:15:48, a dev
 * server reload; in production a person's F5, or any reload, does the same),
 * and the guard's clock started again at mount — so the 15 minutes were
 * counted from the reload, not from the person. HIPAA §164.312(a)(2)(iii):
 * the window is the PERSON's inactivity. The clock is kept per session across
 * reloads and tabs, so a remount continues it instead of restarting it.
 */
import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const MINUTE = 60_000;
const auth = vi.hoisted(() => ({
  policy: { idleMinutes: 15, lifetimeHours: 12, expiresAt: null as string | null, sessionId: 'sid-1' as string | null },
  refreshSessionPolicy: vi.fn(),
  keepAlive: vi.fn(async () => undefined),
  logout: vi.fn(async () => undefined),
}));
vi.mock('@/services/portal/authService', () => ({
  authService: {
    getSessionPolicy: () => auth.policy,
    refreshSessionPolicy: auth.refreshSessionPolicy,
    keepAlive: auth.keepAlive,
    logout: auth.logout,
  },
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, vars?: Record<string, unknown>) => (vars?.seconds !== undefined ? `${key}:${vars.seconds}` : key),
  }),
}));

import { IdleSessionGuard } from '../IdleSessionGuard';

beforeEach(() => {
  vi.useFakeTimers();
  sessionStorage.clear();
  localStorage.clear();
  auth.policy = { idleMinutes: 15, lifetimeHours: 12, expiresAt: null, sessionId: 'sid-1' };
  auth.refreshSessionPolicy.mockImplementation(async () => auth.policy);
  auth.logout.mockClear();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('the idle clock survives a reload', () => {
  it('a reload in the middle of the window does not restart it: sign-out comes 15 minutes after the person stopped', async () => {
    const first = render(<IdleSessionGuard />);
    await act(async () => {
      vi.advanceTimersByTime(9 * MINUTE);
    });
    first.unmount(); // the page reloads; nobody touched it
    render(<IdleSessionGuard />);
    await act(async () => {
      vi.advanceTimersByTime(5 * MINUTE); // 14 minutes since the person was last active
    });
    expect(screen.getByRole('alertdialog').textContent).toContain('session.stillThere');
    await act(async () => {
      vi.advanceTimersByTime(MINUTE);
    });
    expect(auth.logout).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem('trialsage_signout_reason')).toBe('idle');
  });

  it('a page opened after the window has passed signs out at once', async () => {
    const first = render(<IdleSessionGuard />);
    first.unmount();
    await act(async () => {
      vi.advanceTimersByTime(16 * MINUTE);
    });
    render(<IdleSessionGuard />);
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(auth.logout).toHaveBeenCalledTimes(1);
  });

  it("another session's clock is never applied to this one", async () => {
    const first = render(<IdleSessionGuard />);
    first.unmount();
    await act(async () => {
      vi.advanceTimersByTime(16 * MINUTE);
    });
    auth.policy = { ...auth.policy, sessionId: 'sid-2' }; // a fresh sign-in
    render(<IdleSessionGuard />);
    await act(async () => {
      vi.advanceTimersByTime(MINUTE);
    });
    expect(auth.logout).not.toHaveBeenCalled();
  });

  it('activity in another tab of the same session keeps this tab signed in', async () => {
    render(<IdleSessionGuard />);
    await act(async () => {
      vi.advanceTimersByTime(14 * MINUTE + 10_000);
    });
    expect(screen.getByRole('alertdialog')).toBeTruthy();
    // The other tab records the person's activity in the shared store.
    const at = Date.now();
    const value = JSON.stringify({ sid: 'sid-1', at });
    localStorage.setItem('c2c-idle-last-activity', value);
    await act(async () => {
      window.dispatchEvent(new StorageEvent('storage', { key: 'c2c-idle-last-activity', newValue: value }));
    });
    expect(screen.queryByRole('alertdialog')).toBeNull();
    await act(async () => {
      vi.advanceTimersByTime(10 * MINUTE);
    });
    expect(auth.logout).not.toHaveBeenCalled();
  });
});
