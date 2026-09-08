// @vitest-environment jsdom
/**
 * The submission pyramid's task-status dropdown writes what it shows.
 *
 * ── The defect ───────────────────────────────────────────────────────────────
 * Pyramid.tsx held task status in `statusOverrides`, a component-state object,
 * and the dropdown's entire handler was `setStatusOverrides(...)`. A user
 * marked a submission task "Done" or "Blocked", watched the completion ring and
 * the phase bars move, and had recorded nothing: it vanished on reload, and on
 * merely switching submission type, which cleared the object outright. There
 * was no warning, because from the screen's point of view nothing had failed.
 *
 * The pyramid STRUCTURE is a deterministic engine read and is shared; the
 * PROGRESS over it is per-org, which is why the engine models them separately.
 * GET/PATCH /api/v1/pyramids/:type/progress is that second half
 * (server/routes/pyramid.routes.ts), and it had no caller.
 *
 * ── What this asserts ────────────────────────────────────────────────────────
 * The CHAIN, not the control: that the recorded progress is what the board
 * renders on load, that changing a status reaches the governed route with the
 * type and task id in the URL and the status in the body, that 'todo' is sent
 * as the clearing status it is, and — the one that matters — that a REFUSED
 * write is reverted and announced, so the completion ring never counts a task
 * the org's record does not have done.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { PyramidShell } from '../surfaces/Pyramid';

// The shell reads none of SurfaceViewProps; typing it by what this file
// supplies keeps the test from churning on unrelated registry changes, and is
// the same shape batchDraftAcceptance.test.tsx uses.
const Surface = PyramidShell as unknown as React.ComponentType<Record<string, unknown>>;

const TYPES = [
  { id: 'IND', label: 'IND — Investigational New Drug', segment: 'pharma', agency: 'FDA', ctd: 'CTD', phases: 1, tasks: 2, hours: 40 },
];

const PYRAMID = {
  id: 'IND',
  label: 'IND — Investigational New Drug',
  phases: [{ id: 'p1', order: 1, name: 'Nonclinical package', weeks: 6 }],
  tasks: [
    { id: 't1', phase: 'p1', name: 'Assemble tox reports', role: 'nonclinical', hours: 20, status: 'todo', critical: true, deps: [], ctd: ['M4.2.3'] },
    { id: 't2', phase: 'p1', name: 'Draft the Investigator Brochure', role: 'regulatory', hours: 20, status: 'todo', critical: false, deps: [], ctd: ['M1.3'] },
  ],
};

/** Envelope-free 200 — liveGetOrNull unwraps `{ data }`, so both shapes work. */
const okJson = (data: unknown) => ({ ok: true, status: 200, json: async () => ({ data }) });

/** Route every GET this surface makes; the PATCH is left to each test. */
function routeReads(recorded: Record<string, string> = {}) {
  apiRequest.mockImplementation(async (method: string, path: string) => {
    if (method !== 'GET') throw new Error('unrouted ' + method + ' ' + path);
    if (path === '/api/v1/pyramids/types') return okJson(TYPES);
    if (path === '/api/v1/global-pyramids') return okJson([]);
    if (path === '/api/v1/pyramids/IND/progress') return okJson({ type: 'IND', statuses: recorded });
    if (path === '/api/v1/pyramids/IND') return okJson(PYRAMID);
    throw new Error('unrouted GET ' + path);
  });
}

/** Pick the IND type and open the work breakdown, where the dropdown lives. */
async function openWorkBreakdown() {
  render(<Surface />);
  await waitFor(() => screen.getByText(/Investigational New Drug/));
  fireEvent.click(screen.getAllByRole('button').find(b => b.textContent?.includes('Investigational New Drug'))!);
  await waitFor(() => screen.getByRole('tab', { name: 'Work breakdown' }));
  fireEvent.click(screen.getByRole('tab', { name: 'Work breakdown' }));
  return await screen.findByLabelText('Status of Assemble tox reports');
}

/** The percentage the completion ring is drawing. */
const ringPct = () =>
  Array.from(document.querySelectorAll('text'))
    .map(t => t.textContent ?? '')
    .find(t => /^\d+%$/.test(t)) ?? null;

afterEach(() => cleanup());
beforeEach(() => { apiRequest.mockReset(); });

