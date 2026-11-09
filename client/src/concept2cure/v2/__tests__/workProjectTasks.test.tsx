// @vitest-environment jsdom
/**
 * P-111 slice 2 (S12): a CMC or Quality work area opened from a work project's door is bound to it and shows its
 * tasks. Pinned here: nothing shows when the area is not bound; the door's hand-off binds it and the URL keeps it; the
 * binding is proven through the project hierarchy with the open program, never trusted; its tasks are its
 * `unified_tasks` (`board` items) on its own projects.id; "Add a task" files one on the work project, never as its
 * "Deliver" task; a refused binding and a failed task read are said, never shown as none.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/queryClient')>()), apiRequest }));
const auth = vi.hoisted(() => ({ user: null as null | { id: string; permissions?: string[] } }));
vi.mock('@/services/portal/authService', async (original) => ({ ...await original<typeof import('@/services/portal/authService')>(), useAuth: () => auth, useAuthUser: () => auth.user }));
const shell = vi.hoisted(() => ({ program: '6065271c-d4b0-4936-aad1-02855423a738' as string | null }));
vi.mock('../shellProject', async (original) => ({ ...await original<typeof import('../shellProject')>(),
  useShellProject: () => (shell.program ? { id: shell.program } : null), shellProgramId: () => shell.program }));

import { WorkProjectTasks, bindWorkProject, buildWorkProjectAreaTaskBody, WORK_PROJECT_TASKS_ENTITY } from '../surfaces/ProjectWorkTasks';
import { bindWorkProject as doorBinds } from '../surfaces/ProjectWorkTasks';

const PID = '6065271c-d4b0-4936-aad1-02855423a738';
const ok = (body: unknown, status = 200) => ({ ok: status < 400, status, headers: new Headers({ 'Content-Type': 'application/json' }), json: async () => body }) as Response;
let proofStatus = 200;
let workStatus = 200;
let items: unknown[] = [];

/** The reads the panel makes. */
function get(url: string): Response {
  if (url === `/api/project-hierarchy/101/children?programId=${PID}`) {
    return proofStatus === 200 ? ok({ success: true, data: { parentId: 101, anchorProjectId: 11, children: [] } })
      : ok({ success: false, error: { code: 'PARENT_NOT_IN_PROGRAM', message: 'Not this program.' } }, proofStatus);
  }
  if (url === `/api/project-hierarchy/11/children?programId=${PID}`) {
    return ok({ success: true, data: { parentId: 11, anchorProjectId: 11, children: [{ id: 101, name: 'Drug substance CMC', workKind: 'cmc', ownerName: 'JM Smith' }] } });
  }
  if (url === '/api/concept2cure/projects/101/unified-work') return workStatus === 200 ? ok({ items, summary: { partial: false } }) : ok({ error: 'unavailable' }, workStatus);
  if (url === '/api/task-management/assignees') return ok({ success: true, data: [{ id: '12', name: 'Dana Ruiz' }] });
  return ok({}, 404);
}

/** The one task create, answering as the server does. */
function post(url: string, body?: Record<string, unknown>): Response {
  if (url !== '/api/tasks/tasks') return ok({}, 404);
  items = [...items, { id: 'board:t2', source: 'board', title: body?.title, status: 'open', dueAt: body?.dueDate ?? null, ownerName: 'Dana Ruiz' }];
  return ok({ success: true, data: { taskId: 't2', assigneeName: 'Dana Ruiz', assigneeId: 12, sourceEntityType: body?.sourceEntityType, sourceEntityId: body?.sourceEntityId } }, 201);
}

beforeEach(() => {
  proofStatus = 200; workStatus = 200; auth.user = null; shell.program = PID;
  items = [
    { id: 'board:t1', source: 'board', title: 'Confirm the drug substance specification', status: 'open', dueAt: '2026-11-30T17:00:00.000Z', ownerName: 'Dana Ruiz' },
    { id: 'schedule:4', source: 'schedule', title: 'A schedule milestone', status: 'open', dueAt: null, ownerName: null },
  ];
  window.history.replaceState(null, '', '/concept2cure/cmc?program=' + PID);
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (method: string, url: string, body?: Record<string, unknown>) => (method === 'GET' ? get(url) : post(url, body)));
});
afterEach(() => { cleanup(); delete (window as { C2C_NAV_PARAMS?: unknown }).C2C_NAV_PARAMS; });

