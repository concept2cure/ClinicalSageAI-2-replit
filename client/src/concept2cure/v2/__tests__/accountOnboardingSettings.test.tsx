// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  request: vi.fn(),
  user: { id: '33', organizationId: '1' } as { id: string; organizationId: string } | null,
  token: 'signed-in-access-token' as string | null,
}));
vi.mock('@/lib/queryClient', async (original) => ({
  ...(await original<typeof import('@/lib/queryClient')>()),
  apiRequest: mocks.request,
}));
vi.mock('@/services/portal/authService', () => ({ useAuth: () => ({ user: mocks.user }) }));
vi.mock('@/utils/authToken', () => ({ getAuthToken: () => mocks.token }));

import { AccountOnboardingSettings } from '../AccountOnboardingSettings';
import { REPORT_PERSONAS } from '@shared/constants/domain/report-personas';

const INBOX = '/api/tenant-users/invitations/mine';
const PERSONA = '/api/users/me/persona';
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json' },
});
const invitation = {
  id: 52, organizationId: 71, email: 'ada.rowe@c2c.test', role: 'reviewer', status: 'pending',
  createdAt: '2026-10-12T08:00:00.000Z', invitedById: 8,
};
const routes = new Map<string, () => Response | Promise<Response>>();

beforeEach(() => {
  routes.clear();
  mocks.user = { id: '33', organizationId: '1' };
  mocks.token = 'signed-in-access-token';
  mocks.request.mockReset();
  mocks.request.mockImplementation(async (method: string, path: string) => {
    const route = routes.get(`${method} ${path}`);
    return route ? route() : json(404, { error: 'Unexpected request' });
  });
  routes.set(`GET ${INBOX}`, () => json(200, []));
  routes.set(`GET ${PERSONA}`, () => json(200, { persona: 'ra_lead', role: 'reviewer', availablePersonas: REPORT_PERSONAS }));
  routes.set('GET /api/organizations?membershipOnly=true', () => json(200, { success: true, organizations: [{ id: '1', name: null }] }));
});
afterEach(cleanup);
const open = () => render(<AccountOnboardingSettings userId="33" organizationId="1" />);
const section = (name: string) => screen.getByRole('region', { name });

