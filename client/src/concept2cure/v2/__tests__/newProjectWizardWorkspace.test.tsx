// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const fixture = vi.hoisted(() => ({ actor: 12, org: 7, tenantOrg: 7, globalClient: 22, request: vi.fn() }));
vi.mock('@/services/portal/authService', () => ({ useAuthUser: () => ({ id: String(fixture.actor), organizationId: String(fixture.org) }) }));
vi.mock('@/contexts/TenantContext', () => ({ useTenant: () => ({ currentOrganization: { id: fixture.tenantOrg }, currentClientWorkspace: { id: fixture.globalClient } }) }));
vi.mock('@/lib/queryClient', async (original) => ({ ...(await original<typeof import('@/lib/queryClient')>()), apiRequest: fixture.request }));
vi.mock('../surfaces/AnaVerbs', () => ({ RegistryPicker: ({ onChange }: { onChange: (id: string) => void }) => <button onClick={() => onChange('510k')}>Pick filing</button> }));
vi.mock('../surfaces/RegistryBridge', () => ({ getSubmissionTypeContext: () => ({ id: 'us_510k', displayName: 'Traditional 510(k)', pathwayKey: '510k', agency: 'FDA', region: 'US' }) }));

import { ApiRequestError } from '@/lib/queryClient';
import { setAuthToken, clearAuthToken } from '@/utils/authToken';
import { NewProjectWizard } from '../surfaces/Projects';
import { clearShellProject, readShellProject } from '../shellProject';

const programId = 'b6d3e141-7abb-4f1d-9b8b-f0f334604a05';
const clients = [{ id: '21', name: 'Sponsor A', organizationId: '7', status: 'active' }, { id: '22', name: 'Sponsor B', organizationId: '7', status: 'active' }];
const response = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body });
const options = (rows = clients) => ({ success: true, clients: rows, meta: { purpose: 'project-intake', organizationId: fixture.org, actorUserId: fixture.actor } });
const receipt = (changes: Record<string, unknown> = {}) => ({ data: { id: programId, title: 'A trial' }, meta: { created: true, projectAnchorId: 31, organizationId: 7, actorUserId: 12, clientWorkspaceId: 21, clientWorkspaceName: 'Sponsor A', ...changes } });
const token = (actor = fixture.actor, org = fixture.org) => setAuthToken(`e30.${btoa(JSON.stringify({ userId: actor, organizationId: org }))}.signature`);
const postCalls = () => fixture.request.mock.calls.filter(([method]) => method === 'POST');
async function configure() {
  fireEvent.click(screen.getByRole('button', { name: 'Pick filing' }));
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  await screen.findByRole('combobox', { name: 'Client workspace' });
  await waitFor(() => expect((screen.getByRole('combobox', { name: 'Client workspace' }) as HTMLSelectElement).disabled).toBe(false));
  fireEvent.change(screen.getByRole('textbox', { name: /project name/i }), { target: { value: 'A trial' } });
}
async function review() {
  await configure();
  fireEvent.change(screen.getByRole('combobox', { name: 'Client workspace' }), { target: { value: '21' } });
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
}
beforeEach(() => {
  clearShellProject();
  Object.assign(fixture, { actor: 12, org: 7, tenantOrg: 7, globalClient: 22 });
  token();
  fixture.request.mockImplementation(async (method: string) => method === 'GET' ? response(options()) : response(receipt(), 201));
});
afterEach(() => { cleanup(); fixture.request.mockReset(); clearAuthToken(); });

