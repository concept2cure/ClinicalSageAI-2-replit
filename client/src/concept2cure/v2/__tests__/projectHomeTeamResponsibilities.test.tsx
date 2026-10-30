/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ProjectTeamMember, ProjectTeamResponse } from '@shared/project-team';

const request = vi.hoisted(() => vi.fn());
/* useDocumentList reads the signed-in session (CanvasDocumentList.tsx); with
   no AuthProvider mounted, the real useAuth throws before Project home renders. */
vi.mock('@/services/portal/authService', async original => ({ ...await original<typeof import('@/services/portal/authService')>(), useAuth: () => ({ user: null }) }));
vi.mock('@/lib/queryClient', async original => ({ ...await original<typeof import('@/lib/queryClient')>(), apiRequest: request }));
import { ProjectHome } from '../surfaces/ProjectHome';
import { useActiveSurfaceContext, type SurfaceContext } from '../surfaceContext';

/* The team, the project's tasks and My work are on the Plan step (CLIENT_JOURNEY_2026-10-25.md, pass 3). */
const openPlan = () => fireEvent.click(screen.getByRole('button', { name: 'Plan' }));

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const props = { surface: { id: 'project-home' } as never, segment: 'biopharma', onNav: vi.fn(), onAsk: vi.fn() };
const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => data }) as Response;
const member = (id = 7): ProjectTeamMember => ({
  user_id: id, role: 'lead', name: 'Alex Chen', email: `alex${id}@example.test`, entry_id: `user:${id}`,
  identity: 'active_member', label: `Alex Chen · Account #${id}`, responsibilities: ['project_lead'],
  sharing_role: 'use', sources: ['program_lead', 'project_member'],
});
const roster = (program_id = A, team = [member()]): ProjectTeamResponse => ({ program_id, project_id: 51, team });
function serve(team: unknown, status = 200) {
  request.mockImplementation(async (_method: string, path: string) => {
    if (path.endsWith('/team')) return { ...ok(team), ok: status === 200, status };
    if (path === `/api/c2c/projects/${A}` || path === `/api/c2c/projects/${B}`) return ok({ id: path.includes(B) ? B : A, name: 'Programme' });
    return ok({});
  });
}
function Probe({ seen }: { seen: { ctx: SurfaceContext | null } }) {
  seen.ctx = useActiveSurfaceContext('project-home');
  return null;
}
function pendingRead() {
  let resolve!: (response: Response) => void;
  return { promise: new Promise<Response>(done => { resolve = done; }), resolve: (response: Response) => resolve(response) };
}
beforeEach(() => { window.C2C_PROJECT = { id: A, title: 'Programme A' }; });
afterEach(() => { cleanup(); request.mockReset(); delete window.C2C_PROJECT; });

describe('ProjectHome sourced responsibility integration', () => {
  it('renders disambiguated identities and publishes identity/source facts to AnA without contact details', async () => {
    const data = roster(A, [member(), { ...member(8), role: null, responsibilities: [], sources: ['project_member'], sharing_role: 'edit' }]);
    serve(data);
    const seen = { ctx: null as SurfaceContext | null };
    render(<><ProjectHome {...props} /><Probe seen={seen} /></>);
    openPlan();
    await screen.findByText('Alex Chen · Account #7');
    expect(screen.getByText('Alex Chen · Account #8')).toBeTruthy();
    expect(screen.getByText('Project lead', { exact: true })).toBeTruthy();
    expect(screen.getByText('Sharing: Use')).toBeTruthy();
    expect(screen.getByText(/do not grant universal editing or approval\/signing authority/)).toBeTruthy();
    await waitFor(() => expect(seen.ctx?.facts?.team).toEqual([
      { entry_id: 'user:7', user_id: 7, identity: 'active_member', name: 'Alex Chen', role: 'lead',
        responsibilities: ['project_lead'], sharing_role: 'use', sources: ['program_lead', 'project_member'] },
      { entry_id: 'user:8', user_id: 8, identity: 'active_member', name: 'Alex Chen', role: null,
        responsibilities: [], sharing_role: 'edit', sources: ['project_member'] },
    ]));
    expect(JSON.stringify(seen.ctx?.facts?.team)).not.toContain('@');
    expect(seen.ctx?.facts?.teamProgramId).toBe(A);
    expect(seen.ctx?.facts?.teamProjectId).toBe(51);
  });

  it.each([
    { label: 'wrong program', body: roster(B) },
    { label: 'legacy shape', body: { team: [member()] } },
    { label: 'invalid identity', body: roster(A, [{ ...member(), identity: 'approver' } as never]) },
    { label: 'null response', body: null },
    { label: 'missing store', body: { success: true, data: roster(A, []), meta: { pendingStore: true } } },
  ])('states $label as unavailable, never an empty roster or identity facts', async ({ body }) => {
    serve(body); const seen = { ctx: null as SurfaceContext | null };
    render(<><ProjectHome {...props} /><Probe seen={seen} /></>);
    openPlan();
    await screen.findByText("Couldn't load the project team");
    expect(screen.queryByText('No recorded team members')).toBeNull();
    expect(screen.queryByText('Alex Chen · Account #7')).toBeNull();
    await waitFor(() => expect(seen.ctx?.facts?.teamUnavailable).toBe('the team read failed'));
    expect(seen.ctx?.facts?.team).toBeNull();
  });

  it('distinguishes a verified empty roster from a failed read', async () => {
    serve(roster(A, [])); render(<ProjectHome {...props} />);
    openPlan();
    await screen.findByText('No recorded team members');
    expect(screen.queryByText("Couldn't load the project team")).toBeNull();
  });
});

