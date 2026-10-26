// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { authService } from '@/services/portal/authService';
import { queryClient } from '@/lib/queryClient';
import { setAuthToken } from '@/utils/authToken';
import { OrganizationSwitcher } from '../OrganizationSwitcher';
import { reportPersonaKey, useCurrentReportPersona } from '../reportingPersona';

const LIST = '/api/organizations?membershipOnly=true';
const PERSONA = '/api/users/me/persona';
const SELECT = '/api/auth/enterprise/select-organization';
const jwt = (userId = 33, organizationId = 1) => `test.${btoa(JSON.stringify({ userId, organizationId }))}.synthetic`;
const user = { id: '33', organizationId: '1', email: 'ada@c2c.test', roles: ['member'], permissions: [], mfaEnabled: false, mfaMethods: [], mustChangePassword: false };
const profile = { persona: 'qa', role: 'member', availablePersonas: ['qa', 'ra_lead'] };
const memberships = { success: true, organizations: [{ id: '1', name: 'First sponsor' }, { id: '71', name: 'Second sponsor' }] };
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
const routes = new Map<string, () => Response | Promise<Response>>();
const calls: { method: string; path: string; headers: Headers }[] = [];
function Profile() {
  const read = useCurrentReportPersona();
  return <span>{read.isError ? 'Profile unavailable' : read.data?.persona ?? 'Reading profile'}</span>;
}
const openSwitch = () => render(<OrganizationSwitcher userId="33" organizationId="1" navigate={vi.fn()} />);
async function choose() {
  fireEvent.change(await screen.findByRole('combobox', { name: 'Organisation to open' }), { target: { value: '71' } });
  fireEvent.click(screen.getByRole('button', { name: 'Switch organisation' }));
}
beforeEach(() => {
  authService.endSession(null); queryClient.clear(); routes.clear(); calls.length = 0;
  authService.setToken(jwt(), user, 'synthetic-refresh', 3600);
  routes.set(`GET ${LIST}`, () => json(memberships));
  routes.set(`GET ${PERSONA}`, () => json(profile));
  vi.stubGlobal('fetch', vi.fn(async (input: Parameters<typeof fetch>[0], init: Parameters<typeof fetch>[1] = {}) => {
    const path = String(input); const method = init.method ?? 'GET';
    calls.push({ method, path, headers: new Headers(init.headers) });
    return routes.get(`${method} ${path}`)?.() ?? new Response('{}', { status: 403 });
  }));
});
afterEach(() => { cleanup(); queryClient.clear(); authService.endSession(null); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it.each(['profile', 'memberships'])('pins %s reads to the expected source organization', async kind => {
  render(kind === 'profile' ? <Profile /> : <OrganizationSwitcher userId="33" organizationId="1" />);
  if (kind === 'profile') await screen.findByText('qa'); else await screen.findByRole('option', { name: 'Second sponsor' });
  const call = calls.find(c => c.path === (kind === 'profile' ? PERSONA : LIST))!;
  expect(call.headers.get('Authorization')).toBe(`Bearer ${jwt()}`);
  expect(call.headers.get('x-organization-id')).toBe('1');
});

it.each(['profile', 'memberships'])('refuses %s preflight when bearer claims differ from the retained auth context', async kind => {
  setAuthToken(jwt(44, 2));
  render(kind === 'profile' ? <Profile /> : <OrganizationSwitcher userId="33" organizationId="1" />);
  if (kind === 'profile') await screen.findByText('Profile unavailable'); else await screen.findByRole('alert');
  expect(calls).toHaveLength(0);
});

it.each(['profile', 'memberships'])('withholds a late %s read after bearer replacement', async kind => {
  const pending = deferred<Response>(); const path = kind === 'profile' ? PERSONA : LIST;
  routes.set(`GET ${path}`, () => pending.promise);
  render(kind === 'profile' ? <Profile /> : <OrganizationSwitcher userId="33" organizationId="1" />);
  await waitFor(() => expect(calls.some(c => c.path === path)).toBe(true));
  setAuthToken(jwt(44, 2));
  await act(async () => { pending.resolve(json(kind === 'profile' ? profile : memberships)); });
  if (kind === 'profile') {
    expect(queryClient.getQueryData(reportPersonaKey('33', '1'))).toBeUndefined();
    expect(screen.queryByText('qa')).toBeNull();
  } else expect(screen.queryByRole('option', { name: 'Second sponsor' })).toBeNull();
});

it('does not cache an unmounted persona request', async () => {
  const pending = deferred<Response>(); routes.set(`GET ${PERSONA}`, () => pending.promise);
  const view = render(<Profile />);
  await waitFor(() => expect(calls).toHaveLength(1)); view.unmount();
  await act(async () => { pending.resolve(json(profile)); });
  expect(queryClient.getQueryData(reportPersonaKey('33', '1'))).toBeUndefined();
});

it('withholds a cached persona immediately when current bearer claims belong to another account', async () => {
  queryClient.setQueryData(reportPersonaKey('33', '1'), profile);
  setAuthToken(jwt(44, 2)); render(<Profile />);
  expect(screen.queryByText('qa')).toBeNull();
  await screen.findByText('Profile unavailable');
  expect(calls).toHaveLength(0);
});

it('rechecks persona ownership after JSON decoding', async () => {
  const body = deferred<unknown>(); routes.set(`GET ${PERSONA}`, () => ({ ok: true, json: () => body.promise }) as Response);
  render(<Profile />); await waitFor(() => expect(calls).toHaveLength(1));
  setAuthToken(jwt(44, 2));
  await act(async () => { body.resolve(profile); });
  expect(queryClient.getQueryData(reportPersonaKey('33', '1'))).toBeUndefined();
});

it('refuses a stale source bearer before spending a workspace session', async () => {
  openSwitch(); await choose(); setAuthToken(jwt(44, 2));
  fireEvent.click(screen.getByRole('button', { name: 'Confirm switch' }));
  await screen.findByRole('alert');
  expect(calls.some(c => c.path === SELECT)).toBe(false);
  expect(authService.getUser()?.id).toBe('33');
});

it('pins workspace rotation to the source organization', async () => {
  openSwitch(); await choose();
  fireEvent.click(screen.getByRole('button', { name: 'Confirm switch' }));
  await screen.findByRole('alert');
  const call = calls.find(c => c.path === SELECT)!;
  expect(call.headers.get('Authorization')).toBe(`Bearer ${jwt()}`);
  expect(call.headers.get('x-organization-id')).toBe('1');
});
