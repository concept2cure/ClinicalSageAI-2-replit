// @vitest-environment jsdom
/**
 * ClientPortal ↔ GET /api/client-portal/overview wiring (fixture-free).
 *
 * Locks the FIXTURE-FREE live adoption in surfaces/ClientPortal.tsx. The surface
 * dropped its inline `CP` fixture, its `mapLive` fail-closed adopter and the
 * SampleTag "Sample data" pill in the GA honesty sweep. It now renders REAL
 * org-scoped overview data, or an honest state:
 *  - GET /api/client-portal/overview adopted (live client/cro/user, program
 *    cards with real readiness + next-milestone, shared deliverables, updates)
 *  - an authenticated client whose partner has shared nothing → honest per-
 *    section empty affordances, never a fabricated program
 *  - a 403 (portal not shared with the caller) → honest "not shared" state
 *  - any other failure (offline/500) → honest "couldn't load" state
 *  - NO fixture content (Meridian/Vertex/MER-*), NO "Sample data" pill, ever
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { ClientPortal } from '../surfaces/ClientPortal';

/** The `data` payload the real route returns (server/routes/client-portal.ts). */
const OVERVIEW = {
  data: {
    mode: 'client',
    client: 'Northwind Bio',
    cro: 'Atlas Regulatory',
    user: 'Dr. Priya Anand',
    programs: [
      { id: 'NW-101', title: 'NW-101 — IND enabling', pathway: 'IND', readiness: 64, status: 'active', next: 'Next milestone · 21 days', blocker: null },
      { id: 'NW-220', title: 'NW-220 — 510(k)', pathway: '510(k)', readiness: 40, status: 'active', next: 'In review', blocker: 'Awaiting your device spec sign-off' },
    ],
    deliverables: [
      { name: 'IND draft — Module 2.5', prog: 'NW-101', status: 'shared', when: '2026-07-28T00:00:00.000Z', sig: false },
      { name: 'Predicate comparison report', prog: 'NW-220', status: 'approved', when: '2026-07-20T00:00:00.000Z', sig: true },
    ],
    updates: [
      { who: 'Atlas Regulatory', what: 'shared the IND Module 2.5 draft for your review', when: '2026-07-28T00:00:00.000Z' },
    ],
  },
  meta: { clientWorkspaceId: 10, programCount: 2, deliverableCount: 2 },
};

function ok(payload: unknown) {
  return { ok: true, status: 200, json: async () => payload } as Response;
}
function fail(status: number) {
  return { ok: false, status, json: async () => ({ error: 'x' }) } as Response;
}

const noop = () => {};
const mount = () =>
  // No `onAsk`. `client-portal` is `ownsConversation: true`, and the union in
  // surfaceViews narrows its component to props without it — so passing one is
  // now a type error rather than a prop that silently goes nowhere. This line
  // failing is how the guard proved it bites.
  render(<ClientPortal surface={{ id: 'client-portal' } as any} onNav={noop} segment="biopharma" />);

afterEach(() => {
  cleanup();
  apiRequest.mockReset();
});

describe('ClientPortal — live overview (fixture-free)', () => {
  it('adopts the real overview: client/cro/user, program cards, deliverables, updates', async () => {
    apiRequest.mockImplementation(async (method: string, url: string) => {
      expect(method).toBe('GET');
      expect(url).toBe('/api/client-portal/overview');
      return ok(OVERVIEW);
    });
    mount();

    // Live program card anchors the loaded state, then live org identity.
    expect(await screen.findByText('NW-101 — IND enabling')).toBeTruthy();
    expect(screen.getAllByText(/Atlas Regulatory/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Northwind Bio/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Welcome, Anand/)).toBeTruthy();

    // Live program cards — real readiness + next-milestone + blocker flag
    expect(screen.getByText('64% ready')).toBeTruthy();
    expect(screen.getByText('Next milestone · 21 days')).toBeTruthy();
    expect(screen.getByText('Awaiting your device spec sign-off')).toBeTruthy();

    // Live shared deliverables + count
    expect(screen.getByText('2 documents')).toBeTruthy();
    expect(screen.getByText('IND draft — Module 2.5')).toBeTruthy();
    expect(screen.getByText('Predicate comparison report')).toBeTruthy();

    // Live update
    expect(screen.getByText(/shared the IND Module 2\.5 draft for your review/)).toBeTruthy();

    // No fixture leakage and no sample pill, ever
    expect(document.querySelector('.c2c-sample-tag')).toBeNull();
    expect(screen.queryByText(/Sample data/i)).toBeNull();
    expect(document.body.textContent).not.toMatch(/Meridian|Vertex|MER-\d/);
  });

  it('client mode hides the CRO-preview banner', async () => {
    apiRequest.mockResolvedValue(ok(OVERVIEW));
    mount();
    await screen.findByText('NW-101 — IND enabling');
    expect(document.querySelector('.cp-ctx')).toBeNull();
    expect(screen.queryByText(/External client view/)).toBeNull();
  });

  it('preview mode (staff) shows the external-client-view banner', async () => {
    apiRequest.mockResolvedValue(
      ok({ ...OVERVIEW, data: { ...OVERVIEW.data, mode: 'preview' } }),
    );
    mount();
    expect(await screen.findByText(/External client view/)).toBeTruthy();
  });

  it('empty workspace → honest per-section empties, never a fabricated program', async () => {
    apiRequest.mockResolvedValue(
      ok({
        data: { mode: 'client', client: 'Northwind Bio', cro: 'Atlas Regulatory', user: 'Priya Anand', programs: [], deliverables: [], updates: [] },
        meta: { clientWorkspaceId: 10, programCount: 0, deliverableCount: 0 },
      }),
    );
    mount();
    expect(await screen.findByText(/No active programs yet/)).toBeTruthy();
    expect(screen.getByText(/No deliverables have been shared with you yet/)).toBeTruthy();
    expect(screen.getByText(/No recent updates/)).toBeTruthy();
    expect(document.querySelector('.c2c-sample-tag')).toBeNull();
    expect(document.body.textContent).not.toMatch(/Meridian|Vertex|MER-\d/);
  });

  it('403 (portal not shared) → honest not-shared state, no fixture', async () => {
    apiRequest.mockResolvedValue(fail(403));
    mount();
    expect(await screen.findByText(/isn't shared with your account/)).toBeTruthy();
    expect(document.querySelector('.c2c-sample-tag')).toBeNull();
    expect(document.body.textContent).not.toMatch(/Meridian|Vertex|MER-\d/);
  });

  it('offline/500 → honest couldn\'t-load state, never a fixture or sample pill', async () => {
    apiRequest.mockRejectedValue(new Error('network down'));
    mount();
    expect(await screen.findByText(/workspace could not be loaded/i)).toBeTruthy();
    expect(document.querySelector('.c2c-sample-tag')).toBeNull();
    expect(screen.queryByText(/Sample data/i)).toBeNull();
    expect(document.body.textContent).not.toMatch(/Meridian|Vertex|MER-\d/);
  });
});
