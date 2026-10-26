// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { authService } from '@/services/portal/authService';
import { queryClient } from '@/lib/queryClient';
import { getAuthToken, setAuthToken } from '@/utils/authToken';
import { isSessionChangeHeld, registerSessionChangeGuard } from '@/lib/sessionChangeGuard';
import { OrganizationAccess } from '../OrganizationAccess';
import { switchOrganization } from '../switchOrganization';
import { __resetCeremonies } from '../ceremony';

const INBOX = '/api/tenant-users/invitations/mine';
const SELECT = '/api/auth/enterprise/select-organization';
const jwt = (userId = 33, organizationId = 7) => `test.${btoa(JSON.stringify({ userId, organizationId }))}.synthetic`;
const user = (id = '33', organizationId = '7') => ({ id, organizationId, email: 'ada@c2c.test', roles: ['member'], permissions: [], mfaEnabled: false, mfaMethods: [], mustChangePassword: false });
const invitation = { id: 52, organizationId: 9, organizationName: 'Sponsor', email: 'ada@c2c.test', role: 'reviewer', status: 'pending' };
const accepted = { success: true, data: { invitationId: 52, organizationId: 9, userId: 33, role: 'member', status: 'accepted' } };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const routes = new Map<string, () => Response | Promise<Response>>();
const calls: { method: string; path: string }[] = [];
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
async function open() {
  render(<OrganizationAccess />); fireEvent.click(screen.getByRole('button', { name: 'Organizations and invitations' }));
  await screen.findByRole('button', { name: 'Switch to Sponsor' });
}
async function decide(action: 'Accept' | 'Decline') {
  await open(); fireEvent.click(await screen.findByRole('button', { name: `${action} invitation from Sponsor` }));
  return within(screen.getByRole('dialog')).getByRole('button', { name: `${action} invitation` });
}
beforeEach(() => {
  authService.endSession(null); queryClient.clear(); __resetCeremonies(); routes.clear(); calls.length = 0;
  authService.setToken(jwt(), user(), 'synthetic-refresh', 3600);
  routes.set(`GET ${INBOX}`, () => json([invitation]));
  routes.set('GET /api/auth/enterprise/organizations', () => json([{ id: 7, name: 'Current', role: 'member', status: 'active' }, { id: 9, name: 'Sponsor', role: 'reviewer', status: 'active' }]));
  routes.set(`POST /api/tenant-users/invitations/52/accept`, () => json(accepted));
  routes.set(`POST /api/tenant-users/invitations/52/decline`, () => json({ success: true }));
  routes.set(`POST ${SELECT}`, () => json({ success: true, token: jwt(33, 9), organization: { id: '9' } }));
  routes.set('GET /api/v1/auth/session', () => json({ authenticated: true, user: user('33', '9') }));
  vi.stubGlobal('fetch', vi.fn(async (input: Parameters<typeof fetch>[0], init: Parameters<typeof fetch>[1] = {}) => {
    const path = String(input); const method = init.method ?? 'GET'; calls.push({ method, path });
    return routes.get(`${method} ${path}`)?.() ?? json({}, 404);
  }));
});
afterEach(() => { cleanup(); queryClient.clear(); authService.endSession(null); __resetCeremonies(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it.each(['Accept', 'Decline'] as const)('refuses a retained %s decision after bearer replacement', async action => {
  const submit = await decide(action); setAuthToken(jwt(44, 2)); fireEvent.click(submit);
  await waitFor(() => expect(calls.filter(c => c.method === 'POST')).toHaveLength(0));
});

it('withholds a late invitation list after the bearer changes', async () => {
  const pending = deferred<Response>(); routes.set(`GET ${INBOX}`, () => pending.promise);
  await open(); setAuthToken(jwt(44, 2));
  await act(async () => { pending.resolve(json([invitation])); });
  expect(screen.queryByRole('button', { name: 'Accept invitation from Sponsor' })).toBeNull();
});

it('does not accept an unnamed inviting organization', async () => {
  routes.set(`GET ${INBOX}`, () => json([{ ...invitation, organizationName: null }]));
  await open(); await screen.findByText('Organization name unavailable');
  expect(screen.getByRole('button', { name: /Accept invitation/ })).toHaveProperty('disabled', true);
});

it('rejects duplicate pending invitation identities', async () => {
  routes.set(`GET ${INBOX}`, () => json([invitation, invitation])); await open();
  await screen.findByRole('alert'); expect(screen.queryByRole('button', { name: /Accept invitation/ })).toBeNull();
});

it.each([{ success: true }, { ...accepted, data: { ...accepted.data, userId: 44 } }])('does not acknowledge an unconfirmed membership: %j', async result => {
  routes.set('POST /api/tenant-users/invitations/52/accept', () => json(result));
  fireEvent.click(await decide('Accept')); await screen.findByText(/did not confirm membership/);
  expect(screen.queryByText(/Invitation accepted\./)).toBeNull();
});

it('withholds a late consent acknowledgement after the owner changes', async () => {
  const pending = deferred<Response>(); routes.set('POST /api/tenant-users/invitations/52/accept', () => pending.promise);
  fireEvent.click(await decide('Accept')); const reads = calls.filter(c => c.path === INBOX).length; setAuthToken(jwt(44, 2));
  await act(async () => { pending.resolve(json(accepted)); });
  expect(screen.queryByText(/Invitation accepted\./)).toBeNull();
  expect(calls.filter(c => c.path === INBOX)).toHaveLength(reads);
});

it('refuses a stale source before the shared helper rotates a session', async () => {
  setAuthToken(jwt(44, 2));
  await expect(switchOrganization(9, vi.fn(), { userId: '33', organizationId: '7' })).rejects.toThrow(/session|account/i);
  expect(calls.filter(c => c.method === 'POST')).toHaveLength(0);
});

it('does not adopt over or end an unrelated login while SELECT is pending', async () => {
  const pending = deferred<Response>(); routes.set(`POST ${SELECT}`, () => pending.promise);
  const navigate = vi.fn(); const operation = switchOrganization(9, navigate).catch(error => error);
  await waitFor(() => expect(calls.some(c => c.path === SELECT)).toBe(true));
  authService.setToken(jwt(44, 2), user('44', '2'), 'new-refresh', 3600);
  pending.resolve(json({ success: true, token: jwt(33, 9), organization: { id: '9' } })); await operation;
  expect(getAuthToken()).toBe(jwt(44, 2)); expect(authService.getUser()?.id).toBe('44');
  expect(navigate).not.toHaveBeenCalled();
});

it('reserves the native editor before the shared helper spends a bearer', async () => {
  let dirty = false; const hold = vi.fn();
  const unregister = registerSessionChangeGuard({ hasUnsavedWork: () => dirty, hold });
  const pending = deferred<Response>(); routes.set(`POST ${SELECT}`, () => pending.promise);
  const operation = switchOrganization(9, vi.fn()).catch(error => error);
  try {
    await waitFor(() => expect(calls.some(c => c.path === SELECT)).toBe(true));
    expect(isSessionChangeHeld()).toBe(true); expect(hold).toHaveBeenCalledWith(true);
  } finally {
    dirty = true; pending.resolve(json({ success: true, token: jwt(33, 9), organization: { id: '9' } }));
    await operation; unregister();
  }
});

it('ends its own uncertain session after a network failure without navigating', async () => {
  routes.set(`POST ${SELECT}`, () => { throw new TypeError('Failed to fetch'); });
  const navigate = vi.fn(); await expect(switchOrganization(9, navigate)).rejects.toThrow();
  expect(getAuthToken()).toBeNull(); expect(navigate).not.toHaveBeenCalled();
});

it('clears the canonical in-memory bearer when AuthService ends a session', () => {
  setAuthToken(jwt()); localStorage.clear(); sessionStorage.clear();
  authService.endSession(null);
  expect(getAuthToken()).toBeNull();
});
