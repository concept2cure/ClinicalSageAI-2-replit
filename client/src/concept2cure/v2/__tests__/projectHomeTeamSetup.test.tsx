/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ProjectSharingResponse } from '@shared/project-sharing';

const request = vi.hoisted(() => vi.fn());
const tenant = vi.hoisted(() => ({ currentOrganization: { id: 4 }, currentClientWorkspace: { id: '9', organizationId: '4' } }));
vi.mock('@/lib/queryClient', async original => ({ ...await original<typeof import('@/lib/queryClient')>(), apiRequest: request }));
vi.mock('@/services/portal/authService', async original => {
  const actual = await original<typeof import('@/services/portal/authService')>();
  return { ...actual, useAuth: () => ({ user: actual.authService.getUser() }), useAuthUser: () => actual.authService.getUser() };
});
vi.mock('@/contexts/TenantContext', () => ({ useTenant: () => tenant }));
import { authService } from '@/services/portal/authService';
import { ProjectHome } from '../surfaces/ProjectHome';

/* The team, the project's tasks and My work are on the Plan step (CLIENT_JOURNEY_2026-10-25.md, pass 3). */
const openPlan = () => fireEvent.click(screen.getByRole('button', { name: 'Plan' }));

const PID = '11111111-1111-4111-8111-111111111111';
const TEAM = { program_id: PID, project_id: 51, team: [{ entry_id: 'user:7', user_id: 7, role: null,
  name: 'Coordinator', email: null, label: 'Coordinator', identity: 'active_member',
  responsibilities: ['project_owner'], sharing_role: 'owner', sources: ['project_owner', 'project_creator'] }] };
const URL = `/api/concept2cure/projects/51/sharing?programId=${PID}`;
const props = { surface: { id: 'project-home' } as never, segment: 'biopharma', onNav: vi.fn(), onAsk: vi.fn() };
const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => ({ success: true, data }) }) as Response;
const token = (id = 7, org = 4) => `x.${btoa(JSON.stringify({ userId: id, organizationId: org }))}.x`;
const session = (actor = 7, org = 4) => authService.setToken(token(actor, org),
  { id: String(actor), organizationId: String(org), permissions: [] }, 'fixture-refresh', 3600);
function sharing(): ProjectSharingResponse {
  return { projectId: 'proj_51', programId: PID, organizationId: 4, actorUserId: 7, clientWorkspaceId: 9,
    visibility: 'org_public', legacyFallbackApplied: false, canManage: true,
    candidates: [{ userId: 7, label: 'Coordinator' }, { userId: 8, label: 'Client colleague' }, { userId: 9, label: 'New colleague' }],
    members: [
      { userId: 7, role: 'owner', status: 'active', addedById: null, addedAt: null, explicit: false,
        implicitSources: ['project_owner', 'project_creator'], canSetRole: false, canRevoke: false },
      { userId: 8, role: 'use', status: 'active', addedById: 7, addedAt: null, explicit: true,
        implicitSources: [], canSetRole: true, canRevoke: true },
    ] };
}
function serve(teamResponse: Response | Promise<Response> = ok(TEAM), sharingResponse: Response = ok(sharing())) {
  request.mockImplementation(async (_method: string, path: string) => {
    if (path === `/api/c2c/projects/${PID}`) return ok({ id: PID, name: 'Programme A' });
    if (path === `/api/c2c/projects/${PID}/team`) return teamResponse;
    if (path === URL) return sharingResponse;
    return ok({});
  });
}
beforeEach(() => {
  session();
  tenant.currentOrganization = { id: 4 }; tenant.currentClientWorkspace = { id: '9', organizationId: '4' };
  window.C2C_PROJECT = { id: PID, title: 'Programme A' };
});

