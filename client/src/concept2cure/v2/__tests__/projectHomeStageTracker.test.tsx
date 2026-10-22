// @vitest-environment jsdom
/**
 * Project home — the lifecycle tracker states no completion it cannot back.
 *
 * ── The defect (launch sweep, empty org) ─────────────────────────────────────
 * StageTracker set `data-status="done"` on every stage before the open tab,
 * from the tab's POSITION alone. `stage` defaults to 'author', so Plan and
 * Evidence rendered as completed (filled node, filled connector) on every
 * project — and with no project loaded at all, under a header that used the
 * placeholder word "Project" as the project's name ("PROJECT Project", H1
 * "Project"). Opening Submit on a real project "completed" Review.
 *
 * Nothing Project home reads records per-stage completion, so the only state
 * the tracker may state is which stage is open.
 *
 * Since FILING_SPINE.md F2 (2026-10-08) the tracker has five stages: Plan and
 * Lifecycle were removed (projectHomeStages.test.tsx).
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { ProjectHome } from '../surfaces/ProjectHome';

const PID = '9a7f0b10-0000-4000-8000-0000000000bb';
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as unknown as Response;

const props = () =>
  ({ surface: { id: 'project-home', label: 'Project home' } as never, onAsk: vi.fn(), onNav: vi.fn(), segment: 'biotech' });

const stages = () => Array.from(document.querySelectorAll('.pj-lc-stage'));
const statusOf = (label: string) =>
  stages().find((b) => b.textContent?.includes(label))?.getAttribute('data-status') ?? null;

beforeEach(() => {
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (_m: string, url: string) => {
    if (url === `/api/c2c/projects/${PID}`) return ok({ id: PID, name: 'BX-204', status: 'active' });
    return ok({});
  });
});
afterEach(() => {
  cleanup();
  delete (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT;
});

describe('Project home — lifecycle tracker', () => {
  it('marks no stage done on a real project; only the open stage is marked', async () => {
    (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT = { id: PID, title: 'BX-204' };
    render(<ProjectHome {...props()} />);
    await waitFor(() => expect(stages().length).toBe(5));

    const done = stages().filter((b) => b.getAttribute('data-status') === 'done');
    expect(done.map((b) => b.textContent), 'a stage is marked completed from tab position alone').toEqual([]);
    expect(statusOf('Author')).toBe('active');
    expect(statusOf('Evidence')).toBeNull();
  });

  it('opening a later stage does not complete the ones before it', async () => {
    (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT = { id: PID, title: 'BX-204' };
    render(<ProjectHome {...props()} />);
    await waitFor(() => expect(stages().length).toBe(5));

    fireEvent.click(stages().find((b) => b.textContent?.includes('Submit'))!);
    await waitFor(() => expect(statusOf('Submit')).toBe('active'));
    for (const earlier of ['Evidence', 'Author', 'Review']) {
      expect(statusOf(earlier), `${earlier} became "done" because Submit was opened`).toBeNull();
    }
  });

  it('with no project selected, shows no lifecycle and no placeholder project name', async () => {
    render(<ProjectHome {...props()} />);
    expect(await screen.findByText('No project selected')).toBeTruthy();

    // No tracker to mark anything on — a lifecycle belongs to a project.
    expect(stages().length).toBe(0);
    expect(document.querySelector('nav[aria-label="Project lifecycle"]')).toBeNull();

    // No "PROJECT Project" crumb, and the H1 names the screen, not a project.
    expect(document.querySelector('.pj-crumb')).toBeNull();
    expect(document.querySelector('.pj-title')?.textContent).toBe('Project home');
    // No read was made for a project that is not there.
    expect(apiRequest.mock.calls.filter(([, url]) => String(url).startsWith('/api/c2c/projects/'))).toEqual([]);
  });

  it('with a project selected, names it in the crumb and the heading', async () => {
    (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT = { id: PID, title: 'BX-204' };
    render(<ProjectHome {...props()} />);
    await waitFor(() => expect(document.querySelector('.pj-title')?.textContent).toBe('BX-204'));
    expect(document.querySelector('.pj-crumb')?.textContent).toContain('BX-204');
  });
});
