// @vitest-environment jsdom
/**
 * Recents and Search in the sidebar, as in Claude's.
 *
 * The person's own conversations moved from Home to the sidebar's Recents
 * (Shell.tsx RailRecents). The honesty Home pinned moves with them: a failed
 * read is said, and never shown as no conversations. Search opens the
 * command palette.
 *
 * Recents lists recent projects too, as Claude's does (D1-1, D1.md §D1.A step 4):
 * up to three, newest-updated first (the route's own order), from the same
 * GET /api/c2c/projects Home and the palette read; each opens its project the
 * one way every list opens one. A failed project read shows no project rows and
 * never hides the conversations, which keep their own honest states.
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
  useAuth: () => ({ user: { firstName: 'Dana', roles: ['member'] }, logout: vi.fn() }),
}));
vi.mock('@/contexts/TenantContext', () => ({
  useTenant: () => ({ tenant: null, organizationId: 7 }),
}));

import { NavEntitlementsProvider } from '../navEntitlements';
import { Rail } from '../Shell';
import { clearShellProject, readShellProject } from '../shellProject';

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response;
const THREADS = [
  { id: 't-1', title: 'Summarize the nonclinical package' },
  { id: 't-2', title: null },
];

const PROJECTS = [
  { id: '6191805f-e83d-4327-af00-aa2c6f4d43b0', title: 'BX-204 Oncology IND', code: 'C2C-101', ws: 'biotech', status: 'active' },
  { id: '7a2b1c3d-0000-4000-8000-000000000002', title: 'MD-11 510(k)', code: null, ws: 'mdx', status: 'active' },
  { id: '7a2b1c3d-0000-4000-8000-000000000003', title: 'Stability programme', code: 'C2C-103', ws: null, status: null },
  { id: '7a2b1c3d-0000-4000-8000-000000000004', title: 'A fourth project', code: 'C2C-104', ws: null, status: null },
];
/** The projects read: not served (an object, as before this step), unless a test serves it. */
let projects: () => Promise<Response> = () => Promise.resolve(ok({ organizationId: 7, resolved: false, surfaces: [] }));

function serve(threads: () => Promise<Response>) {
  apiRequest.mockImplementation((_m: string, url: string) => {
    if (url.startsWith('/api/chat/threads')) return threads();
    if (url.startsWith('/api/c2c/projects')) return projects();
    return Promise.resolve(ok({ organizationId: 7, resolved: false, surfaces: [] }));
  });
}

function mount(props: { collapsed?: boolean; onSearch?: () => void } = {}) {
  const onNav = vi.fn();
  render(
    <NavEntitlementsProvider>
      <Rail activeId="home" onNav={onNav} collapsed={props.collapsed ?? false} setCollapsed={() => {}}
        segment="biotech" setSegment={() => {}} onSearch={props.onSearch} />
    </NavEntitlementsProvider>,
  );
  return { onNav };
}

beforeEach(() => {
  apiRequest.mockReset();
  projects = () => Promise.resolve(ok({ organizationId: 7, resolved: false, surfaces: [] }));
  serve(() => Promise.resolve(ok({ threads: THREADS })));
});
afterEach(() => {
  cleanup();
  delete window.C2C_CONVO;
  clearShellProject();
});

