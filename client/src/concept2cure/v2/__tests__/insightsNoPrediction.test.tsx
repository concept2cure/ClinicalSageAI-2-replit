// @vitest-environment jsdom
/**
 * The canvas offers no prediction it cannot make (reporting review 2026-10-01).
 *
 * "Predictive Regulatory Forecast" and "CRL / RTF Pre-Mortem" ran the generic
 * readiness run under a prediction's title, behind a Professional lock, and
 * the opener suggested "What is my CRL risk?". No prediction model ran. The
 * server now refuses a prediction type as a run; the canvas answers the
 * question with what the governed record holds and sends no run.
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

const ok = (obj: unknown) => ({ ok: true, status: 200, json: async () => obj }) as unknown as Response;
const overview = (segment: string) => ({
  data: {
    organizationId: 1, tier: 'enterprise', segments: [segment],
    leadProgram: {
      projectId: 1, code: 'BX204', label: 'BX204', filing: 'NDA', indication: null,
      readiness: 70, scope: 'project', scopeId: '1', agency: null, pdufa: null, criticalBlockerCount: 0,
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
  await waitFor(() => expect(document.querySelector('.rc-ana-head')).not.toBeNull());
}

function ask(text: string) {
  const composer = document.querySelector('.rc-input textarea') as HTMLTextAreaElement;
  fireEvent.change(composer, { target: { value: text } });
  fireEvent.keyDown(composer, { key: 'Enter' });
}

const runsSent = () => apiRequest.mock.calls.filter(([m, u]) => m === 'POST' && u === '/api/report-os/runs');

describe('Insights — no prediction it cannot make', () => {
  it.each(['What is my CRL risk?', 'Forecast the review trajectory for BX204', 'Predict the likelihood of approval'])(
    '"%s" is answered honestly and sends no run',
    async (question) => {
      await renderCanvas('pharma');
      ask(question);
      await screen.findByText(/Forecasts and CRL\/RTF pre-mortems are not part of this release/);
      expect(runsSent()).toHaveLength(0);
      expect(screen.getByRole('button', { name: 'Executive Readiness Digest' })).toBeTruthy();
    },
  );

  it.each(['pharma', 'biotech'])('the %s opener no longer suggests a CRL risk question', async (seg) => {
    await renderCanvas(seg);
    expect(document.querySelector('.rc-opener')?.textContent ?? '').not.toMatch(/CRL risk/);
  });

  it.each(['pharma', 'biotech'])('no %s standard pack offers a prediction tile', async (seg) => {
    await renderCanvas(seg);
    fireEvent.click(document.querySelector('.rc-preset-btn') as HTMLElement);
    await waitFor(() => expect(document.querySelector('.ro-pack-grid')).not.toBeNull());
    const grid = document.querySelector('.ro-pack-grid')?.textContent ?? '';
    expect(grid).not.toMatch(/Forecast|Pre-Mortem|Predictive/i);
  });
});
