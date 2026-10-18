// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { TaskFilingHome } from '@shared/types/task-filing-home';
import { getSurface } from '@shared/constants/ui-surface-registry';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async original => ({ ...(await original<typeof import('@/lib/queryClient')>()), apiRequest }));
vi.mock('@/services/portal/authService', () => ({ useAuth: () => ({ user: { id: '1', permissions: [] } }) }));
const publishShellProject = vi.hoisted(() => vi.fn());
vi.mock('../shellProject', () => ({ publishShellProject }));
import { TaskBoard } from '../surfaces/TaskBoard';
import { clearNavParams, consumeNavParams } from '../navParams';

const FILING = '11111111-1111-4111-8111-111111111111';
const PROGRAM = '22222222-2222-4222-8222-222222222222';
const PATH = `/api/task-management/filings/${FILING}`;
const card = {
  taskId: `filing:${FILING}`, title: 'Saved native device filing', project: '12', moduleType: '', taskType: '',
  status: 'in-progress', priority: '', assignee: '', assignedBy: null, progress: 0, impactScore: null,
  due: '', dueDateIso: null, phase: null, criticalPath: false, regulatoryImpact: false, blocked: false,
  approvalRequired: false, approvalStatus: 'not_started', approvalHistory: [], dependsOn: [], blocks: [],
  comments: 0, attachments: 0, source: 'filing', readOnly: true,
  home: { source: 'filing', nativeId: FILING, surface: 'submission-center', projectId: 12,
    programId: '33333333-3333-4333-8333-333333333333', programTitle: 'Stale board owner' },
};
const body = (): TaskFilingHome => ({
  filing: { id: FILING, catalogKey: 'k510_traditional', programType: '510k', variant: 'device', title: card.title,
    status: 'under_review', decision: null, fdaTrackingNumber: 'K262345', filedAt: null, reviewGoalDays: 90,
    decisionDueAt: null, filedArtifactDocumentId: null, filedArtifactSha256: null, notes: 'Actual retained tracker note',
    createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-14T00:00:00Z' },
  home: { source: 'filing', nativeId: FILING, projectId: 12, programId: PROGRAM, programTitle: 'Verified owner' },
});
const ok = (data: unknown, status = 200) => ({ ok: status < 400, status, json: async () => data }) as Response;
let filingRead: () => Promise<Response>;
beforeEach(() => {
  clearNavParams(); publishShellProject.mockReset(); apiRequest.mockReset();
  filingRead = async () => ok({ success: true, data: body() });
  apiRequest.mockImplementation(async (_method: string, path: string) => {
    if (path === PATH) return filingRead();
    if (path === '/api/task-management/board') return ok({ data: [card] });
    if (path === '/api/projects') return ok([{ id: 12, name: 'Saved project' }]);
    return ok({ data: [] });
  });
});
afterEach(() => { cleanup(); clearNavParams(); });
async function open() {
  const onNav = vi.fn();
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <TaskBoard surface={getSurface('tasks')!} onAsk={vi.fn()} onNav={onNav} segment="biopharma" />
  </QueryClientProvider>);
  fireEvent.click(await screen.findByRole('button', { name: `Open ${card.title}` }));
  return { onNav, dialog: await screen.findByRole('dialog', { name: 'Task detail' }) };
}
describe('task board exact native filing handoff', () => {
  it('verifies the native row before publishing its actual UUID owner and exact filing target', async () => {
    const { dialog, onNav } = await open();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Open in Submission Center' }));
    await waitFor(() => expect(onNav).toHaveBeenCalledWith('submission-center'));
    expect(apiRequest).toHaveBeenCalledWith('GET', PATH);
    expect(publishShellProject).toHaveBeenCalledWith({ id: PROGRAM, title: 'Verified owner' });
    expect(consumeNavParams('submission-center')).toEqual({ filingId: FILING, ws: 'portfolio' });
    expect(apiRequest.mock.calls.every(([method]) => method === 'GET')).toBe(true);
  });
  it('opens an unbound native row without changing the currently open programme', async () => {
    const data = body(); data.home.projectId = null; data.home.programId = null; data.home.programTitle = null;
    filingRead = async () => ok({ success: true, data });
    const { dialog, onNav } = await open();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Open in Submission Center' }));
    await waitFor(() => expect(onNav).toHaveBeenCalledWith('submission-center'));
    expect(publishShellProject).not.toHaveBeenCalled();
    expect(consumeNavParams('submission-center')?.filingId).toBe(FILING);
  });
  it.each([403, 404, 503])('keeps the task and programme unchanged after HTTP%s, then permits exact-record retry', async status => {
    filingRead = async () => ok({ error: 'Refused' }, status);
    const { dialog, onNav } = await open();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Open in Submission Center' }));
    await within(dialog).findByRole('alert');
    expect(onNav).not.toHaveBeenCalled(); expect(publishShellProject).not.toHaveBeenCalled();
    filingRead = async () => ok({ success: true, data: body() });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Open in Submission Center' }));
    await waitFor(() => expect(onNav).toHaveBeenCalledWith('submission-center'));
  });
  it('refuses a malformed successful row rather than adopting another filing identity', async () => {
    const data = body(); data.filing.id = PROGRAM;
    filingRead = async () => ok({ success: true, data });
    const { dialog, onNav } = await open();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Open in Submission Center' }));
    await within(dialog).findByRole('alert');
    expect(onNav).not.toHaveBeenCalled(); expect(publishShellProject).not.toHaveBeenCalled();
  });
  it('ignores a late authorization response after the original task detail closes', async () => {
    let finish!: (response: Response) => void;
    filingRead = () => new Promise(resolve => { finish = resolve; });
    const { dialog, onNav } = await open();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Open in Submission Center' }));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith('GET', PATH));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
    await act(async () => { finish(ok({ success: true, data: body() })); });
    expect(onNav).not.toHaveBeenCalled(); expect(publishShellProject).not.toHaveBeenCalled();
    expect(consumeNavParams('submission-center')).toBeNull();
  });
  it('does not let an older request navigate after the same task was closed and reopened', async () => {
    let finish!: (response: Response) => void;
    filingRead = () => new Promise(resolve => { finish = resolve; });
    const { dialog, onNav } = await open();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Open in Submission Center' }));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith('GET', PATH));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
    fireEvent.click(screen.getByRole('button', { name: `Open ${card.title}` }));
    await act(async () => { finish(ok({ success: true, data: body() })); });
    expect(onNav).not.toHaveBeenCalled(); expect(publishShellProject).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'Task detail' })).toBeTruthy();
  });
});
