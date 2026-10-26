// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async original => ({
  ...(await original<typeof import('@/lib/queryClient')>()), apiRequest,
}));
vi.mock('@/services/portal/authService', () => ({ useAuth: () => ({ user: { id: 7, firstName: 'Ada' } }) }));
vi.mock('@/utils/authToken', async original => ({
  ...(await original<typeof import('@/utils/authToken')>()),
  getAuthToken: () => 't', getAuthHeaders: () => ({ Authorization: 'Bearer t', 'x-organization-id': '1' }),
}));

import { Projects } from '../surfaces/Projects';
import { __resetSurfaceActionBus, applySurfaceAction } from '../surfaceActions';
import { resolveSurfaceAction } from '@shared/navigation/surface-actions';

const clients = [{ id: 11, name: 'Client Alpha' }, { id: 12, name: 'Client Beta' }];
const row = (id: string, client: number) => ({
  id, title: `Project ${id}`, code: id, ws: 'Biotech', stage: 'Planning', status: 'active',
  readiness: null, lead: 'Ada', blocker: null, due: '—', activity: '',
  client_workspace_id: client, client_name: clients.find(c => c.id === client)?.name,
});
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response;
const props = () => ({ surface: { id: 'projects', label: 'Projects' } as never, onAsk: vi.fn(), onNav: vi.fn(), segment: 'biopharma' });
let filteredFails = false;

beforeEach(() => {
  filteredFails = false;
  apiRequest.mockReset().mockImplementation(async (_method: string, path: string) => {
    if (path === '/api/c2c/projects?clientWorkspaceId=11') {
      if (filteredFails) return { ok: false, status: 503, json: async () => ({ error: 'Client projects could not be read.' }) };
      return ok({ data: [row('A', 11)], meta: { clients, clientsHasMore: false } });
    }
    return ok({ data: [row('A', 11), row('B', 12)], meta: { clients, clientsHasMore: false } });
  });
});
afterEach(() => { cleanup(); __resetSurfaceActionBus(); });

describe('Projects client filter uses the authorized server projection', () => {
  it('filters on the server before paging and can clear the selection', async () => {
    render(<Projects {...props()} />);
    const select = await screen.findByRole('combobox', { name: 'Client' });
    await screen.findByText('Project B');
    fireEvent.change(select, { target: { value: '11' } });
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith('GET', '/api/c2c/projects?clientWorkspaceId=11'));
    await waitFor(() => expect(screen.queryByText('Project B')).toBeNull());
    expect(screen.getByText('Project A')).toBeTruthy();
    fireEvent.change(select, { target: { value: 'all' } });
    expect(await screen.findByText('Project B')).toBeTruthy();
  });

  it('offers no redundant selector for one active accessible client', async () => {
    apiRequest.mockImplementation(async () => ok({ data: [row('A', 11)], meta: { clients: clients.slice(0, 1) } }));
    render(<Projects {...props()} />);
    await screen.findByText('Project A');
    expect(screen.queryByRole('combobox', { name: 'Client' })).toBeNull();
  });

  it('keeps a way to clear the filter after a failed read and reports the failure', async () => {
    render(<Projects {...props()} />);
    const select = await screen.findByRole('combobox', { name: 'Client' });
    filteredFails = true;
    fireEvent.change(select, { target: { value: '11' } });
    expect(await screen.findByText("Couldn't load the project portfolio")).toBeTruthy();
    expect(screen.queryByText('No projects yet')).toBeNull();
    fireEvent.change(screen.getByRole('combobox', { name: 'Client' }), { target: { value: 'all' } });
    expect(await screen.findByText('Project B')).toBeTruthy();
  });

  it('does not describe an empty filtered read as an organization with no projects', async () => {
    apiRequest.mockImplementation(async (_method: string, path: string) => ok({
      data: path.includes('?') ? [] : [row('A', 11)], meta: { clients },
    }));
    render(<Projects {...props()} />);
    fireEvent.change(await screen.findByRole('combobox', { name: 'Client' }), { target: { value: '12' } });
    expect(await screen.findByText('No projects for this client')).toBeTruthy();
    expect(screen.queryByText('No projects yet')).toBeNull();
  });

  it('performs the same client filter through the existing surface action', async () => {
    render(<Projects {...props()} />);
    await screen.findByRole('combobox', { name: 'Client' });
    const resolved = resolveSurfaceAction('projects.filter', { clientWorkspaceId: '11' });
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) throw new Error(resolved.error);
    act(() => { expect(applySurfaceAction(resolved.directive, vi.fn()).status).toBe('applied'); });
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith('GET', '/api/c2c/projects?clientWorkspaceId=11'));
    expect(screen.getByRole('combobox', { name: 'Client' })).toHaveProperty('value', '11');
  });

  it('refuses an action for a client outside the authorized choices', async () => {
    render(<Projects {...props()} />);
    await screen.findByRole('combobox', { name: 'Client' });
    const resolved = resolveSurfaceAction('projects.filter', { clientWorkspaceId: '999' });
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) throw new Error(resolved.error);
    act(() => { expect(applySurfaceAction(resolved.directive, vi.fn()).status).toBe('failed'); });
    expect(apiRequest.mock.calls.some(([, path]) => String(path).includes('999'))).toBe(false);
  });
});
