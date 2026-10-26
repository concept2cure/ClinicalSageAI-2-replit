// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const mocks = vi.hoisted(() => ({ request: vi.fn(), user: { id: '33', organizationId: '1' } }));
vi.mock('@/lib/queryClient', async original => ({ ...(await original<typeof import('@/lib/queryClient')>()), apiRequest: mocks.request }));
vi.mock('@/services/portal/authService', () => ({ useAuth: () => ({ user: mocks.user }) }));
vi.mock('../OrganizationSwitcher', () => ({ OrganizationSwitcher: ({ revision }: { revision: number }) => <span>Membership revision {revision}</span> }));
vi.mock('../CompanyDocumentsAccountSection', () => ({ CompanyDocumentsAccountSection: () => null }));
vi.mock('../NotificationPreferences', () => ({ NotificationPreferenceAccountSection: () => null }));

import { AccountOnboardingSettings } from '../AccountOnboardingSettings';
import { queryClient } from '@/lib/queryClient';
import { clearAuthToken, setAuthToken } from '@/utils/authToken';
import { reportPersonaKey } from '../reportingPersona';

const INBOX = '/api/tenant-users/invitations/mine';
const PERSONA = '/api/users/me/persona';
const persona = { persona: 'ra_lead', role: 'reviewer', availablePersonas: ['ra_lead', 'qa'] };
const invitation = { id: 52, organizationId: 71, organizationName: 'Inviting sponsor', email: 'ada@c2c.test', role: 'reviewer', status: 'pending' };
const token = (userId = 33, organizationId = 1) => `test.${btoa(JSON.stringify({ userId, organizationId }))}.synthetic`;
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
const routes = new Map<string, () => Response | Promise<Response>>();
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
const open = () => render(<AccountOnboardingSettings userId="33" organizationId="1" />);
async function editPersona() {
  const field = await screen.findByRole('combobox', { name: 'Reporting role' });
  fireEvent.change(field, { target: { value: 'qa' } });
  return screen.getByRole('button', { name: 'Save reporting role' });
}
beforeEach(() => {
  setAuthToken(token()); queryClient.clear(); routes.clear(); mocks.request.mockReset();
  routes.set(`GET ${INBOX}`, () => json([invitation]));
  routes.set(`GET ${PERSONA}`, () => json(persona));
  routes.set(`PUT ${PERSONA}`, () => json({ success: true, persona: 'qa', role: 'reviewer' }));
  routes.set('POST /api/tenant-users/invitations/52/accept', () => json({ success: true, data: { invitationId: 52, organizationId: 71, userId: 33, role: 'reviewer', status: 'accepted' } }));
  mocks.request.mockImplementation(async (method: string, path: string) => routes.get(`${method} ${path}`)?.() ?? json({}));
});
afterEach(() => { cleanup(); queryClient.clear(); clearAuthToken(); vi.restoreAllMocks(); });

it('pins Account reads and mutations to the validated captured actor', async () => {
  open(); fireEvent.click(await editPersona());
  await screen.findByText('Reporting role saved. Your access role is unchanged.');
  const headers = { Authorization: `Bearer ${token()}`, 'x-organization-id': '1' };
  expect(mocks.request).toHaveBeenCalledWith('GET', PERSONA, undefined, headers);
  expect(mocks.request).toHaveBeenCalledWith('GET', INBOX, undefined, headers);
  expect(mocks.request).toHaveBeenCalledWith('PUT', PERSONA, { persona: 'qa' }, headers);
});

