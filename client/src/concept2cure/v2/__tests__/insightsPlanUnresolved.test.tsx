// @vitest-environment jsdom
/**
 * A plan the server could not read is not presented as the Standard plan.
 *
 * HS-1008-4, honest-state review 2026-10-08. `requireReportEntitlement` wraps
 * the capability lookup in `catch { tier = 'standard' }` and passed the
 * assumption on unflagged, so an enterprise customer whose lookup threw saw
 * "Plan: Standard", a wall of locked tiles, and nothing to say their plan had
 * not been read — they would reasonably conclude they were on the wrong plan.
 *
 * The locks stay: the gate fails closed on every paid feature, and that is
 * correct. What goes is the claim about which plan it is.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { InsightsCanvas } from '../surfaces/Insights';
import type { OwnedSurfaceViewProps } from '../surfaceViews';

const ok = (obj: unknown) => ({ ok: true, status: 200, json: async () => obj }) as Response;
const PROPS: OwnedSurfaceViewProps = {
  surface: { id: 'insights', label: 'Insights' } as OwnedSurfaceViewProps['surface'],
  segment: 'biotech',
  onNav: () => {},
};

/** The overview as the server sends it, with the tier-resolution flag. */
function overview(tierResolved: boolean | undefined) {
  return {
    data: {
      organizationId: 1,
      tier: 'standard',
      ...(tierResolved === undefined ? {} : { tierResolved }),
      segments: ['biotech'],
      leadProgram: {
        projectId: 1, code: 'BX204', label: 'BX204', filing: null, indication: null,
        readiness: 60, scope: 'program', scopeId: '1', agency: null, pdufa: null,
        criticalBlockerCount: 0,
      },
      portfolio: { entitled: false, requiredTier: 'enterprise', summary: null, programs: null },
    },
  };
}

let resolved: boolean | undefined = true;
beforeEach(() => {
  resolved = true;
  apiRequest.mockReset();
  apiRequest.mockImplementation((_m: string, url: string) =>
    url.includes('/api/insights-canvas/overview') ? ok(overview(resolved)) : ok({}),
  );
});
afterEach(() => cleanup());

async function renderCanvas() {
  render(<InsightsCanvas {...PROPS} />);
  await waitFor(() => expect(document.querySelector('.rc-ana-head')).not.toBeNull());
}

describe('Insights — a plan that could not be read', () => {
  it('says the plan could not be read, rather than naming one', async () => {
    resolved = false;
    await renderCanvas();
    const notice = document.querySelector('[data-testid="rc-tier-unresolved"]');
    expect(notice, 'a failed plan read was shown as a plan').not.toBeNull();
    expect(notice?.textContent).toMatch(/could not be read/);
    expect(notice?.textContent).toMatch(/not a statement about your plan/i);
  });

  it('control: says nothing extra when the plan was read', async () => {
    await renderCanvas();
    expect(document.querySelector('[data-testid="rc-tier-unresolved"]')).toBeNull();
  });

  /* A server that predates the flag sends no `tierResolved`. Absent is read as
     resolved: the flag only ever withdraws a claim, so its absence must not
     start making one. */
  it('treats an absent flag as resolved, so an older server loses nothing', async () => {
    resolved = undefined;
    await renderCanvas();
    expect(document.querySelector('[data-testid="rc-tier-unresolved"]')).toBeNull();
  });
});
