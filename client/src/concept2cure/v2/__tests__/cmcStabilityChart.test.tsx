// @vitest-environment jsdom
/**
 * The Stability register draws the Q1E fit (P-122 inventory, B1).
 *
 * CMC had no chart anywhere: no stability plot, no regression line, no
 * confidence band. The shelf-life estimate was a number in a table, behind a
 * button, and a CMC lead could not see the data it came from or how close the
 * bound runs to the limit.
 *
 * What must be true:
 *   • a study with recorded results is estimated when the register opens — the
 *     estimate is a read, and a chart behind a button is a chart nobody sees;
 *   • each estimable attribute is drawn from the server's own numbers: the
 *     observations it fitted, its fitted line and its one-sided bound (`band`),
 *     the specification and the shelf life it reported — the browser computes
 *     none of them (RULE 2);
 *   • the chart says in words what it shows, for a screen reader;
 *   • an attribute the engine could not fit, or an estimate with no band (an
 *     older server), draws nothing rather than something the engine did not
 *     return;
 *   • a refused estimate is said in the register, not as a failure toast.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
vi.mock('@/services/portal/authService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/portal/authService')>()),
  useAuth: () => ({ user: { id: '7', email: 'a@b.test', displayName: 'A' } }),
}));

import type { SurfaceViewProps } from '../surfaceViews';
import { CmcModule } from '../surfaces/CmcModule';
import { useAutoQ1e } from '../surfaces/cmcStabilityChart';

const PROJECT = 'a3b1c2d4-e5f6-4a1b-8c2d-0123456789ab';
const STUDY = {
  id: 41, studyTitle: 'C2C-201 tablets — long-term, 25°C/60% RH', productName: 'C2C-201 tablets', batchNumber: 'C2C201-DP-2503',
  storageConditions: ['LT', '25°C ± 2°C / 60% ± 5% RH'], duration: 24, status: 'ACTIVE', shelfLife: '18 months', projectId: PROJECT,
  stabilityData: { results: [
    { timePoint: '0', parameter: 'Assay', result: '100.2', specification: '95.0 - 105.0 %' },
    { timePoint: '6', parameter: 'Assay', result: '99.1', specification: '95.0 - 105.0 %' },
    { timePoint: '9', parameter: 'Assay', result: '98.6', specification: '95.0 - 105.0 %' },
  ] },
};
const BAND = [
  { time: 0, fitted: 100.17, bound: 99.2 }, { time: 6, fitted: 99.13, bound: 98.6 }, { time: 9, fitted: 98.61, bound: 97.9 },
  { time: 12, fitted: 98.09, bound: 96.9 }, { time: 16.4, fitted: 97.33, bound: 95.0 }, { time: 18, fitted: 97.05, bound: 94.4 },
];
const ESTIMATE = {
  parameter: 'Assay', condition: '25°C ± 2°C / 60% ± 5% RH', estimable: true, specLimit: 95, direction: 'decreasing',
  shelfLife: 16.4, statisticalCrossing: 16.4, observedPeriod: 9, extrapolationLimit: 18, cappedByExtrapolationLimit: false,
  pointsUsed: 3, pointsRecorded: 3, regression: { slope: -0.1733, intercept: 100.17, r2: 0.99, residualSd: 0.05, n: 3, df: 1 },
  confidence: { alpha: 0.05, tQuantile: 6.31, bound: 'lower' }, band: BAND,
  observations: [{ time: 0, value: 100.2 }, { time: 6, value: 99.1 }, { time: 9, value: 98.6 }], notes: [],
};
const REPORT = (estimates: unknown[]) => ({
  basis: 'ICH Q1E', scopeLimit: 'Single batch', maxTimeEvaluated: 120, limitingParameter: 'Assay', supportedShelfLife: 16.4, estimates,
});

function res(payload: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => payload } as Response;
}
function wire(shelfLife: () => Response) {
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (method === 'GET' && url.startsWith('/api/cmc/stability-studies')) return res({ success: true, data: [STUDY] });
    if (method === 'POST' && url === '/api/cmc/stability-studies/41/shelf-life') return shelfLife();
    return res({ success: true, data: [] });
  });
}
async function openStability() {
  render(
    <CmcModule
      surface={{ id: 'cmc', label: 'CMC' } as unknown as SurfaceViewProps['surface']}
      onAsk={vi.fn()}
      onNav={vi.fn()}
      segment="biotech"
    />,
  );
  fireEvent.click(screen.getByRole('tab', { name: 'Stability' }));
}
const shelfLifeCalls = () => apiRequest.mock.calls.filter((c) => c[0] === 'POST' && String(c[1]).endsWith('/shelf-life'));

beforeEach(() => {
  apiRequest.mockReset();
  (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT = { id: PROJECT };
});
afterEach(() => {
  cleanup();
  delete (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT;
});

describe('the Stability register draws each Q1E fit', () => {
  it('estimates a study with results when the register opens, and draws its fit', async () => {
    wire(() => res({ success: true, data: REPORT([ESTIMATE]) }));
    await openStability();
    const chart = await screen.findByRole('img', { name: /Assay/ });
    expect(shelfLifeCalls()).toHaveLength(1);
    expect(chart.getAttribute('aria-label')).toMatch(/shelf life 16\.4 months/i);
    expect(chart.getAttribute('aria-label')).toMatch(/specification 95/i);
  });

  it('draws the server’s numbers, and computes none of its own', async () => {
    wire(() => res({ success: true, data: REPORT([ESTIMATE]) }));
    await openStability();
    const chart = await screen.findByRole('img', { name: /Assay/ });
    /* One vertex per band sample on each line, one marker per fitted observation. */
    expect(chart.querySelector('[data-mark="fitted"]')!.getAttribute('points')!.trim().split(/\s+/)).toHaveLength(BAND.length);
    expect(chart.querySelector('[data-mark="bound"]')!.getAttribute('points')!.trim().split(/\s+/)).toHaveLength(BAND.length);
    expect(chart.querySelectorAll('[data-mark="observation"]')).toHaveLength(3);
    expect(chart.querySelector('[data-mark="spec"]')).not.toBeNull();
    expect(chart.querySelector('[data-mark="shelf-life"]')).not.toBeNull();
    /* Each point says its own value on hover. */
    expect([...chart.querySelectorAll('[data-mark="observation"] title')].map((t) => t.textContent)).toEqual([
      '0 months: 100.2', '6 months: 99.1', '9 months: 98.6',
    ]);
  });

  it('draws nothing the engine did not return', async () => {
    const noBand = { ...ESTIMATE, band: undefined };
    wire(() => res({ success: true, data: REPORT([noBand, { parameter: 'Dissolution', estimable: false, reason: 'Two points.' }]) }));
    await openStability();
    await waitFor(() => expect(shelfLifeCalls()).toHaveLength(1));
    await screen.findByText(/Two points\./);
    expect(screen.queryByRole('img', { name: /Assay|Dissolution/ })).toBeNull();
  });

  it('says a refused estimate in the register, without a failure toast', async () => {
    wire(() => res({ success: false, error: 'Module 3 is not composed here for this project: it records a biologic (ICH Q6B, Q5C).' }, 409));
    await openStability();
    await screen.findByText(/it records a biologic/);
    expect(screen.queryByRole('img', { name: /Assay/ })).toBeNull();
    expect(screen.queryAllByRole('alert').map((a) => a.textContent).join(' ')).not.toMatch(/biologic|estimate/i);
  });
});

