// @vitest-environment jsdom
/**
 * R1 reach (2026-11-06): a review thread or task resolved by mistake can be reopened where it was resolved.
 *
 * POST /api/concept2cure/review-threads/:threadId/reopen and POST …/review-tasks/:taskId/reopen
 * (server/routes/c2c/reviews.ts) exist, check the `resolve` permission and write their own audit and activity
 * rows, and had no caller: the inbox lists only open items assigned to you, so a resolved one left the screen
 * with no way back. Right after a resolve, the pane says what was resolved and offers Reopen, to the people the
 * server lets reopen (my-queue's `permissions.canResolve`, the same rule).
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
const signedIn = vi.hoisted(() => ({ user: { id: 7, firstName: 'Ada' } }));
vi.mock('@/services/portal/authService', () => ({ useAuth: () => signedIn }));
vi.mock('@/utils/authToken', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/utils/authToken')>()),
  getAuthToken: () => 't',
  getAuthHeaders: () => ({ Authorization: 'Bearer t', 'x-organization-id': '1' }),
}));

import { ReviewThreadsPane } from '../surfaces/ReviewThreads';

const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => data }) as Response;
const refused = (status: number, message: string) =>
  ({ ok: false, status, json: async () => ({ error: { message } }) }) as Response;

const thread = { threadId: 'th-1', title: 'Section 12 safety tables', artifactTitle: 'CSR', anchorLabel: '§12' };
const task = { taskId: 'tk-1', title: 'Check the disposition table', taskType: 'review', artifactTitle: 'CSR' };

function serve(canResolve: boolean, reopen: () => Response = () => ok({ success: true })) {
  let resolvedThread = false;
  let resolvedTask = false;
  apiRequest.mockImplementation(async (method: string, url: string) => {
    const u = String(url);
    if (method === 'GET' && u.startsWith('/api/concept2cure/reviews/my-queue')) {
      const threads = resolvedThread ? [] : [thread];
      const tasks = resolvedTask ? [] : [task];
      return ok({ threads, tasks, totalThreads: threads.length, totalTasks: tasks.length,
        permissions: { canComment: true, canRequestChanges: canResolve, canResolve } });
    }
    if (method === 'GET' && u.includes('/comments')) return ok({ comments: [] });
    if (method === 'POST' && u === '/api/concept2cure/review-threads/th-1/resolve') { resolvedThread = true; return ok({ success: true }); }
    if (method === 'POST' && u === '/api/concept2cure/review-tasks/tk-1/resolve') { resolvedTask = true; return ok({ success: true }); }
    if (method === 'POST' && u.endsWith('/reopen')) {
      const res = reopen();
      if (res.ok) { if (u.includes('review-threads')) resolvedThread = false; else resolvedTask = false; }
      return res;
    }
    return ok({});
  });
}
const posts = () => apiRequest.mock.calls.filter(([m]) => m === 'POST').map(([, u]) => String(u));

beforeEach(() => apiRequest.mockReset());
afterEach(cleanup);

describe('reopening what was just resolved', () => {
  it('a resolved task can be reopened from the pane, and is back in the inbox', async () => {
    serve(true);
    const notice = vi.fn();
    render(<ReviewThreadsPane onNotice={notice} board={null} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Resolve' }));
    const status = await screen.findByText(/Resolved “Check the disposition table”\./);
    fireEvent.click(await screen.findByRole('button', { name: 'Reopen' }));
    await waitFor(() => expect(posts()).toContain('/api/concept2cure/review-tasks/tk-1/reopen'));
    await waitFor(() => expect(notice).toHaveBeenCalledWith('Reopened: Check the disposition table'));
    expect(status.isConnected).toBe(false);
    expect(await screen.findByText('Check the disposition table')).toBeTruthy();
  });

  it('a resolved thread can be reopened from the pane, through the thread’s own route', async () => {
    serve(true);
    const notice = vi.fn();
    render(<ReviewThreadsPane onNotice={notice} board={null} />);
    fireEvent.click(await screen.findByText('Section 12 safety tables'));
    fireEvent.click(await screen.findByRole('button', { name: /Resolve thread/ }));
    await screen.findByText(/Resolved “Section 12 safety tables”\./);
    fireEvent.click(screen.getByRole('button', { name: 'Reopen' }));
    await waitFor(() => expect(posts()).toContain('/api/concept2cure/review-threads/th-1/reopen'));
    await waitFor(() => expect(notice).toHaveBeenCalledWith('Reopened: Section 12 safety tables'));
  });

  it('is not offered to a person the server would refuse (no resolve permission): a task resolved as its assignee', async () => {
    serve(false);
    render(<ReviewThreadsPane onNotice={vi.fn()} board={null} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Resolve' }));
    await waitFor(() => expect(posts()).toContain('/api/concept2cure/review-tasks/tk-1/resolve'));
    await waitFor(() => expect(screen.queryByText('Check the disposition table')).toBeNull());
    expect(screen.queryByRole('button', { name: 'Reopen' })).toBeNull();
  });

  it('a refused reopen is said in the server’s words, and the offer stays', async () => {
    serve(true, () => refused(403, 'Your role cannot reopen tasks'));
    const notice = vi.fn();
    render(<ReviewThreadsPane onNotice={notice} board={null} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Resolve' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Reopen' }));
    await waitFor(() => expect(notice).toHaveBeenCalledWith(expect.stringContaining('Your role cannot reopen tasks'), 'error'));
    expect(screen.getByRole('button', { name: 'Reopen' })).toBeTruthy();
  });
});
