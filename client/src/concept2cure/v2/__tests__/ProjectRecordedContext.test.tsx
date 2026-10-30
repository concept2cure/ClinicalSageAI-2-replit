// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ProjectRecordedContextData, ProjectRecordedProfile } from '@shared/project-recorded-context';
const request = vi.hoisted(() => vi.fn());
const tenant = vi.hoisted(() => ({ currentOrganization: { id: 7 }, currentClientWorkspace: { id: '21', organizationId: '7' } as { id: string; organizationId: string } | null }));
vi.mock('@/lib/queryClient', async original => ({ ...await original<typeof import('@/lib/queryClient')>(), apiRequest: request }));
vi.mock('@/services/portal/authService', async original => {
  const actual = await original<typeof import('@/services/portal/authService')>();
  return { ...actual, useAuth: () => ({ user: actual.authService.getUser() }), useAuthUser: () => actual.authService.getUser() };
});
vi.mock('@/contexts/TenantContext', () => ({ useTenant: () => tenant }));
import { authService } from '@/services/portal/authService';
import { setAuthToken } from '@/utils/authToken';
import { publishShellProject } from '../shellProject';
import { ProjectSide } from '../surfaces/ProjectSide';

const PID = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const path = `/api/c2c/projects/${PID}/intelligence`;
const jwt = (actor = 12, org = 7, revision = 'fixture') => `e30.${btoa(JSON.stringify({ userId: actor, organizationId: org }))}.${revision}`;
const login = (actor = 12, org = 7, role = 'member') => authService.setToken(jwt(actor, org), { id: String(actor), organizationId: String(org), roles: [role], permissions: [] }, 'fixture-refresh', 3600);
const profile = (): ProjectRecordedProfile => ({ profileId: 51, regulatoryStrategy: 'Recorded strategy from the client profile', targetIndication: 'Client-recorded indication', targetPopulation: 'Client-recorded population', customInstructions: 'Preserve the recorded nomenclature',
  riskFactors: [{ risk: 'Recorded risk', likelihood: 'Not quantified', impact: 'Recorded impact', mitigation: 'Review source evidence' }],
  openQuestions: [{ question: 'Recorded evidence question', context: 'Recorded question context', priority: 'high' }],
  keyDecisions: [{ decision: 'Recorded decision', rationale: 'Recorded rationale', date: '2026-10-29', source: 'Client meeting' }],
  learnedInsights: [{ insight: 'Recorded insight', source: 'Source document', confidence: null, extractedAt: '2026-10-29' }], lastEnrichedAt: '2026-10-29T10:00:00.000Z' });
const data = (over: Partial<ProjectRecordedContextData> = {}): ProjectRecordedContextData => ({ programId: PID, projectId: 31, organizationId: 7, actorUserId: 12, clientWorkspaceId: 21, profile: profile(), ...over });
const ok = (value: unknown, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => value }) as Response;
const answer = (over: Partial<ProjectRecordedContextData> = {}) => ok({ success: true, data: data(over) });
function serve(value: Response | Promise<Response>) { request.mockImplementation(async (_method: string, url: string) => url.endsWith('/intelligence') ? value : ok({ success: true, data: null })); }
const reads = () => request.mock.calls.filter(([, url]) => String(url).endsWith('/intelligence'));
function deferred() {
  let resolve!: (value: Response) => void;
  return { promise: new Promise<Response>(done => { resolve = done; }), resolve: (value: Response) => resolve(value) };
}
const side = (pid: string | null = PID) => <ProjectSide pid={pid} dossier={{ state: { loading: true, data: null }, retry: () => {} } as never} copyFor={() => ({ kind: 'none' })} onOpenDoc={() => {}} />;
beforeEach(() => {
  login(); tenant.currentOrganization = { id: 7 }; tenant.currentClientWorkspace = { id: '21', organizationId: '7' };
  window.C2C_PROJECT = { id: PID, title: 'Current project' }; request.mockReset(); serve(answer());
});
afterEach(() => { cleanup(); authService.endSession(null); vi.unstubAllGlobals(); delete window.C2C_PROJECT; });

