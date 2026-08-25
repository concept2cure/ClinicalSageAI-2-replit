// @vitest-environment jsdom
/**
 * Batch poolability in the stability programme — ICH Q1E, at render level.
 *
 * ── The gap ───────────────────────────────────────────────────────────────────
 * `services/cmc/shelf-life-poolability.ts` decides whether stability batches may
 * be combined into ONE registered shelf life or whether the claim must fall back
 * to the shortest batch. It was reachable only as an AnA tool taking hand-typed
 * numbers, so the decision could not be run against the studies of record — the
 * stability surface said, in its own copy, that poolability "is a separate
 * assessment", and there was nowhere to make it.
 *
 * ── What must be true ─────────────────────────────────────────────────────────
 * These tests mount the real surface and drive the real controls:
 *
 *   • the selection is per BATCH and the request carries the study ids;
 *   • the button will not fire on fewer than two, because poolability compares
 *     batches and one batch is not a comparison;
 *   • a pooled verdict and a fall-back-to-shortest verdict are visibly
 *     DIFFERENT — the number alone does not say which happened, and a reviewer
 *     reading "24 months" needs to know whether it is one claim for all batches
 *     or the worst of three;
 *   • both F-tests are shown with their statistic, including "not reached" for
 *     the intercept test Q1E never runs when the slopes differ. A blank there
 *     would read as "passed";
 *   • a server refusal is surfaced as its reason, not as an empty result — and
 *     no stale verdict is left on screen behind it.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
vi.mock('@/services/portal/authService', () => ({
  useAuth: () => ({ user: { id: '7', email: 'a@b.test', displayName: 'A. Analyst' } }),
}));

import type { SurfaceViewProps } from '../surfaceViews';
import { CmcModule } from '../surfaces/CmcModule';

function res(payload: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => payload } as Response;
}

const calls = () => apiRequest.mock.calls as Array<[string, string, unknown?]>;
const poolCalls = () =>
  calls().filter((c) => c[0] === 'POST' && c[1] === '/api/cmc/stability-studies/poolability');

/** A study with one recorded result, which is all the surface needs to list it. */
const study = (id: number, batchNumber: string) => ({
  id,
  studyTitle: `Study ${id}`,
  productName: 'Compound A',
  batchNumber,
  studyType: 'primary',
  storageConditions: ['LT'],
  duration: 24,
  status: 'ACTIVE',
  stabilityData: {
    results: [
      { timePoint: '0', parameter: 'Assay', result: '100.0%', specification: '>= 95.0%', withinSpecification: true },
      { timePoint: '12', parameter: 'Assay', result: '97.6%', specification: '>= 95.0%', withinSpecification: true },
    ],
  },
});

const STUDIES = [study(1, 'B-001'), study(2, 'B-002'), study(3, 'B-003')];

/** The stability register answers with STUDIES; the poolability POST is per-test. */
function wire(pool?: { payload: unknown; status?: number }) {
  apiRequest.mockImplementation(async (m?: string, u?: string) => {
    if (u === '/api/cmc/stability-studies' && m !== 'POST') return res({ success: true, data: STUDIES });
    if (u === '/api/cmc/stability-studies/poolability') {
      return res(pool?.payload ?? { success: true, data: null }, pool?.status ?? 200);
    }
    return res({ success: true, data: [] });
  });
}

/** Mount the module and land on the Stability tab, as a user would. */
async function openStability() {
  render(
    <CmcModule
      surface={{ id: 'cmc', label: 'CMC' } as unknown as SurfaceViewProps['surface']}
      onAsk={vi.fn()}
      onNav={vi.fn()}
      segment="biotech"
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: /Stability/ }));
  await waitFor(() => expect(screen.getByRole('button', { name: /Assess poolability/ })).toBeTruthy());
}

const pick = (batch: string) =>
  fireEvent.click(screen.getByLabelText(new RegExp(`batch ${batch}\\)`)));
const assessButton = () => screen.getByRole('button', { name: /Assess poolability/ });

