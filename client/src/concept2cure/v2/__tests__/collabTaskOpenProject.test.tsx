// @vitest-environment jsdom
/**
 * The header's Task form files the task under the open project
 * (2026-10-31 client demo, blocker 1).
 *
 * `C2C.getContext()` takes the open project from `window.C2C_PROJECT.id`,
 * which is the regulatory_programs UUID, and the form used it as the project
 * select's value. No option carries a UUID, so the select showed whichever
 * project rendered first and `Number(uuid)` dropped `projectId` from the POST:
 * the task was saved under no project. The UUID is now resolved to the
 * projects row anchored to it (`regulatoryProgramId`); with no match the form
 * starts on "Choose a project" and refuses to save until one is chosen.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { CollabLayer, TASK_SAVED_EVENT, contextTaskProject, dueDateIso, taskProjectFor } from '../surfaces/CollabLauncher';

const P41 = '41414141-4141-4141-8141-414141414141';
const P42 = '42424242-4242-4242-8242-424242424242';
const ok = (payload: unknown, status = 200) => ({ ok: status < 400, status, json: async () => payload });
const posts = () => apiRequest.mock.calls.filter((c) => c[0] === 'POST' && c[1] === '/api/tasks/tasks');
const projectSelect = () => screen.getByLabelText('Project') as HTMLSelectElement;

beforeEach(() => {
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (method === 'GET' && url === '/api/task-management/assignees') return ok({ success: true, data: [{ id: '8801', name: 'Priya Raman' }] });
    if (method === 'GET' && url === '/api/projects') {
      return ok([
        { id: 41, name: 'BX-204', code: 'NDA-212345', regulatoryProgramId: P41 },
        { id: 42, name: 'MD-11 510(k)', regulatoryProgramId: P42 },
        // A work project under BX-204 (P-111): a child projects row, listed like any other, with no program of its own.
        { id: 101, name: 'Drug substance CMC', regulatoryProgramId: null },
      ]);
    }
    if (method === 'POST' && url === '/api/tasks/tasks') return ok({ data: { taskId: 'TASK-1761-3f2a', assigneeId: 8801 } }, 201);
    return ok({ data: [] });
  });
});
afterEach(() => {
  cleanup();
  Reflect.deleteProperty(window, 'C2C_PROJECT');
  (window as unknown as { C2C: { setContext: (p: Record<string, unknown>) => void } }).C2C.setContext({ workProjectId: null });
});

async function openTaskForm() {
  render(<CollabLayer onNav={vi.fn()} />);
  await act(async () => { window.dispatchEvent(new CustomEvent('c2c:open-collab', { detail: { mode: 'task' } })); });
  await screen.findByRole('option', { name: /MD-11/ });
}
const title = (value: string) =>
  fireEvent.change(screen.getByPlaceholderText(/^e\.g\. Review/), { target: { value } });

describe('header Task — the open project', () => {
  it('opens on the project anchored to the open program and saves the task under it', async () => {
    Object.assign(window, { C2C_PROJECT: { id: P42, title: 'MD-11' } });
    await openTaskForm();
    await waitFor(() => expect(projectSelect().value).toBe('42'));
    title('Confirm the predicate device list');
    fireEvent.click(screen.getByRole('button', { name: /^.?Create task$/ }));
    await waitFor(() => expect(posts()).toHaveLength(1));
    expect(posts()[0][2].projectId).toBe(42);
  });

  it('starts on "Choose a project" with nothing open, and saves nothing until one is chosen', async () => {
    await openTaskForm();
    expect(projectSelect().value).toBe('');
    expect(projectSelect().selectedOptions[0].textContent).toBe('Choose a project');
    title('Draft the response');
    fireEvent.click(screen.getByRole('button', { name: /^.?Create task$/ }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/Choose the project this task belongs to\. Nothing was saved\./);
    expect(posts()).toHaveLength(0);
  });

  it('does not guess when the open program has no task project', async () => {
    Object.assign(window, { C2C_PROJECT: { id: '99999999-9999-4999-8999-999999999999' } });
    await openTaskForm();
    expect(projectSelect().value).toBe('');
  });

  it('tells an open board to re-read, and the confirmation names no task id', async () => {
    Object.assign(window, { C2C_PROJECT: { id: P41 } });
    const saved = vi.fn();
    window.addEventListener(TASK_SAVED_EVENT, saved);
    try {
      await openTaskForm();
      await waitFor(() => expect(projectSelect().value).toBe('41'));
      title('Resolve the open Module 3 comments');
      fireEvent.click(screen.getByRole('button', { name: /^.?Create task$/ }));
      await waitFor(() => expect(saved).toHaveBeenCalledTimes(1));
      const toast = document.querySelector('.cl-toast') as HTMLElement;
      expect(toast.textContent).toMatch(/Saved to the task board, assigned to Priya Raman\./);
      expect(toast.textContent).not.toMatch(/TASK-1761/);
    } finally {
      window.removeEventListener(TASK_SAVED_EVENT, saved);
    }
  });

  it('sends a due date picked on the calendar as the end of that day', async () => {
    Object.assign(window, { C2C_PROJECT: { id: P41 } });
    await openTaskForm();
    await waitFor(() => expect(projectSelect().value).toBe('41'));
    title('File the amendment');
    fireEvent.change(screen.getByLabelText('Due date'), { target: { value: '2027-03-31' } });
    fireEvent.click(screen.getByRole('button', { name: /^.?Create task$/ }));
    await waitFor(() => expect(posts()).toHaveLength(1));
    expect(posts()[0][2].dueDate).toBe(new Date(2027, 2, 31, 23, 59, 59).toISOString());
  });
});

describe('taskProjectFor', () => {
  const rows = [{ id: '41', programId: P41 }, { id: '42', programId: P42 }, { id: '43', programId: null }];
  it('maps a program UUID to its anchored project, case-insensitively, and takes a listed id as it is', () => {
    expect(taskProjectFor(rows, P42.toUpperCase())).toBe('42');
    expect(taskProjectFor(rows, 43)).toBe('43');
  });
  it('guesses nothing: no id, an unknown id, or two projects on one program is ""', () => {
    expect(taskProjectFor(rows, null)).toBe('');
    expect(taskProjectFor(rows, 'all')).toBe('');
    expect(taskProjectFor([...rows, { id: '44', programId: P41 }], P41)).toBe('');
  });
  it('reads only a calendar date as a due date', () => {
    expect(dueDateIso('')).toBeUndefined();
    expect(dueDateIso('2027-02-31')).toBeUndefined();
  });

  it('opens on the work project a bound work area names, and on the open project once it is unbound (P-111)', async () => {
    Object.assign(window, { C2C_PROJECT: { id: P41, title: 'BX-204' } });
    const launcher = (window as unknown as { C2C: { setContext: (p: Record<string, unknown>) => void } }).C2C;
    launcher.setContext({ workProjectId: '101' });
    await openTaskForm();
    await waitFor(() => expect(projectSelect().value).toBe('101'));
    title('Confirm the drug substance specification');
    fireEvent.click(screen.getByRole('button', { name: /^.?Create task$/ }));
    await waitFor(() => expect(posts()).toHaveLength(1));
    expect(posts()[0][2].projectId).toBe(101);
    cleanup();
    launcher.setContext({ workProjectId: null });
    await openTaskForm();
    await waitFor(() => expect(projectSelect().value).toBe('41'));
  });

  it('never files on a bound work project that is not a listed project: it falls back to the open project', () => {
    const rows = [{ id: 41, programId: P41 }, { id: 101, programId: null }];
    expect(contextTaskProject(rows, { project: P41, workProjectId: '101' })).toBe('101');
    expect(contextTaskProject(rows, { project: P41, workProjectId: '999' })).toBe('41');
    expect(contextTaskProject(rows, { project: P41, workProjectId: null })).toBe('41');
  });
});