describe('a work area bound to a work project (P-111 slice 2)', () => {
  it('shows nothing and reads nothing when the area was not opened from a work project', () => {
    const { container } = render(<WorkProjectTasks area="cmc" />);
    expect(container.textContent).toBe('');
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it('is bound by the door, keeps the binding on its URL, and lists the work project\'s own tasks', async () => {
    doorBinds('cmc', 101);
    render(<WorkProjectTasks area="cmc" />);
    expect(await screen.findByText(/Working in Drug substance CMC · CMC · JM Smith/)).toBeTruthy();
    expect(new URLSearchParams(window.location.search).get('workProject')).toBe('101');
    const list = await screen.findByTestId('work-project-tasks');
    expect(list.textContent).toBe('Confirm the drug substance specification · Dana Ruiz · due Nov 30, 2026 · Open');
    // The binding is proven with the open program before its tasks are read.
    const urls = apiRequest.mock.calls.map(([, u]) => u);
    expect(urls.indexOf(`/api/project-hierarchy/101/children?programId=${PID}`)).toBeLessThan(urls.indexOf('/api/concept2cure/projects/101/unified-work'));
    cleanup();
    // A reload keeps it: the URL alone binds the area.
    render(<WorkProjectTasks area="cmc" />);
    expect(await screen.findByText(/Working in Drug substance CMC/)).toBeTruthy();
    // "Show the whole project" unbinds it.
    fireEvent.click(screen.getByRole('button', { name: 'Show the whole project' }));
    await waitFor(() => expect(new URLSearchParams(window.location.search).get('workProject')).toBeNull());
    expect(screen.queryByText(/Working in/)).toBeNull();
  });

  it('adds a task to the work project, never as its Deliver task', async () => {
    window.history.replaceState(null, '', `/concept2cure/quality?program=${PID}&workProject=101`);
    render(<WorkProjectTasks area="quality" />);
    fireEvent.click(await screen.findByRole('button', { name: /Add a task/ }));
    fireEvent.change(await screen.findByLabelText(/^Task/), { target: { value: 'Review the CAPA effectiveness check' } });
    fireEvent.change(await screen.findByLabelText(/^Person/), { target: { value: '12' } });
    fireEvent.change(screen.getByLabelText(/^Due date/), { target: { value: '2026-12-04' } });
    fireEvent.click(document.querySelector('.de-btn.primary') as HTMLElement);
    await waitFor(() => expect(apiRequest.mock.calls.some(([m, u]) => m === 'POST' && u === '/api/tasks/tasks')).toBe(true));
    const [, , task] = apiRequest.mock.calls.find(([m, u]) => m === 'POST' && u === '/api/tasks/tasks')!;
    expect(task).toMatchObject({ title: 'Review the CAPA effectiveness check', moduleType: 'Quality', projectId: 101, assigneeId: 12,
      sourceEntityType: WORK_PROJECT_TASKS_ENTITY, sourceEntityId: `${PID}:101` });
    expect(await screen.findByText(/Review the CAPA effectiveness check · Dana Ruiz/)).toBeTruthy();
  });

  it('says a refused binding and a failed task read, never "no tasks"', async () => {
    proofStatus = 404;
    window.history.replaceState(null, '', `/concept2cure/cmc?program=${PID}&workProject=101`);
    render(<WorkProjectTasks area="cmc" />);
    const refused = await screen.findByTestId('work-project-bound');
    expect(refused.textContent).not.toMatch(/No tasks/);
    expect(apiRequest.mock.calls.some(([, u]) => u === '/api/concept2cure/projects/101/unified-work')).toBe(false);
    cleanup();
    proofStatus = 200; workStatus = 503;
    render(<WorkProjectTasks area="cmc" />);
    expect(await screen.findByText('Its tasks could not be read.')).toBeTruthy();
    expect(screen.queryByText(/No tasks/)).toBeNull();
  });

  it('offers no add to a person who may not write, and binds only the areas that show tasks', async () => {
    auth.user = { id: '7', permissions: ['read'] };
    window.history.replaceState(null, '', `/concept2cure/cmc?program=${PID}&workProject=101`);
    render(<WorkProjectTasks area="cmc" />);
    await screen.findByTestId('work-project-tasks');
    expect(screen.queryByRole('button', { name: /Add a task/ })).toBeNull();
    bindWorkProject('biostatistics', 101);
    expect((window as { C2C_NAV_PARAMS?: unknown }).C2C_NAV_PARAMS).toBeUndefined();
    expect(buildWorkProjectAreaTaskBody({ areaId: 'cmc', programId: PID, workProjectId: 101, title: ' X ', assignee: '12', due: '', note: '' }))
      .toMatchObject({ title: 'X', moduleType: 'CMC', projectId: 101 });
  });
});