/** A pooled report over three batches. */
const POOLED = {
  success: true,
  data: {
    basis: 'ICH Q1E — sequential ANCOVA combinability tests at the 0.25 significance level',
    scopeLimit: 'One attribute and one storage condition at a time.',
    storageCondition: 'LT',
    batches: ['B-001', 'B-002', 'B-003'],
    limitingParameter: 'Assay',
    supportedShelfLife: 26.4,
    limitingDecision: 'pooled',
    assessments: [
      {
        parameter: 'Assay',
        assessable: true,
        specLimit: 95,
        direction: 'decreasing',
        contributingBatches: ['B-001', 'B-002', 'B-003'],
        excludedBatches: [],
        slopeTest: { f: 0.31, pValue: 0.74, poolable: true, dfNumerator: 2, dfDenominator: 9 },
        interceptTest: { f: 0.88, pValue: 0.44, poolable: true, dfNumerator: 2, dfDenominator: 11 },
        poolable: true,
        decision: 'pooled',
        shelfLife: 26.4,
        perBatchShelfLives: [
          { batchId: 'B-001', shelfLife: 25.1, exceedsEvaluatedRange: false },
          { batchId: 'B-002', shelfLife: 24.8, exceedsEvaluatedRange: false },
          { batchId: 'B-003', shelfLife: 27.2, exceedsEvaluatedRange: false },
        ],
        pooledShelfLife: 26.4,
        notes: ['Batches are combinable — shelf life is from the single pooled regression.'],
      },
    ],
  },
};

beforeEach(() => apiRequest.mockReset());
afterEach(cleanup);

