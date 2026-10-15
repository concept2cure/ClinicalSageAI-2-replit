// @vitest-environment jsdom
/**
 * What only the right rail carried, after the rail went.
 *
 * docs/design/ONE_ANA_ONE_CANVAS.md, slices 6 and 9. The rail carried three
 * things nothing else did: the first-run welcome, and the engine picker for the
 * conversation's turns. Before the rail was unmounted they moved: the welcome
 * to Home, where a new client starts, and the engine picker to the
 * conversation's own composer. Home's quick actions also stop offering
 * destinations this release does not carry.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { isLaunchSurface } from '../../../../../shared/constants/launch-scope';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
vi.mock('@/services/portal/authService', () => ({ useAuth: () => ({ user: { firstName: 'Dana', displayName: 'Dana' } }) }));
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

describe('the first-run welcome is on Home', () => {
  it('shows the client-type welcome, and a starter starts a conversation with it', () => {
    const onNav = vi.fn();
    const welcome = welcomeFor('biotech', 'Dana');
    render(<Home onNav={onNav} onAsk={vi.fn()} segment="biotech" welcome={welcome} onDismissWelcome={vi.fn()} />);
    expect(screen.getByTestId('home-welcome')).toBeTruthy();
    const starter = welcome.starters.find((s) => !s.navTo)!;
    fireEvent.click(screen.getByRole('button', { name: starter.label }));
    expect((window as unknown as { C2C_CONVO?: unknown }).C2C_CONVO).toEqual({ id: 'new', seed: starter.prompt });
    expect(onNav).toHaveBeenCalledWith('conversation-thread');
  });

  it('is not shown once dismissed', () => {
    render(<Home onNav={vi.fn()} onAsk={vi.fn()} segment="biotech" welcome={null} />);
    expect(screen.queryByTestId('home-welcome')).toBeNull();
  });
});

describe("Home's quick actions", () => {
  it('offer no destination this release does not carry', () => {
    const onNav = vi.fn();
    render(<Home onNav={onNav} onAsk={vi.fn()} segment="biotech" />);
    for (const b of Array.from(document.querySelectorAll('.landing-action'))) fireEvent.click(b);
    const opened = onNav.mock.calls.map((c) => c[0] as string);
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
