// @vitest-environment jsdom
/**
 * Project home's My work line (ONE_ANA_ONE_CANVAS.md slice 24).
 *
 * The page had a "Tasks & readiness" panel whose title said "Tasks & submission
 * readiness aren't wired to this workspace yet" and whose button opened the
 * task board on everyone's tasks. The dispatch readiness is on the Submit stage
 * now (projectHomeSubmitStage.test.tsx). The person's work cannot be filtered
 * to this project yet: the task store keys a project by the numeric
 * projects.id, which this page does not resolve. So the page says that in one
 * line, and "Open My work" opens what the nav's My work opens: the task board
 * on the signed-in person's own tasks.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { ProjectHome } from '../surfaces/ProjectHome';
import { __resetSurfaceActionBus, registerSurfaceActionHandlers } from '../surfaceActions';

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

describe('Project home — My work', () => {
  it('says in one line that the work is not filtered to this project, and no longer claims readiness is unwired', async () => {
    render(<ProjectHome surface={{ id: 'project-home', label: 'Project' } as never} onAsk={vi.fn()} onNav={vi.fn()} segment="biotech" />);
    const section = (await screen.findByRole('heading', { name: 'My work' })).closest('section') as HTMLElement;
    expect(section.textContent).toContain('Your work is not filtered to this project yet. My work lists it for every project.');
    expect(document.body.textContent).not.toMatch(/submission readiness aren.t wired/);
  });

  it('"Open My work" opens the task board on the person\'s own tasks, as the nav does', async () => {
    const onNav = vi.fn();
    render(<ProjectHome surface={{ id: 'project-home', label: 'Project' } as never} onAsk={vi.fn()} onNav={onNav} segment="biotech" />);
    fireEvent.click(await screen.findByRole('button', { name: /Open My work/ }));
    expect(onNav).toHaveBeenCalledWith('tasks');
    // The board, once mounted, is asked for the signed-in person's tasks.
    const filter = vi.fn(() => ({ ok: true as const }));
    registerSurfaceActionHandlers('tasks', { 'tasking.filter': filter });
    expect(filter).toHaveBeenCalledWith(expect.objectContaining({ mine: 'true' }), expect.anything());
  });
});
