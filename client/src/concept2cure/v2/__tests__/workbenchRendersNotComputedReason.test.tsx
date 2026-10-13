// @vitest-environment jsdom
/**
 * The workbench renders WHY a figure is absent, not just the figures (2026-10-12).
 *
 * `scalarRows` in BiostatWorkbench.tsx drops any string longer than 120
 * characters, so that a long memo (external-control's
 * `renderExternalControlMemo`) lands in the raw-response view rather than in
 * the row table. That is right for a memo. It is wrong for the one kind of
 * string that explains an ABSENCE.
 *
 * The interim calculator's engine reports conditional power under H1 as
 * `{drift: null, conditionalPower: null, reason: '<sentence>'}` when no design
 * effect was supplied — deliberately, rather than defaulting a drift nobody
 * chose. The reason is 148 characters. So the figure rendered as nothing (null
 * yields no row) and the sentence rendered as nothing (over the cap), and the
 * H1 row vanished from the table with no explanation anywhere on screen. An
 * error — here, a refusal — rendered as nothing, which this product forbids.
 *
 * `reason` and `note` keys now render whatever their length, and nothing else
 * about the cap changes.
 *
 * RED before the fix: the sentence is nowhere in the document.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { BiostatWorkbench } from '../surfaces/BiostatWorkbench';
import { CALCULATORS } from '../surfaces/biostatCalculators';

const props = () => ({ surface: { id: 'biostat-workbench', label: 'Biostat' } as any, onAsk: vi.fn(), onNav: vi.fn(), segment: 'biopharma' });

/** The engine's own sentence when no design effect was supplied — 148 chars. */
const REASON =
  'No design effect is recorded on this request (designDrift, or designEffect as a standardized effect and n per arm); not computed rather than assumed.';

/**
 * Two long strings. `RESULT_METHOD` lives only inside the result, where the
 * 120-character cap sends it to the raw view. `PROVENANCE_METHOD` is rendered
 * by the provenance stamp whatever its length, by design — so the cap has to
 * be tested on a string that is NOT also in provenance, or the case would pass
 * for the wrong reason.
 */
const RESULT_METHOD =
  'Lan–DeMets alpha spending; boundaries solved by exact recursive numerical integration over the information grid, with the correlation between looks accounted for exactly rather than by simulation, as in Jennison & Turnbull (2000) chapter 19.';
const PROVENANCE_METHOD = 'Lan–DeMets alpha spending (exact recursive integration)';

const INTERIM_RESULT = {
  boundaries: {
    criticalValues: [2.962707240193933, 1.9685900662218359],
    cumulativeAlpha: [0.0015253227579890005, 0.025],
    method: RESULT_METHOD,
  },
  look: { number: 1, informationFraction: 0.5, criticalValue: 2.962707240193933, observedZ: 2, crossedEfficacy: false, isFinal: false },
  conditionalPower: {
    currentTrend: { assumption: 'current-trend', label: 'Under the current trend', drift: 2.8284271247461903, conditionalPower: 0.8880062494384136 },
    designEffect: { assumption: 'design-effect', label: 'Under H1, the design effect', drift: null, conditionalPower: null, reason: REASON },
    nullHypothesis: { assumption: 'null-hypothesis', label: 'Under H0', drift: 0, conditionalPower: 0.21651806881780344 },
  },
  predictivePower: { value: 0.8050605659577507, prior: 'flat' },
  derived: [],
  provenance: { engine: 'adaptive-trial-operations-service', method: PROVENANCE_METHOD },
};

beforeEach(() => {
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (_m: string, u: string) => {
    if (u === '/api/biostat/adaptive/interim') {
      return { ok: true, status: 200, json: async () => ({ success: true, data: INTERIM_RESULT }) } as Response;
    }
    return { ok: true, status: 200, json: async () => ({ success: true, data: [] }) } as Response;
  });
});
afterEach(() => cleanup());

/** Open the interim calculator and compute it with its defaults filled in. */
async function computeInterim() {
  render(<BiostatWorkbench {...props()} />);
  // The stored monitoring panel also mentions interim looks. Open the
  // stateless calculator by the exact button title declared in the registry.
  const interim = CALCULATORS.find((calculator) => calculator.id === 'interim-look')!;
  fireEvent.click(await screen.findByRole('button', { name: interim.title }));

  const fill = (label: RegExp, value: string) => {
    const input = screen.getByText(label).closest('label')!.querySelector('input, select') as HTMLElement;
    fireEvent.change(input, { target: { value } });
  };
  fill(/Information fractions/, '0.5, 1');
  fill(/Look number/, '1');
  fill(/Observed Z/, '2.0');

  fireEvent.click(screen.getByRole('button', { name: /compute/i }));
  await waitFor(() => expect(screen.getByText('0.888006')).toBeTruthy());
}

describe('an absent figure comes with its reason', () => {
  it('shows the engine’s not-computed sentence on screen', async () => {
    await computeInterim();
    expect(
      screen.getByText(new RegExp('not computed rather than assumed')),
      'the H1 figure is absent and the reason is nowhere on screen',
    ).toBeTruthy();
  });

  it('still shows the figures that WERE computed', async () => {
    await computeInterim();
    // fmt() rounds to six decimals and joins a number array with ", ".
    expect(screen.getByText('0.888006')).toBeTruthy();            // current trend
    expect(screen.getByText('0.216518')).toBeTruthy();            // under H0
    expect(screen.getByText('2.962707, 1.96859')).toBeTruthy();   // the boundaries
  });

  it('keeps a long method string out of the rows, as before', async () => {
    await computeInterim();
    // The cap still applies to everything that is not a reason or a note: a
    // long method inside the result goes to the raw response, where it always
    // went. Only the short provenance method is stamped on screen.
    expect(screen.queryByText(new RegExp('chapter 19'))).toBeNull();
    expect(screen.getByText(new RegExp('exact recursive integration'))).toBeTruthy();
  });
});
