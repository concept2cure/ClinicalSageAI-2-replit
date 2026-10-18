// @vitest-environment jsdom
/**
 * IndLifecycle — the 30-day clock card speaks on the basis the SERVER states.
 *
 * What the code used to do (until 2026-10-15): the server's clock engine said
 * "safe to proceed" over any date it was given, so this screen hard-coded
 * `clockFromReceipt = false` and ignored the server's safeToProceed / onHold.
 * The engine now answers honestly — it says whether its date is FDA's recorded
 * receipt (`basis`), and returns null for a clearance or hold verdict it could
 * not assess — so the workaround is gone, and two things follow:
 *   - the engine's honest answer for a target date (basis 'projection',
 *     safeToProceed null, onHold null) must render as a projection; the old
 *     screen rejected nulls as "unexpected response" and showed no clock;
 *   - over a recorded receipt (basis 'fda_receipt') the screen shows the
 *     engine's own status and sentence instead of overriding them.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { useActiveSurfaceContext, type SurfaceContext } from '../surfaceContext';
import { IndLifecycle } from '../surfaces/IndLifecycle';

let seen: SurfaceContext | null = null;
function Probe() {
  seen = useActiveSurfaceContext('ind-checklist');
  return null;
}

const TARGET = '2026-10-01T00:00:00.000Z';
const CHECKLIST = {
  submissionId: 31,
  code: 'ZX-9',
  drugName: 'Zexanib',
  productName: 'ZX-9 First-in-Human',
  indication: null,
  sponsorName: 'Acme Bio',
  submissionType: 'IND',
  targetReceiptDate: TARGET,
  forms: [],
  sections: [],
};

let clockBody: unknown = null;
function mockApi() {
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (method === 'GET' && url === '/api/ind-checklist') {
      return { ok: true, status: 200, json: async () => ({ data: [CHECKLIST], meta: { count: 1 } }) } as Response;
    }
    if (method === 'POST' && url === '/api/ind-lifecycle/clock') {
      return { ok: true, status: 200, json: async () => clockBody } as Response;
    }
    return { ok: true, status: 200, json: async () => ({}) } as Response;
  });
}

const props = () => ({ onAsk: vi.fn(), onNav: vi.fn() }) as any;

afterEach(cleanup);
beforeEach(() => {
  apiRequest.mockReset();
  seen = null;
});

describe('IndLifecycle — the clock renders the server engine\'s stated basis', () => {
  it('the engine\'s honest projection (nulls for what it could not assess) renders as a projection, not a failure', async () => {
    clockBody = {
      status: 'projected',
      basis: 'projection',
      holdHistoryAssessed: false,
      thirtyDayDate: '2026-10-31T00:00:00.000Z',
      safeToProceed: null,
      onHold: null,
      daysUntilThirtyDay: 16,
      rationale: 'FDA receipt of the IND is not recorded, so the 21 CFR 312.40(b) 30-day period cannot be shown to have started.',
    };
    mockApi();
    render(<><IndLifecycle {...props()} /><Probe /></>);

    expect(await screen.findByText('Projected from target date')).toBeTruthy();
    expect(screen.getByText('16')).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/could not be computed/);
    await waitFor(() => expect((seen as any)?.facts?.thirtyDayClock).toBeTruthy());
    expect((seen as any).facts.thirtyDayClock.basis).toBe('projection-from-target-submission-date');
    expect((seen as any).facts.thirtyDayClock.safeToProceed).toBeNull();
  });

  it('over a recorded FDA receipt the screen shows the engine\'s own status and sentence', async () => {
    clockBody = {
      status: 'submitted',
      basis: 'fda_receipt',
      holdHistoryAssessed: true,
      thirtyDayDate: '2026-10-31T00:00:00.000Z',
      safeToProceed: false,
      onHold: false,
      daysUntilThirtyDay: 16,
      rationale: 'Within the 30-day FDA review period; 16 calendar day(s) remain before the investigation may begin absent a hold.',
    };
    mockApi();
    render(<><IndLifecycle {...props()} /><Probe /></>);

    expect(await screen.findByText('In 30-day review')).toBeTruthy();
    expect(screen.queryByText('Projected from target date')).toBeNull();
    expect(document.body.textContent).toContain('16 calendar day(s) remain before the investigation may begin absent a hold.');
    await waitFor(() => expect((seen as any)?.facts?.thirtyDayClock).toBeTruthy());
    expect((seen as any).facts.thirtyDayClock.basis).toBe('fda-receipt');
    expect((seen as any).facts.thirtyDayClock.safeToProceed).toBe(false);
  });
});
