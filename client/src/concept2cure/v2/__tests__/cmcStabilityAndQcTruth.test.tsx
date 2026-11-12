// @vitest-environment jsdom
/**
 * The CMC work area says what the record says, and no more (GA-DEMO-01, GA-DEMO-02).
 *
 * ── GA-DEMO-01: a missing flag is not an OOS ─────────────────────────────────
 * The Stability view counted a result as out of specification whenever its
 * `withinSpecification` flag was not true — so a result recorded with no flag at
 * all read as OOS. C2C-201's demo recorded fourteen results without the flag and
 * the view said 14 of 14 were outside their limits, where one is. Only an
 * explicit "no" is an OOS; a result with no flag reads as "not assessed".
 *
 * ── GA-DEMO-02: a contradicted pass is shown as contradicted ─────────────────
 * The QC register printed the recorded disposition. DS-2502-R2 is recorded as a
 * pass at 97.4 % against 98.0 - 102.0 %, and the register said "pass". Where the
 * server has compared the result with its criterion (`conformance`), a pass it
 * contradicts reads as contradicted, in the error colour.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent, waitFor, within } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
vi.mock('@/services/portal/authService', () => ({
  useAuth: () => ({ user: { id: '7', email: 'a@b.test', displayName: 'A. Analyst' } }),
}));

import type { SurfaceViewProps } from '../surfaceViews';
import { CmcModule, stabilityConformance } from '../surfaces/CmcModule';
import { CmQcTesting } from '../surfaces/cmcRegisters';

function res(payload: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => payload } as Response;
}

beforeEach(() => apiRequest.mockReset());
afterEach(cleanup);

/* C2C-201's three studies as the rehearsal database holds them: no flag on
   thirteen results; the impurity at six months accelerated flagged out. */
const STUDIES = [
  {
    id: 1, studyTitle: 'C2C-201 drug substance — long-term', productName: 'C2C-201', batchNumber: 'C2C201-DS-2502',
    studyType: 'long-term', storageConditions: ['LT'], duration: 36, status: 'ACTIVE', scope: 'DS',
    stabilityData: { results: [
      { timePoint: '0', parameter: 'Assay', result: '99.8', specification: '98.0 - 102.0 %' },
      { timePoint: '6', parameter: 'Assay', result: '99.4', specification: '98.0 - 102.0 %' },
    ] },
  },
  {
    id: 2, studyTitle: 'C2C-201 tablets — accelerated', productName: 'C2C-201 tablets', batchNumber: 'C2C201-DP-2503',
    studyType: 'accelerated', storageConditions: ['ACC'], duration: 6, status: 'ACTIVE', scope: 'DP',
    stabilityData: { results: [
      { timePoint: '0', parameter: 'Total impurities', result: '0.12', specification: 'NMT 0.5 %', withinSpecification: true },
      { timePoint: '6', parameter: 'Total impurities', result: '0.61', specification: 'NMT 0.5 %', withinSpecification: false },
    ] },
  },
];

async function openStability() {
  apiRequest.mockImplementation(async (m?: string, u?: string) => {
    if (u === '/api/cmc/stability-studies' && m !== 'POST') return res({ success: true, data: STUDIES });
    return res({ success: true, data: [] });
  });
  render(
    <CmcModule
      surface={{ id: 'cmc', label: 'CMC' } as unknown as SurfaceViewProps['surface']}
      onAsk={vi.fn()}
      onNav={vi.fn()}
      segment="biotech"
    />,
  );
  /* All nine CMC tabs are one row since 24603881c (P-122): no "Study records"
     toggle stands before Stability any more. */
  fireEvent.click(screen.getByRole('tab', { name: 'Stability' }));
  await waitFor(() => expect(screen.getByTestId('cmc-stability-counts').textContent).toMatch(/2 active studies/));
}

