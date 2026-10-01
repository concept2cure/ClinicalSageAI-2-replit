// @vitest-environment jsdom
/**
 * The task board shows every store's work, says where each item lives, and
 * says when a store could not be read (row D2).
 *
 * GET /api/task-management/board now returns, beside the board's own tasks,
 * the schedule's, correspondence's and filings' work as read-only cards
 * carrying `home` (the screen that owns them), and `meta.partial` /
 * `meta.unreadSources` (tests/db/task-board-every-store.dbtest.ts proves the
 * route). This pins what a person sees of it:
 *   - another store's card is labelled with its store and offers no move;
 *   - it counts in the column it belongs to, Blocked included;
 *   - opening it says where it lives and opens that screen on its project,
 *     never the board's editing controls;
 *   - an unread store is named, so a short board does not read as complete;
 *   - the board's own cards keep their controls.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
vi.mock('@/services/portal/authService', () => ({
  useAuth: () => ({ user: { id: 'u-1', permissions: ['governed:write'] } }),
}));
const shell = vi.hoisted(() => ({ publishShellProject: vi.fn() }));
vi.mock('../shellProject', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../shellProject')>()),
  publishShellProject: shell.publishShellProject,
}));

import { TaskBoard } from '../surfaces/TaskBoard';

const base = {
  project: '12', moduleType: '', taskType: '', priority: '', assignee: '', assignedBy: '', progress: 0,
  impactScore: null, due: '', dueDateIso: null, phase: null, criticalPath: false, regulatoryImpact: false,
  approvalRequired: false, approvalStatus: 'not_started', approvalHistory: [], dependsOn: [], blocks: [],
  comments: 0, attachments: 0,
};
const OWN = {
  ...base, taskId: 'TASK-OWN', title: 'Confirm the pre-IND meeting date', moduleType: 'ind', priority: 'high',
  status: 'pending', source: 'unified', blocked: false,
};
const SCHEDULE = {
  ...base, taskId: 'schedule:41', title: 'Statistical analysis plan', status: 'blocked', source: 'schedule',
  blocked: true, readOnly: true, home: { surface: 'project-home', projectId: 12 }, detail: 'Waiting on the SAP template',
};
const FILING = {
  ...base, taskId: 'filing:9f1c', title: '510(k) additional information', status: 'blocked', source: 'filing',
  blocked: true, readOnly: true, home: { surface: 'submission-center', projectId: 12 }, detail: '510k',
};
const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => data }) as Response;

let boardMeta: Record<string, unknown> = { partial: false, unreadSources: [] };
let onNav: ReturnType<typeof vi.fn>;

beforeEach(() => {
  boardMeta = { partial: false, unreadSources: [] };
  onNav = vi.fn();
  shell.publishShellProject.mockReset();
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (method: string, rawPath: unknown) => {
    const path = String(rawPath ?? '');
    if (method !== 'GET') return ok({ success: true });
    if (path === '/api/task-management/board') return ok({ data: [OWN, SCHEDULE, FILING], meta: boardMeta });
    if (path === '/api/projects') return ok({ data: [{ id: 12, name: 'BX-1 programme' }] });
    return ok({ data: [] });
  });
});
afterEach(cleanup);

const mount = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <TaskBoard {...({ onAsk: () => {}, onNav } as unknown as React.ComponentProps<typeof TaskBoard>)} />
    </QueryClientProvider>,
  );

const card = (title: string) => screen.findByRole('button', { name: `Open ${title}` });

describe("TaskBoard — every store's work", () => {
  it("labels another store's card with its store and offers no move; the board's own card keeps its controls", async () => {
    mount();
    const schedule = await card(SCHEDULE.title);
    expect(schedule.textContent).toMatch(/Schedule/);
    expect(within(schedule).queryByRole('button', { name: 'Advance' })).toBeNull();
    expect(within(schedule).queryByRole('button', { name: 'Move back' })).toBeNull();
    expect((await card(FILING.title)).textContent).toMatch(/Filing/);
    expect(within(await card(OWN.title)).getByRole('button', { name: 'Advance' })).toBeTruthy();
  });

  it('counts work blocked in another store in the Blocked column', async () => {
    mount();
    await card(SCHEDULE.title);
    const blockedHeader = screen.getAllByText('Blocked').find((el) => el.closest('.tb-col-h'));
    expect(blockedHeader?.closest('.tb-col-h')?.querySelector('.kn')?.textContent).toBe('2');
  });

  it('opening it says where it lives and opens that screen on its project, with no board edit control', async () => {
    mount();
    fireEvent.click(await card(SCHEDULE.title));
    const detail = await screen.findByRole('dialog', { name: 'Task detail' });
    expect(detail.textContent).toMatch(/Project home/);
    expect(within(detail).queryByRole('button', { name: /Archive/ })).toBeNull();
    expect(within(detail).queryByRole('button', { name: /Advance/ })).toBeNull();
    fireEvent.click(within(detail).getByRole('button', { name: 'Open in Project home' }));
    expect(shell.publishShellProject).toHaveBeenCalledWith(expect.objectContaining({ id: 12, title: 'BX-1 programme' }));
    expect(onNav).toHaveBeenCalledWith('project-home');
    expect(apiRequest.mock.calls.filter(([m]) => m !== 'GET')).toHaveLength(0);
  });

  it('opens a filing in the Submission Center', async () => {
    mount();
    fireEvent.click(await card(FILING.title));
    const detail = await screen.findByRole('dialog', { name: 'Task detail' });
    fireEvent.click(within(detail).getByRole('button', { name: 'Open in Submission Center' }));
    expect(onNav).toHaveBeenCalledWith('submission-center');
  });

  it('names a store it could not read, and says nothing when every store was read', async () => {
    boardMeta = { partial: true, unreadSources: ['c2c_project_work_items'] };
    mount();
    const note = await screen.findByTestId('tb-partial');
    expect(note.textContent).toMatch(/agency correspondence/);
    cleanup();
    boardMeta = { partial: false, unreadSources: [] };
    mount();
    await card(OWN.title);
    expect(screen.queryByTestId('tb-partial')).toBeNull();
  });
});