describe('Poolability — selecting batches', () => {
  it('will not run on fewer than two batches', async () => {
    wire();
    await openStability();
    expect((assessButton() as HTMLButtonElement).disabled).toBe(true);

    pick('B-001');
    // One batch is not a comparison, and the copy says so rather than the
    // control simply being inert.
    expect((assessButton() as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/needs at least two/)).toBeTruthy();

    pick('B-002');
    expect((assessButton() as HTMLButtonElement).disabled).toBe(false);
    expect(poolCalls()).toHaveLength(0);
  });

  it('sends the selected study ids and nothing else', async () => {
    wire({ payload: POOLED });
    await openStability();
    pick('B-001');
    pick('B-003');
    fireEvent.click(assessButton());
    await waitFor(() => expect(poolCalls()).toHaveLength(1));
    expect(poolCalls()[0][2]).toEqual({ studyIds: [1, 3] });
  });

  it('clearing the selection takes the verdict with it', async () => {
    wire({ payload: POOLED });
    await openStability();
    pick('B-001');
    pick('B-002');
    fireEvent.click(assessButton());
    // The chip, not the note text — "Batches are combinable …" also contains the
    // word, and the chip is what states the verdict.
    await waitFor(() => expect(screen.getByText('combinable', { selector: 'span' })).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: /Clear selection/ }));
    // A verdict left behind would describe batches that are no longer selected.
    // Matched on the chip: the toast still quotes the figure, and it is a
    // transient acknowledgement of an action, not a standing claim on screen.
    expect(screen.queryByText('combinable', { selector: 'span' })).toBeNull();
    expect(screen.queryByText('26.4 mo', { selector: 'b' })).toBeNull();
    expect((assessButton() as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('Poolability — reading the verdict', () => {
  it('shows a pooled result as one claim, with both F-tests', async () => {
    wire({ payload: POOLED });
    await openStability();
    pick('B-001');
    pick('B-002');
    pick('B-003');
    fireEvent.click(assessButton());

    await waitFor(() => expect(screen.getByText('26.4 mo', { selector: 'b' })).toBeTruthy());
    expect(screen.getByText('combinable', { selector: 'span' })).toBeTruthy();
    // Both tests are shown WITH their statistic — a verdict without the numbers
    // is not something a reviewer can check.
    expect(screen.getByText(/F\(2,9\) = 0\.31 · p = 0\.74/)).toBeTruthy();
    expect(screen.getByText(/F\(2,11\) = 0\.88 · p = 0\.44/)).toBeTruthy();
    expect(screen.getByText(/supported shelf life/)).toBeTruthy();
  });

  it('shows a non-poolable result as the shortest batch, and says the intercept test was never reached', async () => {
    wire({
      payload: {
        success: true,
        data: {
          ...POOLED.data,
          supportedShelfLife: 18.2,
          limitingDecision: 'minimum-of-batches',
          assessments: [
            {
              ...POOLED.data.assessments[0],
              slopeTest: { f: 9.4, pValue: 0.006, poolable: false, dfNumerator: 2, dfDenominator: 9 },
              interceptTest: null,
              poolable: false,
              decision: 'minimum-of-batches',
              shelfLife: 18.2,
              pooledShelfLife: null,
              perBatchShelfLives: [
                { batchId: 'B-001', shelfLife: 18.2, exceedsEvaluatedRange: false },
                { batchId: 'B-002', shelfLife: 31.5, exceedsEvaluatedRange: false },
              ],
              notes: ['Slopes differ across batches — data are not combined.'],
            },
          ],
        },
      },
    });
    await openStability();
    pick('B-001');
    pick('B-002');
    fireEvent.click(assessButton());

    await waitFor(() => expect(screen.getByText('shortest batch')).toBeTruthy());
    // Q1E is sequential: the intercept test is not run once the slopes differ.
    // Saying so is not the same as leaving the cell blank, which reads as passed.
    expect(screen.getByText('not reached')).toBeTruthy();
    expect(screen.getByText('differ')).toBeTruthy();
    // The per-batch figures are exposed, so the 18.2 can be seen to be the worst
    // of the set rather than a computed pooled value.
    expect(screen.getByText(/B-001 18\.2, B-002 31\.5 mo/)).toBeTruthy();
  });

  it('names an attribute it could not assess, and the conflict behind it', async () => {
    wire({
      payload: {
        success: true,
        data: {
          ...POOLED.data,
          supportedShelfLife: null,
          limitingParameter: null,
          limitingDecision: null,
          assessments: [
            {
              parameter: 'Assay',
              assessable: false,
              reason: 'The selected batches recorded different acceptance criteria for this attribute.',
              conflictingCriteria: [
                { batchId: 'B-001', limit: 95, direction: 'decreasing' },
                { batchId: 'B-002', limit: 90, direction: 'decreasing' },
              ],
              contributingBatches: ['B-001', 'B-002'],
              excludedBatches: [{ batchId: 'B-003', reason: 'Did not record Assay.' }],
            },
          ],
        },
      },
    });
    await openStability();
    pick('B-001');
    pick('B-002');
    fireEvent.click(assessButton());

    await waitFor(() => expect(screen.getByText('not assessable')).toBeTruthy());
    expect(screen.getByText(/different acceptance criteria/)).toBeTruthy();
    // The conflict is shown on both sides, so it can be resolved rather than
    // just reported.
    expect(screen.getByText(/B-001: ≥ 95 vs B-002: ≥ 90/)).toBeTruthy();
    expect(screen.getByText(/excluded: B-003 \(Did not record Assay\.\)/)).toBeTruthy();
    expect(screen.getByText(/no attribute could be assessed/)).toBeTruthy();
  });
});

describe('Poolability — when the server refuses', () => {
  it('surfaces the refusal as its reason and leaves no verdict behind', async () => {
    // First a good run, so there IS a verdict to be left behind.
    wire({ payload: POOLED });
    await openStability();
    pick('B-001');
    pick('B-002');
    fireEvent.click(assessButton());
    await waitFor(() => expect(screen.getByText('combinable')).toBeTruthy());

    wire({
      status: 409,
      payload: {
        success: false,
        error: 'ICH Q1E combinability is assessed within one storage condition. These studies span 2: LT, ACC.',
      },
    });
    pick('B-003');
    fireEvent.click(assessButton());

    await waitFor(() =>
      expect(screen.getByText(/within one storage condition/)).toBeTruthy(),
    );
    // The previous verdict described a different set of batches; keeping it on
    // screen beside a refusal would read as though it still applied.
    expect(screen.queryByText('combinable')).toBeNull();
  });
});