describe('GA-DEMO-01 — only an explicit "no" is out of specification', () => {
  it('reads the flag as recorded', () => {
    expect(stabilityConformance({ withinSpecification: true })).toBe('within');
    expect(stabilityConformance({ withinSpecification: false })).toBe('outside');
    expect(stabilityConformance({})).toBe('not assessed');
    expect(stabilityConformance({ withinSpecification: undefined })).toBe('not assessed');
    expect(stabilityConformance({ withinSpecification: null as unknown as boolean })).toBe('not assessed');
  });

  it('counts one result outside limits and says how many were not assessed', async () => {
    await openStability();
    const counts = screen.getByTestId('cmc-stability-counts').textContent ?? '';
    expect(counts).toContain('1 outside limits');
    expect(counts).toContain('2 not assessed');
    expect(screen.getByText(/1 stability result is outside the acceptance criteria/)).toBeTruthy();
    expect(screen.queryByText(/3 stability results are outside/)).toBeNull();
  });

  it('marks an unflagged result "not assessed", never OOS, in the study detail', async () => {
    await openStability();
    /* Found by its text: the accessible name is computed across the inner
       spans, which this matcher does not need to model. */
    const open = screen.getAllByRole('button').find((b) => b.textContent === '2 recorded · 2 not assessed');
    expect(open, 'the unflagged study says "2 not assessed", not "2 OOS"').toBeTruthy();
    fireEvent.click(open as HTMLElement);
    const rows = screen.getAllByText('not assessed', { selector: '.rd-chip' });
    expect(rows).toHaveLength(2);
    /* V-L1-03: "not assessed" is quiet, never the error (or the ok) colour. */
    for (const chip of rows) {
      expect(chip.className).toContain('tone-dim');
      expect(chip.className).not.toContain('tone-err');
      expect(chip.className).not.toContain('tone-ok');
    }
    expect(screen.queryAllByText('OOS', { selector: '.rd-chip' })).toHaveLength(0);
  });

  it('the shelf-life evidence line says within, outside and not assessed separately', async () => {
    await openStability();
    expect(screen.getByText(/1 within acceptance criteria, 1 outside, 2 not assessed/)).toBeTruthy();
  });

  it('the shelf-life evidence per-study chip counts only the results assessed within (V-L1-03)', async () => {
    await openStability();
    /* The unflagged long-term study: 0 of its 2 results were assessed within,
       and the chip must not say "2/2" in the ok colour. */
    const lt = screen.getAllByText('C2C201-DS-2502').map((el) => el.closest('tr')).find((tr) => tr && within(tr).queryByText(/\/2$/));
    expect(lt, 'the long-term study has a shelf-life evidence row').toBeTruthy();
    const chip = within(lt as HTMLElement).getByText(/\/2$/, { selector: '.rd-chip' });
    expect(chip.textContent).toBe('0/2');
    expect(chip.className).not.toContain('tone-ok');
    expect(chip.className).toContain('tone-dim');
    /* The accelerated study: 1 within, 1 outside, in the error colour. */
    const acc = screen.getAllByText('C2C201-DP-2503').map((el) => el.closest('tr')).find((tr) => tr && within(tr).queryByText(/\/2$/));
    const accChip = within(acc as HTMLElement).getByText(/\/2$/, { selector: '.rd-chip' });
    expect(accChip.textContent).toBe('1/2');
    expect(accChip.className).toContain('tone-err');
  });
});

describe('GA-DEMO-02 — a recorded pass the result contradicts is shown as contradicted', () => {
  const PROJECT = 'a3b1c2d4-e5f6-4a1b-8c2d-0123456789ab';
  const QC_READ = `/api/cmc/qc-testing?projectId=${encodeURIComponent(PROJECT)}`;
  const base = {
    sampleType: 'in-process', testMethod: 'HPLC-UV assay', testDate: '2026-04-06T00:00:00.000Z',
    releaseDate: null, analyst: 4, reviewedBy: 5, specifications: { acceptanceCriteria: '98.0 - 102.0 %' },
  };
  const ROWS = [
    { ...base, id: 1, sampleId: 'DS-2502-R1', passFailStatus: 'pass', testResults: { value: '99.6', unit: '%' }, conformance: 'within' },
    { ...base, id: 2, sampleId: 'DS-2502-R2', passFailStatus: 'pass', testResults: { value: '97.4', unit: '%' }, conformance: 'outside' },
    /* A server that has not compared (an older one) sends no verdict. */
    { ...base, id: 3, sampleId: 'DS-2502-R3', passFailStatus: 'pass', testResults: { value: '97.4', unit: '%' } },
  ];

  beforeEach(() => {
    (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT = { id: PROJECT };
    apiRequest.mockImplementation(async (m: string, u: string) => {
      if (m === 'GET' && u === QC_READ) return res({ success: true, data: ROWS });
      return res({ success: true, data: [] });
    });
  });
  afterEach(() => {
    delete (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT;
  });

  const rowOf = (sample: string) => screen.getByText(sample).closest('tr') as HTMLElement;

  it('DS-2502-R2 reads as a contradicted pass in the error colour', async () => {
    render(<CmQcTesting />);
    await screen.findByText('DS-2502-R2');
    const chip = within(rowOf('DS-2502-R2')).getByText(/contradicted/);
    expect(chip.textContent).toBe('pass, contradicted by its result');
    expect(chip.className).toContain('tone-err');
  });

  it('a pass its result supports reads as a pass', async () => {
    render(<CmQcTesting />);
    await screen.findByText('DS-2502-R1');
    expect(within(rowOf('DS-2502-R1')).queryByText(/contradicted/)).toBeNull();
    expect(within(rowOf('DS-2502-R1')).getByText('pass')).toBeTruthy();
  });

  it('the count line does not count a contradicted pass as a pass', async () => {
    render(<CmQcTesting />);
    await screen.findByText('DS-2502-R2');
    expect(screen.getByText(/3 samples — 2 pass \/ 0 fail — 1 contradicted/)).toBeTruthy();
  });

  it('a contradicted pass recorded as "Passed" reads as contradicted too, as release reads it (V-L1-04)', async () => {
    apiRequest.mockImplementation(async (m: string, u: string) => {
      if (m === 'GET' && u === QC_READ) {
        return res({ success: true, data: [{ ...ROWS[1], id: 9, sampleId: 'ALIAS-R1', passFailStatus: 'Passed' }] });
      }
      return res({ success: true, data: [] });
    });
    render(<CmQcTesting />);
    await screen.findByText('ALIAS-R1');
    expect(within(rowOf('ALIAS-R1')).getByText(/contradicted/).className).toContain('tone-err');
    expect(screen.getByText(/1 samples — 0 pass \/ 0 fail — 1 contradicted/)).toBeTruthy();
  });

  it('with no server verdict, the recorded disposition is shown as recorded', async () => {
    render(<CmQcTesting />);
    await screen.findByText('DS-2502-R3');
    expect(within(rowOf('DS-2502-R3')).queryByText(/contradicted/)).toBeNull();
  });
});
