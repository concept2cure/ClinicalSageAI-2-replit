// @vitest-environment jsdom
/**
 * The engine-result panel claims only what the engine computed (2026-10-11).
 *
 * `biostatEngineResult.tsx` is the ONE rendering of the deterministic engines'
 * output, shared by the Biostatistics designer and the protocol workspace's
 * Statistics tab. Its own header says an error is never rendered as nothing and
 * a zero never stands in for an absent figure. Four cases broke those rules;
 * each was found by an adversarial read of the panel rather than by a test,
 * which is why they are pinned here.
 *
 *   1. A 200 whose `computation.assumptions` is not an array threw
 *      `assumptions.map is not a function` and React unmounted the WHOLE pane.
 *      Every other list in the file was guarded with `Array.isArray`; this one
 *      and `dimension.flags` were not. An error rendered as nothing.
 *   2. An assessment carrying a `severity: 'blocking'` gap AND a computation
 *      rendered the number, printed "blocking" beside it, and left the governed
 *      Apply write ENABLED. The invariant lived only on the server
 *      (`design-adapter.ts`, `input: blocking ? null : input`); the client
 *      enforced nothing, so one bad response or one stale cached assessment
 *      put an unusable figure in front of a statistician.
 *   3. `sampleSize.total: 0` rendered "0 subjects" and enabled the write.
 *   4. A refusal from the engine had nowhere to go: the bridge's read path
 *      turned `ComputationRefusal` into a 500, so the panel could only say
 *      "this assessment is incomplete". It now carries `refusal` and the
 *      panel prints the engine's own sentence.
 */
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

import {
  ComputedSizeLine,
  EngineAssumptionsTable,
  JudgmentDimensionTable,
  computedTotalN,
  engineFigureIsUsable,
  type DesignJudgment,
  type EngineResult,
} from '../surfaces/biostatEngineResult';

afterEach(() => cleanup());

const COMPUTATION = {
  method: 'Two-sample t-test (superiority)',
  sampleSize: { perGroup: 263, total: 526, groups: 2 },
  power: 0.8,
  effectSize: 0.5,
  alpha: 0.05,
  adjustedTotal: 526,
  attritionAdjusted: false,
  formula: 'n = …',
  assumptions: [{ parameter: 'alpha', value: 0.05, source: 'default', sensitivity: 'moderate' }],
};

const assessment = (over: Partial<EngineResult> = {}): EngineResult =>
  ({
    computation: COMPUTATION,
    judgment: null,
    refusal: null,
    adapter: { input: {}, gaps: [], mapped: ['alpha'] },
    provenance: { engine: 'ana-biostats', engineVersion: '1.0.0', inputsSha256: 'abc123' },
    ...over,
  }) as unknown as EngineResult;

const BLOCKING = [{ field: 'effectSize', message: 'No effect size on the record.', severity: 'blocking' }];

describe('an error is not rendered as nothing', () => {
  it('survives a computation whose assumptions are not an array', () => {
    // Before the guard this threw and unmounted the pane.
    expect(() =>
      render(<EngineAssumptionsTable assumptions={{ alpha: 0.05 } as never} />),
    ).not.toThrow();
  });

  it('survives a judgment dimension whose flags are not an array', () => {
    const judgment = {
      overallVerdict: 'adequate',
      dimensions: [{ name: 'Power Adequacy', verdict: 'adequate', score: 80, rationale: 'Power meets the target.', flags: 'none' }],
      escalationReasons: [],
    } as unknown as DesignJudgment;

    expect(() => render(<JudgmentDimensionTable judgment={judgment} />)).not.toThrow();
    expect(screen.getByText(/Power meets the target\./)).toBeTruthy();
  });
});

describe('a figure is not drawn beside a blocking gap', () => {
  const blocked = assessment({ adapter: { input: {}, gaps: BLOCKING, mapped: [] } as never });

  it('says Not sized rather than printing the number it was handed', () => {
    render(<ComputedSizeLine assessment={blocked} />);
    expect(screen.getByText(/Not sized\./)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/\b526\b/);
  });

  it('refuses the figure to the governed write', () => {
    expect(engineFigureIsUsable(blocked)).toBe(false);
  });

  it('still allows a figure when the gaps are not blocking', () => {
    const noted = assessment({
      adapter: { input: {}, gaps: [{ field: 'variance', message: 'Assumed standardized.', severity: 'defaulted' }], mapped: [] } as never,
    });
    expect(engineFigureIsUsable(noted)).toBe(true);
    render(<ComputedSizeLine assessment={noted} />);
    expect(screen.getByText('526')).toBeTruthy();
  });
});

describe('a zero is not a sample size', () => {
  it.each([0, -4, Number.NaN, Number.POSITIVE_INFINITY])('reads %s as absent, not as a figure', (total) => {
    expect(computedTotalN({ ...COMPUTATION, adjustedTotal: total, sampleSize: { perGroup: 0, total, groups: 2 } } as never)).toBeNull();
  });

  it('says Not sized and withholds the write for a total of zero', () => {
    const zero = assessment({
      computation: { ...COMPUTATION, adjustedTotal: 0, sampleSize: { perGroup: 0, total: 0, groups: 2 } } as never,
    });
    expect(engineFigureIsUsable(zero)).toBe(false);
    render(<ComputedSizeLine assessment={zero} />);
    expect(screen.getByText(/Not sized\./)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/0 subjects/);
  });
});

describe('a refusal is shown in the engine’s own words', () => {
  it('prints the engine’s sentence instead of a generic incomplete-assessment note', () => {
    const refused = assessment({
      computation: null,
      refusal: {
        code: 'not_supported',
        message: 'Agreement (kappa) sample size is not supported: the published methods need the null kappa and the marginal rating prevalence.',
      },
    });
    render(<ComputedSizeLine assessment={refused} />);
    expect(screen.getByText(/the published methods need the null kappa/)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/Reload it before relying on it/);
  });

  it('falls back to the incomplete-assessment note when there is no sentence', () => {
    const empty = assessment({ computation: null, refusal: { code: 'missing_input', message: '   ' } as never });
    render(<ComputedSizeLine assessment={empty} />);
    expect(screen.getByText(/incomplete rather than complete and empty/)).toBeTruthy();
  });
});
