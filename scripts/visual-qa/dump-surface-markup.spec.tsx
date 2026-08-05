/**
 * @vitest-environment jsdom
 *
 * Step 1 of visual QA: capture the REAL markup each converged surface renders.
 *
 * The PR this belongs to is a draft for exactly one reason, stated in its own
 * body: "jsdom does not evaluate the CSS cascade. The render tests prove all 24
 * converged surfaces draw, inside their scope root, with the kit's content
 * measure intact — they cannot prove the result *looks* right."
 *
 * That is precisely right, and it is not fixable by adding more jsdom tests.
 * jsdom parses CSS but does not lay out or cascade it: every `getComputedStyle`
 * answer is a default. So a surface whose stylesheet stopped matching after the
 * kits were rescoped renders identically in jsdom whether it is styled or not.
 *
 * This file does the half jsdom CAN do — mount each surface and serialize what
 * it actually produced — and writes it to disk. `check-surface-styling.mjs`
 * then loads that markup in real Chromium with the real built stylesheets and
 * asks the questions only a browser can answer.
 *
 * Mounting mirrors the existing smoke tests (mdx/__tests__/surfaceHostRenders,
 * tests/concept2cure/module-shells-smoke): every request resolves empty, so each
 * surface reaches its own honest empty state rather than a blank canvas. Empty
 * states are still styled markup, which is what is under test here.
 *
 * NOT part of the normal suite: it lives under scripts/, which the vitest
 * include globs do not cover, and it writes artifacts. `check-unrun-tests`
 * scans tests/server/client/shared only, so this does not trip it.
 */

import { describe, it, beforeEach, afterEach, vi, expect } from 'vitest';
import { render, cleanup, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as React from 'react';
import fs from 'node:fs';
import path from 'node:path';

import { MDX_SURFACE_IDS } from '../../client/src/concept2cure/mdx/surfaceIds';
import { MdxSurfaceHost } from '../../client/src/concept2cure/mdx/MdxSurfaceHost';
import PdevRoute from '../../client/src/concept2cure/pdev/PdevRoute';
import type { SurfaceViewProps } from '../../client/src/concept2cure/v2/surfaceViews';

const OUT = path.resolve(__dirname, '../../.visual-qa/markup');

/** The kit's internal nav vocabulary, as v2/surfaces/PdevSurfaces maps onto it. */
const PDEV_NAVS = [
  'overview', 'cmc', 'nonclinical', 'clinical',
  'regulatory', 'ind_assembly', 'contradictions', 'fda_interactions',
] as const;

/**
 * A URL-aware mock, because an all-empty one makes half the run vacuous.
 *
 * The first version resolved every request to `{ data: [] }`. That is correct
 * for the device surfaces — they each reach their own empty state, which is
 * still styled markup worth checking. It was NOT correct for PDEV: `App.tsx`
 * gates the entire kit on `/api/regulatory-programs` returning at least one row
 * with `programType: 'IND'`, so all eight PDEV navs rendered the identical
 * six-element "No IND programs yet" card. Eight rows of a passing table, all
 * measuring the same empty state, is a check that looks like coverage and is not.
 *
 * So the program list is seeded with one IND row, which lets PDEV get past the
 * gate and draw its real chrome. Everything downstream still resolves empty, so
 * the surfaces show their own honest empty states inside a real layout — which
 * is the thing under test. Seeding a whole fake program tree would be inventing
 * a product state to photograph.
 *
 * Shapes are taken from the code that consumes them (IndProgramRow in
 * pdev/App.tsx:65, the `{ data: … }` envelope in usePdevData.ts), not guessed.
 */
function respond(url: string): unknown {
  if (url.includes('/api/regulatory-programs')) {
    return {
      data: [
        {
          id: 'prog-vqa-1',
          code: 'BX204',
          productName: 'Bexarotene-204',
          name: 'BX204 IND',
          programType: 'IND',
          status: 'active',
          metadata: null,
        },
      ],
    };
  }
  return { data: [] };
}

/**
 * The program view 404s rather than returning an invented `{ data: null }` 200.
 * A row that exists in regulatory-programs but has no PDEV record yet is a real
 * state, and it drives App.tsx's real `pdev-page-error` branch — styled markup
 * worth measuring. Inventing a 200 with a null body would be photographing a
 * server response no server produces.
 */
const NOT_FOUND = (url: string) => /\/api\/pdev\/programs\/[^/]+$/.test(url);

beforeEach(() => {
  cleanup();
  fs.mkdirSync(OUT, { recursive: true });
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : String((input as Request).url ?? input);
      if (NOT_FOUND(url)) {
        return new Response(JSON.stringify({ error: 'No PDEV record for this program yet' }), {
          status: 404,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(JSON.stringify(respond(url)), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }),
  );
  try { window.localStorage.clear(); } catch { /* ignore */ }
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const props = {
  surface: { id: 'device-workstream' },
  onAsk: () => {},
  onNav: () => {},
  segment: 'medtech',
} as unknown as SurfaceViewProps;

function write(name: string, html: string) {
  fs.writeFileSync(path.join(OUT, `${name}.html`), html, 'utf8');
}

/**
 * Wait for the surface to get past its loading state before serializing.
 *
 * The first capture run took the markup synchronously, and nine of the
 * twenty-four surfaces serialized mid-load: all eight PDEV navs produced the
 * identical five-element `<div class="pdev-loading-state">Loading PDEV
 * program…</div>`, and `device-workstream` produced "Loading device programs…".
 * Screenshotting a spinner and calling it visual QA of a surface is worse than
 * not running it, because it produces a green row per surface either way.
 *
 * Every request resolves to an empty payload, so each surface should settle into
 * its own honest empty state. If one never settles, that is a real finding about
 * the surface, so this fails rather than falling back to the spinner.
 */
async function settled(container: HTMLElement, name: string) {
  await waitFor(
    () => {
      const busy = container.querySelector('[aria-busy="true"]');
      const loading = /Loading[^]{0,40}…/.test(container.textContent ?? '');
      // Non-empty is part of "settled". Without it a surface that CRASHES
      // counts as settled: the error unmounts the tree, so the container has no
      // aria-busy and no "Loading" text, and the check waves it through with
      // zero bytes. That is how `device-presub`'s crash reached the styling
      // report as a quiet 0 instead of a failed capture.
      const drew = (container.innerHTML ?? '').trim().length > 0;
      expect(
        busy === null && !loading && drew,
        `${name} did not settle into rendered markup ` +
          `(busy=${busy !== null} loading=${loading} drew=${drew}). ` +
          'A surface that threw leaves an empty container, which is not the ' +
          'same as an empty state — capturing it would make the styling check ' +
          'meaningless for this surface.',
      ).toBe(true);
    },
    { timeout: 8000 },
  );
}

describe('capture converged surface markup', () => {
  it.each([...MDX_SURFACE_IDS])('device: %s', async (nav) => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { container } = render(
      <QueryClientProvider client={client}>
        <MdxSurfaceHost {...props} nav={nav as never} />
      </QueryClientProvider>,
    );
    await settled(container, `device-${nav}`);
    write(`mdx__${nav}`, container.innerHTML);
  });

  it.each([...PDEV_NAVS])('pdev: %s', async (nav) => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { container } = render(
      <QueryClientProvider client={qc}>
        <PdevRoute nav={nav} onNav={() => {}} />
      </QueryClientProvider>,
    );
    await settled(container, `pdev-${nav}`);
    write(`pdev__${nav}`, container.innerHTML);
  });
});
