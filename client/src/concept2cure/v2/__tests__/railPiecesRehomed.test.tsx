// @vitest-environment jsdom
/**
 * What only the right rail carried, after the rail went.
 *
 * docs/design/ONE_ANA_ONE_CANVAS.md, slices 6 and 9. The rail carried three
 * things nothing else did: the first-run welcome, and the engine picker for the
 * conversation's turns. Before the rail was unmounted they moved: the welcome
 * to Home, where a new client starts, and the engine picker to the
 * conversation's own composer. Since 2026-10-25 Home offers the welcome while
 * the organization has no project, beside the first-project explanation, and
 * every destination Home offers is in this release
 * (docs/design/CLIENT_JOURNEY_2026-10-25.md).
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { isLaunchSurface } from '../../../../../shared/constants/launch-scope';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
/* Retain the service's real session guards and event subscriptions, while
   preserving this fixture's display name for Home's welcome. */
vi.mock('@/services/portal/authService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/portal/authService')>();
  return {
    ...actual,
    useAuth: () => ({ user: { firstName: 'Dana', displayName: 'Dana' } }),
  };
});
vi.mock('@/hooks/useGlobalRiCatalog', () => ({ useGlobalRiCatalog: () => ({ catalog: null, loading: false, error: undefined }) }));
vi.mock('../navEntitlements', async (importOriginal) => {
  const real = await importOriginal<typeof import('../navEntitlements')>();
  return {
    ...real,
    useNavEntitlements: () => ({
      verdictFor: (id: string) =>
        isLaunchSurface(id) ? null : { id, label: id, entitled: false, source: 'launch-scope', requiredTier: null },
      resolved: true,
      masterAdmin: false,
      platformAdmin: false,
      tier: null,
    }),
  };
});
vi.mock('../../components/ana/useAnaChat', () => ({
  useAnaChat: () => ({
    messages: [],
    isStreaming: false,
    isLoadingThread: false,
    loadThread: vi.fn().mockResolvedValue(undefined),
    send: vi.fn(),
    threadId: null,
  }),
}));

import { Home } from '../surfaces/Surfaces';
import { ConversationThread } from '../surfaces/ConversationThread';
import { welcomeFor } from '../onboardingWelcome';
import { ANA_MODES } from '../registryModel';

beforeEach(() => {
  apiRequest.mockReset();
  apiRequest.mockResolvedValue({ ok: true, status: 200, json: async () => ({ data: [] }) } as Response);
});
afterEach(() => {
  cleanup();
  delete (window as unknown as { C2C_CONVO?: unknown }).C2C_CONVO;
});

describe('the first-run welcome is on Home while there is no project', () => {
  it('shows the client-type welcome, and a starter starts a conversation with it', async () => {
    const onNav = vi.fn();
    const welcome = welcomeFor('biotech', 'Dana');
    render(<Home onNav={onNav} onAsk={vi.fn()} segment="biotech" welcome={welcome} onDismissWelcome={vi.fn()} />);
    expect(await screen.findByTestId('home-welcome')).toBeTruthy();
    const starter = welcome.starters.find((s) => !s.navTo)!;
    fireEvent.click(screen.getByRole('button', { name: starter.label }));
    expect((window as unknown as { C2C_CONVO?: unknown }).C2C_CONVO).toEqual({ id: 'new', seed: starter.prompt });
    expect(onNav).toHaveBeenCalledWith('conversation-thread');
  });

  it('is not shown once dismissed', async () => {
    render(<Home onNav={vi.fn()} onAsk={vi.fn()} segment="biotech" welcome={null} />);
    await screen.findByTestId('home-first-project');
    expect(screen.queryByTestId('home-welcome')).toBeNull();
  });

  it('is not shown once the organization has a project: the project is the next step', async () => {
    apiRequest.mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({ data: [{ id: 'p-1', title: 'ZX-9 IND', code: 'ZX-9', status: 'active', ws: 'Biotech' }] }),
    } as Response);
    render(<Home onNav={vi.fn()} onAsk={vi.fn()} segment="biotech" welcome={welcomeFor('biotech', 'Dana')} />);
    await screen.findByTestId('home-projects');
    expect(screen.queryByTestId('home-welcome')).toBeNull();
  });
});

describe('Home', () => {
  it('offers no destination this release does not carry', async () => {
    const onNav = vi.fn();
    render(<Home onNav={onNav} onAsk={vi.fn()} segment="biotech" welcome={welcomeFor('biotech', 'Dana')} />);
    await screen.findByTestId('home-first-project');
    await waitFor(() => expect(screen.queryByText('Loading your conversations…')).toBeNull());
    for (const b of screen.queryAllByRole('button')) fireEvent.click(b);
    const opened = onNav.mock.calls.map((c) => c[0] as string);
    expect(opened.length).toBeGreaterThan(0);
    expect(opened.filter((id) => !isLaunchSurface(id))).toEqual([]);
  });
});

describe("the conversation's composer carries the engine", () => {
  it('shows the engine its turns run on, and a choice goes to the shell', () => {
    const setMode = vi.fn();
    const other = ANA_MODES.find((m) => m.id !== ANA_MODES[0].id)!;
    (window as unknown as { C2C_CONVO?: unknown }).C2C_CONVO = { id: 'new' };
    render(
      <ConversationThread
        surface={{ id: 'conversation-thread', label: 'Conversation' } as never}
        segment="biotech"
        onNav={vi.fn()}
        engine={{ mode: ANA_MODES[0].id, setMode }}
      />,
    );
    const pill = screen.getByRole('button', { name: new RegExp(`Engine: ${ANA_MODES[0].effortLabel}`) });
    fireEvent.click(pill);
    fireEvent.click(screen.getByRole('radio', { name: new RegExp(other.effortLabel) }));
    expect(setMode).toHaveBeenCalledWith(other.id);
  });
});
