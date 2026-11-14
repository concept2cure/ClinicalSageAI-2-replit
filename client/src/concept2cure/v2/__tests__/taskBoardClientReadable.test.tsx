// @vitest-environment jsdom
/**
 * The task board reads as a regulatory-affairs screen, not a schema tour
 * (2026-10-31 client demo, majors 4–6, 8, 9, 11 and 13).
 *
 *   4/5  The board's flag and spacer used the class names `reg` and `sp`, which
 *        page-level rules also style (`.c2c-v2 .reg`, the regulatory screen's
 *        scroll container; `.c2c-v2 .sp`, the specialty screens'). A flagged
 *        card got a ~97px blank band; the drawer's Advance went to its own row.
 *   6    New task offered "Done", which the server refuses at creation.
 *   8    Cards and the table never said which project a task belongs to.
 *   9    Task ids, account numbers, table and route names were on screen.
 *   11   A workflow's task (no type) drew an empty grey type pill.
 *   13   New task had no description and counted the due date in days.
 */
import React from 'react';
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { clearAuthToken, setAuthToken } from '@/utils/authToken';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async original => ({ ...(await original<typeof import('@/lib/queryClient')>()), apiRequest }));
vi.mock('@/services/portal/authService', () => ({
  useAuth: () => ({ user: { id: '7', organizationId: 7, permissions: ['governed:write'] } }),
}));

import { TaskBoard } from '../surfaces/TaskBoard';

const base = {
  moduleType: 'CMC', status: 'in-progress', priority: 'high', assignedBy: '7', progress: 20, impactScore: 6,
  criticalPath: false, regulatoryImpact: false, approvalRequired: false, approvalStatus: 'not_started',
  approvalHistory: [], dependsOn: [], blocks: [], comments: 0, attachments: 0, source: 'unified',
  due: 'in 3 days', dueDateIso: null, phase: null, blocked: false,
};
const FLAGGED = { ...base, taskId: 'TASK-1761923456-ab12cd34', title: 'Reconcile the stability claim', project: '31', taskType: 'review', assignee: '7', regulatoryImpact: true };
const FROM_WORKFLOW = { ...base, taskId: 'TASK-1761923999-ef56ab78', title: 'Draft the cover letter', project: '32', taskType: '', assignee: '42', source: 'template', dependsOn: ['TASK-1761923456-ab12cd34'] };
const PROJECTS = [{ id: 31, name: 'BX-204 Oncology IND' }, { id: 32, name: 'MD-11 510(k)' }];
const RULES = { rules: [{ rule_id: 'r1', name: 'Escalate', description: null, trigger_event: 'task_overdue', actions: [{ type: 'send_notification' }], is_active: true }], total: 1 };
/** Engineering vocabulary that has no place in copy a person reads (registryModel.test.ts INTERNAL). */
const INTERNAL = [/\/api\//, /\bunifiedTasks\b/, /\btaskDependencies\b/, /\btaskTemplates\b/, /\b[a-z]+_[a-z_]+\b/, /Account #\d/, /TASK-\d/, /from-template/, /\bPOST\b/];
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response;

beforeEach(() => {
  setAuthToken(`fixture.${btoa(JSON.stringify({ userId: 7, organizationId: 7 }))}.fixture`);
  apiRequest.mockReset().mockImplementation(async (method: string, p: string) => {
    if (method === 'POST' && p === '/api/tasks/tasks') return ok({ success: true, data: { taskId: 'TASK-NEW' } });
    if (p === '/api/task-management/board') return ok({ data: [FLAGGED, FROM_WORKFLOW] });
    if (p === '/api/projects') return ok(PROJECTS);
    if (p === '/api/task-management/assignees') return ok({ data: [{ id: '7', name: 'JM Smith' }] });
    if (p === '/api/project-rules') return ok(RULES);
    return ok({ data: [] });
  });
});
afterEach(() => { cleanup(); clearAuthToken(); });

async function mount() {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <TaskBoard {...({ onAsk: vi.fn(), onNav: vi.fn() } as unknown as React.ComponentProps<typeof TaskBoard>)} />
    </QueryClientProvider>,
  );
  /* The List is the first view now (D6.md §A.4 step 5; P-131). These cases read the board's cards, so they
     open the Board, one click away; the List's own case below opens the List. */
  fireEvent.click(await screen.findByRole('button', { name: 'Board' }));
  return screen.findByRole('button', { name: `Open ${FLAGGED.title}` });
}
const expectReadable = (el: HTMLElement) => {
  const text = el.textContent ?? '';
  for (const re of INTERNAL) expect(text, String(re)).not.toMatch(re);
};

