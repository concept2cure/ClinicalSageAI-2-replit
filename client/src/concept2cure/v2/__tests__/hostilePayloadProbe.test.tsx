// @vitest-environment jsdom
/**
 * Every surface must survive a response it did not expect.
 *
 * ── What this measures ────────────────────────────────────────────────────────
 * Each surface is mounted with a backend that answers EVERY request with one
 * hostile-but-plausible body, and must still be standing once its data has
 * arrived. Rendering an empty state is fine. Rendering an error state is fine.
 * Throwing is not.
 *
 * A throw during render unwinds the subtree; `SurfaceBoundary` catches it and
 * shows "this surface didn't finish loading", which tells the user their app is
 * broken when the truthful answer — one that every one of these surfaces has
 * already written — is "we couldn't load this".
 *
 * ── Why an empirical sweep rather than a lint rule ────────────────────────────
 * The first pass at this bug class was by inspection, one adapter at a time, and
 * it kept missing cases: `state.data?.sources.length` reads as guarded and is
 * not, because the `?.` covers the container and not the member. A rule that
 * catches that shape without drowning in false positives does not exist. So the
 * property is asserted directly, by mounting the real component against the real
 * payload, which is also the only version that cannot go stale as the code moves.
 *
 * ── The payloads ──────────────────────────────────────────────────────────────
 * Not fuzzing. Each is one version skew, one proxy, or one feature flag away:
 * an envelope that lost its payload, a list endpoint's empty form where an
 * object was expected, a 200 carrying an error body. `{ data: [] }` is the one
 * that caused the original crashes, because `unwrapEnvelope` collapses it to a
 * TRUTHY `[]` that walks past every `if (!data)` guard while satisfying no shape.
 *
 * Set PROBE_ONLY=<id>[,<id>…] to restrict the sweep while fixing one surface.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as React from 'react';

// ApiRequestError is re-exported because consumers `instanceof` it. A mock that
// omits it makes a surface fail for a reason the probe invented, which is the
// harness lying about the product — the exact failure this directory has hit
// three times now. Both live inside vi.hoisted because vi.mock's factory is
// lifted above every other statement in the file, class declarations included.
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

const PAYLOADS: ReadonlyArray<readonly [string, unknown]> = [
  ['a list where an object was expected', { data: [] }],
  ['a partially-populated record', { data: {} }],
  ['an explicit null payload', { data: null }],
  ['an envelope with no payload', {}],
  ['a 200 carrying an error body', { error: 'Something went wrong' }],
  ['a bare array', []],
  ['a JSON scalar', 'unexpected'],
];

let body: unknown = { data: [] };

/** Stands in for SurfaceBoundary so a caught crash is a value, not a test crash. */
class Catcher extends React.Component<
  { onErr: (e: string) => void; children: React.ReactNode },
  { dead: boolean }
> {
  constructor(p: { onErr: (e: string) => void; children: React.ReactNode }) {
    super(p);
    this.state = { dead: false };
  }
  static getDerivedStateFromError() {
    return { dead: true };
  }
  componentDidCatch(err: unknown) {
    this.props.onErr(String((err as Error)?.message ?? err));
  }
  render() {
    return this.state.dead ? <div data-dead="1" /> : this.props.children;
  }
}

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
  try {
    window.localStorage.clear();
  } catch {
    /* ignore */
  }
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  delete (window as unknown as Record<string, unknown>).C2C_PROJECT;
  delete (window as unknown as Record<string, unknown>).C2C_CONVO;
});

const ALL = Object.keys(SURFACE_VIEWS).sort();
const ONLY = (process.env.PROBE_ONLY ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const TARGETS = ONLY.length ? ALL.filter((id) => ONLY.includes(id)) : ALL;

describe('every surface survives a response it did not expect', () => {
  it('the registry is non-trivial (guards the enumeration itself)', () => {
    expect(ALL.length).toBeGreaterThan(100);
    if (ONLY.length) expect(TARGETS.length, `PROBE_ONLY matched no surface: ${ONLY}`).toBeGreaterThan(0);
  });

  it.each(TARGETS)(
    '%s',
    async (id) => {
      const entry = (
        SURFACE_VIEWS as Record<
          string,
          { component: React.ComponentType<Record<string, unknown>>; ownsConversation?: boolean }
        >
      )[id];
      const Surface = entry.component;
      const failures: string[] = [];

      for (const [label, payload] of PAYLOADS) {
        body = payload;
        let err = '';
        const props: Record<string, unknown> = {
          surface: { id, label: id, navTier: 'global' },
          onNav: () => {},
          segment: 'biotech',
        };
        // ownsConversation:true narrows the component to OwnedSurfaceViewProps.
        if (!entry.ownsConversation) props.onAsk = () => {};

        const client = new QueryClient({
          defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
        });
        try {
          const { container } = render(
            <QueryClientProvider client={client}>
              <AuthProvider>
                <Catcher onErr={(e) => { err = e; }}>
                  <Surface {...props} />
                </Catcher>
              </AuthProvider>
            </QueryClientProvider>,
          );
          // Wait for the tree to commit something, then let post-load effects
          // run — the crash arrives WITH the data, not before it.
          await waitFor(
            () =>
              expect(
                container.querySelector('[data-dead]') ||
                  (container.innerHTML ?? '').trim().length > 0,
              ).toBeTruthy(),
            { timeout: 4000 },
          );
          await new Promise((r) => setTimeout(r, 30));
        } catch (e) {
          err = err || String((e as Error)?.message ?? e);
        }
        cleanup();
        if (err) failures.push(`${label}\n      ${err.slice(0, 200)}`);
      }

      expect(
        failures,
        failures.length
          ? `${id} throws on ${failures.length} of ${PAYLOADS.length} payloads:\n  · ${failures.join('\n  · ')}`
          : '',
      ).toEqual([]);
    },
    60_000,
  );
});
