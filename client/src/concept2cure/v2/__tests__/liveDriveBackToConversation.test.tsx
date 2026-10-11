// @vitest-environment jsdom
/**
 * When AnA's turn carries the person off the conversation, the way back — and
 * her reply — stay on screen.
 *
 * ── The defect (QA 2026-10-08, j5 "Sending from the project composer moves
 *    the screen and drops the conversation from view") ───────────────────────
 * "Take me to the vault", sent from the project page, opened the conversation,
 * and AnA's move then put the Vault on screen. The turn ran on in the shell's
 * chat and was saved, but with no rail (slice 9) nothing on the Vault showed
 * it: the drive strip lived for the second of the move and went with it, and
 * then the question and her answer were on no screen at all, with no way back
 * to them but the navigation.
 *
 * ── What this pins ───────────────────────────────────────────────────────────
 *   · while the shell's chat answers off the conversation screen, the drive
 *     strip offers "Back to conversation" (design record, slice 4 / risk 13);
 *   · a reply that finishes off the conversation screen leaves a strip saying
 *     so, with the end of her reply and "Back to conversation", which opens
 *     the conversation in progress;
 *   · a reply that finishes ON the conversation screen leaves nothing;
 *   · the notice can be dismissed, and goes once the person is back.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import type { AnaChatMessage, DriveSseEvent, DriveTurnControls } from '../../components/ana/useAnaChat';

const chat = vi.hoisted(() => ({
  isStreaming: false,
  messages: [] as unknown[],
  shellOpts: null as null | { onDriveEvent?: (ev: unknown, controls?: unknown) => void },
}));
vi.mock('../../components/ana/useAnaChat', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../components/ana/useAnaChat')>();
  return {
    ...real,
    useAnaChat: (opts: Record<string, unknown>) => {
      if ('driveMode' in opts) chat.shellOpts = opts as typeof chat.shellOpts;
      return {
        messages: chat.messages,
        isStreaming: chat.isStreaming,
        isLoadingThread: false,
        loadThread: vi.fn(async () => undefined),
        send: vi.fn(),
        stop: vi.fn(),
        reset: vi.fn(),
        interject: vi.fn(async () => true),
        pause: vi.fn(),
        resume: vi.fn(),
        pendingSteers: [],
        runStatus: null,
        threadId: null,
      };
    },
  };
});

import { AuthProvider } from '@/services/portal/authService';
import { TenantProvider } from '@/contexts/TenantContext';
import { V2App } from '../V2App';
import { locationForSurface } from '../routing';

const QUESTION = { id: 'u-1', role: 'user', text: 'take me to the vault' } as AnaChatMessage;
const REPLY = {
  id: 'a-1',
  role: 'assistant',
  text: 'Opening vault. Navigation result: navigation_ready. You are on vault now.',
  streaming: false,
} as AnaChatMessage;

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

const strip = () => document.querySelector('.ana-drive-strip') as HTMLElement | null;

async function mountOn(surface: string) {
  window.history.pushState({}, '', locationForSurface(surface));
  render(
    <Providers>
      <V2App />
    </Providers>,
  );
  await act(async () => {
    await new Promise((r) => setTimeout(r, 20));
  });
}

/** AnA's move (or the person's): the shell's location changes, and it re-renders. */
async function goTo(surface: string) {
  await act(async () => {
    window.history.pushState({}, '', locationForSurface(surface));
    await new Promise((r) => setTimeout(r, 20));
  });
}

beforeEach(() => {
  localStorage.clear();
  chat.isStreaming = false;
  chat.messages = [];
  chat.shellOpts = null;
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 503, body: null, json: async () => ({}) })));
  if (!window.matchMedia) {
    window.matchMedia = ((q: string) => ({
      matches: false, media: q, onchange: null,
      addListener: () => {}, removeListener: () => {},
      addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
  }
  const NoopObserver = class { observe() {} unobserve() {} disconnect() {} };
  (window as unknown as { ResizeObserver?: unknown }).ResizeObserver ??= NoopObserver;
  (window as unknown as { IntersectionObserver?: unknown }).IntersectionObserver ??= NoopObserver;
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
  delete (window as unknown as { C2C_CONVO?: unknown }).C2C_CONVO;
  window.history.pushState({}, '', '/');
});

describe('a reply that finishes off the conversation screen', () => {
  it('leaves a strip with the end of her reply and the way back, which opens the conversation', async () => {
    chat.isStreaming = true;
    chat.messages = [QUESTION, { ...REPLY, text: 'Opening vault.', streaming: true }];
    await mountOn('conversation-thread');
    // AnA's move: the person is now on another screen, her turn still running.
    await goTo('projects');
    chat.isStreaming = false;
    chat.messages = [QUESTION, REPLY];
    await goTo('tasks');

    const s = strip();
    expect(s, 'the reply finished on no screen and nothing said so').not.toBeNull();
    expect(s!.textContent).toContain('You are on vault now.');
    fireEvent.click(within(s!).getByRole('button', { name: 'Back to conversation' }));
    expect(window.location.pathname).toBe('/concept2cure/conversation-thread');
    expect((window as unknown as { C2C_CONVO?: unknown }).C2C_CONVO).toEqual({ id: 'current', seed: null });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(strip(), 'back in the conversation, the notice goes').toBeNull();
  });

  it('can be dismissed', async () => {
    chat.isStreaming = true;
    chat.messages = [QUESTION];
    await mountOn('projects');
    chat.isStreaming = false;
    chat.messages = [QUESTION, REPLY];
    await goTo('tasks');
    fireEvent.click(within(strip()!).getByRole('button', { name: 'Dismiss' }));
    expect(strip()).toBeNull();
  });
});

describe('a reply that finishes on the conversation screen', () => {
  it('leaves nothing: the reply is in front of the person', async () => {
    chat.isStreaming = true;
    chat.messages = [QUESTION];
    await mountOn('conversation-thread');
    chat.isStreaming = false;
    chat.messages = [QUESTION, REPLY];
    await goTo('conversation-thread');
    // Same path: force a render through a drive event the strip ignores.
    act(() => {
      chat.shellOpts?.onDriveEvent?.({ type: 'drive_turn_end' } as DriveSseEvent, undefined as unknown as DriveTurnControls);
    });
    expect(strip()).toBeNull();
  });
});

describe('while AnA drives the person off the conversation', () => {
  it('the drive strip offers the way back', async () => {
    chat.isStreaming = true;
    chat.messages = [QUESTION];
    await mountOn('projects');
    const controls: DriveTurnControls = {
      stop: vi.fn(),
      interject: vi.fn(async () => true),
      reportScreen: vi.fn(async () => true),
      moveLanded: vi.fn(async () => true),
    };
    act(() => {
      chat.shellOpts!.onDriveEvent!({ type: 'drive_state', enabled: true, mode: 'assist' } as DriveSseEvent, controls);
    });
    const s = strip()!;
    expect(within(s).getByText('AnA is driving')).toBeTruthy();
    fireEvent.click(within(s).getByRole('button', { name: 'Back to conversation' }));
    expect(window.location.pathname).toBe('/concept2cure/conversation-thread');
    expect(screen.queryAllByRole('button', { name: 'Back to conversation' })).toHaveLength(0);
  });
});
