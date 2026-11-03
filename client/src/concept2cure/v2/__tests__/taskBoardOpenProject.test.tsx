// @vitest-environment jsdom
/**
 * Tasks opens on the open project, and Start workflow stays on the board
 * (2026-10-31 client demo, blockers 2 and 3).
 *
 *   - The project filter was seeded from `window.C2C_TASK_FILTER`, which nothing
 *     in the product sets, so Tasks opened from a project showed every
 *     project's work. The shell names the open project by its
 *     regulatory_programs UUID; the board's rows carry the numeric projects.id,
 *     so the UUID is mapped through GET /api/projects (`regulatoryProgramId`).
 *   - Start workflow asked AnA "Created N tasks…", which left the board for an
 *     empty conversation. It stays on the board view, re-reads it and says the
 *     count and the project in place.
 *   - A task saved from the header's Task form is re-read on an open board.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { clearAuthToken, setAuthToken } from '@/utils/authToken';
import { resolveSurfaceAction } from '@shared/navigation/surface-actions';

const apiRequest = vi.hoisted(() => vi.fn());
const onAsk = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async original => ({ ...(await original<typeof import('@/lib/queryClient')>()), apiRequest }));
vi.mock('@/services/portal/authService', () => ({
  useAuth: () => ({ user: { id: '7', organizationId: 7, permissions: ['governed:write'] } }),
}));

import { TaskBoard } from '../surfaces/TaskBoard';
import { TASK_SAVED_EVENT } from '../surfaces/CollabLauncher';
import { __resetSurfaceActionBus, applySurfaceAction, registeredSurfaceId } from '../surfaceActions';
import { clearNavParams } from '../navParams';
import { clearEditorTarget } from '../editorTarget';
import { clearShellProject } from '../shellProject';

const P31 = '31313131-3131-4131-8131-313131313131';
const P32 = '32323232-3232-4232-8232-323232323232';
const base = {
  moduleType: 'cmc', taskType: 'review', status: 'pending', priority: 'high', assignee: '7', assignedBy: '7',
  progress: 0, impactScore: null, criticalPath: false, regulatoryImpact: false, approvalRequired: false,
  approvalStatus: 'not_started', approvalHistory: [], dependsOn: [], blocks: [], comments: 0, attachments: 0,
  source: 'unified', due: '', dueDateIso: null, phase: null, blocked: false,
};
const T31 = { ...base, taskId: 'TASK-31', title: 'Draft stability summary', project: '31' };
const T32 = { ...base, taskId: 'TASK-32', title: 'Review predicate table', project: '32' };
const DOC_32 = 'df541fa2-594e-48d7-b451-3a5a3d994d39';
const PROJECTS = [
  { id: 31, name: 'BX-204 Oncology IND', regulatoryProgramId: P31 },
  { id: 32, name: 'MD-11 510(k)', regulatoryProgramId: P32 },
];
const TEMPLATE = {
  templateId: 'tpl-1', name: 'Pre-submission review', description: null, category: 'device', isDefault: true,
  usageCount: 0, taskCount: 1, dependencyCount: 0, spanDays: 1, estimatedHours: 2, tasksTruncated: false,
  tasks: [{ id: 't1', title: 'Draft the cover letter', moduleType: 'Regulatory', dayOffset: 0, duration: 1, priority: 'medium' }],
};
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response;
const boardReads = () => apiRequest.mock.calls.filter(([m, p]) => m === 'GET' && p === '/api/task-management/board').length;
const filter = () => (screen.getByRole('combobox', { name: 'Filter by project' }) as HTMLSelectElement).value;

beforeEach(() => {
  setAuthToken(`fixture.${btoa(JSON.stringify({ userId: 7, organizationId: 7 }))}.fixture`);
  clearNavParams();
  onAsk.mockReset();
  apiRequest.mockReset().mockImplementation(async (method: string, path: string) => {
    if (method === 'POST' && path.includes('/tasks/from-template/')) return ok({ success: true, data: [{ taskId: 'NEW-1' }], count: 1 });
    if (path === '/api/task-management/board') return ok({ data: [T31, T32] });
    if (path === '/api/projects') return ok(PROJECTS);
    if (path === '/api/task-management/templates') return ok({ data: [TEMPLATE] });
    return ok({ data: [] });
  });
});
afterEach(() => {
  cleanup();
  __resetSurfaceActionBus();
  clearAuthToken();
  clearNavParams();
  clearEditorTarget();
  clearShellProject();
});

async function mount(onNav = vi.fn()) {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <TaskBoard {...({ onAsk, onNav } as unknown as React.ComponentProps<typeof TaskBoard>)} />
    </QueryClientProvider>,
  );
  await waitFor(() => expect(registeredSurfaceId()).toBe('tasks'));
}
const card = (title: string) => screen.queryByRole('button', { name: `Open ${title}` });

describe('Tasks opens on the open project', () => {
  it('filters to the project the shell has open, mapped from its program UUID', async () => {
    Object.assign(window, { C2C_PROJECT: { id: P32.toUpperCase(), title: 'MD-11' } });
    await mount();
    await screen.findByRole('button', { name: `Open ${T32.title}` });
    await waitFor(() => expect(filter()).toBe('32'));
    expect(card(T31.title)).toBeNull();
  });

  it('stays on all projects with no project open', async () => {
    await mount();
    await screen.findByRole('button', { name: `Open ${T31.title}` });
    expect(card(T32.title)).toBeTruthy();
    expect(filter()).toBe('all');
  });

  it('keeps the rail’s applied action working, and New task opens on the open project', async () => {
    Object.assign(window, { C2C_PROJECT: { id: P31 } });
    await mount();
    await waitFor(() => expect(filter()).toBe('31'));
    const resolved = resolveSurfaceAction('tasking.filter', { mine: 'false' });
    if (!resolved.ok) throw new Error(resolved.error);
    let outcome!: ReturnType<typeof applySurfaceAction>;
    act(() => { outcome = applySurfaceAction(resolved.directive, vi.fn()); });
    expect(outcome.status).toBe('applied');
    expect(filter()).toBe('31');
    fireEvent.click(screen.getByRole('button', { name: /New task/ }));
    const dialog = await screen.findByRole('dialog', { name: 'New task' });
    await within(dialog).findByRole('option', { name: 'BX-204 Oncology IND' });
    expect((within(dialog).getByLabelText('Project') as HTMLSelectElement).value).toBe('31');
  });

  it('never overwrites a project the person chose before the list settled', async () => {
    Object.assign(window, { C2C_PROJECT: { id: P31 } });
    let finish!: (r: Response) => void;
    const board = apiRequest.getMockImplementation()!;
    apiRequest.mockImplementation(async (method: string, path: string) =>
      path === '/api/projects' ? new Promise<Response>(resolve => { finish = resolve; }) : board(method, path));
    await mount();
    await screen.findByRole('button', { name: `Open ${T31.title}` });
    fireEvent.change(screen.getByRole('combobox', { name: 'Filter by project' }), { target: { value: 'all' } });
    await act(async () => { finish(ok(PROJECTS)); });
    expect(filter()).toBe('all');
    expect(card(T32.title)).toBeTruthy();
  });
});

describe('linked authoring task opens its exact project in the one editor', () => {
  it('closes the task drawer before navigating and preserves the task project with the document', async () => {
    Object.assign(window, { C2C_PROJECT: { id: P31, title: 'BX-204' } });
    const currentRequest = apiRequest.getMockImplementation()!;
    apiRequest.mockImplementation(async (method: string, path: string) => {
      if (path === '/api/task-management/board') {
        return ok({ data: [T31, { ...T32, sourceDocumentId: DOC_32 }] });
      }
      return currentRequest(method, path);
    });
    const onNav = vi.fn();
    await mount(onNav);
    await waitFor(() => expect(filter()).toBe('31'));
    fireEvent.change(screen.getByRole('combobox', { name: 'Filter by project' }),
      { target: { value: 'all' } });
    fireEvent.click(await screen.findByRole('button', { name: `Open ${T32.title}` }));
    const open = screen.getByRole('button', { name: /Open linked document in editor/ });
    fireEvent.click(open);
    await waitFor(() => expect(onNav).toHaveBeenCalledWith('document-authoring'));
    expect((window.C2C_PROJECT as unknown as { id: string }).id).toBe(P32);
    expect(window.C2C_EDITOR_TARGET?.docId).toBe(DOC_32);
    expect(window.C2C_EDITOR_TARGET?.programId).toBe(P32);
  });

  it('refuses an unresolvable project without changing the shell project or editor target', async () => {
    Object.assign(window, { C2C_PROJECT: { id: P31, title: 'BX-204' } });
    const currentRequest = apiRequest.getMockImplementation()!;
    apiRequest.mockImplementation(async (method: string, path: string) => {
      if (path === '/api/task-management/board') {
        return ok({ data: [T31, { ...T32, sourceDocumentId: DOC_32 }] });
      }
      if (path === '/api/projects') return ok(PROJECTS.map(p => ({ id: p.id, name: p.name })));
      return currentRequest(method, path);
    });
    const onNav = vi.fn();
    await mount(onNav);
    await waitFor(() => expect(filter()).toBe('all'));
    fireEvent.click(await screen.findByRole('button', { name: `Open ${T32.title}` }));
    fireEvent.click(screen.getByRole('button', { name: /Open linked document in editor/ }));
    expect(screen.getByText(/task’s exact document and project could not be verified/)).toBeTruthy();
    expect(onNav).not.toHaveBeenCalled();
    expect((window.C2C_PROJECT as unknown as { id: string }).id).toBe(P31);
    expect(window.C2C_EDITOR_TARGET).toBeUndefined();
  });
});

describe('Start workflow stays on the board', () => {
  it('re-reads the board, shows the board view and says the count and project, without asking AnA', async () => {
    Object.assign(window, { C2C_PROJECT: { id: P32 } });
    await mount();
    await waitFor(() => expect(filter()).toBe('32'));
    fireEvent.click(screen.getByRole('button', { name: 'Critical path' }));
    fireEvent.click(screen.getByRole('button', { name: /Start workflow/ }));
    const picker = await screen.findByRole('dialog', { name: 'Start workflow from template' });
    await within(picker).findByText('Draft the cover letter');
    await waitFor(() => expect((within(picker).getByLabelText('Project') as HTMLSelectElement).value).toBe('32'));
    const before = boardReads();
    fireEvent.click(within(picker).getByRole('button', { name: /Auto-assign each task/ }));
    fireEvent.click(within(picker).getByRole('button', { name: 'Create 1 tasks' }));

    const notice = await screen.findByTestId('tb-notice');
    expect(notice.textContent).toMatch(/1 task was created for MD-11 510\(k\) from the workflow\./);
    expect(screen.queryByRole('dialog', { name: 'Start workflow from template' })).toBeNull();
    expect(document.querySelector('.tb-kanban')).toBeTruthy();
    await waitFor(() => expect(boardReads()).toBeGreaterThan(before));
    expect(onAsk).not.toHaveBeenCalled();
  });
});

describe('a task saved from the header Task form', () => {
  it('is re-read on an open board', async () => {
    await mount();
    await screen.findByRole('button', { name: `Open ${T31.title}` });
    const before = boardReads();
    act(() => { window.dispatchEvent(new CustomEvent(TASK_SAVED_EVENT)); });
    await waitFor(() => expect(boardReads()).toBe(before + 1));
  });
});
