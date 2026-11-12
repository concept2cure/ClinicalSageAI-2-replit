// @vitest-environment jsdom
/**
 * The canvas runs its reports over the project its opener names (L189,
 * reporting review 2026-10-01).
 *
 * The overview named the lead as scope 'program' with a project id, and the
 * canvas sends the scope it is given, so every report was computed over the
 * report program group whose serial id equalled the project id: an unrelated
 * group, or nothing. The overview now says 'project'. The canvas passes it
 * through, and a pack tile whose type does not run at that scope says so
 * instead of offering a run the server refuses.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { InsightsCanvas } from '../surfaces/Insights';
// The catalog the overview answers with (the canvas holds no copy of its own).
import { CANVAS_REPORT_TYPES } from './_insights-catalog-fixture';
import type { OwnedSurfaceViewProps } from '../surfaceViews';

const ok = (obj: unknown) => ({ ok: true, status: 200, json: async () => obj }) as unknown as Response;
const overview = (segment: string) => ({
  data: {
    organizationId: 1, tier: 'enterprise', segments: [segment], reportTypes: CANVAS_REPORT_TYPES,
    leadProgram: {
      projectId: 12, code: 'ABC-101', label: 'ABC-101', filing: null, indication: null,
      readiness: 64, scope: 'project', scopeId: '12', agency: null, pdufa: null, criticalBlockerCount: 1,
    },
    portfolio: { programs: null },
  },
});

let segment = 'pharma';
beforeEach(() => {
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (_m: string, url: string) => (url.includes('/api/insights-canvas/overview') ? ok(overview(segment)) : ok({})));
});
afterEach(() => cleanup());

async function renderCanvas(seg: string) {
  segment = seg;
  render(<InsightsCanvas surface={{ id: 'insights', label: 'Insights' } as OwnedSurfaceViewProps['surface']} segment={seg} onNav={() => {}} />);
  await waitFor(() => expect(document.querySelector('[data-testid="rc-find-result"]')).not.toBeNull());
}

describe('Insights — reports run over the lead project', () => {
  it('sends the project scope and id the overview names', async () => {
    await renderCanvas('pharma');
    const composer = document.querySelector('[data-work-area="insights"] .rc-find input') as HTMLInputElement;
    fireEvent.change(composer, { target: { value: 'Generate the Executive Readiness Digest for ABC-101' } });
    fireEvent.keyDown(composer, { key: 'Enter' });
    await waitFor(() => expect(apiRequest.mock.calls.some(([m, u]) => m === 'POST' && u === '/api/report-os/runs')).toBe(true));
    const body = apiRequest.mock.calls.find(([m, u]) => m === 'POST' && u === '/api/report-os/runs')?.[2];
    expect(body).toMatchObject({ scopeType: 'project', scopeId: '12', reportTypeId: 'readiness.executive_digest' });
  });

  it('a pack tile whose type does not run over a project says so and offers no run', async () => {
    await renderCanvas('academic');
    fireEvent.click(document.querySelector('[data-work-area="insights"] .ph-acts .btn.primary') as HTMLElement);
    await waitFor(() => expect(document.querySelector('.ro-pack-grid')).not.toBeNull());
    expect(screen.getByText(/Runs over project group or account, not a single project\./)).toBeTruthy();
    const runnable = [...document.querySelectorAll('button.ro-pack-card')].map((b) => b.textContent ?? '');
    expect(runnable.some((t) => /scorecard/i.test(t))).toBe(false);
    expect(runnable.length).toBeGreaterThan(0);
  });
});

/* P-122: what was built is shown, not left behind a second tab. The landing offered one standard
   pack while the catalog held every report that can be run; it now says how many, and opens them. */
describe('Insights — the landing says how many reports can be run, and opens the catalog', () => {
  it('states the catalog’s own count for the project, with the door to it', async () => {
    await renderCanvas('pharma');
    const line = document.querySelector('[data-testid="ro-runnable-count"]') as HTMLElement;
    expect(line, 'the landing names the runnable reports').toBeTruthy();
    const said = line.textContent?.match(/^(\d+) reports can be run one at a time for ABC-101\./);
    expect(said, line.textContent ?? '').toBeTruthy();
    fireEvent.click(within(line).getByRole('button', { name: 'Open the catalog' }));
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Catalog' }).getAttribute('aria-selected')).toBe('true'));
    // The same number the catalog states over its own cards: one count, not two.
    expect(screen.getByText(/can be run now/).textContent).toContain(`${said![1]} can be run now`);
  });
});
