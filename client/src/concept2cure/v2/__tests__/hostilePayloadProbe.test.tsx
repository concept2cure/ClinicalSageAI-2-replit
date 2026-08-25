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
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
  ApiRequestError,
}));

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
  /*
   * Rows present, fields absent — a different bug class from the six above.
   *
   * Those all malform the ENVELOPE, so a shape guard at the boundary catches
   * them and the rows never render. This one is well-formed at every level the
   * guards inspect: a list, of objects. It is the individual FIELDS that are
   * missing, which is what a nullable column, a narrowed SELECT, or a partially
   * migrated row actually looks like.
   *
   * That class is invisible to everything else here, and it is real: a client
   * review row whose `status` was null crashed the whole device workstream on an
   * otherwise perfect response, one line below a sibling field that WAS guarded.
   */
  ['rows present but their fields absent', { data: [{}, {}] }],
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
          // Wait for the tree to commit something, then wait for it to STOP
          // changing. The fixed 30ms this used to sleep for was a guess, and it
          // was wrong: four surfaces crashed later than that and the probe
          // recorded them as passing. It passed locally and failed in CI, on
          // timing alone — the same wrong-moment blind spot this file exists to
          // catch, in the instrument itself.
          //
          // Quiescence is the honest condition. A crash cannot arrive after the
          // DOM has been identical for three consecutive samples AND no further
          // request is outstanding, because there is nothing left running to
          // produce one.
          await waitFor(
            () =>
              expect(
                container.querySelector('[data-dead]') ||
                  (container.innerHTML ?? '').trim().length > 0,
              ).toBeTruthy(),
            { timeout: 4000 },
          );
          //
          // A LOADING placeholder does not count as settled, and this is the
          // trap that made the old version report green on genuinely broken
          // surfaces. Every device surface is wrapped in React.lazy + Suspense
          // (DeviceSurfaces.tsx), so the first thing committed is the
          // "Loading device workstream…" fallback. That fallback is STABLE — it
          // does not change while the chunk loads — so a stability check alone
          // happily concludes on it and never sees the real surface mount, let
          // alone crash. Proven, not assumed: restoring a known-crashing hook
          // still produced a green probe.
          //
          // So a container whose only substantive content is a role="status"
          // node is treated as still loading, and there is a floor on how early
          // "stable" may be believed.
          const isPlaceholder = () => {
            const status = container.querySelector('[role="status"]');
            if (!status) return false;
            const rest = (container.textContent ?? '')
              .replace(status.textContent ?? '', '')
              .trim();
            return rest.length === 0;
          };
          const mockCalls = () =>
            (globalThis.fetch as unknown as { mock?: { calls: unknown[] } }).mock?.calls.length ??
            0;

          let stable = 0;
          let last = container.innerHTML;
          let lastCalls = mockCalls();
          for (let i = 0; i < 80; i++) {
            if (err) break; // already dead; no point waiting for calm
            await new Promise((r) => setTimeout(r, 25));
            const now = container.innerHTML;
            const calls = mockCalls();
            stable = now === last && calls === lastCalls ? stable + 1 : 0;
            last = now;
            lastCalls = calls;
            // i >= 12 is the floor (~300ms): long enough for a lazy chunk to
            // resolve and its surface to mount, so "nothing changed" means
            // finished rather than not-started-yet.
            if (stable >= 3 && i >= 12 && !isPlaceholder()) break;
          }
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