describe('the board’s own classes do not collide with page rules', () => {
  it('marks regulatory impact and spaces the drawer with board-scoped classes only', async () => {
    const flagged = await mount();
    const flag = within(flagged).getByTitle('Regulatory impact');
    expect(flag.classList.contains('tb-flag-reg')).toBe(true);
    expect(flag.classList.contains('reg')).toBe(false);
    fireEvent.click(flagged);
    const drawer = await screen.findByRole('dialog', { name: 'Task detail' });
    expect(drawer.querySelector('.tb-detail-f .tb-grow')).toBeTruthy();
    fireEvent.click(within(drawer).getByRole('button', { name: 'Close' }));
    fireEvent.click(screen.getByRole('button', { name: 'Critical path' }));
    expect(document.querySelectorAll('.reg, .sp')).toHaveLength(0);
  });

  it('styles the renamed classes, and the page rules they collided with still exist', () => {
    const css = (file: string) => fs.readFileSync(path.resolve(__dirname, '../styles', file), 'utf8');
    const app = css('app-v2.css');
    expect(app).toMatch(/\.c2c-v2 \.tb-flag\.tb-flag-reg\{color:var\(--success\);\}/);
    expect(app).toMatch(/\.c2c-v2 \.tb-grow\{flex:1;\}/);
    expect(app).not.toMatch(/\.tb-flag\.reg\b/);
    expect(app).toMatch(/\.c2c-v2 \.reg\{height:100%/);
    expect(css('journey-v2.css')).toMatch(/\.c2c-v2 \.sp\{height:100%/);
  });
});

describe('cards and the List say which project a task belongs to', () => {
  /* The table became the List (D6.md §A.4 step 5): on a list that spans projects each row names its
     project; no row carries the task id. */
  it('names the project on every card and on every List row, and never the task id', async () => {
    const flagged = await mount();
    expect(within(flagged).getByText('BX-204 Oncology IND')).toBeTruthy();
    expect(within(screen.getByRole('button', { name: `Open ${FROM_WORKFLOW.title}` })).getByText('MD-11 510(k)')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'List' }));
    expect(within(screen.getByRole('button', { name: `Open ${FLAGGED.title}` })).getByText(/BX-204 Oncology IND/)).toBeTruthy();
    expect(within(screen.getByRole('button', { name: `Open ${FROM_WORKFLOW.title}` })).getByText(/MD-11 510\(k\)/)).toBeTruthy();
    expect(document.querySelector('.ct-head')).toBeNull();
    expect(document.body.textContent).not.toMatch(/Task ID/);
  });

  it('draws no type pill for a task with no type', async () => {
    await mount();
    const fromWorkflow = screen.getByRole('button', { name: `Open ${FROM_WORKFLOW.title}` });
    expect(fromWorkflow.querySelector('.tb-type')).toBeNull();
    expect(within(screen.getByRole('button', { name: `Open ${FLAGGED.title}` })).getByText('Review')).toBeTruthy();
  });
});

describe('no internal ids or developer vocabulary on screen', () => {
  it('the board, its List and its analytics', async () => {
    await mount();
    expectReadable(document.body);
    fireEvent.click(screen.getByRole('button', { name: 'List' }));
    expectReadable(document.body);
    fireEvent.click(screen.getByRole('button', { name: 'Analytics' }));
    await screen.findByText(/Task overdue → send notification/);
    expectReadable(document.body);
  });

  it('the task drawer: no task id, no account number, "Came from"', async () => {
    await mount();
    fireEvent.click(screen.getByRole('button', { name: `Open ${FROM_WORKFLOW.title}` }));
    const drawer = await screen.findByRole('dialog', { name: 'Task detail' });
    await waitFor(() => expect(drawer.textContent).toMatch(/MD-11 510\(k\)/));
    expectReadable(drawer);
    expect(drawer.textContent).toMatch(/Came from/);
    expect(drawer.textContent).not.toMatch(/Origin store/);
    // Assignee 42 is not on the roster: said so, not "Account #42".
    expect(drawer.textContent).toMatch(/Name not available/);
  });

  it('the New task and Start workflow dialogs', async () => {
    await mount();
    fireEvent.click(screen.getByRole('button', { name: /New task/ }));
    expectReadable(await screen.findByRole('dialog', { name: 'New task' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    fireEvent.click(screen.getByRole('button', { name: /Start workflow/ }));
    expectReadable(await screen.findByRole('dialog', { name: 'Start workflow from template' }));
  });
});

describe('New task', () => {
  it('offers only the statuses a task can be created in', async () => {
    await mount();
    fireEvent.click(screen.getByRole('button', { name: /New task/ }));
    const dialog = await screen.findByRole('dialog', { name: 'New task' });
    const status = within(dialog).getByLabelText('Status') as HTMLSelectElement;
    expect(Array.from(status.options).map(o => o.textContent)).toEqual(['To do', 'In progress', 'Blocked', 'In review']);
  });

  it('sends a description and the due date picked on the calendar', async () => {
    await mount();
    fireEvent.click(screen.getByRole('button', { name: /New task/ }));
    const dialog = await screen.findByRole('dialog', { name: 'New task' });
    fireEvent.change(within(dialog).getByLabelText(/^Title/), { target: { value: 'Answer the deficiency letter' } });
    fireEvent.change(within(dialog).getByLabelText('Description'), { target: { value: '  Address items 3 and 7.  ' } });
    await within(dialog).findByRole('option', { name: 'MD-11 510(k)' });
    fireEvent.change(within(dialog).getByLabelText('Project'), { target: { value: '32' } });
    const due = within(dialog).getByLabelText('Due date') as HTMLInputElement;
    expect(due.type).toBe('date');
    fireEvent.change(due, { target: { value: '2027-01-15' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /Create task/ }));
    await waitFor(() => expect(apiRequest.mock.calls.some(([m, p]) => m === 'POST' && p === '/api/tasks/tasks')).toBe(true));
    const body = apiRequest.mock.calls.find(([m, p]) => m === 'POST' && p === '/api/tasks/tasks')![2];
    expect(body).toMatchObject({ description: 'Address items 3 and 7.', projectId: 32, dueDate: new Date(2027, 0, 15, 23, 59, 59).toISOString() });
  });
});
