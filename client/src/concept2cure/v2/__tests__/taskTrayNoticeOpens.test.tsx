// @vitest-environment jsdom
/**
 * A detached AnA turn's notice opens its conversation (AnA detach DT3, design
 * §5.5; the old DT4 test 3), through the one door every notice in TaskTray
 * uses: NotificationOpenButton asks the server for the notice's verified
 * record target (GET /api/mdx/notifications/:id/target), and only a confirmed
 * conversation target is opened — through the shell's conversation hand-off.
 * The client never follows the notice's own address. Opening it does not mark
 * it read: trunk's rule for every notice (F19, notificationRecordJourney); the
 * person marks it read, as any other. (The first DT3 build opened conversation notices through a second,
 * client-side door that nothing on the server checked; it was converged onto
 * this one.)
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const mocks = vi.hoisted(() => ({ apiRequest: vi.fn(), user: { id: 42, organizationId: 7 } as { id: number; organizationId: number } | null }));
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest: mocks.apiRequest,
}));
vi.mock('@/services/portal/authService', () => ({ useAuth: () => ({ user: mocks.user }), authService: { getUser: () => mocks.user } }));

import { clearAuthToken, setAuthToken } from '@/utils/authToken';
import { clearShellProject } from '../shellProject';
import { clearNavParams } from '../navParams';
import { TaskTray } from '../TaskTray';

const res = (payload: unknown, status = 200) => ({ ok: status < 400, status, json: async () => payload });
const MY_WORK = { success: true, data: { items: [], total: 0, overdue: 0, dueSoon: 0, blocked: 0, approvalsPending: 0 } };
const NOTICE = {
  id: 41,
  category: 'ana_turn',
  severity: 'info',
  title: 'AnA finished your request',
  body: 'Stability reports for the NDA',
  resource_type: 'chat_thread',
  resource_id: 'th_9',
  action_url: '/concept2cure/conversation-thread/th_9',
};
const PLAIN = { id: 42, category: 'admin', severity: 'info', title: 'Maintenance tonight', body: null, action_url: null };
const CONFIRMED = { surface: 'conversation-thread', label: 'Open conversation', params: { threadId: 'th_9' }, programId: null };

const posted: string[] = [];
const asked: string[] = [];
function serve(rows: unknown[], target: { status: number; body: unknown } = { status: 200, body: { data: CONFIRMED } }) {
  mocks.apiRequest.mockImplementation(async (method: string, url: string) => {
    if (method === 'POST') {
      posted.push(url);
      return res({ ok: true });
    }
    asked.push(url);
    if (/^\/api\/mdx\/notifications\/\d+\/target$/.test(url)) return res(target.body, target.status);
    if (url.startsWith('/api/mdx/notifications/unread-count')) return res({ data: { unread: rows.length } });
    if (url.startsWith('/api/mdx/notifications')) return res({ data: rows, meta: { count: rows.length } });
    if (url === '/api/task-management/my-work') return res(MY_WORK);
    if (url === '/api/concept2cure/reviews/my-queue') return res({ data: { threads: [], tasks: [], totalThreads: 0, totalTasks: 0, unreadNotifications: 0, overdueTasks: 0 } });
    return res({ data: null });
  });
}

async function openTray() {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /Your work/ }));
  });
  await waitFor(() => expect(screen.getByRole('dialog', { name: 'Your work' })).toBeTruthy());
}

const handoff = () => (window as { C2C_CONVO?: { id: string } }).C2C_CONVO;

beforeEach(() => {
  mocks.apiRequest.mockReset();
  mocks.user = { id: 42, organizationId: 7 };
  setAuthToken(`fixture.${btoa(JSON.stringify({ userId: 42, organizationId: 7 }))}.synthetic`);
  posted.length = 0;
  asked.length = 0;
  delete (window as { C2C_CONVO?: unknown }).C2C_CONVO;
});
afterEach(() => {
  cleanup();
  clearAuthToken();
  clearNavParams();
  clearShellProject();
});

describe("a detached AnA turn's notice in TaskTray", () => {
  it('names the conversation, and opens it once the server confirms it', async () => {
    serve([NOTICE]);
    const onNav = vi.fn();
    render(<TaskTray onNav={onNav} />);
    await openTray();
    expect((await screen.findByText('AnA finished your request')).closest('.tt-notif')?.textContent).toContain('Stability reports for the NDA');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Open conversation' }));
    });
    await waitFor(() => expect(onNav).toHaveBeenCalledWith('conversation-thread?threadId=th_9'));
    expect(asked, 'opened without the server confirming the record').toContain('/api/mdx/notifications/41/target');
    expect(handoff()).toEqual({ id: 'th_9' });
    expect(posted, 'opening a notice is not reading it (F19)').toEqual([]);
  });

  it('a conversation the server will not confirm (not yours, or gone) is not opened', async () => {
    serve([NOTICE], { status: 404, body: { error: 'The linked record is unavailable or you no longer have access.' } });
    const onNav = vi.fn();
    render(<TaskTray onNav={onNav} />);
    await openTray();
    await act(async () => {
      fireEvent.click(await screen.findByRole('button', { name: 'Open conversation' }));
    });
    expect((await screen.findByRole('alert')).textContent).toMatch(/unavailable|could not be checked/);
    expect(onNav).not.toHaveBeenCalled();
    expect(handoff()).toBeUndefined();
    expect(posted).toEqual([]);
  });

  it('a notice with no record stays a row that only marks read', async () => {
    serve([PLAIN]);
    const onNav = vi.fn();
    render(<TaskTray onNav={onNav} />);
    await openTray();
    await screen.findByText('Maintenance tonight');
    expect(screen.queryByRole('button', { name: /^Open (conversation|linked record)/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Mark "Maintenance tonight" read' })).toBeTruthy();
  });
});
