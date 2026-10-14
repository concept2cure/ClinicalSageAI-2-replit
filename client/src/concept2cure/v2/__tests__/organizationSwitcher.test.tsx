// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { authService } from '@/services/portal/authService';
import { queryClient } from '@/lib/queryClient';
import { OrganizationSwitcher } from '../OrganizationSwitcher';
import { publishShellProject } from '../shellProject';

const LIST = '/api/organizations?membershipOnly=true';
const SELECT = '/api/auth/enterprise/select-organization';
const SESSION = '/api/v1/auth/session';
const user = (organizationId = '1', id = '33') => ({ id, email: 'ada.rowe@c2c.test', organizationId, organizationName: organizationId === '1' ? 'First sponsor' : 'Second sponsor', roles: ['member'], permissions: [], mfaEnabled: false, mfaMethods: [], mustChangePassword: false });
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json' },
});
const routes = new Map<string, (auth: string | null) => Response | Promise<Response>>();
const calls: { method: string; path: string; auth: string | null; body: unknown }[] = [];
const navigate = vi.fn();
const onClose = vi.fn();

beforeEach(() => {
  authService.endSession(null);
  localStorage.clear();
  sessionStorage.clear();
  queryClient.clear();
  calls.length = 0;
  routes.clear();
  navigate.mockReset();
  onClose.mockReset();
  authService.setToken('old-workspace-token', user(), 'old-workspace-refresh', 3600);
  routes.set(`GET ${LIST}`, () => json(200, { success: true, organizations: [{ id: '1', name: 'First sponsor' }, { id: '71', name: 'Second sponsor' }] }));
  routes.set(`POST ${SELECT}`, () => json(200, { success: true, token: 'new-workspace-token', organization: { id: '71', name: 'Second sponsor' } }));
  routes.set(`GET ${SESSION}`, auth => auth === 'Bearer new-workspace-token'
    ? json(200, { authenticated: true, user: user('71'), session: { idleMinutes: 15, lifetimeHours: 12, expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString() } })
    : json(401, { authenticated: false, error: { code: 'AUTH_005', message: 'Session expired' } }));
  vi.stubGlobal('fetch', vi.fn(async (input: Parameters<typeof fetch>[0], init: Parameters<typeof fetch>[1] = {}) => {
    const path = typeof input === 'string' ? input : input instanceof URL ? input.pathname + input.search : input.url;
    const method = (init?.method ?? 'GET').toUpperCase();
    const auth = new Headers(init?.headers).get('Authorization');
    calls.push({ method, path, auth, body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined });
    return routes.get(`${method} ${path}`)?.(auth) ?? json(404, { error: 'Unexpected request' });
  }));
});
afterEach(() => {
  cleanup();
  authService.endSession(null);
  queryClient.clear();
  vi.unstubAllGlobals();
  delete (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT;
});
const open = () => render(<OrganizationSwitcher userId="33" organizationId="1" navigate={navigate} onClose={onClose} />);
async function choose() {
  fireEvent.change(await screen.findByLabelText('Organisation to open'), { target: { value: '71' } });
  fireEvent.click(screen.getByRole('button', { name: 'Switch organisation' }));
}

describe('verified account workspace switching', () => {
  it('lists actual memberships, requires a calm confirmation, and can cancel without rotating the session', async () => {
    open();
    expect(await screen.findByRole('option', { name: 'First sponsor (current)' })).toBeTruthy();
    expect(calls[0]).toMatchObject({ method: 'GET', path: LIST, auth: 'Bearer old-workspace-token' });
    await choose();
    expect(screen.getByText(/Unsaved changes on this page are discarded/)).toBeTruthy();
    expect(calls.some(call => call.method === 'POST')).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel switch' }));
    expect(screen.queryByRole('button', { name: 'Confirm switch' })).toBeNull();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('adopts the server-verified scoped session, clears predecessor context and opens a fresh shell without a program deep link', async () => {
    publishShellProject({ id: '11111111-1111-4111-8111-111111111111', code: 'OLD-ORG' });
    queryClient.setQueryData(['old-org-records'], { confidential: true });
    sessionStorage.setItem('token', 'legacy-predecessor');
    open();
    await choose();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm switch' }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/concept2cure/projects'));
    expect(calls.find(call => call.path === SELECT)).toMatchObject({ method: 'POST', auth: 'Bearer old-workspace-token', body: { organizationId: '71' } });
    expect(calls.find(call => call.path === SESSION)).toMatchObject({ auth: 'Bearer new-workspace-token' });
    expect(authService.getUser()).toMatchObject({ id: '33', organizationId: '71', roles: ['member'] });
    expect(localStorage.getItem('trialsage_access_token')).toBe('new-workspace-token');
    expect(localStorage.getItem('trialsage_refresh_token')).toBe('');
    expect(sessionStorage.getItem('token')).toBeNull();
    expect(sessionStorage.getItem('c2c.shell-project')).toBeNull();
    expect(window.C2C_PROJECT).toBeUndefined();
    expect(queryClient.getQueryData(['old-org-records'])).toBeUndefined();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('keeps a membership refusal visible and keeps the existing session', async () => {
    routes.set(`POST ${SELECT}`, () => json(403, { error: 'ORG_ACCESS_DENIED', message: 'You do not have access to this organization' }));
    open();
    await choose();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm switch' }));
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', expect.stringContaining('do not have access'));
    expect(authService.getUser()?.organizationId).toBe('1');
    expect(authService.isAuthenticated()).toBe(true);
    expect(navigate).not.toHaveBeenCalled();
    expect(calls.some(call => call.path === SESSION)).toBe(false);
  });

  it('ends the spent session and offers sign-in if the replacement session cannot be verified', async () => {
    routes.set(`GET ${SESSION}`, () => json(500, { error: { message: 'The session could not be read.' } }));
    open();
    await choose();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm switch' }));
    const button = await screen.findByRole('button', { name: 'Sign in again' });
    expect(authService.isAuthenticated()).toBe(false);
    expect(localStorage.getItem('trialsage_access_token')).toBeNull();
    expect(screen.queryByLabelText('Organisation to open')).toBeNull();
    fireEvent.click(button);
    expect(navigate).toHaveBeenCalledWith('/concept2cure/login');
  });

  it('does not store a replacement token whose verified user or organization differs from the requested membership', async () => {
    routes.set(`GET ${SESSION}`, () => json(200, { authenticated: true, user: user('72', '34') }));
    open();
    await choose();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm switch' }));
    await screen.findByRole('button', { name: 'Sign in again' });
    expect(authService.isAuthenticated()).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
    expect(localStorage.getItem('trialsage_access_token')).toBeNull();
  });

  it('does not retain a new session if fresh-shell navigation fails', async () => {
    navigate.mockImplementation(() => { throw new Error('Navigation failed'); });
    open();
    await choose();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm switch' }));
    await screen.findByRole('button', { name: 'Sign in again' });
    expect(authService.isAuthenticated()).toBe(false);
    expect(onClose).not.toHaveBeenCalled();
  });

});

describe('workspace switch refusals and request safety', () => {
  it('ends an expired access-token session rather than allowing another switch attempt', async () => {
    routes.set(`POST ${SELECT}`, () => json(401, { error: 'TOKEN_EXPIRED', message: 'Session expired. Please log in again.' }));
    open();
    await choose();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm switch' }));
    await screen.findByRole('button', { name: 'Sign in again' });
    expect(authService.isAuthenticated()).toBe(false);
    expect(screen.queryByRole('button', { name: 'Confirm switch' })).toBeNull();
  });

  it('requires sign-in when the select request has an unknown outcome after a network failure', async () => {
    routes.set(`POST ${SELECT}`, () => { throw new TypeError('Failed to fetch'); });
    open();
    await choose();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm switch' }));
    await screen.findByRole('button', { name: 'Sign in again' });
    expect(authService.isAuthenticated()).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toContain('could not be confirmed');
  });

  it('prevents duplicate session rotations while a switch request is pending', async () => {
    let finish!: (response: Response) => void;
    routes.set(`POST ${SELECT}`, () => new Promise<Response>(resolve => { finish = resolve; }));
    open();
    await choose();
    const button = screen.getByRole('button', { name: 'Confirm switch' });
    fireEvent.click(button);
    fireEvent.click(button);
    await waitFor(() => expect(calls.filter(call => call.path === SELECT)).toHaveLength(1));
    expect(screen.getByRole('button', { name: 'Switching…' })).toHaveProperty('disabled', true);
    await act(async () => { finish(json(200, { success: true, token: 'new-workspace-token', organization: { id: '71' } })); });
    await waitFor(() => expect(navigate).toHaveBeenCalledOnce());
  });

  it('shows a membership read error with retry rather than pretending there are no organizations', async () => {
    let fail = true;
    routes.set(`GET ${LIST}`, () => fail ? json(503, { error: 'The organization list is temporarily unavailable.' }) : json(200, { success: true, organizations: [] }));
    open();
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.queryByText('No organisation memberships were returned.')).toBeNull();
    fail = false;
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('No organisation memberships were returned.')).toBeTruthy();
  });

  it('renders the organization identifier when the backend has no name', async () => {
    routes.set(`GET ${LIST}`, () => json(200, { success: true, organizations: [{ id: '1', name: null }, { id: '71', name: '' }] }));
    open();
    expect(await screen.findByRole('option', { name: 'Organisation 71' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Organisation 1 (current)' })).toBeTruthy();
  });

  it('refuses a stale account identity before dispatching an organization change', async () => {
    open();
    await choose();
    act(() => authService.setToken('changed-session', user('72'), 'changed-refresh', 3600));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm switch' }));
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', expect.stringContaining('session has changed'));
    expect(calls.some(call => call.path === SELECT)).toBe(false);
  });
});
