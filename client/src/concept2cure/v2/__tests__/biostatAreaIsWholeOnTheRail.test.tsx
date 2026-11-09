// @vitest-environment jsdom
/**
 * The rail's Biostatistics is the whole work area the registry says it is.
 *
 * ── The defect ───────────────────────────────────────────────────────────────
 * The two biostatistics surfaces divide the work between them, and the registry
 * states the division (`shared/constants/ui-surface-registry.ts`):
 *
 *   `biostatistics`     :874 "SAP authoring, power analysis, TLF shells,
 *                             ADAPTIVE TRIAL PLANS, IDMC ... and task raising."
 *   `biostat-workbench` :890 "reviewer-risk defensibility assessment +
 *                             design calculators"
 *
 * The rail opens `biostatistics` (`registryModel.ts:176`), kept there by
 * founder decision P-107. But the adaptive-monitoring panel — the stored plan,
 * its interim looks, the blinded re-estimation, the IDMC report and the
 * Part 11-signed interim decision — and the statistical-precedent panel were
 * mounted on `biostat-workbench` instead, on 2026-10-13.
 *
 * So the one act in this product that stops a trial on unblinded data was
 * reachable only by first noticing a ghost button labelled "Design
 * calculators" (`Biostatistics.tsx:961`) and clicking through to a second
 * surface. The S12 inventory records both capabilities as reachable "only
 * here" (B10, B11 — docs/evidence/SPINE/S12/2026-11-09-core-work-convergence).
 *
 * An IDMC does not look for its charter under a calculator.
 *
 * ── What this asserts ────────────────────────────────────────────────────────
 * That the surface the rail actually opens carries the capabilities the
 * registry assigns to it. RED before the move: neither panel is in the
 * document.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, cleanup, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { Biostatistics } from '../surfaces/Biostatistics';
import { UI_SURFACES } from '@shared/constants/ui-surface-registry';
import { RAIL_CORE } from '../registryModel';

const Surface = Biostatistics as unknown as React.ComponentType<Record<string, unknown>>;

/** Nothing is asked of the engine at mount; every read answers empty. */
function quietServer() {
  apiRequest.mockImplementation(async (_m: string, _p: string) => ({
    ok: true,
    status: 200,
    json: async () => ({ data: [] }),
  }));
}

afterEach(() => cleanup());
beforeEach(() => { apiRequest.mockReset(); });

describe('the rail lands on the whole biostatistics area', () => {
  it('the rail entry opens the `biostatistics` surface, not the calculators', () => {
    const entry = RAIL_CORE.find((e) => e.id === 'biostatistics');
    expect(entry, 'the rail has no Biostatistics entry').toBeTruthy();
    // A `target` would redirect the id; there is none, so the id is the surface.
    expect((entry as { target?: string }).target ?? 'biostatistics').toBe('biostatistics');
  });

  it('the registry assigns adaptive trial plans and IDMC to that surface', () => {
    const entry = UI_SURFACES.find((s) => s.id === 'biostatistics');
    expect(entry, 'no `biostatistics` registry entry').toBeTruthy();
    const notes = String((entry as { notes?: string }).notes ?? '').toLowerCase();
    expect(notes).toMatch(/adaptive trial plans/);
    expect(notes).toMatch(/idmc/);
  });

  it('renders the adaptive monitoring panel, where a signed interim decision lives', async () => {
    quietServer();
    render(<Surface onAsk={() => {}} onNav={() => {}} />);
    await waitFor(() => expect(screen.getByText('Adaptive monitoring')).toBeTruthy());
    // Its subtitle names what the panel is for, so the heading is not a coincidence.
    expect(screen.getByText(/interim looks, their figures, and the signed decision/i)).toBeTruthy();
  });

  it('renders the statistical precedent panel', async () => {
    quietServer();
    render(<Surface onAsk={() => {}} onNav={() => {}} />);
    await waitFor(() => expect(screen.getByText('Method precedent')).toBeTruthy());
  });

  /* Written on 2026-11-09 asserting a ghost button to `biostat-workbench`.
     Later the same day that surface was retired into this one
     (biostatIsOneSurface.test.tsx), so the calculators are a section here and
     there is no button to anywhere. The capability is what this pins. */
  it('carries the calculators itself, with no second surface to send anyone to', async () => {
    quietServer();
    render(<Surface onAsk={() => {}} onNav={() => {}} />);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Design calculators' })).toBeTruthy());
  });
});