it.each(['persona', 'accept', 'decline'])('refuses a stale bearer before %s while auth context still shows the old owner', async action => {
  open(); const save = await editPersona();
  await screen.findByRole('button', { name: 'Accept invitation to Inviting sponsor' });
  setAuthToken(token(44, 2));
  if (action === 'persona') fireEvent.click(save);
  else if (action === 'accept') fireEvent.click(screen.getByRole('button', { name: 'Accept invitation to Inviting sponsor' }));
  else {
    fireEvent.click(screen.getByRole('button', { name: 'Decline invitation to Inviting sponsor' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm decline' }));
  }
  await screen.findByRole('alert');
  expect(mocks.request.mock.calls.filter(([method]) => method !== 'GET')).toHaveLength(0);
});

it.each([INBOX, PERSONA])('withholds a late read from a replaced bearer: %s', async path => {
  const pending = deferred<Response>(); routes.set(`GET ${path}`, () => pending.promise);
  open(); await waitFor(() => expect(mocks.request.mock.calls.some(([method, url]) => method === 'GET' && url === path)).toBe(true));
  setAuthToken(token(44, 2));
  await act(async () => { pending.resolve(json(path === INBOX ? [invitation] : persona)); });
  await screen.findByRole('alert');
  if (path === INBOX) expect(screen.queryByRole('button', { name: /Accept invitation/ })).toBeNull();
  else expect(screen.queryByRole('combobox', { name: 'Reporting role' })).toBeNull();
});

it.each(['session change', 'unmount'])('never caches a late reporting save after %s', async ending => {
  const pending = deferred<Response>(); routes.set(`PUT ${PERSONA}`, () => pending.promise);
  const view = open(); fireEvent.click(await editPersona());
  if (ending === 'unmount') view.unmount(); else setAuthToken(token(44, 2));
  await act(async () => { pending.resolve(json({ success: true, persona: 'qa', role: 'reviewer' })); });
  expect(queryClient.getQueryData(reportPersonaKey('33', '1'))).toBeUndefined();
  expect(screen.queryByText('Reporting role saved. Your access role is unchanged.')).toBeNull();
});

it('does not refresh memberships or acknowledge a late invitation acceptance for a replaced session', async () => {
  const pending = deferred<Response>(); routes.set('POST /api/tenant-users/invitations/52/accept', () => pending.promise);
  open(); fireEvent.click(await screen.findByRole('button', { name: 'Accept invitation to Inviting sponsor' }));
  setAuthToken(token(44, 2));
  await act(async () => { pending.resolve(json({ success: true, data: { invitationId: 52, organizationId: 71, userId: 33, role: 'reviewer', status: 'accepted' } })); });
  expect(screen.getByText('Membership revision 0')).toBeTruthy();
  expect(screen.queryByText(/Invitation accepted for/)).toBeNull();
  expect(mocks.request.mock.calls.filter(([, path]) => path === INBOX)).toHaveLength(1);
});

it('rechecks ownership after response-body decoding', async () => {
  const body = deferred<unknown>();
  routes.set(`PUT ${PERSONA}`, () => ({ ok: true, json: () => body.promise }) as Response);
  open(); fireEvent.click(await editPersona());
  await act(async () => { await Promise.resolve(); });
  setAuthToken(token(44, 2));
  await act(async () => { body.resolve({ success: true, persona: 'qa', role: 'reviewer' }); });
  expect(queryClient.getQueryData(reportPersonaKey('33', '1'))).toBeUndefined();
  expect(screen.queryByText('Reporting role saved. Your access role is unchanged.')).toBeNull();
});

it('pins invitation acceptance and refreshes only after a current-owner confirmation', async () => {
  open(); fireEvent.click(await screen.findByRole('button', { name: 'Accept invitation to Inviting sponsor' }));
  await screen.findByText(/Invitation accepted for Inviting sponsor/);
  expect(mocks.request).toHaveBeenCalledWith('POST', '/api/tenant-users/invitations/52/accept', undefined,
    { Authorization: `Bearer ${token()}`, 'x-organization-id': '1' });
  expect(screen.getByText('Membership revision 1')).toBeTruthy();
});

it('does not acknowledge or reload after a late decline for a replaced bearer', async () => {
  const pending = deferred<Response>(); routes.set('POST /api/tenant-users/invitations/52/decline', () => pending.promise);
  open(); fireEvent.click(await screen.findByRole('button', { name: 'Decline invitation to Inviting sponsor' }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirm decline' }));
  setAuthToken(token(44, 2));
  await act(async () => { pending.resolve(json({ success: true })); });
  expect(screen.queryByText(/Invitation declined for/)).toBeNull();
  expect(mocks.request.mock.calls.filter(([, path]) => path === INBOX)).toHaveLength(1);
});

it('keeps the mutation lock until the saved record is confirmed', async () => {
  const pending = deferred<Response>(); routes.set(`PUT ${PERSONA}`, () => pending.promise);
  open(); const save = await editPersona();
  fireEvent.click(save); fireEvent.click(save);
  expect(mocks.request.mock.calls.filter(([method]) => method === 'PUT')).toHaveLength(1);
  await act(async () => { pending.resolve(json({ success: true, persona: 'qa', role: 'reviewer' })); });
  expect(queryClient.getQueryData(reportPersonaKey('33', '1'))).toMatchObject({ persona: 'qa', role: 'reviewer' });
});
