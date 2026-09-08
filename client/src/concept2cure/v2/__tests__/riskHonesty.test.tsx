// @vitest-environment jsdom
/**
 * The ISO 14971 surface may not clear a risk file nobody has evaluated, and may
 * not conclude benefit-risk at all.
 *
 * ── Finding 1 — clearance selected by two empty filters ──────────────────────
 * The lead's third branch was reached by `highResidual === 0 && open === 0`,
 * both of which are `rows.filter(...).length`:
 *
 *   summary.highResidual = rows.filter(r => residualProduct(r) >= 15).length
 *   summary.open         = rows.filter(r => status is open|mitigating).length
 *
 * and said:
 *
 *   "All N hazards are controlled to an acceptable residual risk.
 *    The benefit-risk conclusion can proceed."
 *
 * Neither filter has anything to do with whether residual risk was EVALUATED.
 * A register of hazards somebody recorded and nobody has assessed — status
 * `verified`, `acceptable` NULL, every severity x probability under 15, no
 * residual probability recorded — matches both filters vacuously and took that
 * branch. Zero of those hazards carried a residual-risk determination, and the
 * surface reported all of them as controlled to an acceptable level.
 *
 * ── Finding 2 — a determination the surface is not entitled to make ──────────
 * The band under the matrix read `Benefit-risk: {highResidual ? 'gated' :
 * 'favorable'}`. Under ISO 14971 the overall benefit-risk conclusion is a
 * documented manufacturer decision recorded in the risk management file. It is
 * not a consequence of one count reaching zero, and no screen makes it by
 * arithmetic. "favorable" is now unreachable in every state; the surface
 * reports the counts its analysis found and stops there.
 *
 * ── What `assessmentRan` is here (assessmentState.ts) ────────────────────────
 * Positive evidence that residual-risk evaluation happened: at least one hazard
 * carries a determination a human recorded — the server's authoritative
 * `acceptable` boolean, or the accepted status. A non-zero count of recorded
 * evaluations, never the absence of findings. So:
 *
 *   3 hazards, acceptable NULL     → NOT CLEAR (the register is unexamined)
 *   3 hazards, acceptable true     → CLEAR     (three recorded acceptances)
 *
 * The second case is the over-correction guard: a surface that could never
 * reach the clear headline would be the same defect inverted, and the clean
 * residual-risk picture is the outcome this screen exists to show.
 *
 * ── What was observed against the pre-fix surface ────────────────────────────
 * Four of the six cases below go red on the original code — the two findings
 * above, the "no controls yet" claim, and the over-correction guard. The
 * remaining two, the failed read and the empty register, PASS on the original:
 * that surface already returned its honest loading / couldn't-load / no-hazards
 * panels before any narrative rendered, and those two cases pin that behaviour
 * against the fix rather than proving a defect.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { Risk } from '../surfaces/Risk';

/**
 * A real `risk_items` row. severity 3 x probability 3 = 9, and with no residual
 * probability recorded the residual product is the same 9 — under the 15
 * threshold, so the "high residual" filter is empty. Complete rather than
 * minimal: mapRiskItems fails the whole batch on a row missing the signature,
 * and a half-mapped fixture would make these tests measure the fixture.
 */
const row = (n: number, over: Record<string, unknown> = {}) => ({
  id: n,
  ref_code: 'HZ-0' + n,
  hazard: 'Inaccurate glucose reading ' + n,
  hazardous_situation: 'Sensor drifts during a 14-day wear period',
  harm: 'Mis-dosing of insulin',
  sequence_of_events: 'Drift — undetected reading — dose calculated from it',
  severity: 3,
  probability: 3,
  detectability: 3,
  residual_probability: null,
  control_strategy: 'design_reduce',
  source: 'fmea',
  /* Not open, not mitigating: the "open evaluations" filter is empty too. */
  status: 'verified',
  /* The whole point — residual acceptability was never determined. */
  acceptable: null,
  ...over,
});

/** The same hazard with a residual-risk acceptance a human recorded. */
const accepted = (n: number) =>
  row(n, { status: 'accepted', acceptable: true, residual_probability: 2 });

function respondWith(rows: unknown[]) {
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (String(method) === 'GET' && String(url) === '/api/mdx/risk-items') {
      return { ok: true, status: 200, json: async () => ({ success: true, data: rows }) };
    }
    return { ok: true, status: 200, json: async () => ({ success: true, data: null }) };
  });
}

function respondWithFailure() {
  apiRequest.mockImplementation(async (_m: string, url: string) => {
    if (String(url) === '/api/mdx/risk-items') {
      return { ok: false, status: 500, json: async () => ({ error: 'INTERNAL' }) };
    }
    return { ok: true, status: 200, json: async () => ({ success: true, data: null }) };
  });
}

function mount() {
  render(<Risk {...({ surface: { id: 'risk' }, onAsk: vi.fn(), onNav: vi.fn() } as any)} />);
}

