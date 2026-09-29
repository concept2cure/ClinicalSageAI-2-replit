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
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { TaskTray } from '../TaskTray';

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

afterEach(() => cleanup());
beforeEach(() => {
  apiRequest.mockReset();
});

describe('TaskTray — messages & alerts', () => {
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
