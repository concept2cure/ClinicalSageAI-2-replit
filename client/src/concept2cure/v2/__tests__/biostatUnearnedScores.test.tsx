// @vitest-environment jsdom
/**
 * WO-16C finding 59 — three fixed constants in the Biostatistics judgment,
 * printed as computed "NN/100" assessment scores into a filed document.
 *
 * ── The defect ───────────────────────────────────────────────────────────────
 * `BiostatEngine.judge()` in client/src/concept2cure/v2/surfaces/Biostatistics.tsx
 * emitted three numbers that no computation produced:
 *
 *   1. an "Effect-size assumption" dimension pushed UNCONDITIONALLY as
 *      `{ verdict: 'marginal', score: 60 }` — no branch on any input; only its
 *      rationale string interpolated `input.effectSize`;
 *   2. an "Enrollment feasibility" score of `85 / 60 / 35`, a literal keyed to
 *      the N-band verdict, under a name claiming a feasibility assessment that
 *      no site-capacity or enrollment-rate data in this surface backs;
 *   3. a confidence score of exactly `86 / 64 / 42`, chosen by the overall
 *      verdict LABEL rather than derived from anything.
 *
 * All three are rendered into the Sample Size Rationale and the Statistical
 * Risk Memo — the documents this surface previews and files into the project
 * dossier through saveToAuthoring (POST /api/authoring/docs + /sections) — as
 * "| Effect-size assumption | marginal | 60/100 |" and
 * "- **Confidence Level**: moderate (64/100)".
 *
 * Because (1) was unconditional, the aggregate could never be 'adequate': the
 * 'adequate' / 'proceed' / 'low' / confidence-86 branches were dead code, and
 * every design ever generated read as "marginal / proceed_with_conditions /
 * moderate" no matter how well powered, small and robust it was.
 *
 * ── How the failure is injected ──────────────────────────────────────────────
 * There is no dependency to fail here — the defect is hard-coded constants in a
 * pure function, so the input IS the injection. Each case below hands
 * `BiostatEngine.judge()` a real design and asserts on what it returns, and the
 * last case drives the real surface and reads the real rendered document.
 *
 * The fully-adequate design (case 2) is the sharpest: 80.1% achieved power
 * against an 80% target and 140 subjects after attrition. Nothing about it is
 * marginal, and the pre-fix engine called it marginal anyway.
 *
 * RED on the pre-fix head: the effect-size row is `marginal` / `60`, the
 * fully-adequate design returns 'marginal' / 'proceed_with_conditions' /
 * 'moderate', two designs with different power and assumption profiles get the
 * same confidence score, and the rendered Risk Memo contains "60/100".
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, cleanup, fireEvent, screen } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { BiostatEngine, Biostatistics } from '../surfaces/Biostatistics';

const Surface = Biostatistics as unknown as React.ComponentType<Record<string, unknown>>;

/* Loosely typed: BiostatInput is module-local to the surface. These are real
   designs a user can build from the surface's own controls. */
type Design = Record<string, unknown>;

/** Well powered (80.1% achieved vs an 80% target) and small (140 after 10%
 *  attrition) — nothing in it is marginal on any dimension the engine can
 *  actually assess. */
const ADEQUATE: Design = {
  clientTrack: 'biotech_pharma', regulatoryBody: 'FDA', studyType: 'superiority',
  objectiveType: 'efficacy', endpointType: 'continuous',
  alpha: 0.05, powerTarget: 0.80, effectSize: 0.5, variance: 1,
  attritionRate: 0.10, allocationRatio: 1, numberOfGroups: 2,
};

/** Same overall verdict as ADEQUATE (power meets its own target, N small), but
 *  a materially weaker evidence profile: the target itself is 70%. */
const WEAK_TARGET: Design = {
  clientTrack: 'biotech_pharma', regulatoryBody: 'FDA', studyType: 'superiority',
  objectiveType: 'efficacy', endpointType: 'binary',
  alpha: 0.05, powerTarget: 0.70, effectSize: 0.15, controlRate: 0.30, treatmentRate: 0.45,
  attritionRate: 0.10, allocationRatio: 1, numberOfGroups: 2,
};

/** A large, unmistakably infeasible-band design. */
const LARGE: Design = {
  clientTrack: 'biotech_pharma', regulatoryBody: 'FDA', studyType: 'superiority',
  objectiveType: 'efficacy', endpointType: 'continuous',
  alpha: 0.05, powerTarget: 0.90, effectSize: 0.12, variance: 1,
  attritionRate: 0.20, allocationRatio: 1, numberOfGroups: 2,
};