const text = () => document.body.textContent ?? '';
/** The lead's own primary action, distinct from the band CTA below the matrix. */
const leadAction = () => document.querySelector('.al-lead .al-btn')?.textContent ?? '';

beforeEach(() => apiRequest.mockReset());
afterEach(() => cleanup());

describe('Risk (ISO 14971) — an unexamined register is not a controlled one', () => {
  it('does not report hazards as controlled when no residual risk has been evaluated', async () => {
    respondWith([row(1), row(2), row(3)]);
    mount();

    await waitFor(() => expect(text()).toMatch(/Inaccurate glucose reading 1/));

    // The sentence the finding named, and the determination attached to it.
    expect(
      /controlled to an acceptable residual risk/i.test(text()),
      'must not report unevaluated hazards as controlled to an acceptable residual risk',
    ).toBe(false);
    expect(
      /benefit-risk conclusion can proceed/i.test(text()),
      'must not conclude that benefit-risk can proceed',
    ).toBe(false);

    // And it must say what is actually true of these three rows.
    expect(text()).toMatch(/no recorded residual-risk acceptance/i);
    // The next step it offers is the first hazard without a determination, not
    // the RMF conclusion it used to offer over exactly this register.
    expect(leadAction()).toMatch(/Open the HZ-01 evaluation/i);
  });

  it('never renders a benefit-risk determination, in any state', async () => {
    respondWith([row(1), row(2), row(3)]);
    mount();
    // The page subtitle names benefit-risk as one of this surface's subjects,
    // so the wait is on a row: "Benefit-risk:" with the colon is the band.
    await waitFor(() => expect(text()).toMatch(/Inaccurate glucose reading 1/));

    expect(/favorable/i.test(text()), 'benefit-risk is not concluded by a count of zero').toBe(false);
    expect(text()).toMatch(/Benefit-risk: not concluded here/i);
    expect(text()).toMatch(/documented manufacturer decision/i);
    // The citation is reported unchanged, not rewritten.
    expect(text()).toMatch(/ISO 14971 section 8/);
  });

  it('does not claim a hazard has no risk controls when it never read them', async () => {
    // The hazard-register read carries no control lists at all, so the previous
    // copy — "No controls yet — add the first risk control." — was rendered
    // against every server-read hazard regardless of what it carries.
    respondWith([row(1)]);
    mount();
    await waitFor(() => expect(text()).toMatch(/Inaccurate glucose reading 1/));

    expect(
      /No controls yet/i.test(text()),
      'must not assert an absence of risk controls it never read',
    ).toBe(false);
    expect(text()).toMatch(/not a record that none exist/i);
    // Same class, same read: verification evidence is not carried either.
    expect(text()).toMatch(/Not read on this screen/i);
  });

  it('says nothing about residual risk when the read failed', async () => {
    respondWithFailure();
    mount();
    await waitFor(() => expect(text()).toMatch(/Couldn't load the risk file/i));

    expect(/acceptable residual risk/i.test(text()), 'a failed read is not an empty register').toBe(false);
    expect(/favorable/i.test(text())).toBe(false);
    expect(/Benefit-risk:/i.test(text()), 'the benefit-risk band may not speak over a failed read').toBe(false);
  });

  it('says nothing about residual risk over an empty register', async () => {
    respondWith([]);
    mount();
    await waitFor(() => expect(text()).toMatch(/No hazards in the risk file yet/i));

    expect(/acceptable residual risk/i.test(text()), 'an empty register is unexamined, not clear').toBe(false);
    expect(/Benefit-risk:/i.test(text()), 'the benefit-risk band may not speak over an empty register').toBe(false);
  });

  /**
   * ── The over-correction guard ────────────────────────────────────────────
   * Every case above would also pass if the surface had simply stopped saying
   * anything reassuring, which would destroy the outcome this screen exists to
   * report. Given three hazards each carrying a residual-risk acceptance a
   * human recorded, the clear headline must still be reached — and the offer to
   * draft the RMF conclusion, withheld above, must come back.
   */
  it('still reports a clean residual-risk picture when every hazard carries a recorded acceptance', async () => {
    respondWith([accepted(1), accepted(2), accepted(3)]);
    mount();

    await waitFor(() => expect(text()).toMatch(/Inaccurate glucose reading 1/));

    expect(text()).toMatch(/All 3 hazards carry a recorded acceptable residual risk/i);
    expect(text()).toMatch(/none sit in the unacceptable band/i);
    // The earned next step, which the unevaluated register above does not get.
    // Read off the lead's own action button — the band below carries a
    // same-named CTA in every state, so a page-wide query would prove nothing.
    expect(leadAction()).toMatch(/Draft RMF conclusion/i);
    // Reassurance is still not a determination.
    expect(/favorable/i.test(text())).toBe(false);
    expect(/benefit-risk conclusion can proceed/i.test(text())).toBe(false);
  });
});
