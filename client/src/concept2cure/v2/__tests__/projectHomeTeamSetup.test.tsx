/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
import { PROJECT_TEAM_AUTHORITY_NOTE } from '../surfaces/ProjectTeamResponsibilities';

/* The team, the project's tasks and My work are on the Plan step (CLIENT_JOURNEY_2026-10-25.md, pass 3). */
/* D3-3: the sharing controls are in the Team drawer, opened by the Team card's "Manage" (they were on Plan). */
async function openTeam() {
  fireEvent.click(await screen.findByRole('button', { name: 'Manage team' }));
  return screen.findByRole('dialog', { name: 'Team' });
}

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
    await openTeam();
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
    /* The page is remounted for the new account or organization, so the Team drawer the previous one opened is
       closed (D3-3): no sharing control from the previous scope stays on screen. */
    expect(screen.queryByRole('dialog', { name: 'Team' })).toBeNull();
    expect(screen.queryByLabelText('Organization member')).toBeNull();
    expect(screen.queryByText('Coordinator', { exact: true })).toBeNull();
    const drawer = await openTeam();
    expect(within(drawer).queryByLabelText('Organization member')).toBeNull();
    expect(request.mock.calls.filter(([, path]) => path.includes('/sharing'))).toHaveLength(before);
    await act(async () => finish(ok({ ...TEAM, project_id: anchor })));
    await within(drawer).findByLabelText('Organization member');
    await waitFor(() => expect(request).toHaveBeenCalledWith('GET',
      `/api/concept2cure/projects/${anchor}/sharing?programId=${PID}`, undefined,
      expect.objectContaining({ Authorization: `Bearer ${token(actor, org)}`, 'x-client-id': String(workspace) })));
  });
});
afterEach(() => { cleanup(); authService.endSession(null); request.mockReset(); delete window.C2C_PROJECT; });

describe('ProjectHome reaches its existing sharing controls', () => {
  it('uses the admitted numeric anchor and offers only human Use/Edit choices', async () => {
    serve(); render(<ProjectHome {...props} />);
    await openTeam();
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
    const drawer = within(await openTeam());
    expect(request.mock.calls.some(([, path]) => path.includes('/sharing'))).toBe(false);
    await act(async () => finish(ok(TEAM)));
    await drawer.findByText("Couldn't load project sharing");
    /* The roster is kept in the drawer (and on the card beside it). */
    expect(drawer.getByText('Coordinator')).toBeTruthy();
    expect(drawer.getByRole('button', { name: 'Retry sharing' })).toBeTruthy();
  });

  it('uses server capability instead of a displayed project owner fact', async () => {
    const denied = sharing(); denied.canManage = false; denied.candidates = [];
    denied.members = denied.members.map(member => ({ ...member, canSetRole: false, canRevoke: false }));
    serve(ok(TEAM), ok(denied)); render(<ProjectHome {...props} />);
    await openTeam();
    await screen.findByText(/Organization-visible project: organization members may have access/);
    expect(screen.queryByRole('button', { name: 'Grant sharing' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Revoke explicit share/ })).toBeNull();
    expect(screen.queryByLabelText('Organization member')).toBeNull();
  });
});

