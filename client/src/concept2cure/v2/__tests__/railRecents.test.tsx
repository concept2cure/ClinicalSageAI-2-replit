// @vitest-environment jsdom
/**
 * Recents and Search in the sidebar, as in Claude's.
 *
 * The person's own conversations moved from Home to the sidebar's Recents
 * (Shell.tsx RailRecents). The honesty Home pinned moves with them: a failed
 * read is said, and never shown as no conversations. Search opens the
 * command palette.
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

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response;
const THREADS = [
  { id: 't-1', title: 'Summarize the nonclinical package' },
  { id: 't-2', title: null },
];

function serve(threads: () => Promise<Response>) {
  apiRequest.mockImplementation((_m: string, url: string) => {
    if (url.startsWith('/api/chat/threads')) return threads();
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
  serve(() => Promise.resolve(ok({ threads: THREADS })));
});
afterEach(() => {
  cleanup();
  delete window.C2C_CONVO;
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

describe('Search', () => {
  it('opens the command palette', () => {
    const onSearch = vi.fn();
    mount({ onSearch });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    expect(onSearch).toHaveBeenCalledOnce();
  });
});