describe('PyramidShell — a task status is the org\'s record, not a local override', () => {
  it('renders the status the org has RECORDED, not the structure\'s initial todo', async () => {
    // The engine's structure carries status 'todo' on both tasks. The org's
    // record says one is done. The board must show the record.
    routeReads({ t1: 'done' });
    const select = await openWorkBreakdown();
    expect((select as HTMLSelectElement).value).toBe('done');
    expect((screen.getByLabelText('Status of Draft the Investigator Brochure') as HTMLSelectElement).value).toBe('todo');
  });

  it('sends the change to PATCH /api/v1/pyramids/:type/progress/:taskId with the status', async () => {
    routeReads({});
    const select = await openWorkBreakdown();

    const patch = vi.fn(async (_m: string, _p: string, _b?: unknown) => (
      { ok: true, status: 200, json: async () => ({ data: {} }) }
    ));
    const reads = apiRequest.getMockImplementation()!;
    apiRequest.mockImplementation(async (m: string, p: string, b?: unknown) =>
      m === 'PATCH' ? patch(m, p, b) : reads(m, p, b));

    fireEvent.change(select, { target: { value: 'blocked' } });

    await waitFor(() => expect(patch).toHaveBeenCalled());
    const [method, path, body] = patch.mock.calls[0];
    expect(method).toBe('PATCH');
    expect(path).toBe('/api/v1/pyramids/IND/progress/t1');
    expect(body).toEqual({ status: 'blocked' });
  });

  it('sends \'todo\' as its own status — clearing progress is a write, not a no-op', async () => {
    // 'todo' is the ABSENCE of recorded progress, and the route deletes the
    // entry for it. Skipping the request would leave the server holding 'done'
    // for a task the screen shows as not started.
    routeReads({ t1: 'done' });
    const select = await openWorkBreakdown();

    const patch = vi.fn(async (_m: string, _p: string, _b?: unknown) => (
      { ok: true, status: 200, json: async () => ({ data: {} }) }
    ));
    const reads = apiRequest.getMockImplementation()!;
    apiRequest.mockImplementation(async (m: string, p: string, b?: unknown) =>
      m === 'PATCH' ? patch(m, p, b) : reads(m, p, b));

    fireEvent.change(select, { target: { value: 'todo' } });

    await waitFor(() => expect(patch).toHaveBeenCalled());
    const [, path, body] = patch.mock.calls[0];
    expect(path).toBe('/api/v1/pyramids/IND/progress/t1');
    expect(body).toEqual({ status: 'todo' });
  });

  it('reverts and announces a REFUSED write — the ring never counts a task the record lacks', async () => {
    routeReads({});
    const select = await openWorkBreakdown();

    // Both tasks todo → the ring reads 0%.
    fireEvent.click(screen.getByRole('tab', { name: 'Dashboard' }));
    await waitFor(() => expect(ringPct()).toBe('0%'));
    fireEvent.click(screen.getByRole('tab', { name: 'Work breakdown' }));

    const reads = apiRequest.getMockImplementation()!;
    apiRequest.mockImplementation(async (m: string, p: string, b?: unknown) =>
      m === 'PATCH'
        ? { ok: false, status: 403, json: async () => ({ error: { code: 'FORBIDDEN', message: 'The submission is locked for filing.' } }) }
        : reads(m, p, b));

    fireEvent.change(screen.getByLabelText('Status of Assemble tox reports'), { target: { value: 'done' } });

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/not saved.*locked for filing.*unchanged/i);

    // The dropdown snapped back...
    await waitFor(() =>
      expect((screen.getByLabelText('Status of Assemble tox reports') as HTMLSelectElement).value).toBe('todo'),
    );
    // ...and so did every figure computed from it. This is the assertion the
    // old behaviour could never satisfy: `setStatusOverrides` had no failure
    // path at all, so the ring moved to 50% and stayed there.
    fireEvent.click(screen.getByRole('tab', { name: 'Dashboard' }));
    await waitFor(() => expect(ringPct()).toBe('0%'));
  });

  it('reverts when the write throws, and does not report the throw as a saved status', async () => {
    routeReads({});
    const select = await openWorkBreakdown();

    const reads = apiRequest.getMockImplementation()!;
    apiRequest.mockImplementation(async (m: string, p: string, b?: unknown) => {
      if (m === 'PATCH') throw new Error('Failed to fetch');
      return reads(m, p, b);
    });

    fireEvent.change(select, { target: { value: 'in_progress' } });

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/not saved.*Failed to fetch.*unchanged/i);
    await waitFor(() =>
      expect((screen.getByLabelText('Status of Assemble tox reports') as HTMLSelectElement).value).toBe('todo'),
    );
  });
});
