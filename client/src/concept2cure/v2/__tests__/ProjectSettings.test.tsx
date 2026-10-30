// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProjectSettingsData, ProjectSettingsWrite } from '@shared/project-settings';
const request = vi.hoisted(() => vi.fn());
const tenant = vi.hoisted(() => ({ organizationId: 7, workspace: { id: '21', organizationId: '7' } as { id: string; organizationId: string } | null }));
vi.mock('@/lib/queryClient', async original => ({ ...await original<typeof import('@/lib/queryClient')>(), apiRequest: request }));
vi.mock('@/services/portal/authService', async original => {
  const actual = await original<typeof import('@/services/portal/authService')>();
  return { ...actual, useAuthUser: () => actual.authService.getUser() };
});
vi.mock('@/contexts/TenantContext', () => ({ useTenant: () => ({ currentOrganization: { id: tenant.organizationId }, currentClientWorkspace: tenant.workspace }) }));
import { authService } from '@/services/portal/authService';
import { ApiRequestError } from '@/lib/queryClient';
import { setAuthToken } from '@/utils/authToken';
import { ProjectSettings } from '../surfaces/ProjectSettings';
import { clearShellProject, publishShellProject } from '../shellProject';
const PROGRAM = '9a7f0b10-0000-4000-8000-0000000000aa';
const OTHER = '9a7f0b10-0000-4000-8000-0000000000bb';
const ACTOR = { id: '12', organizationId: '7', permissions: ['governed:write'], displayName: 'Current actor' };
const jwt = (userId = 12, organizationId = 7, marker = 'original') => `e30.${btoa(JSON.stringify({ userId, organizationId }))}.${marker}`;
const data = (): ProjectSettingsData => ({ programId: PROGRAM, projectId: 31, organizationId: 7, actorUserId: 12, clientWorkspaceId: 21,
  canChange: true, revision: `v1:${'a'.repeat(64)}`, description: 'Private project description', priority: 'medium', targetSubmissionDate: '2027-03-15' });
