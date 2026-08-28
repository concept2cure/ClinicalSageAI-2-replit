// @vitest-environment jsdom
/**
 * The MDX lane's entry surface, when the portfolio fetch fails.
 *
 * ── What it used to render ───────────────────────────────────────────────────
 *     <div role="alert">Device program data is unavailable. {liveProgramsResult.error}</div>
 *
 * `useFetchJson` sets that field to `HTTP ${status} ${path}` on a non-OK
 * response, and to a caught exception's message otherwise. So the
 * highest-traffic failure in the device lane interpolated an API route — or a
 * driver error, or a stack-bearing message — verbatim, at a regulatory
 * director. That is an information-disclosure finding in a regulated product,
 * and it is the class W0-4 closed on every other surface; this one was reached
 * through a different code path and was missed.
 *
 * It also offered no recovery. `useMdxPrograms` has returned a `refresh` since
 * it was written and nothing called it, so a transient failure on the portfolio
 * left the user with a dead screen — UI standards §8.
 *
 * ── Why the existing host test could not catch it ────────────────────────────
 * `surfaceHostRenders.test.tsx` stubs every fetch to resolve `{ data: [] }`, so
 * the host is only ever exercised on its SUCCESS path. The failure branch —
 * the one that leaks — is unreachable from that suite by construction. This
 * file exists to fail the fetch on purpose.
 */
import React from 'react';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { MdxSurfaceHost } from '../MdxSurfaceHost';
import type { SurfaceViewProps } from '../../v2/surfaceViews';

afterEach(cleanup);

const props = {
  surface: { id: 'device-workstream' },
  onAsk: () => {},
  onNav: () => {},
  segment: 'medtech',
} as unknown as SurfaceViewProps;

function renderHost() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MdxSurfaceHost {...props} nav={'device-workstream' as never} />
    </QueryClientProvider>,
  );
}

/** The shapes `useFetchJson` actually puts in `error`, both of them internal. */
const LEAKS = [
  { label: 'a route and a status', status: 500, body: 'nope' },
  { label: 'a driver error', status: 503, body: 'ECONNREFUSED' },
];

describe('MDX portfolio — a failed load discloses nothing and offers a way out', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it.each(LEAKS)('does not render %s', async ({ status, body }) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(body, { status, headers: { 'content-type': 'text/plain' } }),
      ),
    );
    renderHost();

    const alert = await waitFor(() => screen.getByRole('alert'));
    const shown = alert.textContent ?? '';

    expect(shown).toContain("Couldn't load your device programs");
    /* Nothing recognisably internal survives, in any form: no API route, no
       HTTP-with-path string, no driver code, no relation name. */
    expect(shown).not.toMatch(/\/api\//);
    expect(shown).not.toMatch(/HTTP \d{3}/);
    expect(shown).not.toMatch(/ECONNREFUSED|relation "|Failed query|select "/i);
  });

  it('offers a retry rather than a dead screen', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('nope', { status: 500 })),
    );
    renderHost();

    await waitFor(() => screen.getByRole('alert'));
    /* `refresh` was available on the hook all along and nothing called it. */
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
  });
});