describe('Recents', () => {
  it('lists the person’s own conversations, and one reopens its thread', async () => {
    const { onNav } = mount();
    const recents = await screen.findByTestId('rail-recents');
    expect(await within(recents).findByText('Summarize the nonclinical package')).toBeTruthy();
    expect(within(recents).getByText('Untitled conversation')).toBeTruthy();
    expect(apiRequest.mock.calls.some(([m, u]) => m === 'GET' && u === '/api/chat/threads?limit=15')).toBe(true);
    fireEvent.click(within(recents).getByText('Summarize the nonclinical package'));
    expect(window.C2C_CONVO).toEqual({ id: 't-1' });
    expect(onNav).toHaveBeenCalledWith('conversation-thread');
  });

  it('with none, says where they will appear', async () => {
    serve(() => Promise.resolve(ok({ threads: [] })));
    mount();
    expect(await screen.findByText('Your conversations appear here.')).toBeTruthy();
  });

  it('a failed read is said, and is not shown as no conversations', async () => {
    serve(() => Promise.reject(Object.assign(new Error('Unavailable'), { status: 503 })));
    mount();
    expect(await screen.findByText(/Couldn’t load your conversations/)).toBeTruthy();
    expect(screen.queryByText('Your conversations appear here.')).toBeNull();
  });

  it('a reply without a list is a failed read, not an empty one', async () => {
    serve(() => Promise.resolve(ok({ data: [] })));
    mount();
    expect(await screen.findByText(/Couldn’t load your conversations/)).toBeTruthy();
  });

  it('is not drawn in the collapsed rail', () => {
    mount({ collapsed: true });
    expect(screen.queryByTestId('rail-recents')).toBeNull();
  });
});

describe('Recents: projects, then conversations (D1.md §D1.A step 4)', () => {
  it('lists up to three projects first, by title with a folder, then the conversations', async () => {
    projects = () => Promise.resolve(ok({ data: PROJECTS }));
    mount();
    const recents = await screen.findByTestId('rail-recents');
    await within(recents).findByText('BX-204 Oncology IND');
    await within(recents).findByText('Summarize the nonclinical package');
    expect(apiRequest.mock.calls.some(([m, u]) => m === 'GET' && u === '/api/c2c/projects?limit=3')).toBe(true);
    const rows = Array.from(recents.querySelectorAll('button')).map((b) => b.textContent?.trim());
    expect(rows).toEqual(['BX-204 Oncology IND', 'MD-11 510(k)', 'Stability programme', 'Summarize the nonclinical package', 'Untitled conversation']);
    const projectRows = Array.from(recents.querySelectorAll('button')).slice(0, 3);
    for (const b of projectRows) expect(b.querySelector('.ico svg'), b.textContent ?? '').toBeTruthy();
    // One heading for both, as Claude's sidebar has.
    expect(within(recents).getAllByText('Recents')).toHaveLength(1);
  });

  it('a project opens its page, as every list opens one', async () => {
    projects = () => Promise.resolve(ok({ data: PROJECTS }));
    const { onNav } = mount();
    const recents = await screen.findByTestId('rail-recents');
    fireEvent.click(await within(recents).findByText('BX-204 Oncology IND'));
    expect(onNav).toHaveBeenCalledWith('project-home');
    expect(readShellProject()).toMatchObject({ id: PROJECTS[0].id, title: 'BX-204 Oncology IND', code: 'C2C-101' });
  });

  it('a failed project read shows no project rows and never hides the conversations', async () => {
    projects = () => Promise.reject(Object.assign(new Error('Unavailable'), { status: 500 }));
    mount();
    const recents = await screen.findByTestId('rail-recents');
    expect(await within(recents).findByText('Summarize the nonclinical package')).toBeTruthy();
    expect(within(recents).queryByText('BX-204 Oncology IND')).toBeNull();
    expect(recents.querySelectorAll('button')).toHaveLength(2);
    expect(within(recents).queryByRole('alert')).toBeNull();
  });

  it('with no conversations, the note stays under the projects', async () => {
    projects = () => Promise.resolve(ok({ data: PROJECTS.slice(0, 1) }));
    serve(() => Promise.resolve(ok({ threads: [] })));
    mount();
    const recents = await screen.findByTestId('rail-recents');
    expect(await within(recents).findByText('BX-204 Oncology IND')).toBeTruthy();
    expect(await within(recents).findByText('Your conversations appear here.')).toBeTruthy();
  });
});

describe('Search', () => {
  it('opens the command palette', () => {
    const onSearch = vi.fn();
    mount({ onSearch });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    expect(onSearch).toHaveBeenCalledOnce();
  });
});