const response = (body: unknown, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;
const readResponse = (over: Partial<ProjectSettingsData> = {}) => response({ success: true, data: { ...data(), ...over } });
const savedResponse = (write: ProjectSettingsWrite) => response({ success: true, data: { ...data(), ...write.patch, revision: `v1:${'b'.repeat(64)}` },
  meta: { auditTrail: { persisted: true, chained: true }, changedFields: Object.keys(write.patch) } });
const patches = () => request.mock.calls.filter(([method]) => method === 'PATCH');
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
function mount(onSaved = vi.fn()) { return { onSaved, ...render(<ProjectSettings programId={PROGRAM} onSaved={onSaved} />) }; }
async function open() {
  fireEvent.click(screen.getByRole('button', { name: 'Project settings' }));
  await screen.findByRole('textbox', { name: 'Project description' });
}
async function review() {
  await open();
  fireEvent.change(screen.getByRole('combobox', { name: 'Project priority' }), { target: { value: 'high' } });
  fireEvent.click(screen.getByRole('button', { name: 'Review settings change' }));
  return screen.findByRole('dialog');
}
async function submit(dialog: HTMLElement = screen.getByRole('dialog'), reason = 'Sponsor milestone alignment') {
  fireEvent.change(within(dialog).getByPlaceholderText('Captured verbatim in the audit log. Be specific.'), { target: { value: reason } });
  fireEvent.change(within(dialog).getByPlaceholderText('yes'), { target: { value: 'yes' } });
  await act(async () => { fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm and log' })); });
}
beforeEach(() => {
  tenant.organizationId = 7; tenant.workspace = { id: '21', organizationId: '7' };
  authService.setToken(jwt(), ACTOR, 'fixture-refresh', 3600);
  publishShellProject({ id: PROGRAM, title: 'Current project' });
  request.mockImplementation(async (method: string, _path: string, write?: ProjectSettingsWrite) => method === 'GET' ? readResponse() : savedResponse(write!));
});
afterEach(() => { cleanup(); authService.endSession(null); clearShellProject(); request.mockReset(); vi.unstubAllGlobals(); });

describe('Project settings reads and bounded fields', () => {
  it('reads lazily, renders actual fields, prevents a no-op and records only the reasoned difference', async () => {
    const { onSaved } = mount();
    expect(request).not.toHaveBeenCalled();
    await open();
    expect((screen.getByRole('button', { name: 'Review settings change' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByRole('textbox', { name: /owner|name|filing|client/i })).toBeNull();
    fireEvent.change(screen.getByRole('combobox', { name: 'Project priority' }), { target: { value: 'high' } });
    fireEvent.click(screen.getByRole('button', { name: 'Review settings change' }));
    expect(screen.getByRole('dialog').textContent).toContain('Current project · Priority');
    expect(screen.getByRole('dialog').textContent).not.toContain(PROGRAM);
    await submit();
    await screen.findByText(/saved with your reason in the chained audit/i);
    expect(onSaved).toHaveBeenCalledOnce();
    expect(patches()[0][2]).toEqual({ revision: data().revision, reason: 'Sponsor milestone alignment', patch: { priority: 'high' } });
    expect(patches()[0][3]).toMatchObject({ 'x-client-id': '21', 'x-organization-id': '7', Authorization: `Bearer ${jwt()}` });
  });
  it('clears description and recorded target with null without inventing another change', async () => {
    mount(); await open();
    fireEvent.change(screen.getByRole('textbox', { name: 'Project description' }), { target: { value: '   ' } });
    fireEvent.change(screen.getByLabelText('Target submission date'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Review settings change' })); await submit();
    expect(patches()[0][2].patch).toEqual({ description: null, targetSubmissionDate: null });
  });
  it('leaves an admitted reader read-only when the fresh capability is false', async () => {
    request.mockResolvedValue(readResponse({ canChange: false }));
    mount(); await open();
    expect((screen.getByRole('textbox', { name: 'Project description' }) as HTMLTextAreaElement).disabled).toBe(true);
    expect(screen.queryByRole('button', { name: 'Review settings change' })).toBeNull();
  });
  it('does not propose trimming a legacy description that the person has not edited', async () => {
    request.mockResolvedValue(readResponse({ description: '  Legacy saved description  ' }));
    mount(); await open();
    expect((screen.getByRole('textbox', { name: 'Project description' }) as HTMLTextAreaElement).value).toBe('  Legacy saved description  ');
    expect((screen.getByRole('button', { name: 'Review settings change' }) as HTMLButtonElement).disabled).toBe(true);
    expect(patches()).toHaveLength(0);
  });
  it('pins writes to the verified GET parent when the global workspace was empty', async () => {
    tenant.workspace = null;
    mount(); await review(); await submit();
    expect(request.mock.calls[0][3]).not.toHaveProperty('x-client-id');
    expect(patches()[0][3]).toHaveProperty('x-client-id', '21');
  });
  it.each(['program', 'actor', 'organization', 'anchor', 'workspace', 'revision', 'date', 'priority', 'pending'])('refuses a malformed %s settings read without blank editable defaults', async defect => {
    const body: { success: boolean; data: Record<string, unknown>; meta?: unknown } = { success: true, data: { ...data() } };
    const changes: Record<string, Record<string, unknown>> = { program: { programId: OTHER }, actor: { actorUserId: 99 }, organization: { organizationId: 99 }, anchor: { projectId: 0 },
      workspace: { clientWorkspaceId: 22 }, revision: { revision: 'v1:bad' }, date: { targetSubmissionDate: '2027-02-30' }, priority: { priority: 'urgent' } };
    Object.assign(body.data, changes[defect]);
    if (defect === 'pending') body.meta = { pendingStore: true };
    request.mockResolvedValue(response(body)); mount();
    fireEvent.click(screen.getByRole('button', { name: 'Project settings' }));
    await screen.findByText(/could not be verified/i);
    expect(screen.queryByRole('textbox', { name: 'Project description' })).toBeNull();
  });
  it('bounds the governed reason before sending a write', async () => {
    mount(); const dialog = await review();
    await submit(dialog, 'x'.repeat(2001));
    await within(dialog).findByText(/between 8 and 2000/i);
    expect(patches()).toHaveLength(0);
  });
});

describe('Project settings uncertain or conflicting saves', () => {
  it.each(['network', 'zero', 'server', 'explicit', 'receipt', 'audit', 'scope', 'unchanged-field', 'changed-fields'])('holds a %s outcome across collapse until an explicit reload', async defect => {
    const { onSaved } = mount();
    request.mockImplementation(async (method: string, _path: string, write?: ProjectSettingsWrite) => {
      if (method === 'GET') return readResponse();
      if (defect === 'network') throw new TypeError('Failed to fetch');
      if (defect === 'zero') throw new ApiRequestError('Unconfirmed save.', 0);
      if (defect === 'server') throw new ApiRequestError('Unconfirmed save.', 503);
      if (defect === 'explicit') throw new ApiRequestError('Unconfirmed save.', 409, {}, 'OUTCOME_UNKNOWN');
      if (defect === 'receipt') return response({ success: true });
      const result = await savedResponse(write!).json();
      if (defect === 'audit') result.meta.auditTrail.chained = false;
      if (defect === 'scope') result.data.clientWorkspaceId = 22;
      if (defect === 'unchanged-field') result.data.description = 'Unexpected different description';
      if (defect === 'changed-fields') result.meta.changedFields = [];
      return response(result);
    });
    await review(); await submit();
    await screen.findByText(/could not be confirmed/i);
    fireEvent.click(screen.getByRole('button', { name: 'Close settings' }));
    fireEvent.click(screen.getByRole('button', { name: 'Project settings' }));
    expect(request.mock.calls.filter(([method]) => method === 'GET')).toHaveLength(1);
    expect((screen.getByRole('button', { name: 'Review settings change' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Reload saved settings' }));
    await screen.findByText(/Current saved settings loaded/);
    expect(patches()).toHaveLength(1); expect(onSaved).not.toHaveBeenCalled();
  });
  it('requires a fresh read after a stale row refusal and never automatically repeats PATCH', async () => {
    request.mockImplementation(async (method: string) => {
      if (method === 'GET') return readResponse();
      throw new ApiRequestError('Another change updated this project. Reload saved settings.', 409, { error: 'PROJECT_SETTINGS_STALE', message: 'Another change updated this project. Reload saved settings.' });
    });
    mount(); await review(); await submit();
    await screen.findByText(/Another change updated/i);
    expect((screen.getByRole('button', { name: 'Review settings change' }) as HTMLButtonElement).disabled).toBe(true);
    expect(patches()).toHaveLength(1);
  });
  it('withdraws editable private values after a current access refusal', async () => {
    request.mockImplementation(async (method: string) => {
      if (method === 'GET') return readResponse();
      throw new ApiRequestError('Current project access was refused.', 403, { message: 'Current project access was refused.' });
    });
    const { onSaved } = mount(); await review(); await submit();
    await screen.findByText(/Current project access was refused/);
    expect(screen.queryByRole('textbox', { name: 'Project description' })).toBeNull();
    expect(onSaved).not.toHaveBeenCalled();
  });
  it('blocks duplicate saves and settings Escape/close until the pending reply settles', async () => {
    const pending = deferred<Response>();
    request.mockImplementation(async (method: string) => method === 'GET' ? readResponse() : pending.promise);
    mount(); await review(); await submit();
    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: 'Close settings' }));
    expect(screen.getByRole('region', { name: 'Project settings' })).toBeTruthy();
    expect(patches()).toHaveLength(1);
    await act(async () => pending.resolve(response(null, 503)));
    await screen.findByText(/could not be confirmed/i);
    fireEvent.click(screen.getByRole('button', { name: 'Close settings' }));
    expect(screen.queryByRole('region', { name: 'Project settings' })).toBeNull();
  });
});

describe('Project settings request ownership', () => {
  it.each(['account', 'role', 'organization', 'workspace', 'program-roundtrip', 'token'])('retires a sent save across a %s change', async change => {
    const pending = deferred<Response>();
    request.mockImplementation(async (method: string) => method === 'GET' ? readResponse() : pending.promise);
    const view = mount(); await review(); await submit();
    await act(async () => {
      if (change === 'account') authService.setToken(jwt(99), { ...ACTOR, id: '99' }, 'next-refresh', 3600);
      if (change === 'role') authService.setToken(jwt(), { ...ACTOR, permissions: [] }, 'next-refresh', 3600);
      if (change === 'organization') { tenant.organizationId = 9; authService.setToken(jwt(12, 9), { ...ACTOR, organizationId: '9' }, 'next-refresh', 3600); }
      if (change === 'workspace') { tenant.workspace = { id: '22', organizationId: '7' }; view.rerender(<ProjectSettings programId={PROGRAM} onSaved={view.onSaved} />); }
      if (change === 'program-roundtrip') { publishShellProject({ id: OTHER, title: 'Other' }); publishShellProject({ id: PROGRAM, title: 'Current' }); }
      if (change === 'token') setAuthToken(jwt(99));
      pending.resolve(savedResponse({ revision: data().revision, reason: 'Sponsor milestone alignment', patch: { priority: 'high' } }));
    });
    expect(screen.queryByRole('textbox', { name: 'Project description' })).toBeNull();
    expect(screen.queryByText(/saved with your reason/i)).toBeNull();
    expect(view.onSaved).not.toHaveBeenCalled();
  });
  it('withholds a delayed GET after a token switch without another render', async () => {
    const pending = deferred<Response>(); request.mockReturnValue(pending.promise);
    mount(); fireEvent.click(screen.getByRole('button', { name: 'Project settings' }));
    setAuthToken(jwt(99)); await act(async () => pending.resolve(readResponse()));
    expect(screen.queryByRole('textbox', { name: 'Project description' })).toBeNull();
    expect(screen.getByText(/settings were retired/i)).toBeTruthy();
  });
  it('blocks a stale same-frame review click before any PATCH dispatch', async () => {
    mount(); await open();
    fireEvent.change(screen.getByRole('combobox', { name: 'Project priority' }), { target: { value: 'high' } });
    const old = screen.getByRole('button', { name: 'Review settings change' });
    act(() => { authService.setToken(jwt(99), { ...ACTOR, id: '99' }, 'next-refresh', 3600); fireEvent.click(old); });
    expect(patches()).toHaveLength(0); expect(screen.queryByRole('dialog')).toBeNull();
  });
  it('preserves a pending save through ordinary same-account bearer refresh', async () => {
    const pending = deferred<Response>();
    request.mockImplementation(async (method: string) => method === 'GET' ? readResponse() : pending.promise);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ accessToken: jwt(12, 7, 'refreshed'), refreshToken: 'new-refresh', expiresIn: 3600 }), { status: 200, headers: { 'Content-Type': 'application/json' } })));
    const { onSaved } = mount(); await review(); await submit();
    await act(async () => { expect(await authService.refreshToken()).toBe(true); });
    await act(async () => pending.resolve(savedResponse({ revision: data().revision, reason: 'Sponsor milestone alignment', patch: { priority: 'high' } })));
    await screen.findByText(/saved with your reason/i);
    expect(onSaved).toHaveBeenCalledOnce();
  });
});
