// @vitest-environment jsdom
/**
 * What the shell (V2App) hands its screens, mounted for real, with only the
 * chat stream and the network stubbed.
 *
 *  1. The demo starter under a Live Drive lock. The right rail withheld its
 *     "Start demonstration" chip while Live Drive was locked for the
 *     workspace. The rail was deleted (docs/evidence/D2-ONE-ANA/2026-10-08/
 *     ana-2a-rail-code-and-nav), and the conversation reads the starter from
 *     the shell's Live Drive bridge, so the rule moved there. This mounts the
 *     shell under a lock and looks at the chip, rather than reading the
 *     bridge's source.
 *  2. Choosing a client type from the account menu lands on that type's
 *     default screen; choosing the one already chosen stays put.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/* The shell's chat stream, stubbed: one settled turn whose executed actions
   include a demonstration AnA offered. */
const chat = vi.hoisted(() => ({
  messages: [] as unknown[],
  send: vi.fn(async () => undefined),
}));
vi.mock('../../components/ana/useAnaChat', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../components/ana/useAnaChat')>();
  return {
    ...real,
    useAnaChat: () => ({
      messages: chat.messages,
      isStreaming: false,
      isLoadingThread: false,
      loadThread: vi.fn(async () => undefined),
      send: chat.send,
      stop: vi.fn(),
      reset: vi.fn(),
      interject: vi.fn(async () => true),
      pause: vi.fn(async () => true),
      resume: vi.fn(async () => true),
      pendingSteers: [],
      runStatus: null,
      runHold: null,
      threadId: null,
    }),
  };
});

import { AuthProvider } from '@/services/portal/authService';
import { TenantProvider } from '@/contexts/TenantContext';
import { V2App } from '../V2App';
import { locationForSurface } from '../routing';
import { clearShellProject, publishShellProject } from '../shellProject';
import { setAnaLockedScreens } from '../../components/ana/anaLockedScreens';

const DEMO_TURN = [
  { id: 'u-1', role: 'user', text: 'Show me how this works' },
  {
    id: 'a-1',
    role: 'assistant',
    text: 'There is a demonstration for that.',
    sentAt: 1_000,
    completedAt: 5_000,
    executedActions: [
      {
        label: 'Start demonstration: Sales demonstration',
        actionType: 'start_demo',
        demoId: 'sales-flagship',
        demoTitle: 'Sales demonstration',
        executed: true,
      },
    ],
  },
];

/** What GET /api/ana-ri/live-drive/state answers; every other read is refused. */
let liveDriveState: unknown = null;