describe('team anchors belong to the current authenticated scope', () => {
  it.each([
    { change: 'account', actor: 12, org: 4, workspace: 9, anchor: 51 },
    { change: 'organization', actor: 7, org: 5, workspace: 10, anchor: 61 },
  ])('waits for a fresh team anchor after $change changes on the same selected UUID', async ({ actor, org, workspace, anchor }) => {
    serve(); const view = render(<ProjectHome {...props} />);
    openPlan();
    await screen.findByLabelText('Organization member');
    let finish!: (response: Response) => void;
    const pending = new Promise<Response>(resolve => { finish = resolve; });
    request.mockImplementation(async (_method: string, path: string) => {
      if (path === `/api/c2c/projects/${PID}/team`) return pending;
      if (path.includes('/sharing')) {
        const data = sharing(); data.projectId = `proj_${anchor}`; data.actorUserId = actor;
        data.organizationId = org; data.clientWorkspaceId = workspace;
        return ok(data);
      }
      return ok({});
    });
    const before = request.mock.calls.filter(([, path]) => path.includes('/sharing')).length;
    session(actor, org);
    tenant.currentOrganization = { id: org }; tenant.currentClientWorkspace = { id: String(workspace), organizationId: String(org) };
    view.rerender(<ProjectHome {...props} />);
    expect(screen.queryByLabelText('Organization member')).toBeNull();
    expect(screen.queryByText('Coordinator', { exact: true })).toBeNull();
    expect(request.mock.calls.filter(([, path]) => path.includes('/sharing'))).toHaveLength(before);
    await act(async () => finish(ok({ ...TEAM, project_id: anchor })));
    await screen.findByLabelText('Organization member');
    await waitFor(() => expect(request).toHaveBeenCalledWith('GET',
      `/api/concept2cure/projects/${anchor}/sharing?programId=${PID}`, undefined,
      expect.objectContaining({ Authorization: `Bearer ${token(actor, org)}`, 'x-client-id': String(workspace) })));
  });
});
afterEach(() => { cleanup(); authService.endSession(null); request.mockReset(); delete window.C2C_PROJECT; });

describe('ProjectHome reaches its existing sharing controls', () => {
  it('uses the admitted numeric anchor and offers only human Use/Edit choices', async () => {
    serve(); render(<ProjectHome {...props} />);
    openPlan();
    await screen.findByRole('heading', { name: 'Project sharing' });
    expect(await screen.findByLabelText('Organization member')).toBeTruthy();
    const role = screen.getByLabelText('New sharing role');
    expect(role.textContent).toContain('Use'); expect(role.textContent).toContain('Edit');
    expect(role.textContent).not.toMatch(/Owner|Approver|Reviewer/);
    expect(request).toHaveBeenCalledWith('GET', URL, undefined, expect.objectContaining({
      Authorization: `Bearer ${token()}`, 'x-organization-id': '4', 'x-client-id': '9',
    }));
    const grant = screen.getByRole('button', { name: 'Grant sharing' }) as HTMLButtonElement;
    expect(grant.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Organization member'), { target: { value: '9' } });
    expect(grant.disabled).toBe(true);
    fireEvent.change(role, { target: { value: 'edit' } });
    expect(grant.disabled).toBe(false);
  });

  it('waits for a verified team anchor and retains the roster when sharing is unavailable', async () => {
    let finish!: (response: Response) => void;
    serve(new Promise(resolve => { finish = resolve; }), { ...ok({}), ok: false, status: 503 });
    render(<ProjectHome {...props} />);
    openPlan();
    expect(request.mock.calls.some(([, path]) => path.includes('/sharing'))).toBe(false);
    await act(async () => finish(ok(TEAM)));
    await screen.findByText("Couldn't load project sharing");
    expect(screen.getByText('Coordinator')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Retry sharing' })).toBeTruthy();
  });

  it('uses server capability instead of a displayed project owner fact', async () => {
    const denied = sharing(); denied.canManage = false; denied.candidates = [];
    denied.members = denied.members.map(member => ({ ...member, canSetRole: false, canRevoke: false }));
    serve(ok(TEAM), ok(denied)); render(<ProjectHome {...props} />);
    openPlan();
    await screen.findByText(/Organization-visible project: organization members may have access/);
    expect(screen.queryByRole('button', { name: 'Grant sharing' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Revoke explicit share/ })).toBeNull();
    expect(screen.queryByLabelText('Organization member')).toBeNull();
  });
});