/* ─────────────────────────────────────────────────────────────────────────────
 * An estimate belongs to the results it was fitted from.
 *
 * The register estimated each study ONCE for the life of the screen. Recording
 * a new pull point replaced the study's row — "Longest pull" and "Within
 * limits" moved — while the Q1E estimate, its chart and its limiting attribute
 * stayed as fitted from the earlier points, with nothing to say so. After a
 * 12-month out-of-specification pull the cell still read the old shelf life;
 * after the third point of a new study it still read "too few points". The
 * shelf life is the claim §3.2.S.7 / §3.2.P.8 rest on.
 * ────────────────────────────────────────────────────────────────────────────*/
describe('useAutoQ1e — a study whose results changed is estimated again', () => {
  function Probe({ studies, have, adopt }: {
    studies: Array<{ id: number; hasResults: boolean; stamp?: number }>;
    have: Record<number, { n: number }>;
    adopt: (id: number, r: { n: number }) => void;
  }) {
    const refused = useAutoQ1e<{ n: number }>(studies, have, adopt, (v): v is { n: number } => typeof (v as { n?: unknown })?.n === 'number');
    return <div data-testid="refused">{JSON.stringify(refused)}</div>;
  }

  it('asks once for a study whose results have not changed, however often the screen renders', async () => {
    apiRequest.mockImplementation(async () => res({ success: true, data: { n: 3 } }));
    const adopt = vi.fn();
    const { rerender } = render(<Probe studies={[{ id: 41, hasResults: true, stamp: 3 }]} have={{}} adopt={adopt} />);
    await waitFor(() => expect(adopt).toHaveBeenCalledTimes(1));
    rerender(<Probe studies={[{ id: 41, hasResults: true, stamp: 3 }]} have={{}} adopt={adopt} />);
    rerender(<Probe studies={[{ id: 41, hasResults: true, stamp: 3 }]} have={{ 41: { n: 3 } }} adopt={adopt} />);
    await new Promise((r) => setTimeout(r, 20));
    expect(shelfLifeCalls().length).toBe(1);
  });

  // The defect: the same study with one more result was never asked again.
  it('asks again when the study has one more result and its old estimate was dropped', async () => {
    apiRequest.mockImplementation(async () => res({ success: true, data: { n: 3 } }));
    const adopt = vi.fn();
    const { rerender } = render(<Probe studies={[{ id: 41, hasResults: true, stamp: 3 }]} have={{}} adopt={adopt} />);
    await waitFor(() => expect(adopt).toHaveBeenCalledTimes(1));
    rerender(<Probe studies={[{ id: 41, hasResults: true, stamp: 4 }]} have={{}} adopt={adopt} />);
    await waitFor(() => expect(shelfLifeCalls().length).toBe(2));
    await waitFor(() => expect(adopt).toHaveBeenCalledTimes(2));
  });

  it('forgets a refusal when it asks again — "too few points" does not outlive the third point', async () => {
    apiRequest.mockImplementationOnce(async () => res({ success: false, error: 'Assay has 2 usable points; 3 are needed.' }, 409));
    apiRequest.mockImplementation(async () => res({ success: true, data: { n: 3 } }));
    const adopt = vi.fn();
    const { rerender } = render(<Probe studies={[{ id: 41, hasResults: true, stamp: 2 }]} have={{}} adopt={adopt} />);
    await waitFor(() => expect(screen.getByTestId('refused').textContent).toContain('3 are needed'));
    rerender(<Probe studies={[{ id: 41, hasResults: true, stamp: 3 }]} have={{}} adopt={adopt} />);
    await waitFor(() => expect(adopt).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId('refused').textContent).toBe('{}');
  });
});

