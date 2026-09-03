// @vitest-environment jsdom
/**
 * Every device surface renders something, inside the scope root.
 *
 * ── The defect this exists for ────────────────────────────────────────────────
 * `MdxSurfaceHost` shipped returning nothing. Its switch assigned
 * `surface = <K510Surface …/>` in all sixteen cases and the function body then
 * ended — no `return`. Every device surface rendered `undefined`: a blank
 * canvas on five shipping registry ids, with no error and no console warning.
 *
 * Nothing caught it. `tsc` is happy because a component returning `undefined`
 * satisfies `ReactNode`. All 1,157 tests passed because not one of them
 * rendered this component. The reachability, CSS-collision, token-cascade and
 * one-shell guards all measure structure, and the structure was fine — the
 * component existed, was registered, and was imported. It just drew nothing.
 *
 * The second half of the same bug: with no element carrying `.mdx-shell`, none
 * of the kit's CSS applied. Every rule in app.css is scoped under that class,
 * as is 100% of pathway-tabs.css, files-tree.css and drafter.css, and
 * the class also carries the custom-property block those rules read. A wrapper
 * that renders but drops the class is the same outage wearing different
 * clothes, so both halves are asserted here.
 *
 * ── Why rendering, not source analysis ────────────────────────────────────────
 * The sibling guards in tests/ui read source, and that is right for structural
 * invariants. It is wrong here: source analysis is exactly what could not see
 * this. Only mounting the component proves it draws.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { MDX_SURFACE_IDS } from '../surfaceIds';
import { MdxSurfaceHost } from '../MdxSurfaceHost';
import type { SurfaceViewProps } from '../../v2/surfaceViews';

// The surfaces fan out to a lot of live endpoints. This test is about whether
// the HOST draws, not about what any surface fetches, so every request resolves
// to an empty payload and each surface renders its own honest empty state.
vi.stubGlobal(
  'fetch',
  vi.fn(async () => new Response(JSON.stringify({ data: [] }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })),
);

afterEach(cleanup);

/**
 * Four of the sixteen surfaces read through react-query. Retries off and a
 * fresh client per render so one surface's cache cannot mask another's failure
 * to draw — the exact thing this file exists to detect.
 */
function renderHost(nav: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MdxSurfaceHost {...props} nav={nav as never} />
    </QueryClientProvider>,
  );
}

const props = {
  surface: { id: 'device-workstream' },
  onAsk: () => {},
  onNav: () => {},
  segment: 'medtech',
} as unknown as SurfaceViewProps;

describe('MdxSurfaceHost draws every surface it claims', () => {
  it.each([...MDX_SURFACE_IDS])('%s renders inside the .mdx-shell scope root', (nav) => {
    const { container } = renderHost(nav);

    // THE ASSERTION THAT WAS MISSING. `undefined` gives an empty container —
    // no throw, no warning, just nothing on screen.
    const root = container.querySelector('.mdx-shell');
    expect(root, `${nav} rendered nothing — the host is not returning its surface`).toBeTruthy();

    // …and the scope root has to actually contain the surface, not just exist.
    expect(root!.textContent?.length ?? 0, `${nav} rendered an empty scope root`).toBeGreaterThan(0);
  });

  it('the scope root opts out of the shell grid', () => {
    // `.mdx-shell` is also `display: grid` with a rail column at 100vh. Without
    // `data-surface` the canvas lands in the rail slot of a shell that no
    // longer exists, in a box taller than the host's page area.
    const { container } = renderHost('device-workstream');
    expect(container.querySelector('.mdx-shell[data-surface="true"]')).toBeTruthy();
  });

  it('keeps the kit content measure around the surface', () => {
    // `.page` / `.page-inner` carry max-width 1280 and the 24/64px padding every
    // surface was designed against. They are content measure, not chrome, and
    // dropping them re-flows all sixteen.
    const { container } = renderHost('device-510k');
    expect(container.querySelector('.mdx-shell > .page > .page-inner')).toBeTruthy();
  });
});
