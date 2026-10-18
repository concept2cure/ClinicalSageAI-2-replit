// @vitest-environment jsdom
/**
 * The bundle register says when it did not read all of it.
 *
 * ── The silent cap (reporting coverage review, C-3's measurable half) ───────
 * `loadBundleRegister` scans a bounded number of `project_memory_entries`
 * rows, and a bundle is stored once PER COVERED PROJECT. So the scan is
 * counted in rows while the register is counted in bundles: the old bound of
 * 1000 rows was 1000 packs only when every pack covered exactly one project,
 * and about 333 when they covered three. Past the bound the oldest packs were
 * absent from a list presented as the register, with nothing saying so.
 *
 * The route now counts the distinct bundles in SQL — not from the rows the
 * scan returned, which would agree with a truncated scan by construction — and
 * sends `meta.truncated` only when the scan actually truncated.
 *
 * Both halves are asserted. The note appearing is the fix; the note NOT
 * appearing on a complete read is what keeps it meaningful, since a caveat on
 * every load is one a reader learns to skip.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { bundleRegisterCaveat } from '../surfaces/insightsLibraryModel';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
vi.mock('@/services/portal/authService', () => ({
  useAuth: () => ({ user: { id: 'u-1', name: 'Tester', email: 't@example.com' } }),
}));

import { BundlesPanel } from '../surfaces/InsightsBundlesPanel';

const BUNDLE = {
  bundleId: 'b-1',
  name: 'Q3 readiness pack',
  description: null,
  createdAt: '2026-10-01T09:00:00Z',
  createdBy: 1,
  projectIds: [7],
  runIds: [1],
  items: [],
};

const serve = (body: unknown) => {
  apiRequest.mockImplementation(async () =>
    ({ ok: true, status: 200, json: async () => body }) as unknown as Response);
};

const panel = () => (
  <BundlesPanel
    canWrite={false}
    pendingRunIds={[]}
    pendingExports={new Set<string>()}
    onExport={() => {}}
    onSaved={() => {}}
    onClearPending={() => {}}
  />
);

beforeEach(() => apiRequest.mockReset());
afterEach(cleanup);

describe('the bundle register states a truncated read', () => {
  it('says nothing when the register was read whole', async () => {
    serve({ data: [BUNDLE] });
    render(panel());
    await screen.findByText('Q3 readiness pack');
    expect(screen.queryByTestId('rl-bundle-register-caveat')).toBeNull();
  });

  it('names the register total when the scan truncated', async () => {
    /* THE REGRESSION. Before `meta.truncated`, this response and the one above
       were indistinguishable to the reader. */
    serve({ data: [BUNDLE], meta: { truncated: true, registerTotal: 1420 } });
    render(panel());
    const note = await screen.findByTestId('rl-bundle-register-caveat');
    expect(note.textContent ?? '').toMatch(/holds 1420 report packs/);
    expect(note.textContent ?? '').toMatch(/older ones were not read/);
  });

  it('does not present the register total as what the reader may see', async () => {
    /* `registerTotal` is counted BEFORE the per-project read check, so "1420
       of yours" would overstate it. The sentence has to carry that. */
    serve({ data: [BUNDLE], meta: { truncated: true, registerTotal: 1420 } });
    render(panel());
    const note = await screen.findByTestId('rl-bundle-register-caveat');
    expect(note.textContent ?? '').toMatch(/outside the projects you can access/);
  });
});

describe('bundleRegisterCaveat, over the cases a panel cannot easily reach', () => {
  it('is silent unless the route said it truncated', () => {
    expect(bundleRegisterCaveat(undefined)).toBeNull();
    expect(bundleRegisterCaveat(null)).toBeNull();
    expect(bundleRegisterCaveat({})).toBeNull();
    expect(bundleRegisterCaveat({ registerTotal: 1420 })).toBeNull();
    // Not `true` — a truthy string must not be read as the flag.
    expect(bundleRegisterCaveat({ truncated: 'yes', registerTotal: 5 })).toBeNull();
  });

  it('still speaks when the total is missing or malformed, without inventing one', () => {
    /* A truncated read with no usable count is still a truncated read. Saying
       nothing because the number was unreadable is the silence being fixed. */
    for (const bad of [undefined, 'many', -1, 2.5]) {
      const said = bundleRegisterCaveat({ truncated: true, registerTotal: bad })!;
      expect(said, String(bad)).toMatch(/More report packs exist than are shown here/);
      expect(said, String(bad)).not.toMatch(/holds \d/);
    }
  });

  it('reports a zero total rather than treating it as absent', () => {
    expect(bundleRegisterCaveat({ truncated: true, registerTotal: 0 })).toMatch(/holds 0 report packs/);
  });
});