describe('the Stability register — the recorded shelf life against the study’s own estimate', () => {
  const CLAIM = {
    claim: '18 months', claimedMonths: 18, supportedMonths: 16.4, verdict: 'exceeds-estimate',
    sentence: 'The recorded 18 months is longer than the 16.4 months this study\'s recorded results support (ICH Q1E, limited by Assay). A longer period rests on other supporting data or a justification, stated in the stability section.',
  };

  it('says, in the engine’s sentence, when the recorded period is longer than the study supports', async () => {
    wire(() => res({ success: true, data: { ...REPORT([ESTIMATE]), recordedClaim: CLAIM } }));
    await openStability();
    const note = await screen.findByTestId('cmc-claim-vs-estimate-41');
    expect(note.textContent).toContain('18 months is longer than the 16.4 months');
    expect(note.getAttribute('data-tone')).toBe('warn');
  });

  it('says nothing beside a claim the estimate supports, and nothing when the server sent no judgement', async () => {
    wire(() => res({ success: true, data: { ...REPORT([ESTIMATE]), recordedClaim: { ...CLAIM, verdict: 'within-estimate', sentence: 'within' } } }));
    await openStability();
    await screen.findAllByText(/16\.4 mo/);
    expect(screen.queryByTestId('cmc-claim-vs-estimate-41')).toBeNull();
    cleanup();
    wire(() => res({ success: true, data: REPORT([ESTIMATE]) }));
    await openStability();
    await screen.findAllByText(/16\.4 mo/);
    expect(screen.queryByTestId('cmc-claim-vs-estimate-41')).toBeNull();
  });
});