describe('the team on the project page (D3-3, D3.md §4.8 item 3 and §4.9)', () => {
  it('is a card in Project knowledge, on every step, and no longer a section of Plan', async () => {
    serve(); render(<ProjectHome {...props} />);
    const card = await screen.findByRole('region', { name: 'Team' });
    expect(card.closest('aside.pj-side')).toBeTruthy();
    expect(await within(card).findByText('Coordinator')).toBeTruthy();
    expect(within(card).getByText('Project owner · Owner')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Plan' }));
    expect(screen.queryByRole('heading', { name: 'Project sharing' })).toBeNull();
    expect(document.querySelector('.pj-main')?.textContent ?? '').not.toMatch(/Recorded responsibilities/);
    expect(screen.getByRole('region', { name: 'Team' })).toBe(card);
  });

  it('"Manage" opens the Team drawer with the roster, the note once and sharing; Escape closes it, focus returns', async () => {
    serve(); render(<ProjectHome {...props} />);
    const manage = await screen.findByRole('button', { name: 'Manage team' });
    manage.focus();
    fireEvent.click(manage);
    const drawer = await screen.findByRole('dialog', { name: 'Team' });
    expect(await within(drawer).findByRole('heading', { name: 'Project sharing' })).toBeTruthy();
    expect(within(drawer).getByRole('list', { name: 'Recorded project team' })).toBeTruthy();
    expect(within(drawer).getAllByText(PROJECT_TEAM_AUTHORITY_NOTE)).toHaveLength(1);
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Team' })).toBeNull());
    expect(document.activeElement).toBe(manage);
  });

  it('a team that could not be read says so on the card, with its retry, and "Manage" still opens', async () => {
    serve({ ...ok({}), ok: false, status: 503 } as Response); render(<ProjectHome {...props} />);
    const card = await screen.findByRole('region', { name: 'Team' });
    expect(await within(card).findByRole('button', { name: 'Retry team' })).toBeTruthy();
    expect(within(card).queryByRole('list')).toBeNull();
  });
});

/* D3-2b (2026-11-06, D3.md §4.10): the page reads the project's unified work and its agency inbox once each. The
   task panels, the Team card's per-person lines, Respond and the Filing card's letters row render those reads. */
describe('one read, several readers (D3-2b)', () => {
  const WORK_URL = `/api/concept2cure/projects/${PID}/unified-work`;
  const COMMS_URL = `/api/concept2cure/projects/${PID}/agency-communications`;
  const item = (id: string, status: string, ownerName: string | null, dueAt: string | null) =>
    ({ id, source: 'board', title: `Item ${id}`, status, priority: null, dueAt, ownerName, blocking: false });
  const WORK = { items: [
    item('w1', 'open', 'Coordinator', '2020-01-05T00:00:00Z'),
    item('w2', 'in_progress', 'Coordinator', '2099-02-01T00:00:00Z'),
    item('w3', 'open', null, null),
    item('w4', 'done', 'Coordinator', '2019-01-01T00:00:00Z'),
    item('w5', 'open', 'Former colleague', null),
  ] };
  const letter = (id: string, closureStatus: string, dueDate: string) => ({
    id, sourceType: 'agency_letter', communicationType: 'information_request', sourceChannel: 'email', linkedSectionCodes: [],
    receivedDate: '2099-01-02', dueDate, urgency: 'high', responseRequired: true, extractedIssues: [], humanReviewStatus: 'pending', closureStatus,
  });
  function serveAll(work: Response = ok(WORK), comms: Response = ok([letter('c1', 'open', '2099-02-20'), letter('c2', 'closed', '2099-01-01')])) {
    request.mockImplementation(async (_method: string, path: string) => {
      if (path === `/api/c2c/projects/${PID}`) return ok({ id: PID, name: 'Programme A' });
      if (path === `/api/c2c/projects/${PID}/team`) return ok(TEAM);
      if (path === URL) return ok(sharing());
      if (path === WORK_URL) return work;
      if (path === COMMS_URL) return comms;
      return ok({});
    });
  }
  const calls = (url: string) => request.mock.calls.filter(([, path]) => path === url).length;
  const step = (label: string) => fireEvent.click(screen.getByRole('button', { name: label }));

  it('each person on the Team card says their open work; what no one on the team holds is said, and opens Plan', async () => {
    serveAll(); render(<ProjectHome {...props} />);
    const card = await screen.findByRole('region', { name: 'Team' });
    const line = await within(card).findByText('2 open · next due Jan 5, 2020');
    expect(line.getAttribute('data-late'), 'a passed due date is marked').not.toBeNull();
    expect(within(card).getByRole('button', { name: '1 open item unassigned' })).toBeTruthy();
    fireEvent.click(within(card).getByRole('button', { name: '1 open item assigned to someone not on this list' }));
    await waitFor(() => expect(document.querySelector('.pj-lc-stage[aria-current="step"]')?.textContent?.trim()).toBe('Plan'));
  });

  it('a work read that failed is said once on the card, never as "Nothing open"', async () => {
    serveAll({ ...ok({}), ok: false, status: 503 } as Response); render(<ProjectHome {...props} />);
    const card = await screen.findByRole('region', { name: 'Team' });
    expect(await within(card).findByText('Open work could not be read.')).toBeTruthy();
    expect(within(card).queryByText('Nothing open')).toBeNull();
  });

  it("the Filing card says the open agency letters and the next response due, and opens Respond", async () => {
    serveAll(); render(<ProjectHome {...props} />);
    const filing = await screen.findByRole('region', { name: 'Filing' });
    /* The name says label and value apart, as a screen reader reads it. */
    const row = await within(filing).findByRole('button', { name: 'Agency letters: 1 open · next response due Feb 20, 2099' });
    fireEvent.click(row);
    await waitFor(() => expect(document.querySelector('.pj-lc-stage[aria-current="step"]')?.textContent?.trim()).toBe('Respond'));
  });

  it('the work and the inbox are each read once, however many steps show them', async () => {
    serveAll(); render(<ProjectHome {...props} />);
    const card = await screen.findByRole('region', { name: 'Team' });
    await within(card).findByText('2 open · next due Jan 5, 2020');
    for (const label of ['Plan', 'Review', 'Respond', 'Plan', 'Review']) step(label);
    await screen.findByRole('region', { name: 'Tasks and approvals' });
    expect(calls(WORK_URL)).toBe(1);
    expect(calls(COMMS_URL)).toBe(1);
  });
});
