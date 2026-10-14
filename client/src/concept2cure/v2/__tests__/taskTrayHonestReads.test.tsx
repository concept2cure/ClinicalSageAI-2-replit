// @vitest-environment jsdom
/**
 * The "Your work" tray never reports a failed read as "nothing waiting".
 *
 * ── The defect ───────────────────────────────────────────────────────────────
 * TaskTray already refused to show silence for a failed tasks, approvals or
 * review-queue read — its own comment calls "you're clear" when the truth is
 * "we don't know" the worst available failure on a surface whose job is
 * telling someone what needs them. Two reads did not get the same treatment:
 *
 *   · Messages & alerts rendered "No unread messages or alerts." whenever the
 *     row list was empty — including when GET /api/mdx/notifications failed,
 *     because `notifs.error` was never read.
 *   · The bell's badge summed `work?.total ?? 0` and `unread.data?.unread ?? 0`,
 *     so a failed count read fell to 0 and the bell showed nothing at all.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
const actor = vi.hoisted(() => ({ user: { id: '42', organizationId: '7', role: 'admin' } as Record<string, string> | null }));
vi.mock('@/services/portal/authService', () => ({
  useAuth: () => ({ user: actor.user }),
  authService: { getUser: () => actor.user },
}));
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { TaskTray } from '../TaskTray';
import { setAuthToken, clearAuthToken } from '@/utils/authToken';
import { registerSurfaceLeaveGuard } from '../navParams';

const res = (payload: unknown, status = 200) => ({ ok: status < 400, status, json: async () => payload });

const MY_WORK = { success: true, data: { items: [], total: 0, overdue: 0, dueSoon: 0, blocked: 0, approvalsPending: 0 } };

type Routes = Partial<Record<'notifs' | 'unread' | 'myWork', { payload: unknown; status?: number }>>;

function serve(routes: Routes = {}) {
  apiRequest.mockImplementation(async (_method: string, url: string) => {
    const pick = (r: { payload: unknown; status?: number } | undefined, dflt: unknown) =>
      r ? res(r.payload, r.status ?? 200) : res(dflt);
    if (url.startsWith('/api/mdx/notifications/unread-count')) return pick(routes.unread, { data: { unread: 0 } });
    if (url.startsWith('/api/mdx/notifications')) return pick(routes.notifs, { data: [], meta: { count: 0 } });
    if (url === '/api/task-management/my-work') return pick(routes.myWork, MY_WORK);
    if (url === '/api/concept2cure/reviews/my-queue') {
      return res({ data: { threads: [], tasks: [], totalThreads: 0, totalTasks: 0, unreadNotifications: 0, overdueTasks: 0 } });
    }
    if (url === '/api/approval-workflows/pending') return res({ data: { approvals: [] } });
    return res({ data: null });
  });
}

const trigger = () => screen.getByRole('button', { name: /Your work/ });

async function openTray() {
  await act(async () => {
    fireEvent.click(trigger());
  });
  await waitFor(() => expect(screen.getByRole('dialog', { name: 'Your work' })).toBeTruthy());
}

function messagesGroup(): HTMLElement {
  const head = screen.getByText('Messages & alerts');
  return head.closest('.tt-group') as HTMLElement;
}

afterEach(() => { cleanup(); clearAuthToken(); });
beforeEach(() => {
  apiRequest.mockReset();
  actor.user = { id: '42', organizationId: '7', role: 'admin' };
  setAuthToken(`test.${btoa(JSON.stringify({ userId: 42, organizationId: 7 }))}.synthetic`);
});

describe('TaskTray — messages & alerts', () => {
  it('opens a saved report using its validated run resource instead of an arbitrary action URL', async () => {
    serve({ notifs: { payload: { data: [{ id: 5, category: 'reporting', severity: 'info', title: 'Weekly report ready', body: 'Saved snapshot', resource_type: 'report_run', resource_id: '41', action_url: 'https://unrelated.example/ignore' }] } } });
    const onNav = vi.fn();
    render(<TaskTray onNav={onNav} />);
    await openTray();
    fireEvent.click(await screen.findByRole('button', { name: 'Open saved report' }));
    expect(onNav).toHaveBeenCalledWith('insights?reportRunId=41');
    expect(screen.queryByRole('dialog', { name: 'Your work' })).toBeNull();
    expect(apiRequest.mock.calls.some(([method]) => method === 'POST')).toBe(false);
  });

  it('does not offer a report link for a malformed or unrelated resource', async () => {
    serve({ notifs: { payload: { data: [{ id: 5, category: 'reporting', severity: 'info', title: 'Malformed report', body: null, resource_type: 'report_run', resource_id: '../41', action_url: '/concept2cure/insights?reportRunId=41' }, { id: 6, category: 'general', severity: 'info', title: 'Other notification', body: null, resource_type: 'document', resource_id: '41' }] } } });
    render(<TaskTray onNav={vi.fn()} />);
    await openTray();
    await screen.findByText('Malformed report');
    expect(screen.queryByRole('button', { name: 'Open saved report' })).toBeNull();
  });

  it('a failed notifications read is an alert, not "No unread messages"', async () => {
    serve({ notifs: { payload: { error: 'boom' }, status: 500 } });
    render(<TaskTray onNav={vi.fn()} />);
    await openTray();
    await waitFor(() => expect(messagesGroup().querySelector('[role="alert"]')).toBeTruthy());
    const text = messagesGroup().textContent || '';
    expect(text).toMatch(/Couldn't load your messages and alerts/);
    expect(text).not.toMatch(/No unread messages or alerts/);
  });

  it('a genuinely empty inbox still says so', async () => {
    serve();
    render(<TaskTray onNav={vi.fn()} />);
    await openTray();
    await waitFor(() => expect(messagesGroup().textContent).toMatch(/No unread messages or alerts\./));
    expect(messagesGroup().querySelector('[role="alert"]')).toBeNull();
  });
});

describe('TaskTray — the bell badge', () => {
  it('a failed unread-count read is not shown as zero waiting', async () => {
    serve({ unread: { payload: { error: 'boom' }, status: 500 } });
    render(<TaskTray onNav={vi.fn()} />);
    await waitFor(() => expect(trigger().getAttribute('aria-label')).toMatch(/couldn't load/i));
    // A visible marker, not an absent badge that reads as "you're clear".
    expect(document.querySelector('.tt-badge')).toBeTruthy();
  });

  it('a failed my-work read is not shown as zero waiting either', async () => {
    serve({ myWork: { payload: { error: 'boom' }, status: 500 } });
    render(<TaskTray onNav={vi.fn()} />);
    await waitFor(() => expect(trigger().getAttribute('aria-label')).toMatch(/couldn't load/i));
    expect(document.querySelector('.tt-badge')).toBeTruthy();
  });

  it('when every count loads and nothing is waiting, there is no badge', async () => {
    serve();
    render(<TaskTray onNav={vi.fn()} />);
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith('GET', '/api/mdx/notifications/unread-count'));
    await waitFor(() => expect(trigger().getAttribute('aria-label')).toBe('Your work'));
    expect(document.querySelector('.tt-badge')).toBeNull();
  });

  it('a real count still shows as a number', async () => {
    serve({ unread: { payload: { data: { unread: 3 } } } });
    render(<TaskTray onNav={vi.fn()} />);
    await waitFor(() => expect(document.querySelector('.tt-badge')?.textContent).toBe('3'));
    expect(trigger().getAttribute('aria-label')).toBe('Your work — 3 items waiting');
  });
});


describe('TaskTray — native task handoff', () => {
  it('retains the exact unified task business key for assigned and approval rows', async () => {
    const item = { taskId: 'TASK-42', title: 'Same title', projectId: 3, moduleType: 'authoring',
      status: 'pending', priority: 'high', dueDate: null, overdue: false, dueSoon: false,
      blocked: false, approvalRequired: true, approvalStatus: null, criticalPath: false };
    serve({ myWork: { payload: { success: true, data: { ...MY_WORK.data, items: [item], total: 1 } } } });
    const onNav = vi.fn();
    render(<TaskTray onNav={onNav} />);
    await openTray();
    fireEvent.click((await screen.findAllByRole('button', { name: /Same title/ }))[0]);
    expect(onNav).toHaveBeenLastCalledWith('tasks?taskId=TASK-42&taskActor=42&taskOrg=7');
    await openTray();
    fireEvent.click((await screen.findAllByRole('button', { name: /Same title/ }))[1]);
    expect(onNav).toHaveBeenLastCalledWith('tasks?taskId=TASK-42&taskActor=42&taskOrg=7');
  });
});


describe('TaskTray — navigation ownership', () => {
  it.each(['unsaved', 'account'])('holds triage when %s work owns the canvas', async reason => {
    serve(); const onAsk = vi.fn();
    const remove = reason === 'unsaved' ? registerSurfaceLeaveGuard(() => 'Unsaved edits — save them first.') : () => {};
    try {
      render(<TaskTray onNav={vi.fn()} onAsk={onAsk} />); await openTray();
      if (reason === 'account') setAuthToken(`test.${btoa(JSON.stringify({ userId: 43, organizationId: 7 }))}.synthetic`);
      fireEvent.click(screen.getByRole('button', { name: /Triage my day with AnA/ }));
      expect(await screen.findByRole('alert')).toBeTruthy();
      expect(screen.getByRole('dialog', { name: 'Your work' })).toBeTruthy();
      expect(onAsk).not.toHaveBeenCalled();
    } finally { remove(); }
  });

  it('keeps the tray open with the native surface refusal and never writes or navigates', async () => {
    serve();
    const onNav = vi.fn();
    const remove = registerSurfaceLeaveGuard(() => 'There are unsaved edits in §3.2.S.1 — save or leave them first.');
    try {
      render(<TaskTray onNav={onNav} />);
      await openTray();
      fireEvent.click(screen.getByRole('button', { name: /Open the task board/ }));
      expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'There are unsaved edits in §3.2.S.1 — save or leave them first.');
      expect(screen.getByRole('dialog', { name: 'Your work' })).toBeTruthy();
      expect(onNav).not.toHaveBeenCalled();
      expect(apiRequest.mock.calls.some(([method]) => method !== 'GET')).toBe(false);
      remove();
      fireEvent.click(screen.getByRole('button', { name: /Open the task board/ }));
      expect(onNav).toHaveBeenCalledWith('tasks');
    } finally { remove(); }
  });

  it('refuses a same-tick bearer replacement before React sees the account change', async () => {
    serve();
    const onNav = vi.fn();
    render(<TaskTray onNav={onNav} />);
    await openTray();
    setAuthToken(`test.${btoa(JSON.stringify({ userId: 43, organizationId: 7 }))}.synthetic`);
    fireEvent.click(screen.getByRole('button', { name: /Open the task board/ }));
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Your signed-in account or organization changed. Reopen Your work.');
    expect(onNav).not.toHaveBeenCalled();
  });

  it('retires the old drawer and its pending reads when the actor changes', async () => {
    let finishOld: ((value: unknown) => void) | undefined;
    serve();
    const original = apiRequest.getMockImplementation()!;
    apiRequest.mockImplementation((method, path) => path === '/api/task-management/my-work' && actor.user?.id === '42'
      ? new Promise(resolve => { finishOld = resolve; }) : original(method, path));
    const view = render(<TaskTray onNav={vi.fn()} />);
    await openTray();
    actor.user = { id: '43', organizationId: '8' };
    setAuthToken(`test.${btoa(JSON.stringify({ userId: 43, organizationId: 8 }))}.synthetic`);
    view.rerender(<TaskTray onNav={vi.fn()} />);
    expect(screen.queryByRole('dialog', { name: 'Your work' })).toBeNull();
    await act(async () => { finishOld?.(res({ data: { ...MY_WORK.data, total: 99 } })); });
    await openTray();
    expect(screen.queryByText(/99 assigned/)).toBeNull();
    expect(document.querySelector('.tt-badge')).toBeNull();
  });
});