const judgeOf = (d: Design) => {
  const res = (BiostatEngine as any).compute(d);
  return { res, jud: (BiostatEngine as any).judge(d, res) };
};
const dimNamed = (jud: any, re: RegExp) =>
  jud.dimensions.find((x: any) => re.test(String(x.name)));

afterEach(() => cleanup());
beforeEach(() => {
  apiRequest.mockReset();
  apiRequest.mockImplementation(async () => ({ ok: true, status: 200, json: async () => ({ data: [] }) }));
});

describe('Biostatistics judgment — no assessment score without an assessment', () => {
  it('does not emit a verdict and a score for the effect-size assumption it never assessed', () => {
    const a = judgeOf(ADEQUATE).jud;
    const b = judgeOf(LARGE).jud;

    for (const jud of [a, b]) {
      const dim = dimNamed(jud, /effect-size/i);
      expect(dim, 'the effect-size dimension disappeared entirely').toBeTruthy();
      // The third state: nothing in this surface carries prior evidence about
      // the assumed effect, so its plausibility is NOT ASSESSED — not scored
      // 60/100, and not silently dropped either.
      expect(dim.verdict).toBe('not_assessed');
      expect(dim.score, 'a dimension nothing assessed must carry no score').toBeNull();
      expect(String(dim.rationale)).toMatch(/not assessed/i);
    }
  });

  it('lets a fully adequate design read as adequate', () => {
    const { res, jud } = judgeOf(ADEQUATE);

    // Guard the premise, so a later change to the sizing math cannot turn this
    // case into a pass for the wrong reason.
    expect(res.power).toBeGreaterThanOrEqual(0.795);
    expect(res.adjustedTotal).toBeLessThanOrEqual(300);

    expect(jud.overallVerdict).toBe('adequate');
    expect(jud.actionRecommendation).toBe('proceed');
    expect(jud.overallRisk).toBe('low');
  });

  it('states plainly, on every judgment, which dimensions were not assessed', () => {
    const jud = judgeOf(ADEQUATE).jud;
    const limitations = (jud.confidence.limitations as string[]).join('\n');
    expect(limitations).toMatch(/not assessed/i);
    expect(limitations).toMatch(/effect-size/i);
  });

  it('derives the confidence score instead of keying it to the verdict label', () => {
    const strong = judgeOf(ADEQUATE).jud;
    const weak = judgeOf(WEAK_TARGET).jud;

    // Same overall verdict on both — the pre-fix score was a function of that
    // label alone, so the two were necessarily identical.
    expect(weak.overallVerdict).toBe(strong.overallVerdict);
    expect(
      weak.confidence.score,
      'two designs with different power and assumption profiles share a confidence score',
    ).not.toBe(strong.confidence.score);
    // Directional, not just different: the 70%-target design is the weaker one.
    expect(weak.confidence.score).toBeLessThan(strong.confidence.score);
    expect(strong.confidence.score).toBeGreaterThan(0);
  });

  it('does not score the enrollment band, and says what it could not judge', () => {
    const dim = dimNamed(judgeOf(ADEQUATE).jud, /enrollment/i);
    expect(dim, 'the enrollment dimension disappeared entirely').toBeTruthy();
    // The N-band verdict is real — it is computed from the attrition-adjusted
    // total. The "/100" beside it never was, and the name claimed an
    // operational feasibility judgment nothing in this surface can make.
    expect(dim.score, 'the enrollment band is banded, not scored').toBeNull();
    expect(/feasibilit/i.test(String(dim.name)), 'still claims a feasibility assessment').toBe(false);
    expect(String(dim.rationale)).toMatch(/site capacity/i);
  });

  it('never prints a fabricated score into the Statistical Risk Memo the customer files', () => {
    render(<Surface onAsk={() => {}} onNav={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /Statistical Risk Memo/i }));

    const body = document.body.textContent ?? '';
    expect(body, 'the risk memo did not render').toMatch(/Effect-size assumption/);
    expect(/60\/100/.test(body), 'the fixed 60/100 effect-size score is still filed').toBe(false);
    expect(/null\/100/.test(body), 'an unscored dimension rendered as "null/100"').toBe(false);
    expect(body).toMatch(/not.assessed/i);
  });
});
