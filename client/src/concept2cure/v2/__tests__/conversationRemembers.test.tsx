// @vitest-environment jsdom
/**
 * What AnA remembers is reached from the conversation (D2, fold ana-memory into
 * the conversation, 2026-10-29;
 * docs/evidence/D2-ONE-ANA/2026-10-29/fold-ana-memory/).
 *
 * The conversation's header opens the panel beside it, and the project the
 * panel reads the project-scoped notes for is the project this conversation's
 * turns are sent under: the one `useAnaChat` is given, which the stream admits
 * and loadRelationalOverlay reads the same row for.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
vi.mock('@/services/portal/authService', async original => ({
  ...await original<typeof import('@/services/portal/authService')>(),
  useAuth: () => ({ user: { id: '1', organizationId: '1', displayName: 'Test Author', email: 'author@test.co' } }),
}));

const chatOptions = vi.hoisted(() => [] as Array<{ projectId?: unknown }>);
vi.mock('../../components/ana/useAnaChat', () => ({
  useAnaChat: (options: { projectId?: unknown }) => {
    chatOptions.push(options);
    return {
      messages: [],
      isStreaming: false,
      isLoadingThread: false,
      loadThread: vi.fn().mockResolvedValue(undefined),
      send: vi.fn(),
      threadId: null,
    };
  },
}));

import { ConversationThread } from '../surfaces/ConversationThread';
import type { OwnedSurfaceViewProps } from '../surfaceViews';
import { authService, type AuthUser } from '@/services/portal/authService';
import { clearAuthToken, setAuthToken } from '@/utils/authToken';
import { readWorkerSnapshot, type WorkerSnapshot } from '@shared/ana/turn-timeline';
import { AGENT_ACTIVITY_POLL_MS, uniqueTeamWorkers, useAgentActivity, useProjectTeam, workerEstimate, workerMeasurement, workerState } from '../useAgentActivity';
import { ProjectTeamPanel, TeamWorker } from '../AnaWorkPanel';
import { TurnSummary } from '../TurnSummary';
import type { AnaChatMessage } from '../../components/ana/useAnaChat';

const PROPS: OwnedSurfaceViewProps = {
  surface: { id: 'conversation-thread', label: 'Conversation' } as OwnedSurfaceViewProps['surface'],
  segment: 'biotech',
  onNav: () => {},
};
const PROGRAM = '5ac45b38-a1d8-4a41-9488-fac39a57b852';
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response;
let projectBefore: typeof window.C2C_PROJECT;

beforeEach(() => {
  clearAuthToken();
  projectBefore = window.C2C_PROJECT;
  (window as unknown as { C2C_CONVO?: unknown }).C2C_CONVO = { id: 'new' };
  chatOptions.length = 0;
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (method === 'GET' && url === '/api/mdx/ana/memory/profile') {
      return ok({ data: { interaction_count: 2, last_interaction_at: null, profile_summary: 'Answer first.', tone_calibration: {}, emotional_signals: [], acknowledged_mistakes: [] }, meta: { scope: 'user' } });
    }
    if (method === 'GET' && url.startsWith('/api/mdx/ana/memory/profile?project_id=')) {
      return ok({ data: null, meta: { scope: 'project', projectId: 11, projectRef: PROGRAM } });
    }
    return ok({ success: true, data: [] });
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks(); vi.useRealTimers();
  clearAuthToken();
  window.C2C_PROJECT = projectBefore;
  delete (window as unknown as { C2C_CONVO?: unknown }).C2C_CONVO;
});

const TEAM_EVENT_ID = '10000000-0000-4000-8000-000000000001';
function teamWorker(overrides: Partial<WorkerSnapshot> = {}): WorkerSnapshot {
  return { parent: 'parent_1', worker: 'w1', revision: 1, parentStep: 's1', task: 't1', role: 'verify', workKind: 'verification',
    label: 'Check assigned work', phase: 'checking', outcome: null, completed: 1, total: 4, basis: 'deterministic_checks',
    parentDisposition: 'pending', estimate: null, receipt: { eventId: TEAM_EVENT_ID, eventHash: 'a'.repeat(64) }, ...overrides };
}
function teamSnapshot(overrides: Record<string, unknown> = {}) {
  return { organizationId: 7, projectId: 11, projectRef: PROGRAM, asOf: '2026-11-06T20:00:00.000Z', cursor: 'cursor_1', complete: true,
    goal: { alias: 'goal_1', label: 'Project objective', version: 3, summary: 'Prepare the current evidence review for human consideration.', truncated: false,
      source: { charterId: 9, sectionKey: 'objectives', version: 3, contentHash: 'b'.repeat(64), status: 'draft', locked: false } },
    workers: [teamWorker()], ...overrides };
}
function setupTeam(body = teamSnapshot()) {
  const user = { id: '3', organizationId: '7', displayName: 'Synthetic Author', email: 'synthetic@example.invalid' } as AuthUser;
  const userRead = vi.spyOn(authService, 'getUser').mockReturnValue(user);
  vi.spyOn(authService, 'captureSessionReadGuard').mockReturnValue({ sameRevision: () => true, credentialsCurrent: () => true, current: () => true });
  localStorage.setItem('trialsage_access_token', `fixture.${btoa(JSON.stringify({ userId: 3, organizationId: 7 }))}.fixture`);
  const fallback = apiRequest.getMockImplementation();
  apiRequest.mockImplementation(async (method, url, ...rest) => String(url).includes('view=team')
    ? ok({ success: true, data: body }) : fallback?.(method, url, ...rest));
  return { userRead, user };
}
const teamReads = () => apiRequest.mock.calls.filter(([, url]) => String(url).includes('view=team'));

const ACTIVITY = '/api/ana-ri/agent-activity';
const activityReads = () => apiRequest.mock.calls.filter(([method, url]) => method === 'GET' && url === ACTIVITY);
const activityItem = { id: 'investigation_1', question: 'Check the supplied evidence', status: 'Running', toolCalls: 1,
  startedAt: '2026-11-06T20:00:00Z', completedAt: null };
const activitySummary = (activeCount = 1) => ({ activeCount, stalledCount: 0, recentlyCompletedCount: 0, items: [activityItem] });
const activityToken = (userId = 3, organizationId = 7, generation = 1) => `fixture.${btoa(JSON.stringify({ userId, organizationId, generation }))}.fixture`;
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
function setupActivity(body: unknown = activitySummary()) {
  const account = setupTeam(), revision = { value: 1, pending: false, credentials: 1 };
  vi.mocked(authService.captureSessionReadGuard).mockImplementation(() => {
    const captured = revision.value, credentials = revision.credentials;
    const sameRevision = () => captured === revision.value && !revision.pending;
    return { sameRevision, credentialsCurrent: () => sameRevision() && credentials === revision.credentials,
      current: () => sameRevision() && credentials === revision.credentials };
  });
  setAuthToken(activityToken());
  const fallback = apiRequest.getMockImplementation();
  apiRequest.mockImplementation(async (method, url, ...rest) => url === ACTIVITY
    ? ok({ success: true, data: body }) : fallback?.(method, url, ...rest));
  return { ...account, revision };
}

describe('background activity belongs to the current verified account', () => {
  it('accepts explicit empty results and canonical textual statuses without inventing counts', async () => {
    setupActivity({ activeCount: 0, stalledCount: 0, recentlyCompletedCount: 0, items: [] });
    const { result } = renderHook(() => useAgentActivity(true)); await act(async () => {});
    expect(result.current.state).toBe('ready'); expect(result.current.summary?.items).toEqual([]);
    apiRequest.mockResolvedValue(ok({ success: true, data: { ...activitySummary(0), items: [{ ...activityItem, question: '', status: 'external_status', startedAt: null }] } }));
    await act(async () => result.current.refresh());
    expect(result.current.state).toBe('ready'); expect(result.current.summary?.items[0].status).toBe('external_status');
  });

  it.each([
    ['absent summary fields', {}], ['missing items', { activeCount: 0, stalledCount: 0, recentlyCompletedCount: 0 }],
    ['negative count', { ...activitySummary(), activeCount: -1 }], ['fractional count', { ...activitySummary(), stalledCount: 0.5 }],
    ['unsafe count', { ...activitySummary(), recentlyCompletedCount: Number.MAX_SAFE_INTEGER + 1 }],
    ['invalid item', { ...activitySummary(), items: [null] }],
    ...[{ id: 12 }, { id: '' }, { question: undefined }, { status: undefined }, { toolCalls: -1 }, { toolCalls: 0.5 },
      { startedAt: 'not a date' }, { completedAt: undefined }].map(patch => ['invalid item fields', { ...activitySummary(), items: [{ ...activityItem, ...patch }] }]),
  ])('rejects a successful envelope with %s as an error rather than an empty queue', async (_name, body) => {
    setupActivity(body); const { result } = renderHook(() => useAgentActivity(true)); await act(async () => {});
    expect(result.current.state).toBe('error'); expect(result.current.summary).toBeNull(); expect(result.current.readAt).toBeNull();
  });

  it('clears previously verified data after a failed refresh', async () => {
    setupActivity(); const { result } = renderHook(() => useAgentActivity(true)); await act(async () => {});
    expect(result.current.summary?.activeCount).toBe(1);
    apiRequest.mockRejectedValue(new Error('synthetic unavailable'));
    await act(async () => result.current.refresh());
    expect(result.current.state).toBe('error'); expect(result.current.summary).toBeNull(); expect(result.current.readAt).toBeNull();
  });

  it.each(['account', 'roles', 'session'] as const)('hides retained data immediately on a %s change while hidden', async change => {
    const { userRead, user, revision } = setupActivity();
    const { result, rerender } = renderHook(({ enabled }) => useAgentActivity(enabled), { initialProps: { enabled: true } });
    await act(async () => {}); expect(result.current.summary).not.toBeNull(); rerender({ enabled: false });
    if (change === 'account') userRead.mockReturnValue({ ...user, id: '8', organizationId: '9' });
    if (change === 'roles') userRead.mockReturnValue({ ...user, roles: ['changed-role'] } as AuthUser);
    if (change === 'session') revision.value++;
    rerender({ enabled: false });
    expect(result.current.summary).toBeNull(); expect(result.current.readAt).toBeNull(); expect(activityReads()).toHaveLength(1);
  });

  it('holds pending session adoption and never sends old bearer headers for a new account', async () => {
    const { userRead, user, revision } = setupActivity(); const { result, rerender } = renderHook(() => useAgentActivity(true));
    await act(async () => {}); revision.value++; revision.pending = true;
    userRead.mockReturnValue({ ...user, id: '8', organizationId: '9' }); rerender();
    expect(result.current.summary).toBeNull(); await act(async () => {}); expect(activityReads()).toHaveLength(1);
    revision.pending = false; rerender(); await act(async () => {});
    expect(result.current.state).toBe('error'); expect(activityReads()).toHaveLength(1);
    setAuthToken(activityToken(8, 9)); await act(async () => result.current.refresh());
    expect(result.current.state).toBe('ready'); expect(activityReads()).toHaveLength(2);
    expect(activityReads()[1][3]).toMatchObject({ Authorization: `Bearer ${activityToken(8, 9)}`, 'x-organization-id': '9' });
  });

  it('fences a late JSON body after an account switch', async () => {
    const { userRead, user, revision } = setupActivity(), oldBody = deferred<unknown>();
    apiRequest.mockResolvedValueOnce({ ok: true, status: 200, json: () => oldBody.promise } as Response);
    const { result, rerender } = renderHook(() => useAgentActivity(true)); await act(async () => {});
    revision.value++; userRead.mockReturnValue({ ...user, id: '8', organizationId: '9' }); setAuthToken(activityToken(8, 9));
    rerender(); expect(result.current.summary).toBeNull(); await act(async () => {});
    expect(result.current.summary?.activeCount).toBe(1);
    await act(async () => oldBody.resolve({ success: true, data: activitySummary(99) }));
    expect(result.current.summary?.activeCount).toBe(1); expect(activityReads()).toHaveLength(2);
  });

  it('serializes timers and coalesces refreshes while fencing the superseded response', async () => {
    vi.useFakeTimers(); setupActivity(); const first = deferred<Response>(); apiRequest.mockReturnValueOnce(first.promise);
    const { result } = renderHook(() => useAgentActivity(true)); await act(async () => {});
    await act(async () => vi.advanceTimersByTime(AGENT_ACTIVITY_POLL_MS * 2)); expect(activityReads()).toHaveLength(1);
    await act(async () => result.current.refresh()); await act(async () => result.current.refresh());
    expect(activityReads()).toHaveLength(1);
    apiRequest.mockResolvedValue(ok({ success: true, data: activitySummary(2) }));
    await act(async () => first.resolve(ok({ success: true, data: activitySummary(99) })));
    expect(activityReads()).toHaveLength(2); expect(result.current.summary?.activeCount).toBe(2);
  });

  it('stops hidden polling and discards its late response until explicitly shown again', async () => {
    vi.useFakeTimers(); setupActivity(); const first = deferred<Response>(); apiRequest.mockReturnValueOnce(first.promise);
    const { result, rerender } = renderHook(({ enabled }) => useAgentActivity(enabled), { initialProps: { enabled: false } });
    await act(async () => {}); expect(activityReads()).toHaveLength(0); rerender({ enabled: true }); await act(async () => {});
    expect(activityReads()).toHaveLength(1); rerender({ enabled: false });
    await act(async () => { vi.advanceTimersByTime(AGENT_ACTIVITY_POLL_MS * 2); first.resolve(ok({ success: true, data: activitySummary(99) })); });
    expect(result.current.state).toBe('idle'); expect(result.current.summary).toBeNull(); expect(activityReads()).toHaveLength(1);
    rerender({ enabled: true }); await act(async () => {});
    expect(result.current.summary?.activeCount).toBe(1); expect(activityReads()).toHaveLength(2);
  });

  it('retains a legitimate same-actor bearer refresh and uses its current token on the next poll', async () => {
    vi.useFakeTimers(); const { userRead, user, revision } = setupActivity();
    const { result, rerender } = renderHook(() => useAgentActivity(true)); await act(async () => {});
    const readAt = result.current.readAt; revision.credentials++; userRead.mockReturnValue({ ...user });
    setAuthToken(activityToken(3, 7, 2)); rerender();
    expect(result.current.summary?.activeCount).toBe(1); expect(result.current.readAt).toBe(readAt); expect(activityReads()).toHaveLength(1);
    await act(async () => vi.advanceTimersByTime(AGENT_ACTIVITY_POLL_MS));
    expect(activityReads()).toHaveLength(2);
    expect(activityReads()[1][3]).toMatchObject({ Authorization: `Bearer ${activityToken(3, 7, 2)}`, 'x-organization-id': '7' });
    expect(result.current.state).toBe('ready');
  });
});

describe('the optional project team view uses recorded project facts', () => {
  it('starts hidden in a new conversation, toggles accessibly, and renders the actual objective and measured checks', async () => {
    setupTeam(); window.C2C_PROJECT = { id: PROGRAM } as typeof window.C2C_PROJECT;
    render(<ConversationThread {...PROPS} />);
    const show = screen.getByRole('button', { name: 'Show team' });
    expect(show.getAttribute('aria-pressed')).toBe('false'); expect(show.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('region', { name: 'Project team' })).toBeNull();
    await waitFor(() => expect(teamReads()).toHaveLength(1));
    fireEvent.click(show);
    const team = await screen.findByRole('region', { name: 'Project team' });
    expect(team.textContent).toContain('Prepare the current evidence review'); expect(team.textContent).toContain('Draft objective');
    expect(team.textContent).toContain('1/4 checks recorded'); expect(team.textContent).toContain('25% of measured checks');
    expect(team.textContent).toContain('Overall completion estimate unavailable');
    const hide = screen.getByRole('button', { name: 'Hide team' }); expect(hide.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(hide); expect(screen.queryByRole('region', { name: 'Project team' })).toBeNull();
    expect(screen.getByRole('button', { name: /Progress/ })).toBeTruthy();
  });

  it('continues reading durable monitoring while its presentation is off', async () => {
    vi.useFakeTimers(); setupTeam();
    const { result } = renderHook(() => useProjectTeam(PROGRAM, 'new'));
    await act(async () => {}); expect(result.current.open).toBe(false); expect(teamReads()).toHaveLength(1);
    await act(async () => { vi.advanceTimersByTime(20_000); });
    expect(teamReads()).toHaveLength(2); expect(result.current.open).toBe(false);
  });

  it('drops an old project response and resets visibility on a project change', async () => {
    setupTeam(); const other = '6ac45b38-a1d8-4a41-9488-fac39a57b853';
    let release: (response: Response) => void = () => {};
    const old = new Promise<Response>(resolve => { release = resolve; });
    apiRequest.mockImplementation(async (_method, url) => String(url).includes(encodeURIComponent(PROGRAM)) ? old
      : ok({ success: true, data: teamSnapshot({ projectRef: other, projectId: 12 }) }));
    const { result, rerender } = renderHook(({ project }) => useProjectTeam(project, 'new'), { initialProps: { project: PROGRAM } });
    act(() => result.current.toggle()); expect(result.current.open).toBe(true);
    rerender({ project: other }); await act(async () => {});
    expect(result.current.open).toBe(false); expect(result.current.snapshot?.projectId).toBe(12);
    await act(async () => { release(ok({ success: true, data: teamSnapshot() })); });
    expect(result.current.snapshot?.projectId).toBe(12);
  });

  it('drops account-owned data immediately when the session account changes', async () => {
    const { userRead, user } = setupTeam(); const { result, rerender } = renderHook(() => useProjectTeam(PROGRAM, 'new'));
    await act(async () => {}); act(() => result.current.toggle()); expect(result.current.snapshot?.organizationId).toBe(7);
    userRead.mockReturnValue({ ...user, id: '8', organizationId: '9' }); rerender();
    expect(result.current.open).toBe(false); expect(result.current.snapshot).toBeNull();
    await act(async () => {}); expect(result.current.state).toBe('error');
  });

  it.each(['foreign', 'malformed'])('reports a %s snapshot as failure, never as an empty team', async kind => {
    setupTeam(teamSnapshot(kind === 'foreign' ? { organizationId: 99 } : { workers: [teamWorker({ completed: 5 })] }));
    const { result } = renderHook(() => useProjectTeam(PROGRAM, 'new'));
    await act(async () => {}); expect(result.current.state).toBe('error');
    render(<ProjectTeamPanel view={result.current} />);
    expect(screen.getByText(/This is not an empty team/)).toBeTruthy();
  });

  it('deduplicates exact replay and rejects ambiguous duplicate worker records', async () => {
    setupTeam(teamSnapshot({ workers: [teamWorker(), teamWorker()] }));
    const { result } = renderHook(() => useProjectTeam(PROGRAM, 'new')); await act(async () => {});
    expect(result.current.snapshot?.workers).toHaveLength(1);
    expect(uniqueTeamWorkers([teamWorker(), teamWorker({ completed: 2 })])).toBeNull();
    expect(uniqueTeamWorkers([teamWorker(), teamWorker({ revision: 2, completed: 0 })])?.[0].revision).toBe(2);
  });

  it.each(['failed', 'cancelled', 'incomplete'] as const)('never shows a percentage or ETA for a %s worker', outcome => {
    const worker = teamWorker({ phase: 'stopped', outcome, completed: 4 });
    expect(workerMeasurement(worker).percentage).toBeNull(); expect(workerEstimate(worker)).toBe('Completion estimate unavailable.');
  });

  it('never estimates unknown dynamic totals or confuses a returned report with acceptance', () => {
    expect(workerMeasurement(teamWorker({ basis: 'observed_steps', completed: 3, total: null }))).toEqual({ text: '3 steps recorded · total unknown', percentage: null });
    const worker = teamWorker({ phase: 'reported', outcome: 'completed', completed: 4 });
    render(<TurnSummary turn={{ id: 'turn_1', role: 'assistant', text: '', timeline: [{ ...worker, kind: 'worker', seq: 1, at: '2026-11-06T20:00:00Z', round: 1 }] } as AnaChatMessage} live={false} />);
    expect(screen.getByText('Awaiting AnA review')).toBeTruthy(); expect(screen.queryByText('Proposal accepted')).toBeNull();
  });

  it('keeps a stale parent phase historical and never turns it into current progress', () => {
    const worker = teamWorker({ parentState: 'stale', completed: 4 });
    expect(workerState(worker)).toContain('Last recorded: Checking');
    expect(workerState(worker)).toContain('parent state is stale');
    expect(workerMeasurement(worker).percentage).toBeNull();
    expect(workerEstimate(worker)).toBe('Completion estimate unavailable.');
  });

  it('strips raw briefs, reports and arbitrary labels through the actual shared parser', () => {
    const parsed = readWorkerSnapshot({ ...teamWorker(), label: 'PRIVATE_CONTEXT_CANARY', objective: 'PRIVATE_CONTEXT_CANARY', report: 'PRIVATE_CONTEXT_CANARY' });
    expect(parsed?.label).toBe('Check assigned work'); expect(JSON.stringify(parsed)).not.toContain('PRIVATE_CONTEXT_CANARY');
  });
});

describe('measured remaining-check estimates', () => {
  it('states a measured estimate only for remaining checks and never for whole-goal completion', () => {
    const worker = teamWorker({ completed: 3, total: 5, estimate: { basis: 'observed_check_durations', scope: 'remaining_checks', lowerMs: 60_000, upperMs: 120_000, sampleCount: 3, at: '2026-11-06T20:00:00Z' } });
    const now = Date.parse('2026-11-06T20:00:00Z');
    expect(workerEstimate(worker, now)).toContain('Remaining checks: approximately 1–2 minutes');
    expect(workerEstimate(worker, now)).toContain('Overall completion time is not estimated');
    expect(workerEstimate({ ...worker, phase: 'reported', outcome: 'completed' })).toBe('Completion estimate unavailable.');
  });

  it.each([
    [10, 30, 'estimated under a second'], [900, 4900, 'estimated up to 5 seconds'],
    [1000, 59_000, 'approximately 1–59 seconds'], [900, 61_000, 'estimated up to 2 minutes'],
  ])('does not invent a minute-long lower bound for %sms–%sms of measured work', (lowerMs, upperMs, text) => {
    const now = Date.parse('2026-11-13T12:00:00Z');
    const worker = teamWorker({ completed: 3, total: 5, estimate: { basis: 'observed_check_durations', scope: 'remaining_checks',
      lowerMs: Number(lowerMs), upperMs: Number(upperMs), sampleCount: 3, at: new Date(now).toISOString() } });
    expect(workerEstimate(worker, now)).toContain(`Remaining checks: ${text}`);
  });

  it('withdraws an expired or future-dated estimate and refuses inconsistent measurement counts', () => {
    const now = Date.parse('2026-11-13T12:00:00Z');
    const worker = teamWorker({ completed: 3, total: 5, estimate: { basis: 'observed_check_durations', scope: 'remaining_checks',
      lowerMs: 1000, upperMs: 5000, sampleCount: 3, at: new Date(now).toISOString() } });
    for (const at of [now - 1, now + 5000, Number.NaN]) expect(workerEstimate(worker, at)).toBe('Completion estimate unavailable.');
    expect(workerEstimate({ ...worker, completed: 1 }, now)).toBe('Completion estimate unavailable.');
    expect(workerEstimate({ ...worker, basis: 'observed_steps' }, now)).toBe('Completion estimate unavailable.');
    expect(workerEstimate({ ...worker, completed: 5 }, now)).toBe('Completion estimate unavailable.');
  });

  it('updates and expires the visible estimate without waiting for another server poll', () => {
    vi.useFakeTimers(); const now = Date.parse('2026-11-13T12:00:00Z'); vi.setSystemTime(now);
    const worker = teamWorker({ completed: 3, total: 5, estimate: { basis: 'observed_check_durations', scope: 'remaining_checks',
      lowerMs: 2000, upperMs: 5000, sampleCount: 3, at: new Date(now).toISOString() } });
    render(<TeamWorker worker={worker} />);
    expect(screen.getByText(/Remaining checks: approximately 2–5 seconds/)).toBeTruthy();
    act(() => { vi.advanceTimersByTime(3000); });
    expect(screen.getByText(/Remaining checks: estimated up to 2 seconds/)).toBeTruthy();
    act(() => { vi.advanceTimersByTime(2000); });
    expect(screen.getByText('Completion estimate unavailable.')).toBeTruthy();
    expect(screen.queryByText(/Remaining checks:/)).toBeNull();
  });

});

const profileReads = () => apiRequest.mock.calls.map(([, url]) => String(url)).filter((u) => u.startsWith('/api/mdx/ana/memory/profile'));

describe('the conversation reaches What AnA remembers', () => {
  it('opens the panel from the header, for the project this conversation’s turns are sent under', async () => {
    window.C2C_PROJECT = { id: PROGRAM, product: 'ZX-9' } as typeof window.C2C_PROJECT;
    render(<ConversationThread {...PROPS} />);
    // Nothing is read until the person asks to see it.
    expect(profileReads()).toEqual([]);
    expect(screen.queryByRole('dialog', { name: 'What AnA remembers' })).toBeNull();

    const toggle = screen.getByRole('button', { name: 'What AnA remembers' });
    expect(toggle.getAttribute('aria-haspopup')).toBe('dialog');
    fireEvent.click(toggle);

    const dialog = await screen.findByRole('dialog', { name: 'What AnA remembers' });
    expect(await within(dialog).findByText('Answer first.')).toBeTruthy();
    expect(within(dialog).getByRole('heading', { name: /for this project: zx-9/i })).toBeTruthy();
    await waitFor(() => expect(profileReads().sort()).toEqual([
      '/api/mdx/ana/memory/profile',
      `/api/mdx/ana/memory/profile?project_id=${PROGRAM}`,
    ]));
    // The same project the conversation's turns carry.
    expect(chatOptions.at(-1)?.projectId).toBe(PROGRAM);
  });

  it('closes on Escape and hands focus back to the header control', async () => {
    window.C2C_PROJECT = { id: PROGRAM, product: 'ZX-9' } as typeof window.C2C_PROJECT;
    render(<ConversationThread {...PROPS} />);
    const toggle = screen.getByRole('button', { name: 'What AnA remembers' });
    toggle.focus();
    fireEvent.click(toggle);
    const dialog = await screen.findByRole('dialog', { name: 'What AnA remembers' });
    await within(dialog).findByText('Answer first.');
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'What AnA remembers' })).toBeNull());
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'What AnA remembers' }));
  });

  it('with no project open, reads only the person’s own notes', async () => {
    window.C2C_PROJECT = undefined as unknown as typeof window.C2C_PROJECT;
    try { sessionStorage.clear(); } catch { /* jsdom */ }
    render(<ConversationThread {...PROPS} />);
    fireEvent.click(screen.getByRole('button', { name: 'What AnA remembers' }));
    const dialog = await screen.findByRole('dialog', { name: 'What AnA remembers' });
    expect(await within(dialog).findByText('Answer first.')).toBeTruthy();
    expect(within(dialog).getByText(/no project is open/i)).toBeTruthy();
    expect(profileReads()).toEqual(['/api/mdx/ana/memory/profile']);
  });
});