describe('ProjectHome team program-switch isolation', () => {
  /* A different project opens on its own step, never the previous project's
     (D2 A2.1, 2aace71d), so after a switch a person opens Plan again to see its team. */
  it('hides the previous program roster immediately while its replacement loads', async () => {
    const pending = pendingRead(); serve(roster());
    const original = request.getMockImplementation()!;
    request.mockImplementation((method, path) => path === `/api/c2c/projects/${B}/team` ? pending.promise : original(method, path));
    const seen = { ctx: null as SurfaceContext | null };
    const view = render(<><ProjectHome {...props} /><Probe seen={seen} /></>);
    openPlan();
    await screen.findByText('Alex Chen · Account #7');
    window.C2C_PROJECT = { id: B, title: 'Programme B' };
    view.rerender(<><ProjectHome {...props} /><Probe seen={seen} /></>);
    expect(screen.queryByText('Alex Chen · Account #7')).toBeNull();
    expect(seen.ctx?.facts?.team ?? null).toBeNull();
    openPlan();
    expect(screen.queryByText('Alex Chen · Account #7')).toBeNull();
    expect(screen.getByText('Loading team…')).toBeTruthy();
    expect(seen.ctx?.facts?.team ?? null).toBeNull();
    await act(async () => pending.resolve(ok(roster(B, [member(9)]))));
    await screen.findByText('Alex Chen · Account #9');
    await waitFor(() => expect(seen.ctx?.facts?.teamProgramId).toBe(B));
    expect(seen.ctx?.facts?.team).toEqual([expect.objectContaining({ user_id: 9, entry_id: 'user:9', identity: 'active_member' })]);
  });

  it('ignores a late successful roster from an abandoned program', async () => {
    const pending = pendingRead(); serve(roster(B, [member(9)]));
    const original = request.getMockImplementation()!;
    request.mockImplementation((method, path) => path === `/api/c2c/projects/${A}/team` ? pending.promise : original(method, path));
    const view = render(<ProjectHome {...props} />);
    openPlan();
    window.C2C_PROJECT = { id: B, title: 'Programme B' };
    view.rerender(<ProjectHome {...props} />);
    openPlan();
    await screen.findByText('Alex Chen · Account #9');
    await act(async () => pending.resolve(ok(roster())));
    expect(screen.queryByText('Alex Chen · Account #7')).toBeNull();
    expect(screen.getByText('Alex Chen · Account #9')).toBeTruthy();
  });
});

describe('ProjectHome team summary and recovery', () => {
  it('keeps email-bearing account names, legacy names and display labels outside AnA facts', async () => {
    const current = { ...member(), name: 'account@example.test', label: 'Alex (account@example.test)' };
    const legacy: ProjectTeamMember = { user_id: null, entry_id: 'recorded-name:0', identity: 'recorded_name',
      name: 'legacy@example.test', label: 'legacy@example.test', email: null, role: null,
      responsibilities: [], sharing_role: null, sources: ['recorded_name'] };
    serve(roster(A, [current, legacy]));
    const seen = { ctx: null as SurfaceContext | null };
    render(<><ProjectHome {...props} /><Probe seen={seen} /></>);
    openPlan();
    await screen.findByText('Alex (account@example.test)');
    expect(screen.getByText('legacy@example.test', { exact: true })).toBeTruthy();
    await waitFor(() => expect(seen.ctx?.facts?.team).toHaveLength(2));
    expect(JSON.stringify(seen.ctx?.facts?.team)).not.toContain('@');
    expect(seen.ctx?.facts?.team).toEqual([
      expect.objectContaining({ user_id: 7, entry_id: 'user:7', identity: 'active_member', name: null }),
      expect.objectContaining({ user_id: null, entry_id: 'recorded-name:0', identity: 'recorded_name', name: null }),
    ]);
  });

  it('states the total and truncation when AnA receives a roster excerpt', async () => {
    const team = Array.from({ length: 13 }, (_, n) => ({ ...member(n + 1), role: null,
      responsibilities: [], sources: ['project_member'] } as ProjectTeamMember));
    serve(roster(A, team)); const seen = { ctx: null as SurfaceContext | null };
    render(<><ProjectHome {...props} /><Probe seen={seen} /></>);
    openPlan();
    await screen.findByText('Alex Chen · Account #13');
    await waitFor(() => expect(seen.ctx?.facts?.teamTotal).toBe(13));
    expect(seen.ctx?.facts?.teamTruncated).toBe(true);
    expect(seen.ctx?.facts?.team).toHaveLength(12);
  });

  it('retries the actual scoped GET after an unavailable read', async () => {
    serve(roster()); const original = request.getMockImplementation()!;
    let reads = 0;
    request.mockImplementation((method, path) => path.endsWith('/team') && ++reads === 1
      ? Promise.resolve({ ...ok({}), ok: false, status: 503 }) : original(method, path));
    render(<ProjectHome {...props} />);
    openPlan();
    const error = await screen.findByText("Couldn't load the project team");
    fireEvent.click(within(error.closest('[role="alert"]') as HTMLElement).getByRole('button', { name: 'Retry team' }));
    await screen.findByText('Alex Chen · Account #7');
    expect(reads).toBe(2);
    expect(request.mock.calls.filter(([, path]) => path.endsWith('/team')).every(([method, path]) =>
      method === 'GET' && path === `/api/c2c/projects/${A}/team`)).toBe(true);
  });
});