describe('New project workspace intake', () => {
  it('requires a local multi-workspace choice despite the global default, and sends the reviewed sponsor', async () => {
    const onNav = vi.fn();
    render(<NewProjectWizard onClose={vi.fn()} onNav={onNav} />);
    await configure();
    expect((screen.getByRole('combobox', { name: 'Client workspace' }) as HTMLSelectElement).value).toBe('');
    expect((screen.getByRole('button', { name: 'Continue' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByRole('combobox', { name: 'Client workspace' }), { target: { value: '21' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(document.querySelector('.npw-review')?.textContent).toContain('Sponsor A');
    fireEvent.click(screen.getByRole('button', { name: /create project/i }));
    await waitFor(() => expect(onNav).toHaveBeenCalledWith('project-home'));
    expect(readShellProject()?.id).toBe(programId);
    expect(postCalls()[0][2]).toMatchObject({ clientWorkspaceId: 21 });
    expect(postCalls()[0][3]).toMatchObject({ 'x-client-id': '21', 'x-organization-id': '7', Authorization: expect.stringContaining('Bearer ') });
    expect(fixture.request.mock.calls.filter(([method, path]) => method === 'GET' && path === '/api/clients?purpose=project-intake')).toHaveLength(2);
  });
  it('names and records the single verified workspace', async () => {
    fixture.request.mockImplementation(async () => response(options([clients[0]])));
    render(<NewProjectWizard onClose={vi.fn()} onNav={vi.fn()} />);
    await configure();
    expect((screen.getByRole('combobox', { name: 'Client workspace' }) as HTMLSelectElement).value).toBe('21');
    expect(screen.getByText(/only active client workspace/i)).toBeTruthy();
  });
  it.each(['duplicate', 'foreign', 'inactive', 'actor', 'missing-name'])('refuses a malformed %s directory without enabling Continue', async (defect) => {
    const body = options(clients.map(row => ({ ...row })));
    if (defect === 'duplicate') body.clients.push({ ...clients[0] });
    if (defect === 'foreign') body.clients[0].organizationId = '9';
    if (defect === 'inactive') body.clients[0].status = 'inactive';
    if (defect === 'actor') body.meta.actorUserId = 99;
    if (defect === 'missing-name') body.clients[0].name = '';
    fixture.request.mockResolvedValue(response(body));
    render(<NewProjectWizard onClose={vi.fn()} onNav={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Pick filing' }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await screen.findByText(/client workspaces could not be verified/i);
    expect((screen.getByRole('button', { name: 'Continue' }) as HTMLButtonElement).disabled).toBe(true);
    expect(postCalls()).toHaveLength(0);
  });
  it.each(['workspace', 'actor', 'anchor', 'uuid', 'json'])('blocks resubmission and navigation after an unverified %s creation receipt', async (defect) => {
    const onNav = vi.fn();
    fixture.request.mockImplementation(async (method: string) => {
      if (method === 'GET') return response(options());
      if (defect === 'json') return { ok: true, status: 201, json: async () => { throw new SyntaxError('json'); } };
      const body = receipt(defect === 'workspace' ? { clientWorkspaceId: 22 } : defect === 'actor' ? { actorUserId: 99 } : defect === 'anchor' ? { projectAnchorId: null } : {});
      if (defect === 'uuid') body.data.id = 'new';
      return response(body, 201);
    });
    render(<NewProjectWizard onClose={vi.fn()} onNav={onNav} />);
    await review();
    fireEvent.click(screen.getByRole('button', { name: /create project/i }));
    await screen.findByRole('button', { name: /check projects/i });
    expect(onNav).not.toHaveBeenCalled();
    expect(readShellProject()).toBeNull();
    expect(screen.queryByRole('button', { name: /try again/i })).toBeNull();
    expect((screen.getByRole('button', { name: /create project/i }) as HTMLButtonElement).disabled).toBe(true);
  });
  it.each(['transport', 'server'])('blocks duplicate creation after an unknown %s outcome', async (failure) => {
    fixture.request.mockImplementation(async (method: string) => {
      if (method === 'GET') return response(options());
      throw failure === 'transport' ? new TypeError('Failed to fetch') : new ApiRequestError('The save could not be confirmed.', 503);
    });
    render(<NewProjectWizard onClose={vi.fn()} onNav={vi.fn()} />);
    await review();
    fireEvent.click(screen.getByRole('button', { name: /create project/i }));
    await screen.findByRole('button', { name: /check projects/i });
    expect(postCalls()).toHaveLength(1);
    expect(screen.queryByRole('button', { name: /try again/i })).toBeNull();
    expect((screen.getByRole('button', { name: /create project/i }) as HTMLButtonElement).disabled).toBe(true);
  });
  it('refreshes active options before retrying a confirmed refusal', async () => {
    fixture.request.mockImplementation(async (method: string) => {
      if (method === 'GET') return response(options());
      throw new ApiRequestError('The project name is already in use.', 409);
    });
    render(<NewProjectWizard onClose={vi.fn()} onNav={vi.fn()} />);
    await review();
    fireEvent.click(screen.getByRole('button', { name: /create project/i }));
    fireEvent.click(await screen.findByRole('button', { name: /try again/i }));
    await waitFor(() => expect(postCalls()).toHaveLength(2));
    expect(fixture.request.mock.calls.filter(([, path]) => path === '/api/clients?purpose=project-intake' || path === '/api/c2c/projects').map(([method]) => method)).toEqual(['GET', 'GET', 'POST', 'GET', 'POST']);
  });
});

describe('New project intake session retirement', () => {
  it('retires sponsor form contents on an account or organization change', async () => {
    const view = render(<NewProjectWizard onClose={vi.fn()} onNav={vi.fn()} />);
    await review();
    fixture.org = fixture.tenantOrg = 9;
    token();
    view.rerender(<NewProjectWizard onClose={vi.fn()} onNav={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Pick filing' })).toBeTruthy();
    expect(screen.queryByText('A trial')).toBeNull();
    expect(screen.queryByRole('button', { name: /create project/i })).toBeNull();
  });
  it('does not send a stale write after a token switch', async () => {
    render(<NewProjectWizard onClose={vi.fn()} onNav={vi.fn()} />);
    await review();
    token(99);
    fireEvent.click(screen.getByRole('button', { name: /create project/i }));
    await waitFor(() => expect(document.body.textContent).toMatch(/account or organization changed/i));
    expect(postCalls()).toHaveLength(0);
  });
  it('retires a late workspace read when the bearer changes without a render', async () => {
    let finish: (value: unknown) => void = () => {};
    fixture.request.mockImplementation((method: string, path: string) => path === '/api/clients?purpose=project-intake'
      ? new Promise(resolve => { finish = resolve; }) : Promise.resolve(response(options())));
    render(<NewProjectWizard onClose={vi.fn()} onNav={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Pick filing' }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.change(screen.getByRole('textbox', { name: /project name/i }), { target: { value: 'Private sponsor name' } });
    token(99);
    await act(async () => finish(response(options())));
    expect(document.body.textContent).toMatch(/account or organization changed/i);
    expect(screen.queryByRole('textbox', { name: /project name/i })).toBeNull();
    expect(postCalls()).toHaveLength(0);
  });
  it('does not publish or navigate after an old create receipt arrives under another bearer', async () => {
    let finish: (value: unknown) => void = () => {};
    const onNav = vi.fn();
    fixture.request.mockImplementation((method: string) => method === 'GET' ? Promise.resolve(response(options())) : new Promise(resolve => { finish = resolve; }));
    render(<NewProjectWizard onClose={vi.fn()} onNav={onNav} />);
    await review();
    fireEvent.click(screen.getByRole('button', { name: /create project/i }));
    await waitFor(() => expect(postCalls()).toHaveLength(1));
    token(99);
    await act(async () => finish(response(receipt(), 201)));
    expect(onNav).not.toHaveBeenCalled();
    expect(readShellProject()).toBeNull();
    expect(screen.queryByText('A trial')).toBeNull();
    expect(document.body.textContent).toMatch(/account or organization changed/i);
  });
  it('returns to Configure without writing if the selected workspace changes before Create', async () => {
    let reads = 0;
    fixture.request.mockImplementation(async (method: string, path: string) => {
      if (path === '/api/clients?purpose=project-intake') return response(options(++reads === 1 ? clients : [clients[1]]));
      return response(receipt(), 201);
    });
    render(<NewProjectWizard onClose={vi.fn()} onNav={vi.fn()} />);
    await review();
    fireEvent.click(screen.getByRole('button', { name: /create project/i }));
    await screen.findByRole('combobox', { name: 'Client workspace' });
    expect(postCalls()).toHaveLength(0);
    expect(screen.queryByRole('button', { name: /create project/i })).toBeNull();
  });
  it('states confirmed creation when only the saved project details are unavailable', async () => {
    fixture.request.mockImplementation(async (method: string) => {
      if (method === 'GET') return response(options());
      throw new ApiRequestError('Project details could not be loaded.', 503, {}, 'PROJECT_CREATED_DETAILS_UNAVAILABLE');
    });
    render(<NewProjectWizard onClose={vi.fn()} onNav={vi.fn()} />);
    await review();
    fireEvent.click(screen.getByRole('button', { name: /create project/i }));
    const banner = await screen.findByTestId('new-project-outcome');
    expect(banner.textContent).toMatch(/project was created/i);
    expect(banner.textContent).not.toMatch(/could not be confirmed/i);
    expect(screen.queryByRole('button', { name: /try again/i })).toBeNull();
  });
});

describe('New project pending creation exits', () => {
  it.each(['Cancel', 'Projects', 'Escape'] as const)('keeps the pending write visible through %s, then restores Check projects after uncertainty', async (exit: 'Cancel' | 'Projects' | 'Escape') => {
    let rejectSave: (reason: unknown) => void = () => {};
    const onClose = vi.fn();
    const onNav = vi.fn();
    fixture.request.mockImplementation((method: string) => method === 'GET' ? Promise.resolve(response(options())) : new Promise((_, reject) => { rejectSave = reject; }));
    function Host() {
      const [open, setOpen] = React.useState(true);
      return open ? <NewProjectWizard onClose={() => { onClose(); setOpen(false); }} onNav={onNav} /> : <button onClick={() => setOpen(true)}>Reopen New project</button>;
    }
    render(<Host />);
    await review();
    fireEvent.click(screen.getByRole('button', { name: /create project/i }));
    // Escape is exercised immediately too: a pending ref must govern the close
    // callback before React has had another opportunity to render its state.
    if (exit === 'Escape') fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(postCalls()).toHaveLength(1));
    if (exit === 'Escape') fireEvent.keyDown(document, { key: 'Escape' });
    else fireEvent.click(screen.getByRole('button', { name: exit }));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Reopen New project' })).toBeNull();
    expect(screen.getByRole('button', { name: /creating project/i })).toBeTruthy();
    await act(async () => rejectSave(new TypeError('Failed to fetch')));
    fireEvent.click(await screen.findByRole('button', { name: 'Check projects' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Reopen New project' })).toBeTruthy();
    expect(postCalls()).toHaveLength(1);
    expect(onNav).not.toHaveBeenCalled();
    expect(readShellProject()).toBeNull();
  });
});
