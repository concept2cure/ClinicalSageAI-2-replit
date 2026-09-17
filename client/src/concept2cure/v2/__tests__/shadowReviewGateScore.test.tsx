// @vitest-environment jsdom
/**
 * WO-16C finding 99 — the v2 "Shadow review" surface painted a Refuse-to-File
 * percentage that no shadow-review run ever recorded.
 *
 * ── The defect ───────────────────────────────────────────────────────────────
 * `runShadowReview` persists, per run, the gate scores it actually produced:
 *
 *     rtfRiskScore = Math.max(clamp01(model.rtfRiskScore, agg.rtf), agg.rtf)
 *
 * i.e. the reviewer model's own self-reported risk, floored by a deterministic
 * aggregate over the findings. That number is the run's recorded verdict, and
 * it is what SubmissionCenter → sequence → Shadow review prints to two
 * decimals (SubmissionSeqWorkspaces.tsx).
 *
 * The v2 surface never saw it. `GET /api/shadow-review` returned only
 * `{ lens, findings[] }` (shadow-review-view-assembler), and ShadowReview.tsx
 * re-derived the gates client-side from the findings list alone, through
 * `shadowAggregateRisk` — a self-described VERBATIM copy of the server's
 * `aggregateRisk` living in fixtures/shadow-review-data.ts.
 *
 * `aggregateRisk` returns 0 for a gate with NO findings in its dimensions. On
 * the server that 0 is only a floor. On this surface it was the answer. So a
 * complete run whose reviewer raised only CRL findings — including the case the
 * prompt mandates, an empty leaf set scored near 1.0 with no findings at all —
 * rendered "0%", an empty fill bar and "low risk" on the "Refuse-to-File (RTF)"
 * card, and a lead reading "RTF risk 0% … This is a clean simulated review",
 * while the same run's stored score could be 0.90. One customer, two screens,
 * two contradictory Refuse-to-File verdicts.
 *
 * ── How the failure is injected ──────────────────────────────────────────────
 * At the DEPENDENCY: `apiRequest` is stubbed so `GET /api/shadow-review`
 * answers with a real-shaped payload for a COMPLETE run. Nothing in the surface
 * is mocked — the component, its `useLiveRows` read, its risk rendering and its
 * surface-context publication all run for real over that response.
 *
 * Case 1 is the divergence: a run that recorded rtfRiskScore 0.9 with only a
 * CRL finding. Pre-fix the RTF card read "0%"/"low risk"; it must read the
 * recorded 90%.
 *
 * Case 2 is the third state: a complete run with NO recorded gate score
 * (rtf_risk_score IS NULL). A percentage nothing computed must not be emitted —
 * the card says so and AnA is told the score is absent, in the house
 * vocabulary (server/lib/verification-outcome.ts: a value that was not produced
 * is never rendered as a zero).
 *
 * Case 3 guards against over-correction: a lens that has NOT been run keeps its
 * existing honest empty state, and a run that genuinely recorded 0 still shows
 * 0% — "not scored" is a third state, not a replacement for a real zero.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { useActiveSurfaceContext, type SurfaceContext } from '../surfaceContext';
import type { SurfaceViewProps } from '../surfaceViews';
import { ShadowReview } from '../surfaces/ShadowReview';

function res(payload: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => payload } as Response;
}

const props = () => ({
  surface: { id: 'shadow-review', label: 'Shadow review' } as unknown as SurfaceViewProps['surface'],
  onAsk: vi.fn(),
  onNav: vi.fn(),
  segment: 'biopharma',
});

let seen: SurfaceContext | null = null;
function Probe() {
  seen = useActiveSurfaceContext('shadow-review');
  return null;
}

/**
 * A CRL-dimension finding, complete rather than minimal: the surface renders
 * the row itself, so a partial fixture would measure the fixture.
 */
const CRL_FINDING = {
  dimension: 'crl',
  severity: 'major',
  title: 'Single pivotal trial without confirmatory support',
  detail: 'Efficacy rests on one pivotal study (BX204-301).',
  basis: 'FDA 1998 guidance; 21 CFR 314.126.',
  recommendation: 'Pre-empt in §2.5.4.',
  leafRef: '2.5.4',
};

/** One lens row exactly as the real-store assembler returns it. */
function lensRow(over: Record<string, unknown> = {}) {
  return {
    lens: 'fda_filing',
    runId: 12,
    rtfRiskScore: 0.9,
    crlRiskScore: 0.55,
    findings: [CRL_FINDING],
    ...over,
  };
}

function renderSurface(rows: unknown[]) {
  apiRequest.mockImplementation(async (_m: string, url: string) => {
    if (String(url).startsWith('/api/shadow-review')) {
      return res({ data: rows, meta: { count: rows.length, source: 'shadow_review_runs' } });
    }
    return res({ data: [] });
  });
  return render(
    <>
      <ShadowReview {...props()} />
      <Probe />
    </>,
  );
}

