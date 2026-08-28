// @vitest-environment jsdom
/**
 * The task launcher never names a person it has not been told about.
 *
 * ── The defect ───────────────────────────────────────────────────────────────
 * CollabLauncher.tsx:543 — with "Auto" selected, which is the DEFAULT for every
 * task created from every surface, the panel rendered:
 *
 *   Auto-assign resolves to <b>{whoName}</b> for <b>{moduleType}</b> …
 *
 * `whoName` comes from `C2C.optimalFor()`, which deliberately returns '' — its
 * own note explains that the fixture roster it used to consult named people who
 * do not work at the tenant. So the sentence rendered with an EMPTY name, in the
 * past tense, before any request existed: the user was told a person had been
 * chosen and shown nobody.
 *
 * The server is the authority. `getOptimalAssignee` runs server-side against the
 * org's roster when `assigneeId` is omitted, so the client cannot know the answer
 * until the write returns.
 *
 * ── What this asserts ────────────────────────────────────────────────────────
 * The CHAIN: the panel claims no chosen assignee before the write, renders no
 * empty name node at all, omits `assigneeId` so the SERVER decides, and then
 * reports the assignee the server actually returned.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { CollabLayer } from '../surfaces/CollabLauncher';

const ok = (payload: unknown, status = 200) => ({ ok: status < 400, status, json: async () => payload });

/** The org's real roster — 8801 is who the SERVER picks for auto. */
const ROSTER = { success: true, data: [{ id: '8801', name: 'Priya Raman' }, { id: '8802', name: 'Tom Ashby' }] };

function note(): HTMLElement | null {
  return Array.from(document.querySelectorAll('.cl-note'))
    .find((n) => (n.textContent || '').includes('Auto-assign')) as HTMLElement | undefined ?? null;
}

async function openLauncher() {
  render(<CollabLayer onNav={vi.fn()} />);
  await act(async () => { window.dispatchEvent(new CustomEvent('c2c:open-collab', { detail: { mode: 'task' } })); });
  await waitFor(() => expect(screen.getByText(/Assign to/)).toBeTruthy());
}

afterEach(() => cleanup());
beforeEach(() => {
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (method === 'GET' && url === '/api/task-management/assignees') return ok(ROSTER);
    if (method === 'GET' && url === '/api/projects') return ok([{ id: 41, name: 'BX-204', code: 'NDA-212345' }]);
    if (method === 'GET') return ok({ data: [] });
    if (method === 'POST' && url === '/api/tasks/tasks') {
      return ok({ data: { taskId: 'TSK-9001', assigneeId: 8801 } }, 201);
    }
    return ok({ data: null });
  });
});

describe('CollabLauncher — auto-assign says what is true before the write', () => {
  it('does not claim an assignee has been chosen, and renders no blank name', async () => {
    await openLauncher();
    const n = note();
    expect(n).toBeTruthy();
    const text = n!.textContent || '';

    // The past-tense claim is gone…
    expect(text).not.toMatch(/resolves to/i);
    // …and so is the shape that produced the blank: no empty emphasis node.
    const blanks = Array.from(n!.querySelectorAll('b, code, strong'))
      .filter((el) => !(el.textContent || '').trim());
    expect(blanks).toEqual([]);
    // What it says instead: the server chooses on save, and on what basis.
    expect(text).toMatch(/chosen when you save/i);
    expect(text).toMatch(/workload/i);
  });

  it('omits assigneeId so the server chooses, then reports the assignee it chose', async () => {
    await openLauncher();
    fireEvent.change(screen.getByPlaceholderText(/^e\.g\. Review/), {
      target: { value: 'Resolve the open Module 3 comments' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Create task/i }));

    await waitFor(() =>
      expect(apiRequest.mock.calls.some((c) => c[1] === '/api/tasks/tasks')).toBe(true),
    );
    const body = apiRequest.mock.calls.find((c) => c[1] === '/api/tasks/tasks')![2];
    // The whole point of "auto": the client sends no assignee at all.
    expect('assigneeId' in body).toBe(false);

    // And the confirmation names the person the SERVER returned — not a guess.
    await waitFor(() => expect(screen.getByText(/TSK-9001/)).toBeTruthy());
    expect(document.body.textContent).toMatch(/Priya Raman/);
  });

  it('a manually picked assignee is sent, and no auto note is shown', async () => {
    await openLauncher();
    fireEvent.click(screen.getByRole('button', { name: /Tom Ashby/ }));
    expect(note()).toBeNull();

    fireEvent.change(screen.getByPlaceholderText(/^e\.g\. Review/), { target: { value: 'Draft the response' } });
    fireEvent.click(screen.getByRole('button', { name: /Create task/i }));
    await waitFor(() =>
      expect(apiRequest.mock.calls.some((c) => c[1] === '/api/tasks/tasks')).toBe(true),
    );
    const body = apiRequest.mock.calls.find((c) => c[1] === '/api/tasks/tasks')![2];
    expect(body.assigneeId).toBe(8802);
  });
});