describe('recorded profile in the existing project side cards', () => {
  it('reads one scoped profile for both cards and identifies its recorded source', async () => {
    render(side());
    expect(await screen.findByText('Recorded strategy from the client profile')).toBeTruthy();
    expect(screen.getByText('Preserve the recorded nomenclature')).toBeTruthy();
    expect(screen.getByText(/Saved intelligence-profile instructions/)).toBeTruthy();
    expect(reads()).toHaveLength(1);
    expect(request).toHaveBeenCalledWith('GET', path, undefined, expect.objectContaining({ Authorization: `Bearer ${jwt()}`, 'x-organization-id': '7', 'x-client-id': '21' }));
    expect(screen.queryByText('Not read on this page yet')).toBeNull();
    expect(screen.getByText('Client-recorded indication')).toBeTruthy();
    expect(screen.getByText('Client-recorded population')).toBeTruthy();
    expect(screen.getByText('Recorded evidence question')).toBeTruthy();
    expect(screen.getByText('Recorded rationale: Recorded rationale')).toBeTruthy();
    expect(screen.getByText('Recorded source: Client meeting')).toBeTruthy();
    expect(screen.getByText('Recorded source: Source document')).toBeTruthy();
    expect(screen.getByText('Confidence not recorded.')).toBeTruthy();
    expect(screen.getByText(/not verified evidence or a readiness verdict/)).toBeTruthy();
    expect(screen.getByText(/Authored project instructions and the skills AnA follows are separate sources/)).toBeTruthy();
    expect(request.mock.calls.every(([method]) => method === 'GET')).toBe(true);
  });

  it('distinguishes a verified absent profile from a profile with no recorded fields', async () => {
    serve(answer({ profile: null })); const view = render(side());
    await screen.findByText('No saved intelligence profile for this project.');
    expect(screen.queryByText('No instructions recorded on this profile.')).toBeNull();
    serve(answer({ profile: { ...profile(), regulatoryStrategy: ' ', targetIndication: null, targetPopulation: null,
      customInstructions: null, riskFactors: [], openQuestions: [], keyDecisions: [], learnedInsights: [] } }));
    view.unmount(); render(side());
    await screen.findByText('No regulatory strategy recorded on this profile.');
    expect(screen.getByText('No instructions recorded on this profile.')).toBeTruthy();
    expect(screen.queryByText('No saved intelligence profile for this project.')).toBeNull();
  });

  it('bounds each recorded list with shown and total counts and escapes saved text', async () => {
    const saved = profile();
    saved.regulatoryStrategy = '<script>Untrusted recorded note</script>';
    saved.riskFactors = Array.from({ length: 7 }, (_, index) => ({ risk: `Risk ${index + 1}`, likelihood: 'Recorded', impact: 'Recorded' }));
    saved.learnedInsights[0].confidence = 0.42;
    serve(answer({ profile: saved })); render(side());
    await screen.findByText('<script>Untrusted recorded note</script>');
    expect(document.querySelector('script')).toBeNull();
    expect(screen.getByText('Showing 5 of 7 recorded risks.')).toBeTruthy();
    expect(screen.getByText('Risk 5')).toBeTruthy(); expect(screen.queryByText('Risk 6')).toBeNull();
    expect(screen.getByText('Recorded confidence: 0.42')).toBeTruthy();
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('states loading without an absence claim and permits an unselected workspace to bind the actual saved parent', async () => {
    tenant.currentClientWorkspace = null;
    const pending = deferred(); serve(pending.promise); render(side());
    expect(screen.getAllByText('Reading saved project profile…')).toHaveLength(2);
    expect(screen.queryByText('No saved intelligence profile for this project.')).toBeNull();
    await waitFor(() => expect(reads()).toHaveLength(1));
    expect(reads()[0][3]).not.toHaveProperty('x-client-id');
    await act(async () => pending.resolve(answer()));
    await screen.findByText('Recorded strategy from the client profile');
  });

  it.each([
    ['foreign program', { success: true, data: data({ programId: OTHER }) }],
    ['foreign actor', { success: true, data: data({ actorUserId: 99 }) }],
    ['foreign organization', { success: true, data: data({ organizationId: 8 }) }],
    ['foreign workspace', { success: true, data: data({ clientWorkspaceId: 22 }) }],
    ['invalid anchor', { success: true, data: data({ projectId: 0 }) }],
    ['false success', { success: false, data: data() }],
    ['absent profile field', { success: true, data: { ...data(), profile: undefined } }],
    ['malformed risk row', { success: true, data: data({ profile: { ...profile(), riskFactors: [null] } as never }) }],
    ['invented missing confidence', { success: true, data: data({ profile: { ...profile(), learnedInsights: [{ insight: 'Unscored', source: 'Source', extractedAt: '2026-10-29' }] } as never }) }],
  ])('withholds a successful but %s answer as unavailable', async (_label, body) => {
    serve(ok(body)); render(side());
    await screen.findByRole('button', { name: 'Retry recorded project context' });
    expect(screen.getAllByRole('alert').filter(element => element.textContent?.includes('Recorded project context could not be read'))).toHaveLength(2);
    expect(screen.queryByText('Recorded strategy from the client profile')).toBeNull();
    expect(screen.queryByText('No saved intelligence profile for this project.')).toBeNull();
  });

  it.each([403, 503])('keeps HTTP %s unavailable and retries the actual same scoped read', async status => {
    serve(ok({ error: 'Profile unavailable' }, status)); render(side());
    const retry = await screen.findByRole('button', { name: 'Retry recorded project context' });
    expect(screen.queryByText('No saved intelligence profile for this project.')).toBeNull();
    serve(answer()); fireEvent.click(retry);
    await screen.findByText('Recorded strategy from the client profile');
    expect(reads()).toHaveLength(2);
    expect(reads().every(([method, url]) => method === 'GET' && url === path)).toBe(true);
  });

  it('makes no profile request for a foreign current tenant selection', () => {
    tenant.currentOrganization = { id: 8 }; render(side());
    expect(screen.getAllByText(/Recorded project context was withdrawn/)).toHaveLength(2);
    expect(reads()).toHaveLength(0);
  });
});

describe('recorded profile response ownership', () => {
  it.each(['account', 'role', 'organization', 'workspace', 'program', 'program-roundtrip', 'token-only'])('drops a delayed old profile after %s changes', async change => {
    const pending = deferred(); let sent = false;
    request.mockImplementation(async (_method: string, url: string) => {
      if (!url.endsWith('/intelligence')) return ok({ success: true, data: null });
      if (sent) return new Promise<Response>(() => {});
      sent = true; return pending.promise;
    });
    const view = render(side()); await waitFor(() => expect(reads()).toHaveLength(1));
    let selected = PID;
    act(() => {
      if (change === 'account') login(99);
      if (change === 'role') login(12, 7, 'manager');
      if (change === 'organization') { login(12, 8); tenant.currentOrganization = { id: 8 }; tenant.currentClientWorkspace = { id: '21', organizationId: '8' }; }
      if (change === 'workspace') tenant.currentClientWorkspace = { id: '22', organizationId: '7' };
      if (change === 'program') { selected = OTHER; publishShellProject({ id: OTHER }); }
      if (change === 'program-roundtrip') { publishShellProject({ id: OTHER }); publishShellProject({ id: PID }); }
      if (change === 'token-only') setAuthToken(jwt(99));
      if (change !== 'token-only') view.rerender(side(selected));
    });
    await act(async () => pending.resolve(answer()));
    expect(screen.queryByText('Recorded strategy from the client profile')).toBeNull();
    expect(screen.queryByText('Preserve the recorded nomenclature')).toBeNull();
    expect(screen.queryByText('No saved intelligence profile for this project.')).toBeNull();
  });

  it('withdraws a loaded profile immediately when the selected workspace changes', async () => {
    const view = render(side()); await screen.findByText('Recorded strategy from the client profile');
    tenant.currentClientWorkspace = { id: '22', organizationId: '7' };
    view.rerender(side());
    expect(screen.queryByText('Recorded strategy from the client profile')).toBeNull();
    expect(screen.queryByText('Preserve the recorded nomenclature')).toBeNull();
  });

  it('refuses a retained retry handler after a bearer account switch before another render', async () => {
    serve(ok({}, 503)); render(side());
    const retry = await screen.findByRole('button', { name: 'Retry recorded project context' });
    setAuthToken(jwt(99)); fireEvent.click(retry);
    expect(reads()).toHaveLength(1);
    expect(screen.getAllByText(/Recorded project context was withdrawn/)).toHaveLength(2);
  });

  it('preserves a pending profile read through canonical same-account bearer refresh', async () => {
    const pending = deferred(); serve(pending.promise); render(side());
    await waitFor(() => expect(reads()).toHaveLength(1));
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ accessToken: jwt(12, 7, 'refreshed'), refreshToken: 'new-refresh', expiresIn: 3600 }), { status: 200, headers: { 'Content-Type': 'application/json' } })));
    await act(async () => { expect(await authService.refreshToken()).toBe(true); });
    await act(async () => pending.resolve(answer()));
    await screen.findByText('Recorded strategy from the client profile');
    expect(reads()).toHaveLength(1);
  });
});
