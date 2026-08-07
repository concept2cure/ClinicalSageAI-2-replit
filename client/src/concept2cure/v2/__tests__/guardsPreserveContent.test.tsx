// @vitest-environment jsdom
/**
 * The guards must not have become gags.
 *
 * ── Why this exists ───────────────────────────────────────────────────────────
 * `hostilePayloadProbe.test.tsx` proves no surface CRASHES on a bad response. It
 * cannot prove a surface still shows anything on a GOOD one — and the failure
 * mode of defensive coding is exactly that: a guard broad enough to blank the
 * panel passes every hostile case, ships a permanently empty screen, and looks
 * like a fix. That is worse than the crash it replaced, because the crash was at
 * least visible.
 *
 * 45 shape- and field-guards were added across this product in a day, most of
 * them by agents working in parallel. Nothing else in the suite would catch an
 * over-broad one. `surfaceRender.test.tsx` asserts a surface renders without
 * throwing, and an empty panel does not throw. The accessibility suite asserts
 * every control has a name, and a screen with no controls has no unnamed ones.
 * Both go green on a surface that has been quietly emptied.
 *
 * So this asserts the other direction, on the surface carrying the most guards:
 * feed a WELL-FORMED row and require the specific values to reach the DOM.
 *
 * ── Why these assertions and not others ───────────────────────────────────────
 * Each targets a read that was actually changed:
 *   · `closureStatus` — a `.replace()` that used to throw, now guarded. The chip
 *     must still render WITH its text for a row that has one, not be omitted.
 *   · `linkedSectionCodes` — a `.join()`; the guard must not swallow a real list.
 *   · `extractedIssues` — the `<li>` COUNT is asserted, because "the text appears
 *     somewhere" would pass on a stray title attribute.
 *   · `auditMetadata.visibilityTier` — a sibling read that was ALREADY guarded
 *     before this work, included so a regression in the untouched path is caught
 *     too.
 *
 * It began as a verification agent's scratch file, which it deleted on the way
 * out. It is kept because it asserts something nothing else in the suite does.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as React from 'react';

const { apiRequest, ApiRequestError } = vi.hoisted(() => {
  class ApiRequestError extends Error {
    constructor(message: string, public readonly status: number, public readonly payload?: unknown) {
      super(message);
      this.name = 'ApiRequestError';
    }
  }
  return { apiRequest: vi.fn(), ApiRequestError };
});
vi.mock('@/lib/queryClient', () => ({ apiRequest, ApiRequestError }));

import { AuthProvider } from '@/services/portal/authService';
import { SURFACE_VIEWS } from '../surfaceViews';

/** A complete, entirely plausible row — every field the render reads is present. */
const GOOD_ROW = {
  id: 'comm-77',
  sourceType: 'agency_portal',
  communicationType: 'Information Request',
  sourceChannel: 'ESG gateway',
  linkedSectionCodes: ['3.2.P.8', '3.2.S.7'],
  receivedDate: '2026-07-01',
  dueDate: null,
  urgency: 'high',
  responseRequired: true,
  extractedIssues: ['Additional stability data required', 'Clarify batch genealogy'],
  humanReviewStatus: 'pending_review',
  closureStatus: 'in_progress',
  auditMetadata: { visibilityTier: 'shared_client_c2c' },
};

const body: unknown = { data: [GOOD_ROW] };

beforeEach(() => {
  cleanup();
  apiRequest.mockReset();
  apiRequest.mockImplementation(async () => ({
    ok: true,
    status: 200,
    json: async () => body,
    text: async () => JSON.stringify(body),
  }));
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(JSON.stringify(body), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    ),
  );
  (window as unknown as Record<string, unknown>).C2C_PROJECT = { id: 'p1', code: 'BX204' };
  (window as unknown as Record<string, unknown>).C2C_CONVO = { id: 'new' };
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  delete (window as unknown as Record<string, unknown>).C2C_PROJECT;
  delete (window as unknown as Record<string, unknown>).C2C_CONVO;
});

describe('a guarded surface still renders real values', () => {
  it('communication-center shows closureStatus, linked sections and extracted issues', async () => {
    const entry = (
      SURFACE_VIEWS as Record<
        string,
        { component: React.ComponentType<Record<string, unknown>>; ownsConversation?: boolean }
      >
    )['communication-center'];
    expect(entry, 'the surface is no longer registered under this id').toBeTruthy();
    const View = entry.component;

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { container } = render(
      <QueryClientProvider client={qc}>
        <AuthProvider>
          <View
            surface={{ id: 'communication-center', label: 'communication-center', navTier: 'global' }}
            segment="biotech"
            onNav={() => {}}
            onAsk={() => {}}
          />
        </AuthProvider>
      </QueryClientProvider>,
    );

    // Wait for the row itself, not for a spinner to clear — waiting on the
    // absence of something is how the hostile probe ended up measuring a
    // Suspense fallback for a day.
    await waitFor(() => expect(container.textContent).toContain('Information Request'), {
      timeout: 8000,
    });

    const txt = container.textContent ?? '';
    expect(txt, 'closureStatus chip text').toContain('in progress');
    expect(txt, 'linkedSectionCodes join output').toContain('§3.2.P.8 §3.2.S.7');
    expect(txt, 'extracted issue 1').toContain('Additional stability data required');
    expect(txt, 'extracted issue 2').toContain('Clarify batch genealogy');
    expect(txt, 'a sibling read that was already guarded').toContain('shared client c2c');

    // Structural, not textual: the chip ELEMENT exists, and the issues list has
    // two items. Text-only assertions pass on a stray title attribute.
    const chips = Array.from(container.querySelectorAll('.rd-chip')).map((e) => e.textContent);
    expect(chips.join('|'), 'the closure chip was omitted for a row that has one').toContain(
      'in progress',
    );
    expect(
      container.querySelectorAll('.cc-comm-issues li').length,
      'the issues list was emptied by a guard',
    ).toBe(2);
  });
});
