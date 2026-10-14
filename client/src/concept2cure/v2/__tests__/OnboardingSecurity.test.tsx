// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OnboardingSecurity } from '../surfaces/OnboardingSecurity';
import { useOnboardingDiscovery } from '../useOnboardingDiscovery';
import { completeDiscovery } from './onboardingDiscoveryFixtures';

const { request } = vi.hoisted(() => ({ request: vi.fn() }));
const auth = vi.hoisted(() => ({ user: { roles: ['admin'] } }));
vi.mock('@/services/portal/authService', () => ({ useAuthUser: () => auth.user }));
vi.mock('../onboarding/SessionPolicySetting', () => ({ SessionPolicySetting: () => <section aria-label="Session security policy" /> }));
vi.mock('@/lib/queryClient', () => ({ apiRequest: request, redactInternals: (message: string) => message }));
vi.mock('@/utils/authToken', () => ({ getOrgId: () => 7 }));
vi.mock('../AccountPanel', () => ({ AccountPanel: ({ onClose }: { onClose: () => void }) => <button onClick={onClose}>Close Account</button> }));
const navigate = vi.fn();
let session: unknown;
const reply = (body: unknown) => ({ ok: true, json: async () => body });
function Harness() {
  const discovery = useOnboardingDiscovery();
  return <OnboardingSecurity discovery={discovery} onNav={navigate} />;
}
beforeEach(() => {
  auth.user = { roles: ['admin'] };
  request.mockReset(); navigate.mockReset();
  session = { authenticated: true, user: { mfaEnabled: false } };
  request.mockImplementation(async (_method: string, path: string) => path === '/api/onboarding/discovery'
    ? reply({ data: { canEdit: true, discovery: { schemaVersion: 1, revision: 1, answers: { ...completeDiscovery(), securityNeeds: ['sso'] }, updatedAt: '2026-10-14T00:00:00.000Z', updatedBy: 9, completedAt: null } } })
    : reply(session));
});
afterEach(cleanup);

describe('security onboarding guidance', () => {
  it('separates requested SSO from verified second-factor status and routes to existing setup', async () => {
    render(<Harness />);
    await screen.findByText('Not enrolled. Sign-in uses an email code.');
    fireEvent.click(await screen.findByRole('button', { name: 'Identity configuration' }));
    expect(navigate).toHaveBeenCalledWith('identity-console');
    expect(request).toHaveBeenCalledWith('GET', '/api/v1/auth/session');
    expect(request.mock.calls.some(([method]) => method !== 'GET')).toBe(false);
    expect(screen.getByText(/Selecting a requirement does not configure/)).toBeTruthy();
  });
  it('does not report enrolled when authentication was not verified', async () => {
    session = { authenticated: false, user: { mfaEnabled: true } };
    render(<Harness />);
    await screen.findByText('Could not verify account security.');
    expect(screen.queryByText('Enrolled.')).toBeNull();
  });
  it('opens the canonical account panel and rereads security after closing', async () => {
    render(<Harness />);
    await screen.findByText('Not enrolled. Sign-in uses an email code.');
    fireEvent.click(screen.getByRole('button', { name: 'Open Account and security' }));
    session = { authenticated: true, user: { mfaEnabled: true } };
    fireEvent.click(screen.getByRole('button', { name: 'Close Account' }));
    await waitFor(() => expect(screen.getByText('Enrolled.')).toBeTruthy());
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Open Account and security' }));
  });
  it('mounts the runtime-backed session policy only for an organization administrator', async () => {
    auth.user = { roles: ['reviewer'] };
    const view = render(<Harness />);
    await screen.findByText('Not enrolled. Sign-in uses an email code.');
    expect(screen.queryByRole('region', { name: 'Session security policy' })).toBeNull();
    view.unmount();
    auth.user = { roles: ['admin'] };
    render(<Harness />);
    await screen.findByText('Not enrolled. Sign-in uses an email code.');
    expect(screen.getByRole('region', { name: 'Session security policy' })).toBeTruthy();
  });
});
