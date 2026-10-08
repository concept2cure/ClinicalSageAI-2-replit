// @vitest-environment jsdom
/**
 * A signed-out deep link keeps the program it names through sign-in.
 *
 * QA 2026-10-08 (j1, "Deep link or new tab to a project home shows 'No project
 * selected'"): reproduction step two is "open it in a new tab or private
 * window". The shell URL now names the open program (?program=<UUID>, see
 * shellProject.ts), but a private window is signed out, and the sign-in
 * redirect carried only the path — `returnTo=/concept2cure/project-home` — so
 * the program was dropped on the way through the login form and the person
 * landed on "No project selected" after all.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';

vi.mock('@/services/portal/authService', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useAuth: () => ({ isAuthenticated: false, isLoading: false, isBootstrapping: false }),
}));
vi.mock('../../auth', () => ({
  ZenSignup: () => null,
  ZenAuthLayout: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  VerifyEmail: () => null,
}));
vi.mock('../../components/concept2cure-auth', () => ({ Concept2CureLogin: () => null }));
vi.mock('../../components/session/IdleSessionGuard', () => ({ IdleSessionGuard: () => null }));
vi.mock('../V2App', () => ({ default: () => null }));

import { ZenRouter } from '../../router/ZenRouter';

const PROGRAM = '099991d1-dac8-43c5-b88a-8baab26194ee';

afterEach(() => {
  cleanup();
  window.history.replaceState(null, '', '/');
});

describe('signed-out deep link → sign-in → back', () => {
  it('the sign-in redirect carries the program the link named', async () => {
    window.history.replaceState(null, '', `/concept2cure/project-home?program=${PROGRAM}`);
    render(<ZenRouter />);
    await waitFor(() => expect(window.location.pathname).toBe('/concept2cure/login'));
    const returnTo = new URLSearchParams(window.location.search).get('returnTo');
    expect(returnTo).toBe(`/concept2cure/project-home?program=${PROGRAM}`);
  });

  it('a link with no query still returns to its path', async () => {
    window.history.replaceState(null, '', '/concept2cure/vault');
    render(<ZenRouter />);
    await waitFor(() => expect(window.location.pathname).toBe('/concept2cure/login'));
    expect(new URLSearchParams(window.location.search).get('returnTo')).toBe('/concept2cure/vault');
  });
});
