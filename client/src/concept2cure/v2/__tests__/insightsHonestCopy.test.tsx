// @vitest-environment jsdom
/**
 * What the Reporting canvas says about itself is true (reporting review
 * 2026-10-01: provenance PROVENANCE-6, honest state HONEST-STATE-8, design
 * DESIGN-4).
 *
 * - "Every value is provenance-linked" was said three times; no block of a
 *   canvas report carries a provenance ref and every seal recorded 0 atoms.
 * - The portfolio note credited AnA with ranking programs a server ranked.
 * - A plan preview looked exactly like the organisation's plan, and on a
 *   Standard org previewing Enterprise answered the portfolio question with
 *   "Your plan unlocks the portfolio rollup, but there are no governed
 *   programs": false twice.
 * - The run refusals spoke in the first person. insightsNotAna.test.tsx renders
 *   only the opener, so these paths were never asserted.
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
// The catalog the overview answers with (the canvas holds no copy of its own).
import { CANVAS_REPORT_TYPES } from './_insights-catalog-fixture';
import type { OwnedSurfaceViewProps } from '../surfaceViews';

const ok = (obj: unknown) => ({ ok: true, status: 200, json: async () => obj }) as unknown as Response;
const refusal = (status: number, payload: unknown) => Object.assign(new Error('refused'), { status, payload });
const PROGRAM = { projectId: 1, code: 'BX204', label: 'BX204', indication: null, readiness: 70, confidence: 60, status: 'partial', riskLevel: 'medium', criticalBlockerCount: 0, pdufa: null };

function overview(tier: string, entitled: boolean) {
  return {
    data: {
      organizationId: 1, tier, segments: ['biotech'], reportTypes: CANVAS_REPORT_TYPES,
      leadProgram: { ...PROGRAM, filing: null, scope: 'project', scopeId: '1', agency: null },
      portfolio: { entitled, requiredTier: 'enterprise', summary: null, programs: entitled ? [PROGRAM, { ...PROGRAM, projectId: 2, code: 'ZX9' }] : null },
    },
  };
}

let current = overview('standard', false);
let runsRefusal: Error | null = null;
beforeEach(() => {
  current = overview('standard', false);
  runsRefusal = null;
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (url.includes('/api/insights-canvas/overview')) return ok(current);
    if (method === 'POST' && url === '/api/report-os/runs' && runsRefusal) throw runsRefusal;
    return ok({});
  });
});
afterEach(() => cleanup());

async function renderCanvas() {
  render(<InsightsCanvas surface={{ id: 'insights', label: 'Insights' } as OwnedSurfaceViewProps['surface']} segment="biotech" onNav={() => {}} />);
  await waitFor(() => expect(document.querySelector('.rc-ana-head')).not.toBeNull());
}

function ask(text: string) {
  const composer = document.querySelector('.rc-input textarea') as HTMLTextAreaElement;
  fireEvent.change(composer, { target: { value: text } });
  fireEvent.keyDown(composer, { key: 'Enter' });
}

const FIRST_PERSON = /\b(I|I'm|I'll|I won't|I can't)\b/;

describe('Insights — the canvas says what is true about itself', () => {
  it('claims no per-value provenance it does not carry', async () => {
    await renderCanvas();
    ask('Generate the Executive Readiness Digest for BX204');
    await screen.findByText(/Running the Executive Readiness Digest/);
    expect(document.body.textContent).not.toMatch(/provenance-linked/);
  });

  it('the portfolio board credits no one with ranking, and says the average is taken here', async () => {
    current = overview('enterprise', true);
    await renderCanvas();
    ask('Compare readiness across all my programs');
    await screen.findByText(/Portfolio — board view/);
    const note = document.querySelector('.ro-dash .ro-dash-note')?.textContent ?? '';
    expect(note).not.toMatch(/\bAnA\b/);
    expect(note).toMatch(/in the order the server ranked them/);
    expect(note).toMatch(/average is taken here/);
  });

  it('a preview says it is one, names the real plan, and does not answer as if the org had it', async () => {
    await renderCanvas();
    expect(screen.queryByTestId('rc-tier-preview')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Enterprise' }));
    expect(screen.getByTestId('rc-tier-preview').textContent).toMatch(/Previewing Enterprise\. Your organization's plan is Standard\./);
    expect(screen.getByRole('button', { name: 'Enterprise' }).getAttribute('aria-pressed')).toBe('true');

    ask('Compare readiness across all my programs');
    await screen.findByText(/"Portfolio readiness rollup" needs the Enterprise plan/);
    expect(document.body.textContent).not.toMatch(/Your plan unlocks the portfolio rollup/);

    fireEvent.click(screen.getByRole('button', { name: 'Back to Standard' }));
    expect(screen.queryByTestId('rc-tier-preview')).toBeNull();
  });

  it.each([
    ['a plan refusal', refusal(403, { error: 'This report requires the enterprise plan.', requiredTier: 'enterprise' }), /needs a higher plan/],
    ['an unregistered type', refusal(404, { error: 'Report type not found' }), /isn't in your governed report registry/],
  ])('%s is said without a first person', async (_label, err, expected) => {
    runsRefusal = err;
    current = overview('enterprise', true);
    await renderCanvas();
    ask('Generate the Executive Readiness Digest for BX204');
    const msg = await screen.findByText(expected);
    expect(msg.textContent ?? '').not.toMatch(FIRST_PERSON);
  });
});
