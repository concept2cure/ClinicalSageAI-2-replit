// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { authService } from '@/services/portal/authService';
import { queryClient } from '@/lib/queryClient';
import { OrganizationSwitcher } from '../OrganizationSwitcher';
import { publishShellProject } from '../shellProject';
import { RichSectionEditor } from '../editor/RichSectionEditor';
import { deviceDraftKey } from '@/lib/deviceDraftCache';
import { isSessionChangeHeld } from '@/lib/sessionChangeGuard';
import type { Editor } from '@tiptap/core';

for (const proto of [Range.prototype, Element.prototype, Text.prototype]) {
  if (!('getClientRects' in proto)) Object.defineProperty(proto, 'getClientRects', { value: () => [] });
  if (!('getBoundingClientRect' in proto)) Object.defineProperty(proto, 'getBoundingClientRect', { value: () => ({ top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0 }) });
}
function canvas(): Editor {
  const element = document.querySelector('.rse-body .tiptap') as (HTMLElement & { editor?: Editor }) | null;
  if (!element?.editor) throw new Error('Editor has not mounted');
  return element.editor;
}
const edit = (content: string) => act(() => { canvas().commands.setContent(`<p>${content}</p>`); });
async function editorAndAccount() {
  const ref = React.createRef<React.ComponentRef<typeof RichSectionEditor>>();
  render(<><RichSectionEditor ref={ref} value="<p>Saved narrative.</p>" onSave={vi.fn(async () => undefined)} storageKey="switch-section" /><OrganizationSwitcher userId="33" organizationId="1" navigate={navigate} onClose={onClose} /></>);
  await waitFor(() => expect(document.querySelector('.rse-body .tiptap')).toBeTruthy());
  await choose();
  return ref;
}

const LIST = '/api/organizations?membershipOnly=true';
const SELECT = '/api/auth/enterprise/select-organization';
const SOURCE_TOKEN = `test.${btoa(JSON.stringify({ userId: 33, organizationId: 1 }))}.synthetic`;
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
  authService.setToken(SOURCE_TOKEN, user(), 'old-workspace-refresh', 3600);
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
    expect(calls[0]).toMatchObject({ method: 'GET', path: LIST, auth: `Bearer ${SOURCE_TOKEN}` });
    await choose();
    expect(screen.getByText(/Save or resolve unsaved work before switching/)).toBeTruthy();
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
    expect(calls.find(call => call.path === SELECT)).toMatchObject({ method: 'POST', auth: `Bearer ${SOURCE_TOKEN}`, body: { organizationId: '71' } });
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

