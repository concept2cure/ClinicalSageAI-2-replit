// @vitest-environment jsdom
/**
 * Readiness on the Insights canvas is the evaluated figure, or it says it was
 * not computed.
 *
 * Reporting review 2026-10-01: the canvas's readiness was the run's confidence,
 * a blocker count clamped to [25, 95]. A program with nothing in it read
 * "25% ready" on the opener, and the portfolio board drew it as a ring, with
 * a 0 ring for anything missing and an average tinted success. The server now
 * sends the evaluated readiness or null. These cases pin what the canvas does
 * with a null.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

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

const program = (code: string, readiness: number | null) => ({
  projectId: code.length, code, label: code, indication: null, readiness, confidence: 60,
  status: 'partial', riskLevel: 'medium', criticalBlockerCount: 0, pdufa: null,
});

function overview(leadReadiness: number | null, leadCriticalBlockers = 0) {
  return {
    data: {
      organizationId: 1,
      tier: 'enterprise',
      segments: ['biotech'],
      leadProgram: {
        projectId: 1, code: 'BX204', label: 'BX204', filing: null, indication: null,
        readiness: leadReadiness, scope: 'program', scopeId: '1', agency: null, pdufa: null,
        criticalBlockerCount: leadCriticalBlockers,
      },
      // As the overview sends it to an entitled organisation (insights-canvas-routes.ts).
      portfolio: { entitled: true, requiredTier: 'enterprise', summary: null, programs: [program('BX204', 80), program('ZX9', null)] },
    },
  };
}

let lead: number | null = null;
let leadCriticalBlockers = 0;
beforeEach(() => {
  lead = null;
  leadCriticalBlockers = 0;
  apiRequest.mockReset();
  apiRequest.mockImplementation((_m: string, url: string) =>
    url.includes('/api/insights-canvas/overview') ? ok(overview(lead, leadCriticalBlockers)) : ok({}),
  );
});
afterEach(() => cleanup());

async function renderCanvas() {
  render(<InsightsCanvas {...PROPS} />);
  await waitFor(() => expect(document.querySelector('.rc-ana-head')).not.toBeNull());
}

describe('Insights — readiness that was not computed', () => {
  it('says so in the opener instead of printing a percentage', async () => {
    await renderCanvas();
    const opener = document.querySelector('.rc-opener')?.textContent ?? '';
    expect(opener).toMatch(/readiness is not yet computed/);
    expect(opener).not.toMatch(/% ready/);
  });

  it('draws no ring for a program without a readiness, and averages only the computed ones', async () => {
    await renderCanvas();
    const composer = document.querySelector('.rc-input textarea') as HTMLTextAreaElement;
    fireEvent.change(composer, { target: { value: 'portfolio board view across all programs' } });
    fireEvent.keyDown(composer, { key: 'Enter' });
    await screen.findByText(/Portfolio — board view/);
    expect(screen.getByText('Readiness not computed')).toBeTruthy();
    const meta = document.querySelector('.ro-dash-head .ro-rep-meta')?.textContent ?? '';
    expect(meta).toMatch(/avg readiness 80%/);
    expect(meta).toMatch(/1 not computed/);
  });
});

/* HS-1008-1, honest-state review 2026-10-08.
   `evaluateReadiness` scores section completion alone when the filing type has
   no resolved required-artifact matrix — most of the application registry —
   and raises a `critical` gap saying so. The run reaches this canvas as
   readiness 100 with criticalBlockerCount 1 and status 'missing', and the
   opener read "BX204 is 100% ready". The count was fetched, typed and copied
   into ProgramCtx, and never rendered anywhere on the surface.

   This is the refuse-to-accept trap stated as reassurance: a sponsor who
   believes the dossier is complete because the canvas said 100% files, and is
   refused on a requirement the tool never claimed to have checked. */
describe('Insights — a readiness figure carrying outstanding critical gaps', () => {
  beforeEach(() => {
    lead = 100;
    leadCriticalBlockers = 1;
  });

  it('does not call the program ready, and states the gap count instead', async () => {
    await renderCanvas();
    const opener = document.querySelector('.rc-opener')?.textContent ?? '';
    expect(opener).toMatch(/100%/);
    expect(opener).toMatch(/1 critical gap outstanding/);
    expect(opener).not.toMatch(/100% ready/);
    expect(opener).not.toMatch(/\bis ready\b/);
  });

  it('qualifies the figure on the regional comparison line too', async () => {
    await renderCanvas();
    const composer = document.querySelector('.rc-input textarea') as HTMLTextAreaElement;
    fireEvent.change(composer, { target: { value: 'compare FDA and EMA markets for harmonization' } });
    fireEvent.keyDown(composer, { key: 'Enter' });
    await waitFor(() => expect(document.querySelector('.ro-dash-progline')).not.toBeNull());
    const line = document.querySelector('.ro-dash-progline')?.textContent ?? '';
    expect(line).toMatch(/100%/);
    expect(line).toMatch(/1 critical gap outstanding/);
  });
});
