// @vitest-environment jsdom
/**
 * Plan's tasks. Its "Your tasks" line was removed on 2026-10-31 (it listed none);
 * what follows is its history. Plan's "Your tasks" line (ONE_ANA_ONE_CANVAS.md slice 24; "My work" with
 * "Open My work" until slice A.1 named it as section 9 of
 * INFORMATION_ARCHITECTURE.md does: Tasks is the place, its door names the job).
 *
 * The page had a "Tasks & readiness" panel whose title said "Tasks & submission
 * readiness aren't wired to this workspace yet" and whose button opened the
 * task board on everyone's tasks. The dispatch readiness is on the Submit stage
 * now (projectHomeSubmitStage.test.tsx). The person's work cannot be filtered
 * to this project yet: the task store keys a project by the numeric
 * projects.id, which this page does not resolve. So the page says that in one
 * line, and "See your tasks in Tasks" opens the task board on the signed-in
 * person's own tasks, as the nav does.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
/* useDocumentList reads the signed-in session (CanvasDocumentList.tsx); with
   no AuthProvider mounted, the real useAuth throws before Project home renders. */
vi.mock('@/services/portal/authService', async original => ({ ...await original<typeof import('@/services/portal/authService')>(), useAuth: () => ({ user: null }) }));
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { ProjectHome } from '../surfaces/ProjectHome';
import { __resetSurfaceActionBus, registerSurfaceActionHandlers } from '../surfaceActions';

/* The team, the project's tasks and the person's own tasks are on the Plan step (CLIENT_JOURNEY_2026-10-25.md, pass 3). */
const openPlan = () => fireEvent.click(screen.getByRole('button', { name: 'Plan' }));

const PID = '7a1d2c3b-4e5f-4061-8a7b-9c0d1e2f3a4b';
const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => data }) as Response;

beforeEach(() => {
  __resetSurfaceActionBus();
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (_m: string, url: string) => {
    if (url === `/api/c2c/projects/${PID}`) return ok({ id: PID, name: 'ONC-221', readiness: 40 });
    if (url.startsWith('/api/chat/threads?program_id=')) return ok({ threads: [] });
    return ok({});
  });
  (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT = { id: PID, title: 'ONC-221' };
});
afterEach(() => {
  cleanup();
  __resetSurfaceActionBus();
  delete (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT;
});

describe('Project home — Plan lists this project\'s tasks, and no other', () => {
  /* "Your tasks" listed none: it said the person's tasks were not filtered to this project and linked to
     Tasks for every project. Removed 2026-10-31; Plan's Tasks section is this project's tasks. */
  it('has no "Your tasks" section that is not about this project', async () => {
    render(<ProjectHome surface={{ id: 'project-home', label: 'Project' } as never} onAsk={vi.fn()} onNav={vi.fn()} segment="biotech" />);
    openPlan();
    expect(await screen.findByRole('region', { name: 'Tasks and approvals' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Your tasks' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'See your tasks in Tasks' })).toBeNull();
    expect(document.body.textContent).not.toMatch(/not filtered to this project/);
    expect(document.body.textContent).not.toMatch(/submission readiness aren.t wired/);
  });

  it('"See all tasks in Tasks" opens Tasks on everyone\'s tasks, from the project\'s Tasks section', async () => {
    const onNav = vi.fn();
    render(<ProjectHome surface={{ id: 'project-home', label: 'Project' } as never} onAsk={vi.fn()} onNav={onNav} segment="biotech" />);
    openPlan();
    /* Slice A.1: it read "Open task board", naming only where it went (section 9, Door names). */
    const panel = await screen.findByRole('region', { name: 'Tasks and approvals' });
    fireEvent.click(within(panel).getByRole('button', { name: 'See all tasks in Tasks' }));
    expect(onNav).toHaveBeenCalledWith('tasks');
    // Everyone's tasks: the board is not asked to filter to the person.
    const filter = vi.fn(() => ({ ok: true as const }));
    registerSurfaceActionHandlers('tasks', { 'tasking.filter': filter });
    expect(filter).not.toHaveBeenCalled();
  });
});