describe('workspace switching holds the existing editor before spending the bearer', () => {
  it('refuses dirty preflight without rotating, purging drafts or asking a second confirmation', async () => {
    const editor = await editorAndAccount();
    edit('Unsaved medical narrative');
    const ownDraft = localStorage.getItem(deviceDraftKey('33', 'switch-section'));
    expect(ownDraft).toContain('Unsaved medical narrative');
    fireEvent.click(screen.getByRole('button', { name: 'Confirm switch' }));
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', expect.stringContaining('Nothing was switched'));
    expect(calls.some(call => call.path === SELECT)).toBe(false);
    expect(localStorage.getItem(deviceDraftKey('33', 'switch-section'))).toBe(ownDraft);
    expect(authService.getUser()?.organizationId).toBe('1');
    expect(canvas().isEditable).toBe(true);
    await act(async () => { await editor.current!.save(); });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm switch' }));
    await waitFor(() => expect(navigate).toHaveBeenCalledOnce());
    expect(canvas().isEditable).toBe(false);
    expect(isSessionChangeHeld()).toBe(true);
  });

  it('holds editing while SELECT waits and restores it after a definite membership refusal', async () => {
    let finish!: (response: Response) => void;
    routes.set(`POST ${SELECT}`, () => new Promise(resolve => { finish = resolve; }));
    const editor = await editorAndAccount();
    const key = deviceDraftKey('33', 'closed-section');
    localStorage.setItem(key, 'Previously cached same-account text');
    fireEvent.click(screen.getByRole('button', { name: 'Confirm switch' }));
    await waitFor(() => expect(calls.some(call => call.path === SELECT)).toBe(true));
    expect(canvas().isEditable).toBe(false);
    expect(editor.current!.insertSuggestion('Late suggested prose', { id: 'ana', name: 'AnA' })).toBe(false);
    await act(async () => { finish(json(403, { error: 'ORG_ACCESS_DENIED', message: 'Membership refused' })); });
    await screen.findByRole('alert');
    expect(isSessionChangeHeld()).toBe(false);
    expect(canvas().isEditable).toBe(true);
    expect(localStorage.getItem(key)).toBe('Previously cached same-account text');
    expect(authService.getUser()?.organizationId).toBe('1');
    expect(navigate).not.toHaveBeenCalled();
  });

  it('keeps the old editor held after assign returns until the current document unloads', async () => {
    await editorAndAccount();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm switch' }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/concept2cure/projects'));
    expect(authService.getUser()?.organizationId).toBe('71');
    expect(canvas().isEditable).toBe(false);
    expect(isSessionChangeHeld()).toBe(true);
    expect(screen.queryByRole('button', { name: 'Save section' })).toBeNull();
  });

  it('holds the raw source textarea without rewriting the device recovery cache', async () => {
    let finish!: (response: Response) => void;
    routes.set(`POST ${SELECT}`, () => new Promise(resolve => { finish = resolve; }));
    const key = deviceDraftKey('33', 'source-section');
    const cached = '<figure><figcaption>Recovered source draft</figcaption></figure>';
    localStorage.setItem(key, cached);
    render(<><RichSectionEditor value="<figure><img src='/api/authoring/images/file_1_a'><figcaption>Saved figure</figcaption></figure>" onSave={vi.fn()} storageKey="source-section" /><OrganizationSwitcher userId="33" organizationId="1" navigate={navigate} onClose={onClose} /></>);
    const textarea = await screen.findByRole('textbox', { name: 'Section source' }) as HTMLTextAreaElement;
    await choose();
    expect(textarea.readOnly).toBe(false);
    expect(localStorage.getItem(key)).toBe(cached);
    fireEvent.click(screen.getByRole('button', { name: 'Confirm switch' }));
    await waitFor(() => expect(calls.some(call => call.path === SELECT)).toBe(true));
    expect(textarea.readOnly).toBe(true);
    expect(localStorage.getItem(key)).toBe(cached);
    await act(async () => { finish(json(403, { error: 'ORG_ACCESS_DENIED', message: 'Membership refused' })); });
    await screen.findByRole('alert');
    expect(textarea.readOnly).toBe(false);
    expect(localStorage.getItem(key)).toBe(cached);
  });
});

describe('workspace switching waits for an existing editor write to settle', () => {
  it('refuses preflight during a save even when typing returns the buffer to its old baseline', async () => {
    let finish!: () => void;
    const saving = new Promise<void>(resolve => { finish = resolve; });
    const ref = React.createRef<React.ComponentRef<typeof RichSectionEditor>>();
    render(<><RichSectionEditor ref={ref} value="<p>Saved narrative.</p>" onSave={vi.fn(() => saving)} storageKey="pending-write" /><OrganizationSwitcher userId="33" organizationId="1" navigate={navigate} onClose={onClose} /></>);
    await waitFor(() => expect(document.querySelector('.rse-body .tiptap')).toBeTruthy());
    await choose();
    edit('A submitted save');
    let pending!: Promise<boolean>;
    act(() => { pending = ref.current!.save(); });
    edit('Saved narrative.');
    fireEvent.click(screen.getByRole('button', { name: 'Confirm switch' }));
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', expect.stringContaining('Nothing was switched'));
    expect(calls.some(call => call.path === SELECT)).toBe(false);
    expect(authService.getUser()?.organizationId).toBe('1');
    await act(async () => { finish(); await pending; });
    await act(async () => { await ref.current!.save(); });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm switch' }));
    await waitFor(() => expect(navigate).toHaveBeenCalledOnce());
    expect(isSessionChangeHeld()).toBe(true);
    expect(canvas().isEditable).toBe(false);
    expect(await ref.current!.save()).toBe(false);
  });
});