describe('self-service onboarding in Account', () => {
  it('reads the signed-in person’s inbox and reporting role; no fixture or invented organization name', async () => {
    open();
    expect(await screen.findByText('No pending invitations.')).toBeTruthy();
    await waitFor(() => expect((screen.getByRole('combobox', { name: 'Reporting role' }) as HTMLSelectElement).value).toBe('ra_lead'));
    expect(mocks.request.mock.calls.filter(([method]) => method === 'GET').map(([, path]) => path).sort())
      .toEqual([INBOX, PERSONA, '/api/organizations?membershipOnly=true'].sort());
    expect(screen.queryByRole('button', { name: /Accept invitation/ })).toBeNull();
  });

  it('accepts an invitation through the self-only endpoint, re-reads pending rows and keeps the current tenant', async () => {
    let accepted = false;
    routes.set(`GET ${INBOX}`, () => json(200, accepted ? [] : [invitation]));
    routes.set('GET /api/organizations?membershipOnly=true', () => json(200, {
      success: true,
      organizations: [{ id: '1', name: null }, ...(accepted ? [{ id: '71', name: 'Inviting sponsor' }] : [])],
    }));
    routes.set('POST /api/tenant-users/invitations/52/accept', () => {
      accepted = true;
      return json(200, { success: true, data: { invitationId: 52, organizationId: 71, userId: 33, role: 'reviewer', status: 'accepted' } });
    });
    open();
    expect(await screen.findByText('Organisation 71')).toBeTruthy();
    expect(screen.queryByText(/Northwind|Demo|Concept2Cure/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Accept invitation to organisation 71' }));
    expect(await screen.findByText(/Invitation accepted for organisation 71/)).toBeTruthy();
    expect(await screen.findByText('No pending invitations.')).toBeTruthy();
    expect(await screen.findByRole('option', { name: 'Inviting sponsor' })).toBeTruthy();
    expect(mocks.request).toHaveBeenCalledWith('POST', '/api/tenant-users/invitations/52/accept', undefined);
    expect(mocks.user?.organizationId).toBe('1');
    expect(screen.getByText(/Your current session stays in its existing organisation/)).toBeTruthy();
  });

  it('confirms a decline calmly and allows cancellation before the server mutation', async () => {
    routes.set(`GET ${INBOX}`, () => json(200, [invitation]));
    routes.set('POST /api/tenant-users/invitations/52/decline', () => json(200, { success: true }));
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Decline invitation to organisation 71' }));
    expect(mocks.request.mock.calls.some(([method]) => method === 'POST')).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel decline' }));
    expect(screen.queryByRole('button', { name: 'Confirm decline' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Decline invitation to organisation 71' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm decline' }));
    expect(await screen.findByText(/Invitation declined for organisation 71/)).toBeTruthy();
    expect(mocks.request).toHaveBeenCalledWith('POST', '/api/tenant-users/invitations/52/decline', undefined);
  });

  it('shows quota or authorization refusals without claiming the invitation was accepted', async () => {
    routes.set(`GET ${INBOX}`, () => json(200, [invitation]));
    routes.set('POST /api/tenant-users/invitations/52/accept', () => json(403, {
      success: false, error: 'QUOTA_EXCEEDED', message: 'This organisation has reached its user limit.',
    }));
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Accept invitation to organisation 71' }));
    expect(await within(section('Invitations')).findByRole('alert')).toHaveProperty('textContent', expect.stringContaining('user limit'));
    expect(screen.queryByText(/Invitation accepted for/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Accept invitation to organisation 71' })).toBeTruthy();
  });

  it('keeps an inbox read error distinct from no pending invitations and retries it', async () => {
    let fail = true;
    routes.set(`GET ${INBOX}`, () => fail ? json(503, { error: 'Invitations are temporarily unavailable.' }) : json(200, []));
    open();
    const alert = await within(section('Invitations')).findByRole('alert');
    expect(alert.textContent).toContain('temporarily unavailable');
    expect(screen.queryByText('No pending invitations.')).toBeNull();
    fail = false;
    fireEvent.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('No pending invitations.')).toBeTruthy();
  });

  it('refuses malformed pending rows instead of offering a mutation against a guessed organization', async () => {
    routes.set(`GET ${INBOX}`, () => json(200, [{ ...invitation, organizationId: null }]));
    open();
    expect(await within(section('Invitations')).findByRole('alert')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Accept invitation/ })).toBeNull();
    expect(screen.queryByText('No pending invitations.')).toBeNull();
  });

});

describe('reporting role in Account', () => {
  it('offers canonical reporting personas returned by the server and saves only the persona', async () => {
    routes.set(`GET ${PERSONA}`, () => json(200, { persona: null, role: 'member', availablePersonas: ['qa', 'medical_writer'] }));
    routes.set(`PUT ${PERSONA}`, () => json(200, { success: true, persona: 'qa', role: 'member' }));
    open();
    const field = await screen.findByRole('combobox', { name: 'Reporting role' });
    expect(within(field).getAllByRole('option').map(option => (option as HTMLOptionElement).value)).toEqual(['', 'qa', 'medical_writer']);
    fireEvent.change(field, { target: { value: 'qa' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save reporting role' }));
    expect(await screen.findByText('Reporting role saved. Your access role is unchanged.')).toBeTruthy();
    expect(mocks.request).toHaveBeenCalledWith('PUT', PERSONA, { persona: 'qa' });
  });

  it('can clear the reporting role without changing the membership role', async () => {
    routes.set(`PUT ${PERSONA}`, () => json(200, { success: true, persona: null, role: 'reviewer' }));
    open();
    const field = await screen.findByRole('combobox', { name: 'Reporting role' });
    fireEvent.change(field, { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save reporting role' }));
    await screen.findByText('Reporting role saved. Your access role is unchanged.');
    expect(mocks.request).toHaveBeenCalledWith('PUT', PERSONA, { persona: null });
  });

  it('does not offer persona controls if membership is refused or the server vocabulary is unknown', async () => {
    routes.set(`GET ${PERSONA}`, () => json(200, { persona: null, role: 'member', availablePersonas: ['super_admin'] }));
    open();
    expect(await within(section('Reporting role')).findByRole('alert')).toBeTruthy();
    expect(screen.queryByRole('combobox', { name: 'Reporting role' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Save reporting role' })).toBeNull();
  });

});

describe('self-service onboarding refuses unavailable sessions', () => {
  it('refuses all reads and writes after a session identity change', async () => {
    mocks.user = { id: '34', organizationId: '2' };
    open();
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', expect.stringContaining('session has changed'));
    expect(mocks.request).not.toHaveBeenCalled();
  });

  it('requires an authenticated access token even if the backend permits development fallbacks', async () => {
    mocks.token = null;
    open();
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(mocks.request).not.toHaveBeenCalled();
  });
});