/** The gate card whose name matches — the surface renders one per gate. */
function gateCard(container: HTMLElement, name: string): HTMLElement {
  const cards = Array.from(container.querySelectorAll('.sr-gate')) as HTMLElement[];
  const hit = cards.find((c) => c.querySelector('.sr-gate-name')?.textContent?.includes(name));
  if (!hit) throw new Error(`no gate card named "${name}" (found: ${cards.map((c) => c.querySelector('.sr-gate-name')?.textContent).join(' | ')})`);
  return hit;
}

beforeEach(() => {
  apiRequest.mockReset();
  seen = null;
});
afterEach(cleanup);

describe('ShadowReview — the RTF gate shows the run\'s recorded score', () => {
  it('renders the persisted rtfRiskScore, not a findings-only recomputation', async () => {
    const { container } = renderSurface([lensRow()]);
    await waitFor(() => expect(container.querySelectorAll('.sr-gate').length).toBe(2));

    const rtf = gateCard(container, 'Refuse-to-File (RTF)');
    expect(rtf.querySelector('.sr-gate-pct')?.textContent).toBe('90%');
    expect(rtf.textContent).not.toMatch(/\b0%/);
    expect(rtf.querySelector('.sr-gate-word')?.textContent).not.toMatch(/low/i);

    const crl = gateCard(container, 'Complete Response Letter (CRL)');
    expect(crl.querySelector('.sr-gate-pct')?.textContent).toBe('55%');
  });

  it('publishes the recorded score to AnA, not the recomputed 0', async () => {
    renderSurface([lensRow()]);
    await waitFor(() => expect(seen?.facts?.lensHasRun).toBe(true));
    expect(seen?.facts?.refuseToFileRisk).toBe(0.9);
    expect(seen?.facts?.completeResponseRisk).toBe(0.55);
    expect(seen?.summary ?? '').not.toMatch(/Refuse-to-file risk 0[,.\s]/i);
  });

  it('the lead sentence quotes the recorded score', async () => {
    const { container } = renderSurface([lensRow()]);
    await waitFor(() => expect(container.querySelector('.sr-lead-h')).toBeTruthy());
    const lead = container.querySelector('.sr-lead-h')?.textContent ?? '';
    expect(lead).toMatch(/RTF risk 90%/);
    expect(lead).not.toMatch(/RTF risk 0%/);
  });
});

describe('ShadowReview — a run with no recorded gate score says so', () => {
  it('renders the third state instead of 0% / low risk', async () => {
    const { container } = renderSurface([
      lensRow({ rtfRiskScore: null, crlRiskScore: null, findings: [] }),
    ]);
    await waitFor(() => expect(container.querySelectorAll('.sr-gate').length).toBe(2));

    const rtf = gateCard(container, 'Refuse-to-File (RTF)');
    expect(rtf.querySelector('.sr-gate-pct')?.textContent).not.toMatch(/%/);
    expect(rtf.querySelector('.sr-gate-word')?.textContent).toMatch(/not scored/i);
    expect(rtf.querySelector('.sr-gate-word')?.textContent).not.toMatch(/low risk/i);
    // The bar must not be painted as an assessed zero.
    expect(rtf.querySelector('.sr-gate-fill')).toBeNull();
  });

  it('does not call an unscored run a clean simulated review', async () => {
    const { container } = renderSurface([
      lensRow({ rtfRiskScore: null, crlRiskScore: null, findings: [] }),
    ]);
    await waitFor(() => expect(container.querySelector('.sr-lead-h')).toBeTruthy());
    const lead = container.querySelector('.sr-lead')?.textContent ?? '';
    expect(lead).not.toMatch(/RTF risk 0%/);
    expect(lead).not.toMatch(/clean simulated review/i);
  });

  it('tells AnA the score is absent rather than zero', async () => {
    renderSurface([lensRow({ rtfRiskScore: null, crlRiskScore: null, findings: [] })]);
    await waitFor(() => expect(seen?.facts?.lensHasRun).toBe(true));
    expect(seen?.facts?.refuseToFileRisk).toBeNull();
    expect(seen?.facts?.completeResponseRisk).toBeNull();
    expect(String(seen?.summary ?? '')).toMatch(/no .*score|not scored/i);
  });
});

describe('ShadowReview — the states that were already honest stay honest', () => {
  it('a recorded 0 is still shown as 0% (a real zero is not the third state)', async () => {
    const { container } = renderSurface([
      lensRow({ rtfRiskScore: 0, crlRiskScore: 0, findings: [] }),
    ]);
    await waitFor(() => expect(container.querySelectorAll('.sr-gate').length).toBe(2));
    const rtf = gateCard(container, 'Refuse-to-File (RTF)');
    expect(rtf.querySelector('.sr-gate-pct')?.textContent).toBe('0%');
    expect(rtf.querySelector('.sr-gate-word')?.textContent).toMatch(/low risk/i);
  });

  it('a lens that has not been run still refuses to score it', async () => {
    // Only ema_d120 has a row; the surface opens on fda_filing.
    const { container, getByText } = renderSurface([lensRow({ lens: 'ema_d120' })]);
    await waitFor(() => getByText(/hasn't been run yet/i));
    expect(container.querySelectorAll('.sr-gate').length).toBe(0);
    expect(seen?.facts?.lensHasRun).toBe(false);
    expect(seen?.facts?.refuseToFileRisk).toBeUndefined();
  });
});