function Providers({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <AuthProvider>
        <TenantProvider>{children}</TenantProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

async function mountShell(on: string) {
  window.history.pushState({}, '', locationForSurface(on));
  render(
    <Providers>
      <V2App />
    </Providers>,
  );
  await screen.findByRole('navigation', { name: 'Primary' }, { timeout: 5000 });
}

beforeEach(() => {
  clearShellProject();
  publishShellProject({ id: '6191805f-e83d-4327-af00-aa2c6f4d43b0' });
  localStorage.clear();
  chat.messages = [];
  chat.send.mockClear();
  liveDriveState = null;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) =>
      String(url).startsWith('/api/ana-ri/live-drive/state') && liveDriveState
        ? { ok: true, status: 200, json: async () => liveDriveState }
        : { ok: false, status: 503, body: null, json: async () => ({}) },
    ),
  );
  if (!window.matchMedia) {
    window.matchMedia = ((q: string) => ({
      matches: false, media: q, onchange: null,
      addListener: () => {}, removeListener: () => {},
      addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
  }
  const NoopObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  (window as unknown as { ResizeObserver?: unknown }).ResizeObserver ??= NoopObserver;
  (window as unknown as { IntersectionObserver?: unknown }).IntersectionObserver ??= NoopObserver;
});
afterEach(() => {
  cleanup();
  clearShellProject();
  setAnaLockedScreens([]);
  vi.unstubAllGlobals();
  localStorage.clear();
  delete (window as unknown as { C2C_CONVO?: unknown }).C2C_CONVO;
  window.history.pushState({}, '', '/');
});

describe('the demo starter under a Live Drive lock', () => {
  it('locked for the workspace: the conversation shows the offer as a record, not a button', async () => {
    liveDriveState = { success: true, data: { enabled: false, reason: 'tier', requiredTier: 'enterprise' } };
    chat.messages = DEMO_TURN;
    await mountShell('conversation-thread');
    await screen.findByText('Start demonstration: Sales demonstration', {}, { timeout: 5000 });
    // The lock arrives with the state read; until then the shell knows of none.
    await waitFor(() => expect(screen.queryByRole('button', { name: /Start demonstration/ })).toBeNull(), { timeout: 3000 });
    expect(chat.send).not.toHaveBeenCalled();
  });

  it('not locked: the same offer is a button that starts the demonstration', async () => {
    liveDriveState = { success: true, data: { enabled: true } };
    chat.messages = DEMO_TURN;
    await mountShell('conversation-thread');
    const chip = await screen.findByRole('button', { name: /Start demonstration/ }, { timeout: 5000 });
    // Give the state read time to land, so this is the settled shell.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    fireEvent.click(chip);
    expect(chat.send).toHaveBeenCalledTimes(1);
    expect((chat.send.mock.calls[0] as unknown[])[0]).toMatch(/demo script id: sales-flagship/);
  });
});

describe('choosing a client type from the account menu', () => {
  async function openAccountMenu() {
    const rail = screen.getByRole('navigation', { name: 'Primary' });
    const button = rail.querySelector('.rail-account') as HTMLButtonElement;
    fireEvent.click(button);
    return { button, menu: screen.getByRole('menu') };
  }

  it('lands on that type’s default screen, which is in this release', async () => {
    await mountShell('vault');
    const { menu } = await openAccountMenu();
    fireEvent.click(within(menu).getByRole('menuitemradio', { name: /Medical Device & IVD/ }));
    await waitFor(() => expect(window.location.pathname).toBe(locationForSurface('projects')));
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('choosing the type already chosen leaves the person where they are', async () => {
    await mountShell('vault');
    const { menu, button } = await openAccountMenu();
    const checked = within(menu)
      .getAllByRole('menuitemradio')
      .filter((r) => r.getAttribute('aria-checked') === 'true');
    expect(checked).toHaveLength(1);
    fireEvent.click(checked[0]);
    expect(screen.queryByRole('menu')).toBeNull();
    expect(window.location.pathname).toBe(locationForSurface('vault'));
    expect(document.activeElement).toBe(button);
  });
});

/* D1-1 (.design/claude-convergence/D1.md §D1.A step 5, §D1.B step 2): at phone width
   the collapsed sidebar is not drawn, so the top bar's "Open the sidebar" is the way
   to it. The shell passes the one handler that expands it. */
describe('the top bar opens the sidebar', () => {
  it('"Open the sidebar" expands a collapsed sidebar', async () => {
    await mountShell('vault');
    const shell = document.querySelector('.c2c-v2.shell') as HTMLElement;
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Primary' })).getByRole('button', { name: 'Collapse' }));
    expect(shell.getAttribute('data-collapsed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Open the sidebar' }));
    expect(shell.getAttribute('data-collapsed')).toBe('false');
  });
});

/* D1-2 (.design/claude-convergence/D1.md §D1.B step 5): the page root names the screen
   it holds, so Home's top bar can drop its rule (.main[data-surface="home"] .topbar). */
describe('the page root names its screen', () => {
  it('data-surface follows the screen the shell shows', async () => {
    await mountShell('vault');
    const main = document.querySelector('main.main') as HTMLElement;
    expect(main.getAttribute('data-surface')).toBe('vault');
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Primary' })).getByRole('button', { name: 'New conversation' }));
    await waitFor(() => expect(main.getAttribute('data-surface')).toBe('home'));
  });
});
