// @vitest-environment jsdom
/**
 * Home is where a client starts: the greeting and AnA's composer first, as on
 * Claude, then where the work is — projects and open items. Recent
 * conversations are the sidebar's Recents (railRecents.test.tsx).
 *
 * docs/design/CLIENT_JOURNEY_2026-10-25.md. The founder tested the product as a
 * client and Home was a chat page: a greeting, a composer with AnA's run
 * controls open in its foot, four AnA starters, four per-segment shortcuts (one
 * an empty Program journey) and "Explore workflows", an 87-feature catalog.
 * Nothing said where the work was or what came next.
 *
 * This pins the order a client reads Home in, that each section reaches its
 * work, and that each read says when it failed. The project list's honest
 * states are pinned in homeNoFixtureProgram.test.tsx; that Home never opens the
 * catalog in capabilityBrowser.test.tsx.
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
  useAuth: () => ({ user: { firstName: 'Dana' } }),
}));

import { Home } from '../surfaces/Surfaces';
import { __resetSurfaceActionBus, registerSurfaceActionHandlers } from '../surfaceActions';

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response;

const PROGRAMS = Array.from({ length: 7 }, (_, i) => ({
  id: `p-${i + 1}`, title: `Program ${i + 1}`, code: `ZX-${i + 1}`, status: 'active', ws: 'Biotech', stage: 'Planning',
}));
const THREADS = [{ id: 't-1', title: 'Summarize the nonclinical package' }];

function serve(over: { projects?: () => Promise<Response>; threads?: () => Promise<Response> } = {}) {
  apiRequest.mockImplementation((_m: string, url: string) => {
    if (url.startsWith('/api/chat/threads')) return over.threads ? over.threads() : Promise.resolve(ok({ threads: THREADS }));
    if (url.startsWith('/api/c2c/projects')) return over.projects ? over.projects() : Promise.resolve(ok({ data: PROGRAMS }));
    return Promise.resolve(ok({ data: [] }));
  });
}

beforeEach(() => {
  apiRequest.mockReset();
  serve();
});
afterEach(() => {
  cleanup();
  window.localStorage.clear();
  __resetSurfaceActionBus();
  delete window.C2C_CONVO;
  delete window.C2C_PROJECT;
});

describe('Home, in the order a client reads it', () => {
  /* Since P-127 §3.6 (75624cff54, 2026-11-12) a member who has not opened the getting-started course is
     offered it between the composer and the projects, as "Get started", until they open it (HomeSetup.tsx).
     This case pinned three sections and was red on trunk from that commit. */
  it('Ask AnA first, then the getting-started course, your projects and your open items; no conversation list', async () => {
    render(<Home onNav={vi.fn()} onAsk={vi.fn()} segment="biopharma" />);
    await screen.findByTestId('home-projects');
    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(headings).toEqual(['Ask AnA', 'Get started', 'Your projects', 'Your open items']);
    expect(screen.queryByTestId('home-conversations')).toBeNull();
  });

  it('once the course has been opened, Home is Ask AnA, your projects and your open items', async () => {
    const first = render(<Home onNav={vi.fn()} onAsk={vi.fn()} segment="biopharma" />);
    await screen.findByTestId('home-projects');
    fireEvent.click(within(screen.getByTestId('home-getting-started')).getByRole('button'));
    first.unmount();
    render(<Home onNav={vi.fn()} onAsk={vi.fn()} segment="biopharma" />);
    await screen.findByTestId('home-projects');
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual(['Ask AnA', 'Your projects', 'Your open items']);
  });

  it('lists five projects and names how many there are in all', async () => {
    const onNav = vi.fn();
    render(<Home onNav={onNav} onAsk={vi.fn()} segment="biopharma" />);
    const list = await screen.findByTestId('home-projects');
    expect(within(list).getAllByRole('button')).toHaveLength(5);
    fireEvent.click(screen.getByRole('button', { name: 'All projects (7)' }));
    expect(onNav).toHaveBeenCalledWith('projects');
  });

  it('New project opens the new-project wizard, not the portfolio behind it', async () => {
    const onNav = vi.fn();
    render(<Home onNav={onNav} onAsk={vi.fn()} segment="biopharma" />);
    await screen.findByTestId('home-projects');
    fireEvent.click(screen.getByRole('button', { name: 'New project' }));
    expect(onNav).toHaveBeenCalledWith('projects');
    const openWizard = vi.fn(() => ({ ok: true as const }));
    registerSurfaceActionHandlers('projects', { 'projects.new-project': openWizard });
    expect(openWizard).toHaveBeenCalledOnce();
    expect(apiRequest.mock.calls.some(([method]) => method !== 'GET')).toBe(false);
  });

  it('your tasks opens the task board', async () => {
    const onNav = vi.fn();
    render(<Home onNav={onNav} onAsk={vi.fn()} segment="biopharma" />);
    fireEvent.click(screen.getByRole('button', { name: /Open the tasks assigned to you/ }));
    expect(onNav).toHaveBeenCalledWith('tasks');
  });

  /* P-131 item 1 (D6.md §A.7 item 1, acceptance 4): Home's list spans every project, so its link opens Tasks
     on the person's work across every project, Mine pressed, as the rail does: not narrowed to whichever
     project is open. */
  it('your tasks opens Tasks on the person’s own work across every project', async () => {
    render(<Home onNav={vi.fn()} onAsk={vi.fn()} segment="biopharma" />);
    fireEvent.click(screen.getByRole('button', { name: /Open the tasks assigned to you/ }));
    const filter = vi.fn((_params: Record<string, string>) => ({ ok: true as const }));
    registerSurfaceActionHandlers('tasks', { 'tasking.filter': filter });
    expect(filter).toHaveBeenCalledOnce();
    expect(filter.mock.calls[0][0]).toEqual({ mine: 'true', project: 'all' });
  });
});

describe('Ask AnA', () => {
  it('keeps AnA’s run controls behind one AnA settings button', async () => {
    render(<Home onNav={vi.fn()} onAsk={vi.fn()} segment="biopharma" />);
    const settings = screen.getByRole('button', { name: 'AnA settings' });
    expect(settings.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('group', { name: 'AnA settings' })).toBeNull();
    fireEvent.click(settings);
    expect(settings.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('group', { name: 'AnA settings' })).toBeTruthy();
  });

  it('the composer is named by its heading', () => {
    render(<Home onNav={vi.fn()} onAsk={vi.fn()} segment="biopharma" />);
    expect(screen.getByRole('textbox', { name: 'Ask AnA' })).toBeTruthy();
  });
});
