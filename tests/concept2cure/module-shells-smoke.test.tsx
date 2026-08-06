/**
 * @vitest-environment jsdom
 *
 * Every PDEV surface renders something.
 *
 * ── What this file used to be ─────────────────────────────────────────────────
 * A mount smoke test for nine top-level module route shells — PDEV, CMC, Risk,
 * Biopharma, Authoring, Labeling, Tasking, Submission, ProjectDetail. Eight of
 * those nine were unreachable from `client/src/main.tsx`: their routes were
 * unmounted, nothing imported them, and they are now deleted. "Nine module
 * shells each mount" describes a product that no longer exists, and the rule
 * that replaced it — one shell — is asserted by `tests/ui/one-shell.test.ts`.
 *
 * ── Why it is now this ────────────────────────────────────────────────────────
 * PDEV is the ninth, the one that survived, and it was converted from a shell
 * into surfaces. Its sibling kit was converted the same way and shipped a bug
 * where `MdxSurfaceHost` built its output and never returned it: every device
 * surface rendered `undefined`. No error, no warning, no failing test — tsc
 * accepts a component returning undefined, and nothing rendered the component.
 *
 * That bug class is not specific to MDX. It is what happens when a refactor
 * changes what a component RETURNS while every guard around it reads source
 * instead of mounting. `mdx/__tests__/surfaceHostRenders.test.tsx` closes it for
 * the device kit; this closes it for PDEV.
 */

import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as React from 'react';

import PdevRoute from '../../client/src/concept2cure/pdev/PdevRoute';

/** The kit's internal nav vocabulary, as `v2/surfaces/PdevSurfaces` maps onto it. */
const PDEV_NAVS = [
  'overview',
  'cmc',
  'nonclinical',
  'clinical',
  'regulatory',
  'ind_assembly',
  'contradictions',
  'fda_interactions',
] as const;

beforeEach(() => {
  cleanup();
  // Every request 404s. The question is whether the kit DRAWS, not what it
  // fetches, so each surface should reach its own honest empty state rather
  // than a blank canvas.
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: false,
    status: 404,
    text: async () => 'Not Found',
    json: async () => ({ data: null }),
  }) as unknown as typeof fetch;
  try { window.localStorage.clear(); } catch { /* ignore */ }
});

function renderNav(nav: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <PdevRoute nav={nav} onNav={() => {}} />
    </QueryClientProvider>,
  );
}

describe('PDEV surfaces draw inside the scope root', () => {
  it.each([...PDEV_NAVS])('%s renders', (nav) => {
    const { container } = renderNav(nav);

    // THE ASSERTION THAT WAS MISSING ON THE MDX SIDE. A component returning
    // undefined leaves an empty container: no throw, nothing on screen.
    const root = container.querySelector('.pdev-shell');
    expect(root, `${nav} rendered nothing — is the host returning its surface?`).toBeTruthy();
    expect((root!.textContent || '').trim().length, `${nav} rendered an empty scope root`)
      .toBeGreaterThan(0);
  });

  it('the scope root opts out of the shell grid', () => {
    // `.pdev-shell` is the SCOPE every rule in pdev/app.css hangs off, and it is
    // also the shell's own grid. As a surface only the first job applies — the
    // v2 shell draws the rail and the topbar now.
    const { container } = renderNav('overview');
    expect(container.querySelector('.pdev-shell[data-surface="true"]')).toBeTruthy();
  });

  it('keeps the kit content measure around the surface', () => {
    const { container } = renderNav('overview');
    expect(container.querySelector('.pdev-shell > .pdev-page > .pdev-page-inner')).toBeTruthy();
  });
});