describe('a pending switch cannot adopt over newly unsaved work or a replacement sign-in', () => {
  it.each(['select', 'probe'])('rechecks after %s, expires the spent bearer and preserves only the original account recovery cache', async phase => {
    let finish!: (response: Response) => void;
    const endpoint = phase === 'select' ? `POST ${SELECT}` : `GET ${SESSION}`;
    routes.set(endpoint, () => new Promise(resolve => { finish = resolve; }));
    await editorAndAccount();
    localStorage.setItem(deviceDraftKey('34', 'another-person'), 'Other account cache');
    localStorage.setItem('dc::legacy-section', 'Old unscoped cache');
    fireEvent.click(screen.getByRole('button', { name: 'Confirm switch' }));
    await waitFor(() => expect(calls.some(call => call.path === (phase === 'select' ? SELECT : SESSION))).toBe(true));
    expect(canvas().isEditable).toBe(false);
    // A delayed programmatic editor command can still change a held TipTap instance.
    edit('Unexpected late unsaved narrative');
    const key = deviceDraftKey('33', 'switch-section');
    const cached = localStorage.getItem(key);
    expect(cached).toContain('Unexpected late unsaved narrative');
    await act(async () => { finish(phase === 'select'
      ? json(200, { success: true, token: 'new-workspace-token', organization: { id: '71' } })
      : json(200, { authenticated: true, user: user('71') })); });
    await screen.findByRole('button', { name: 'Sign in again' });
    expect(authService.isAuthenticated()).toBe(false);
    expect(localStorage.getItem('trialsage_access_token')).toBeNull();
    expect(sessionStorage.getItem('trialsage_access_token')).toBeNull();
    expect(localStorage.getItem(key)).toBe(cached);
    expect(localStorage.getItem(deviceDraftKey('34', 'another-person'))).toBeNull();
    expect(localStorage.getItem('dc::legacy-section')).toBeNull();
    expect(navigate).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(isSessionChangeHeld()).toBe(false);
  });

  it.each(['select', 'probe'])('does not end an unrelated new sign-in while %s was pending', async phase => {
    let finish!: (response: Response) => void;
    const endpoint = phase === 'select' ? `POST ${SELECT}` : `GET ${SESSION}`;
    routes.set(endpoint, () => new Promise(resolve => { finish = resolve; }));
    await editorAndAccount();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm switch' }));
    await waitFor(() => expect(calls.some(call => call.path === (phase === 'select' ? SELECT : SESSION))).toBe(true));
    act(() => { authService.setToken('replacement-login', user('72', '34'), 'replacement-refresh', 3600); });
    await act(async () => { finish(phase === 'select'
      ? json(200, { success: true, token: 'new-workspace-token', organization: { id: '71' } })
      : json(200, { authenticated: true, user: user('71') })); });
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', expect.stringContaining('session has changed'));
    expect(authService.getUser()).toMatchObject({ id: '34', organizationId: '72' });
    expect(localStorage.getItem('trialsage_access_token')).toBe('replacement-login');
    expect(navigate).not.toHaveBeenCalled();
    expect(isSessionChangeHeld()).toBe(true);
    expect(canvas().isEditable).toBe(false);
  });

  it('preserves a replacement sign-in for the same account and organization while SELECT waits', async () => {
    let finish!: (response: Response) => void;
    routes.set(`POST ${SELECT}`, () => new Promise(resolve => { finish = resolve; }));
    await editorAndAccount();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm switch' }));
    await waitFor(() => expect(calls.some(call => call.path === SELECT)).toBe(true));
    act(() => { authService.setToken('same-identity-replacement', user(), 'replacement-refresh', 3600); });
    await act(async () => { finish(json(200, { success: true, token: 'new-workspace-token', organization: { id: '71' } })); });
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', expect.stringContaining('session has changed'));
    expect(calls.some(call => call.path === SESSION)).toBe(false);
    expect(authService.getUser()).toMatchObject({ id: '33', organizationId: '1' });
    expect(localStorage.getItem('trialsage_access_token')).toBe('same-identity-replacement');
    expect(isSessionChangeHeld()).toBe(true);
    expect(canvas().isEditable).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
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
