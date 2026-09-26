// @vitest-environment jsdom
/**
 * The inactivity guard the authenticated shell mounts (P1-1): it warns a
 * minute before the tenant's idle window ends, "Stay signed in" keeps the
 * session (and tells the server, which measures requests), and the end of the
 * window or of the 12-hour lifetime signs the person out with the reason kept
 * for the sign-in page.
 */
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const MINUTE = 60_000;
const auth = vi.hoisted(() => ({
  policy: { idleMinutes: 15, lifetimeHours: 12, expiresAt: null as string | null },
  getSessionPolicy: vi.fn(),
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
  auth.policy = { idleMinutes: 15, lifetimeHours: 12, expiresAt: null };
  auth.refreshSessionPolicy.mockImplementation(async () => auth.policy);
  auth.keepAlive.mockClear();
  auth.logout.mockClear();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('IdleSessionGuard', () => {
  it('renders nothing until a minute before the window, then the warning with the seconds left', async () => {
    render(<IdleSessionGuard />);
    expect(screen.queryByRole('alertdialog')).toBeNull();
    await act(async () => {
      vi.advanceTimersByTime(14 * MINUTE);
    });
    const dialog = screen.getByRole('alertdialog');
    expect(dialog.textContent).toContain('session.stillThere');
    expect(dialog.textContent).toContain('session.signOutIn:60');
    await act(async () => {
      vi.advanceTimersByTime(10_000);
    });
    expect(screen.getByRole('alertdialog').textContent).toContain('session.signOutIn:50');
  });

  it('"Stay signed in" closes the warning, tells the server, and the window starts again', async () => {
    render(<IdleSessionGuard />);
    await act(async () => {
      vi.advanceTimersByTime(14 * MINUTE);
    });
    fireEvent.click(screen.getByRole('button', { name: 'session.staySignedIn' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(auth.keepAlive).toHaveBeenCalled();
    await act(async () => {
      vi.advanceTimersByTime(13 * MINUTE);
    });
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(auth.logout).not.toHaveBeenCalled();
  });

  it('signs out at the end of the window with the reason kept; "Sign out now" does so at once', async () => {
    render(<IdleSessionGuard />);
    await act(async () => {
      vi.advanceTimersByTime(15 * MINUTE);
    });
    expect(auth.logout).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem('trialsage_signout_reason')).toBe('idle');

    auth.logout.mockClear();
    sessionStorage.clear();
    render(<IdleSessionGuard />);
    await act(async () => {
      vi.advanceTimersByTime(14 * MINUTE);
    });
    fireEvent.click(screen.getByRole('button', { name: 'session.signOutNow' }));
    expect(auth.logout).toHaveBeenCalledTimes(1);
  });

  it('uses the window the server reports, and ends the session at the end of its lifetime', async () => {
    auth.policy = { idleMinutes: 30, lifetimeHours: 12, expiresAt: new Date(Date.now() + 2 * MINUTE).toISOString() };
    render(<IdleSessionGuard />);
    await act(async () => {
      vi.advanceTimersByTime(20 * MINUTE);
    });
    // 20 minutes idle: inside a 30-minute window, so no idle warning was due;
    // but the lifetime ended after 2, and that signed the person out.
    expect(auth.logout).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem('trialsage_signout_reason')).toBe('lifetime');
  });

  it('keeps the server informed of activity while the person works without API traffic', async () => {
    render(<IdleSessionGuard />);
    await act(async () => {
      vi.advanceTimersByTime(2 * MINUTE);
      window.dispatchEvent(new Event('keydown'));
      vi.advanceTimersByTime(4 * MINUTE);
    });
    expect(auth.keepAlive).toHaveBeenCalled();
  });
});
