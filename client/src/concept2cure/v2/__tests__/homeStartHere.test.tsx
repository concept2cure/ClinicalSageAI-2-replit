// @vitest-environment jsdom
/**
 * Home is where a client starts: projects, tasks, AnA, then conversations.
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
import { __resetSurfaceActionBus } from '../surfaceActions';

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response;

const PROGRAMS = Array.from({ length: 7 }, (_, i) => ({
  id: `p-${i + 1}`, title: `Program ${i + 1}`, code: `ZX-${i + 1}`, status: 'active', ws: 'Biotech', stage: 'Planning',
}));
const THREADS = [
  { id: 't-1', title: 'Summarize the nonclinical package' },
  { id: 't-2', title: null },
];

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
  __resetSurfaceActionBus();
  delete window.C2C_CONVO;
  delete window.C2C_PROJECT;
});

describe('Home, in the order a client reads it', () => {
  it('your projects, your tasks, Ask AnA, then recent conversations', async () => {
    render(<Home onNav={vi.fn()} onAsk={vi.fn()} segment="biopharma" />);
    await screen.findByTestId('home-projects');
    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(headings).toEqual(['Your projects', 'Your tasks', 'Ask AnA', 'Recent conversations']);
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
    expect(window.__C2C_NEW_PROJECT).toBe(true);
    window.__C2C_NEW_PROJECT = false;
  });

  it('your tasks opens the task board', async () => {
    const onNav = vi.fn();
    render(<Home onNav={onNav} onAsk={vi.fn()} segment="biopharma" />);
    fireEvent.click(screen.getByRole('button', { name: /Open the tasks assigned to you/ }));
    expect(onNav).toHaveBeenCalledWith('tasks');
  });
});

describe('recent conversations', () => {
  it('lists the person’s own conversations, and one reopens its thread', async () => {
    const onNav = vi.fn();
    render(<Home onNav={onNav} onAsk={vi.fn()} segment="biopharma" />);
    const list = await screen.findByTestId('home-conversations');
    expect(within(list).getByText('Summarize the nonclinical package')).toBeTruthy();
    expect(within(list).getByText('Untitled conversation')).toBeTruthy();
    expect(apiRequest).toHaveBeenCalledWith('GET', '/api/chat/threads?limit=5');
    fireEvent.click(within(list).getByText('Summarize the nonclinical package'));
    expect(window.C2C_CONVO).toEqual({ id: 't-1' });
    expect(onNav).toHaveBeenCalledWith('conversation-thread');
  });

  it('with none, says where they come from', async () => {
    serve({ threads: () => Promise.resolve(ok({ threads: [] })) });
    render(<Home onNav={vi.fn()} onAsk={vi.fn()} segment="biopharma" />);
    expect(await screen.findByText(/No conversations yet/)).toBeTruthy();
  });

  it('a failed read is said, and is not shown as no conversations', async () => {
    serve({ threads: () => Promise.reject(Object.assign(new Error('Unavailable'), { status: 503 })) });
    render(<Home onNav={vi.fn()} onAsk={vi.fn()} segment="biopharma" />);
    expect(await screen.findByText(/Couldn’t load your conversations/)).toBeTruthy();
    expect(screen.queryByText(/No conversations yet/)).toBeNull();
  });

  it('a reply without a list is a failed read, not an empty one', async () => {
    serve({ threads: () => Promise.resolve(ok({ data: [] })) });
    render(<Home onNav={vi.fn()} onAsk={vi.fn()} segment="biopharma" />);
    expect(await screen.findByText(/Couldn’t load your conversations/)).toBeTruthy();
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
