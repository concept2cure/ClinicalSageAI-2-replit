// @vitest-environment jsdom
/**
 * The shell must not write into a rail it is not drawing.
 *
 * `ask()` was the leak. It ran for every ⌘K "Ask AnA" and every ⌘K action chip,
 * on every surface, and its first act was `set('anaOpen', true)` — which
 * persists to localStorage. On a surface registered `ownsConversation: true`
 * (was `hideAna: true`) no rail is rendered, so the answer streamed into
 * nothing AND the rail was left armed for the next surface that did draw one.
 * Press "Ask AnA", see nothing, navigate away, find your question and its
 * answer already open. ⌘\ had the same shape through a different door: it
 * toggled and persisted `anaOpen` with no check that a rail existed.
 *
 * These render the real shell at a real URL and assert the destination.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { AuthProvider } from '@/services/portal/authService';
import { TenantProvider } from '@/contexts/TenantContext';
import { V2App } from '../V2App';
import { locationForSurface } from '../routing';

const PREFS_KEY = 'c2c-v2-prefs';

function Providers({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return (
    <QueryClientProvider client={client}>
      <AuthProvider>
        <TenantProvider>{children}</TenantProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

/** Mount the shell at a surface, the way a deep link does. */
function renderShellAt(surfaceId: string) {
  window.history.pushState({}, '', locationForSurface(surfaceId));
  return render(
    <Providers>
      <V2App />
    </Providers>,
  );
}

const storedPrefs = () => {
  try {
    return JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') as Record<string, unknown>;
  } catch {
    return {};
  }
};

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: false, status: 503, body: null, json: async () => ({}) })),
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
  vi.unstubAllGlobals();
  localStorage.clear();
  delete (window as unknown as { C2C_CONVO?: unknown }).C2C_CONVO;
  window.history.pushState({}, '', '/');
});

/**
 * Every POST the page made to the AnA stream, parsed. This is what makes the
 * tests below about DESTINATION rather than mechanism: `context.screen` names
 * the conversation that actually sent the turn, so "the thread answered it" and
 * "the hidden rail swallowed it" are distinguishable facts.
 */
function streamTurns(): Array<{ message?: string; screen?: string }> {
  const calls = (globalThis.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls;
  return calls
    .filter((c) => String(c[0]).includes('/api/ana-ri/stream'))
    .map((c) => {
      const init = c[1] as { body?: string } | undefined;
      try {
        const parsed = JSON.parse(init?.body ?? '{}') as {
          message?: string;
          context?: { screen?: string };
        };
        return { message: parsed.message, screen: parsed.context?.screen };
      } catch {
        return {};
      }
    });
}

/** Open ⌘K, type a question, and take the "Ask AnA" row. */
async function askThroughPalette(question: string) {
  fireEvent.keyDown(window, { key: 'k', metaKey: true });
  const input = await screen.findByPlaceholderText(/Search surfaces/);
  fireEvent.change(input, { target: { value: question } });
  fireEvent.click(await screen.findByText(new RegExp(`Ask AnA: "${question}"`)));
}

describe('the shell rail is drawn only where it can be seen', () => {
  it('renders the rail on a surface that keeps it', async () => {
    renderShellAt('crl-library');
    await waitFor(() => expect(document.querySelector('.shell')).not.toBeNull());
    expect(document.querySelector('.shell')?.getAttribute('data-editor')).toBeNull();
  });

  it('does not render the rail on a surface that owns its conversation', async () => {
    renderShellAt('document-authoring');
    await waitFor(() => expect(document.querySelector('.shell')).not.toBeNull());
    expect(document.querySelector('.shell')?.getAttribute('data-editor')).toBe('true');
  });
});

describe('⌘K on a surface that owns its conversation', () => {
  it('seeds the conversation surface and goes there, instead of arming a hidden rail', async () => {
    renderShellAt('document-authoring');
    await waitFor(() => expect(document.querySelector('.shell')).not.toBeNull());

    await askThroughPalette('what blocks the Module 3 freeze');

    // The browser is taken to the surface that shows the answer…
    await waitFor(() => expect(window.location.pathname).toBe(locationForSurface('conversation-thread')));

    // …and the turn is sent BY that surface's conversation, not by the shell's
    // hidden rail. The seed protocol handed it over and the thread consumed it
    // (ConversationThread.tsx:302 nulls `seed` once it has been sent).
    await waitFor(() => expect(streamTurns()).toContainEqual({
      message: 'what blocks the Module 3 freeze',
      screen: 'conversation-thread',
    }));
    expect((window as unknown as { C2C_CONVO?: { seed?: string | null } }).C2C_CONVO?.seed).toBeNull();

    // THE DEFECT: `anaOpen` must not have been persisted from a screen with no
    // rail. If this regresses, the next surface that draws a rail opens with a
    // question the user never saw asked.
    expect(storedPrefs().anaOpen).not.toBe(true);
  });

  it('re-seeds when the user is already on the conversation surface', async () => {
    // `setLocation` to the current location is a no-op in wouter and the thread
    // reads its seed ON MOUNT, so without a remount the question would sit on
    // `window` until some later mount consumed it — the same ambush in a new
    // place. The surface is keyed on a conversation epoch for exactly this.
    renderShellAt('conversation-thread');
    await waitFor(() => expect(document.querySelector('.shell')).not.toBeNull());

    await askThroughPalette('draft the 2.5 clinical overview');

    // The seed is only ever read by a mount, so this passing means a mount ran
    // AFTER the seed was written — which is the whole point of the epoch key.
    await waitFor(() => expect(streamTurns()).toContainEqual({
      message: 'draft the 2.5 clinical overview',
      screen: 'conversation-thread',
    }));
    expect((window as unknown as { C2C_CONVO?: { seed?: string | null } }).C2C_CONVO?.seed).toBeNull();
    expect(storedPrefs().anaOpen).not.toBe(true);
  });
});

describe('⌘K on a surface that keeps the rail', () => {
  it('opens the rail and streams there', async () => {
    renderShellAt('crl-library');
    await waitFor(() => expect(document.querySelector('.shell')).not.toBeNull());

    await askThroughPalette('summarise this letter');

    // Here the rail IS drawn, so opening it is the right answer and persisting
    // that is not a leak — the user is looking at what they opened.
    await waitFor(() => expect(storedPrefs().anaOpen).toBe(true));
    await waitFor(() => expect(streamTurns()).toContainEqual({
      message: 'summarise this letter',
      screen: 'crl-library',
    }));
    expect(window.location.pathname).toBe(locationForSurface('crl-library'));
    expect((window as unknown as { C2C_CONVO?: unknown }).C2C_CONVO).toBeUndefined();
  });
});

describe('⌘\\ toggles only a rail that exists', () => {
  it('persists anaOpen on a surface that draws the rail', async () => {
    renderShellAt('crl-library');
    await waitFor(() => expect(document.querySelector('.shell')).not.toBeNull());
    fireEvent.keyDown(window, { key: '\\', metaKey: true });
    await waitFor(() => expect(storedPrefs().anaOpen).toBe(true));
  });

  it('is inert on a surface that owns its conversation', async () => {
    renderShellAt('document-authoring');
    await waitFor(() => expect(document.querySelector('.shell')).not.toBeNull());
    fireEvent.keyDown(window, { key: '\\', metaKey: true });
    // Nothing toggled, and — the part that actually hurt — nothing persisted.
    expect(storedPrefs().anaOpen).not.toBe(true);
    expect(document.querySelector('.shell')?.getAttribute('data-ana-open')).toBe('false');
  });
});
