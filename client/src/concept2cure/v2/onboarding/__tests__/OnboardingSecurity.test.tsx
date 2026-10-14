// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const auth = vi.hoisted(() => ({ user: { roles: ['admin'] } as { roles: string[] } | null }));
vi.mock('@/services/portal/authService', () => ({ useAuthUser: () => auth.user }));
vi.mock('../../AccountPanel', () => ({ AccountPanel: ({ onClose }: { onClose: () => void }) => <div role="dialog" aria-label="Canonical Account"><button onClick={onClose}>Close Account</button></div> }));
vi.mock('../SessionPolicySetting', () => ({ SessionPolicySetting: () => <section aria-label="Session security policy" /> }));
import { OnboardingSecurity } from '../OnboardingSecurity';

afterEach(() => { cleanup(); auth.user = { roles: ['admin'] }; });
describe('onboarding security handoffs', () => {
  it('opens the canonical account dialog and restores focus on close', () => {
    render(<OnboardingSecurity onNav={vi.fn()} />);
    const button = screen.getByRole('button', { name: /open account and authenticator setup/i });
    fireEvent.click(button);
    expect(screen.getByRole('dialog', { name: 'Canonical Account' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Close Account' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(button);
  });

  it('routes administrators to the existing membership, setup and identity screens', () => {
    const onNav = vi.fn();
    render(<OnboardingSecurity onNav={onNav} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open Members and roles' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open organization Setup' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open Identity console' }));
    expect(onNav.mock.calls).toEqual([['admin-console'], ['setup'], ['identity-console']]);
    expect(screen.getByRole('region', { name: 'Session security policy' })).toBeTruthy();
    expect(screen.getByText(/does not claim those security controls have been configured/i)).toBeTruthy();
  });

  it('gives nonadministrators the personal-account flow and a truthful admin handoff', () => {
    auth.user = { roles: ['reviewer'] };
    render(<OnboardingSecurity onNav={vi.fn()} />);
    expect(screen.getByRole('button', { name: /open account/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Open Members and roles' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Open Identity console' })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Session security policy' })).toBeNull();
    expect(screen.getByText(/ask an organization administrator/i)).toBeTruthy();
  });
});
