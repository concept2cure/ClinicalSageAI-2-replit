// @vitest-environment jsdom
/**
 * Home lists what is waiting for you (decision 9, CLIENT_JOURNEY_2026-10-25.md pass 5).
 *
 * Home's "Your tasks" was one link to the board. The founder decided Home lists the open items: sections and
 * deliverables assigned to you, approvals you sign, reviews you were asked for. They come from the same reads and
 * the same groups as the top bar's "Your work" (OpenWork.tsx), so the two never disagree. This pins that each
 * group is listed from its read, that each item opens where it is worked and names its project (the first-session
 * journey found the same document listed once per project with nothing to tell them apart), and that a failed
 * read is said as a failure, never as "nothing assigned".
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
vi.mock('@/services/portal/authService', () => ({
  useAuth: () => ({ user: { id: 7, organizationId: 4, firstName: 'Dana' } }),
}));

import { Home } from '../surfaces/Surfaces';
import { __resetSurfaceActionBus } from '../surfaceActions';

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response;
const fail = () => ({ ok: false, status: 503, json: async () => ({}) }) as Response;
const TASK = { taskId: 'TASK-1792954878263-6874b660', title: 'Prepare: Investigator Brochure', projectId: 1, projectName: 'BX-401 — Oncology IND', moduleType: 'Plan', status: 'pending',
  priority: 'medium', dueDate: '2026-11-13T17:00:00.000Z', overdue: false, dueSoon: true, blocked: false, approvalRequired: false, approvalStatus: '', criticalPath: false };
const MY_WORK = { items: [TASK], total: 1, overdue: 0, dueSoon: 1, blocked: 0, approvalsPending: 0 };
const APPROVAL = { id: 'r-1', doc: 'Clinical protocol v2', prog: 'BX-401', role: 'Medical monitor', atMySignOff: true };

function serve(over: { myWork?: () => Response } = {}) {
  apiRequest.mockImplementation((_m: string, url: string) => {
    if (url === '/api/task-management/my-work') return Promise.resolve(over.myWork ? over.myWork() : ok({ success: true, data: MY_WORK }));
    if (url.startsWith('/api/review/board')) return Promise.resolve(ok({ success: true, data: { queue: [APPROVAL] } }));
    if (url === '/api/concept2cure/reviews/my-queue') return Promise.resolve(ok({ success: true, data: { threads: [], tasks: [], totalThreads: 0, totalTasks: 0, unreadNotifications: 0, overdueTasks: 0 } }));
    if (url.startsWith('/api/chat/threads')) return Promise.resolve(ok({ threads: [] }));
    return Promise.resolve(ok({ data: [] }));
  });
}
function mount() {
  const onNav = vi.fn();
  render(<Home onNav={onNav} onAsk={vi.fn()} segment="biotech" />);
  return { onNav };
}

beforeEach(() => { apiRequest.mockReset(); serve(); });
afterEach(() => { cleanup(); __resetSurfaceActionBus(); });

describe('Home: your open items, listed', () => {
  it('lists the deliverable assigned to you, and opens it on the board where it is worked', async () => {
    const { onNav } = mount();
    const section = await screen.findByTestId('home-open-items');
    const item = await within(section).findByRole('button', { name: /Prepare: Investigator Brochure/ });
    fireEvent.click(item);
    expect(onNav).toHaveBeenCalledWith(`tasks?taskId=${TASK.taskId}&taskActor=7&taskOrg=4`);
  });

  it('the same document assigned in two projects is told apart by each project\'s name', async () => {
    const other = { ...TASK, taskId: 'TASK-2', projectId: 2, projectName: 'FS-202 — Fibrosis IND' };
    serve({ myWork: () => ok({ success: true, data: { ...MY_WORK, items: [TASK, other], total: 2 } }) });
    mount();
    const section = await screen.findByTestId('home-open-items');
    const rows = await within(section).findAllByRole('button', { name: /Prepare: Investigator Brochure/ });
    expect(rows.map((r) => r.textContent)).toEqual([
      expect.stringContaining('BX-401 — Oncology IND · Plan'),
      expect.stringContaining('FS-202 — Fibrosis IND · Plan'),
    ]);
  });

  it('a task stored under an internal module id shows the module\'s words, never the id', async () => {
    const stored = { ...TASK, taskId: 'TASK-3', title: 'Build the sequence', moduleType: 'submission-center' };
    serve({ myWork: () => ok({ success: true, data: { ...MY_WORK, items: [stored], total: 1 } }) });
    mount();
    const section = await screen.findByTestId('home-open-items');
    const row = await within(section).findByRole('button', { name: /Build the sequence/ });
    expect(row.textContent).toContain('BX-401 — Oncology IND · Submission Center');
    expect(row.textContent).not.toContain('submission-center');
  });

  it('lists the approval waiting for your signature, and opens Review', async () => {
    const { onNav } = mount();
    const section = await screen.findByTestId('home-open-items');
    expect(await within(section).findByText('Approvals — you sign')).toBeTruthy();
    fireEvent.click(within(section).getByRole('button', { name: /Clinical protocol v2/ }));
    expect(onNav).toHaveBeenCalledWith('review');
  });

  it('a failed read of your tasks is said, never "nothing assigned"', async () => {
    serve({ myWork: fail });
    mount();
    const section = await screen.findByTestId('home-open-items');
    expect(await within(section).findByText(/Couldn't load your tasks/)).toBeTruthy();
    expect(within(section).queryByText(/Nothing assigned to you right now/)).toBeNull();
  });
});
