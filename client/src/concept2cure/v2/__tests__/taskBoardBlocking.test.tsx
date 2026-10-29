// @vitest-environment jsdom
/**
 * The task board marks another store's blocking work, and counts it (D2,
 * 2026-10-29; docs/evidence/D2-ONE-ANA/2026-10-29/fold-device-tasks/).
 *
 * The device task workbench folded into Tasks. Its header said "· N blocking",
 * the cross-store view's `summary.blocking`. The board's other-store cards now
 * carry `blocking`, copied by the server from that view
 * (server/routes/__tests__/taskBoard-blocking.test.ts proves the read). This pins
 * what a person sees of it:
 *   - a review blocker or a critical-to-quality task carries the blocking flag,
 *     in the card-flag vocabulary the board already uses;
 *   - it is not called blocked, and it stays in the column its status puts it in;
 *   - work with no blocking record carries no flag: nothing is invented;
 *   - the Analytics count says how much work holds the submission, by the same
 *     rule as the cross-store summary.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { clearAuthToken, setAuthToken } from '@/utils/authToken';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
vi.mock('@/services/portal/authService', () => ({
  useAuth: () => ({ user: { id: '7', organizationId: 7, permissions: ['governed:write'] } }),
}));

import { TaskBoard } from '../surfaces/TaskBoard';

const base = {
  project: '12', moduleType: '', taskType: '', priority: '', assignee: '', assignedBy: null, progress: 0,
  impactScore: null, due: '', dueDateIso: null, phase: null, criticalPath: false, regulatoryImpact: false,
  approvalRequired: false, approvalStatus: 'not_started', approvalHistory: [], dependsOn: [], blocks: [],
  comments: 0, attachments: 0,
};
const home = (source: string, nativeId: string) => ({ surface: 'project-home', projectId: 12, programId: null, programTitle: null, source, nativeId });
const OWN = { ...base, taskId: 'TASK-OWN', title: 'Confirm the pre-IND meeting date', moduleType: 'ind', status: 'pending', source: 'unified', blocked: false };
const REVIEW_BLOCKER = {
  ...base, taskId: 'review:WI-1', title: 'Reviewer hold on 2.7.4', status: 'pending', source: 'review',
  blocked: false, blocking: true, readOnly: true, home: home('review', 'WI-1'), detail: 'approval_blocker',
};
const CRITICAL_TO_QUALITY = {
  ...base, taskId: 'schedule:41', title: 'Release specification', status: 'pending', source: 'schedule',
  blocked: false, blocking: true, readOnly: true, home: home('schedule', '41'), detail: null,
};
const PLAIN = {
  ...base, taskId: 'review:WI-3', title: 'Tidy the 2.5 references', status: 'pending', source: 'review',
  blocked: false, blocking: false, readOnly: true, home: home('review', 'WI-3'), detail: null,
};
const ON_HOLD = {
  ...base, taskId: 'filing:9f1c', title: '510(k) additional information', status: 'blocked', source: 'filing',
  blocked: true, blocking: true, readOnly: true, home: { ...home('filing', '9f1c'), surface: 'submission-center' }, detail: '510k',
};
const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => data }) as Response;

beforeEach(() => {
  setAuthToken(`fixture.${btoa(JSON.stringify({ userId: 7, organizationId: 7 }))}.fixture`);
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (method: string, rawPath: unknown) => {
    const path = String(rawPath ?? '');
    if (method !== 'GET') return ok({ success: true });
    if (path === '/api/task-management/board') {
      return ok({ data: [OWN, REVIEW_BLOCKER, CRITICAL_TO_QUALITY, PLAIN, ON_HOLD], meta: { partial: false, unreadSources: [] } });
    }
    if (path === '/api/projects') return ok({ data: [{ id: 12, name: 'BX-1 programme' }] });
    return ok({ data: [] });
  });
});
afterEach(() => { cleanup(); clearAuthToken(); });

const mount = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <TaskBoard {...({ onAsk: () => {}, onNav: vi.fn() } as unknown as React.ComponentProps<typeof TaskBoard>)} />
    </QueryClientProvider>,
  );
const card = (title: string) => screen.findByRole('button', { name: `Open ${title}` });
const FLAG = 'Blocking the submission';

describe("TaskBoard: another store's blocking work", () => {
  it('flags a review blocker and a critical-to-quality task as blocking, with the board\'s flag', async () => {
    mount();
    for (const t of [REVIEW_BLOCKER, CRITICAL_TO_QUALITY]) {
      const flag = within(await card(t.title)).getByTitle(FLAG);
      expect(flag.className).toMatch(/\btb-flag\b/);
    }
  });

  it('invents no blocker: plain work and the board\'s own task carry no flag', async () => {
    mount();
    expect(within(await card(PLAIN.title)).queryByTitle(FLAG)).toBeNull();
    expect(within(await card(OWN.title)).queryByTitle(FLAG)).toBeNull();
  });

  it('does not call blocking work blocked: it stays in its own column, and Blocked counts only the hold', async () => {
    mount();
    const flagged = await card(REVIEW_BLOCKER.title);
    expect(within(flagged).queryByText('Blocked')).toBeNull();
    expect(flagged.closest('.tb-col')?.querySelector('.tb-col-h')?.textContent).toMatch(/Pending|To do|Open/i);
    const blockedHeader = screen.getAllByText('Blocked').find((el) => el.closest('.tb-col-h'));
    expect(blockedHeader?.closest('.tb-col-h')?.querySelector('.kn')?.textContent).toBe('1');
    // The hold already reads as blocked; it gets no second flag.
    expect(within(await card(ON_HOLD.title)).queryByTitle(FLAG)).toBeNull();
  });

  it('counts the work holding the submission by the cross-store rule: blocked, or recorded as blocking', async () => {
    mount();
    await card(OWN.title);
    fireEvent.click(screen.getByRole('button', { name: 'Analytics' }));
    const label = screen.getAllByText(FLAG).find((el) => el.classList.contains('metric-l'));
    expect(label, 'no Analytics count for blocking work').toBeTruthy();
    expect(label!.closest('.metric')?.querySelector('.metric-n')?.textContent).toBe('3');
    /* Found by mutation: counting blocking work into Blocked survived the column
       check above, because the column reads the status and the metric does not. */
    const blocked = screen.getAllByText('Blocked').find((el) => el.classList.contains('metric-l'));
    expect(blocked!.closest('.metric')?.querySelector('.metric-n')?.textContent, 'blocking work counted as blocked').toBe('1');
  });
});
