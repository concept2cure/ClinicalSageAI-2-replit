// @vitest-environment jsdom
/**
 * Biostatistics is ONE surface. The design calculators are part of it.
 *
 * ── Why there were two, and why that reason is gone ──────────────────────────
 *  1. 2026-07-21 (`3b3299d733`) `BiostatWorkbench.tsx` was created — "workbench
 *     driving the real statistical engine (not client approx)". It existed
 *     BECAUSE `Biostatistics.tsx` carried its own ~520-line statistics engine in
 *     the browser, with its own Abramowitz & Stegun CDF and four copies of the
 *     sizing arithmetic that did not agree with each other.
 *  2. 2026-08 `docs/SURFACE_CONSOLIDATION_2026-08.md` §5 decided it:
 *     "**Survivor: `biostatistics`.** Fold the workbench in as a tab; it has no
 *     AnA at all today." That document counts `biostat-workbench` among the nine
 *     surface ids to be removed. It was never carried out.
 *  3. 2026-10-12 (`d1a742b5d6`) deleted the browser's engine from
 *     `Biostatistics.tsx`, which now calls the server like the workbench does.
 *     The workbench's entire reason for existing ended there.
 *
 * What was left until this change: two registered surfaces with the same
 * `layoutMode: 'biostatistics'`, the same `sigma` icon, the same `clinical`
 * group and overlapping `apiPrefixes`, one rail entry between them, joined only
 * by a ghost button — and the workbench took `SurfaceViewProps` and dropped
 * `onAsk`, so AnA could not be reached from it at all.
 *
 * CLAUDE.md: "Zero duplication. One canonical implementation per capability."
 * RULE 4: one product, not a screen per capability.
 *
 * ── Zero capability loss ─────────────────────────────────────────────────────
 * The last cases are the ledger: every capability the retired surface carried
 * is asserted present on the survivor. That is the non-negotiable half of a
 * fold (ONE_DESIGN_PLAN §2, "Zero capability loss").
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, cleanup, screen, waitFor } from '@testing-library/react';
import baseline from '../../../../../scripts/ci/one-product-baseline.json';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { Biostatistics } from '../surfaces/Biostatistics';
import { UI_SURFACES } from '@shared/constants/ui-surface-registry';
import { SURFACE_VIEWS } from '../surfaceViews';
import { RAIL_CORE } from '../registryModel';
import { NAVIGATION_TARGETS } from '@shared/navigation';
import { CALCULATORS } from '../surfaces/biostatCalculators';
import { __resetSurfaceActionBus, applySurfaceAction } from '../surfaceActions';
import { resolveSurfaceAction } from '@shared/navigation/surface-actions';

const Surface = Biostatistics as unknown as React.ComponentType<Record<string, unknown>>;
const RETIRED = 'biostat-workbench';

function quietServer() {
  apiRequest.mockImplementation(async () => ({ ok: true, status: 200, json: async () => ({ data: [] }) }));
}

afterEach(() => cleanup());
beforeEach(() => { apiRequest.mockReset(); });

describe('the retired second surface is gone', () => {
  it('is not a registry row', () => {
    expect(UI_SURFACES.map((s) => s.id)).not.toContain(RETIRED);
  });

  it('is not a renderable surface', () => {
    expect(Object.keys(SURFACE_VIEWS)).not.toContain(RETIRED);
  });

  it('is not in the one-product baseline', () => {
    expect((baseline as { surfaces: string[] }).surfaces).not.toContain(RETIRED);
  });

  it('is not a navigation target', () => {
    expect(NAVIGATION_TARGETS.map((t) => t.id)).not.toContain(RETIRED);
  });
});

describe('the survivor is the one biostatistics surface', () => {
  it('is on the rail, and is the id the rail opens', () => {
    const entry = RAIL_CORE.find((e) => e.id === 'biostatistics');
    expect(entry).toBeTruthy();
    expect((entry as { target?: string }).target ?? 'biostatistics').toBe('biostatistics');
  });

  it('claims the api namespaces the folded capabilities call', () => {
    const row = UI_SURFACES.find((s) => s.id === 'biostatistics');
    const prefixes = (row as { apiPrefixes?: string[] }).apiPrefixes ?? [];
    // The defensibility assessment and the eleven CLSI/IVD calculators.
    expect(prefixes).toContain('/api/statistical-defensibility');
    expect(prefixes).toContain('/api/diagnostics-performance');
  });
});

describe('zero capability loss — the ledger', () => {
  it('carries the reviewer-risk defensibility assessment', async () => {
    quietServer();
    render(<Surface onAsk={() => {}} onNav={() => {}} />);
    await waitFor(() => expect(screen.getByText('Statistical defensibility')).toBeTruthy());
  });

  it('carries the design calculators', async () => {
    quietServer();
    render(<Surface onAsk={() => {}} onNav={() => {}} />);
    await waitFor(() => expect(screen.getByText('Design calculators')).toBeTruthy());
  });

  it('carries every one of the calculators, by name', async () => {
    quietServer();
    render(<Surface onAsk={() => {}} onNav={() => {}} />);
    await waitFor(() => expect(screen.getByText('Design calculators')).toBeTruthy());
    expect(CALCULATORS.length).toBeGreaterThanOrEqual(29);
    for (const c of CALCULATORS) {
      expect(screen.getAllByRole('button', { name: c.title }).length, `no way to open ${c.title}`).toBeGreaterThan(0);
    }
  });

  /* The ledger's "AnA opening an engine by name" row, on the mounted surface.
     The action bus holds ONE registration, so the section registering its own
     under `biostatistics` was replaced by the surface's (effects run child
     first): the action answered "This screen does not support" on the screen
     that lists it, and a design named while the list loaded was answered the
     same way before the list arrived (heldScreenActions.test.tsx). */
  it('lets AnA open a design engine by name on the one surface', async () => {
    quietServer();
    __resetSurfaceActionBus();
    render(<Surface onAsk={() => {}} onNav={() => {}} />);
    await waitFor(() => expect(screen.getByText('Design calculators')).toBeTruthy());
    const target = CALCULATORS[CALCULATORS.length - 1];
    const res = resolveSurfaceAction('biostatistics.select-calculator', { calculator: target.id });
    if (!res.ok) throw new Error('biostatistics.select-calculator does not resolve');
    expect(applySurfaceAction(res.directive, vi.fn())).toEqual({ status: 'applied', detail: `Opened ${target.title}` });
    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: target.title }).some((b) => b.getAttribute('aria-pressed') === 'true')).toBe(true),
    );
    __resetSurfaceActionBus();
  });

  it('still carries what it already had: the adaptive monitoring and precedent panels', async () => {
    quietServer();
    render(<Surface onAsk={() => {}} onNav={() => {}} />);
    await waitFor(() => expect(screen.getByText('Adaptive monitoring')).toBeTruthy());
    expect(screen.getByText('Method precedent')).toBeTruthy();
  });

  it('no longer offers a button to a second surface', async () => {
    quietServer();
    render(<Surface onAsk={() => {}} onNav={() => {}} />);
    await waitFor(() => expect(screen.getByText('Design calculators')).toBeTruthy());
    // The ghost button that navigated away is gone: the calculators are here.
    const ghosts = screen.queryAllByRole('button', { name: /^Design calculators$/ });
    expect(ghosts.length, 'a nav button to the retired surface is still rendered').toBe(0);
  });
});
