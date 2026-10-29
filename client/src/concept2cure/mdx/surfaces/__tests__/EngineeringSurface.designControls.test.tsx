// @vitest-environment jsdom
/**
 * Engineering carries the project's design-controls trace (D2, fold F1 slice
 * B, 2026-10-29; docs/evidence/D2-ONE-ANA/2026-10-29/fold-f1b-engineering-parity/).
 *
 * The Design controls screen (v2/surfaces/DesignControls.tsx) held the
 * traceability matrix, the gap breakdown with "Close the … gap", the ISO 13485
 * §7.3 checklist, New design input and an Ask AnA on each row. Engineering
 * showed one line: "N traceability rows tracked". Both screens now mount one
 * panel (v2/surfaces/DesignControlsTrace.tsx). Here, on Engineering for an
 * open project:
 *   - the read and the write name the project;
 *   - each function is present;
 *   - a read not keyed to the project, or refused, says so and draws nothing;
 *   - a viewer is offered no write control.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const H = vi.hoisted(() => ({
  apiRequest: vi.fn(),
  calls: [] as Array<{ method: string; path: string; body?: unknown }>,
  user: null as Record<string, unknown> | null,
  dcAnswer: null as unknown,
  dcThrows: null as unknown,
}));

vi.mock('@/utils/authToken', () => ({ getAuthToken: () => 'test-token', getOrgId: () => '7' }));
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest: (...a: unknown[]) => H.apiRequest(...a),
}));
vi.mock('@/services/portal/authService', () => ({ useAuthUser: () => H.user }));

import { ApiRequestError, extractApiError } from '@/lib/queryClient';
import { GOVERNED_WRITE_PERMISSION } from '@shared/constants/permissions';
import { EngineeringSurface } from '../EngineeringSurface';
import type { Program } from '../../data/programs';

const PROGRAM = { id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', title: 'ENG-1 Sensor', code: 'ENG-1' } as unknown as Program;
const RISK_PATH = `/api/mdx/risk-items?program_id=${PROGRAM.id}`;
const DC_PATH = `/api/design-controls?program_id=${PROGRAM.id}`;

const input = (id: string, over: Record<string, unknown> = {}) => ({
  id, cat: 'performance', req: `Requirement ${id}`, riskRef: null, outputs: [{ id: `DO-${id}`, desc: 'Output' }],
  ver: 'pass', verRef: 'VER-1', val: 'pass', valRef: 'VAL-1', ...over,
});
/** One fully traced input, one with no output (the first gap), one unvalidated and tied to a hazard. */
const INPUTS = [
  input('DI-01'),
  input('DI-02', { outputs: [], ver: null, val: null }),
  input('DI-03', { val: 'pending', riskRef: 'HZ-01' }),
];
const keyed = (data: unknown[]) => ({ data, meta: { count: data.length, scope: 'program', programId: PROGRAM.id } });

const ENGINEERING = {
  data: {
    summary: { dhfCompletion: 0, openEcrs: 0, openRisks: 0, openIssues: 0, riskLastUpdated: null },
    dhf: [], trace: [], risks: [], ecrs: [], issues: [], documents: [],
  },
  meta: { scopes: { risks: 'program', trace: 'program', dhf: 'organization', ecrs: 'organization', issues: 'organization', documents: 'organization' }, unavailable: [] },
};

const answer = (status: number, json: unknown) => ({ ok: status < 300, status, json: async () => json, text: async () => JSON.stringify(json) });
const refusedWith = (status: number, body: unknown) => {
  const { message, code } = extractApiError(body, status);
  return new ApiRequestError(message, status, body, code);
};

beforeEach(() => {
  H.calls.length = 0;
  H.user = { name: 'E. Editor', permissions: [GOVERNED_WRITE_PERMISSION] };
  H.dcAnswer = keyed(INPUTS);
  H.dcThrows = null;
  H.apiRequest.mockReset().mockImplementation(async (method: string, path: string, body?: unknown) => {
    H.calls.push({ method, path, body });
    if (method === 'GET' && path === DC_PATH) {
      if (H.dcThrows) throw H.dcThrows;
      return answer(200, H.dcAnswer);
    }
    if (method === 'GET' && path === RISK_PATH) return answer(200, keyed([]));
    if (method === 'POST' && path === '/api/design-controls') {
      return answer(201, { data: input('DI-04', { req: 'Battery lasts 14 days', outputs: [], ver: null, verRef: null, val: null, valRef: null }), meta: { created: true, scope: 'program', programId: PROGRAM.id } });
    }
    return answer(200, { data: [] });
  });
  vi.stubGlobal('fetch', vi.fn(async () => answer(200, ENGINEERING)));
});
afterEach(() => { vi.unstubAllGlobals(); cleanup(); });

const onAskAna = vi.fn();
function mount() {
  onAskAna.mockReset();
  return render(<EngineeringSurface program={PROGRAM} onAskAna={onAskAna} onOpenEditor={() => {}} />);
}
const panel = () => screen.getByTestId('eng-design-controls');
const matrixRows = () => Array.from(panel().querySelectorAll('.dc-matrix .dc-mrow'));
async function loaded() {
  mount();
  await waitFor(() => expect(matrixRows()).toHaveLength(3));
}
const writes = () => H.calls.filter((c) => c.method !== 'GET');

describe("Engineering reads the open project's design inputs", () => {
  it('reads them by the project', async () => {
    await loaded();
    expect(H.calls.filter((c) => c.method === 'GET' && c.path.startsWith('/api/design-controls')).map((c) => c.path)).toEqual([DC_PATH]);
  });
});

describe('every function of the design-controls trace, on Engineering', () => {
  it('draws the traceability matrix: input, output, verification, validation', async () => {
    await loaded();
    expect(matrixRows().map((r) => r.querySelector('.dc-in-id')?.textContent)).toEqual(['DI-01', 'DI-02', 'DI-03']);
    expect(matrixRows()[1].textContent).toMatch(/missing/);
    expect(matrixRows()[1].getAttribute('data-gap')).toBe('true');
    expect(matrixRows()[0].getAttribute('data-gap')).toBeNull();
  });

  it('breaks down the gaps, and "Close the first gap" asks AnA about it', async () => {
    await loaded();
    expect(panel().textContent).toMatch(/2 of 3 design inputs are not yet fully traced/);
    fireEvent.click(within(panel()).getByRole('button', { name: 'Close the DI-02 gap' }));
    expect(onAskAna).toHaveBeenCalledWith('What is missing to fully trace DI-02 (Requirement DI-02)?');
  });

  it('shows the ISO 13485 §7.3 checklist, with the elements no store evidences', async () => {
    await loaded();
    const rows = Array.from(panel().querySelectorAll('.dc-820 .dc-820-row'));
    expect(rows).toHaveLength(9);
    expect(within(panel()).getAllByText('Not tracked in this store')).toHaveLength(4);
  });

  it('asks AnA from a row: the hazard an input controls', async () => {
    await loaded();
    fireEvent.click(within(matrixRows()[2] as HTMLElement).getByRole('button', { name: /HZ-01/ }));
    expect(onAskAna).toHaveBeenCalledWith('Show HZ-01 in the risk file and confirm this input controls it');
  });

  it('adds a design input to the project', async () => {
    await loaded();
    fireEvent.click(within(panel()).getByRole('button', { name: /New design input/ }));
    fireEvent.change(screen.getByLabelText(/^Requirement/), { target: { value: 'Battery lasts 14 days' } });
    fireEvent.change(screen.getByLabelText(/^Category/), { target: { value: 'performance' } });
    fireEvent.click(screen.getByRole('button', { name: /Add design input/ }));
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0]).toMatchObject({ method: 'POST', path: '/api/design-controls', body: { req: 'Battery lasts 14 days', cat: 'performance', programId: PROGRAM.id } });
    await waitFor(() => expect(matrixRows()).toHaveLength(4));
  });
});

describe('a read that is not this project, or refused, says so', () => {
  it.each([
    ["the organization's scope", { data: INPUTS, meta: { count: 3, scope: 'organization' } }],
    ["another project's scope", { data: INPUTS, meta: { count: 3, scope: 'program', programId: '7c1d2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f' } }],
    ['no scope at all', { data: INPUTS, meta: { count: 3 } }],
  ])('draws no input from an answer with %s', async (_what, body) => {
    H.dcAnswer = body;
    mount();
    await waitFor(() => expect(panel().textContent).toMatch(/Couldn't load this project's design inputs/));
    expect(matrixRows()).toHaveLength(0);
    expect(panel().textContent).not.toMatch(/Requirement DI-01/);
    expect((within(panel()).getByRole('button', { name: /New design input/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('a 404 for the project says it is not one this organization can see', async () => {
    H.dcThrows = refusedWith(404, { error: 'Project not found' });
    mount();
    const refusal = await within(await screen.findByTestId('eng-design-controls')).findByTestId('design-controls-project-refused');
    expect(refusal.textContent).toContain("This project isn't one this organization can see");
    expect(refusal.textContent).toContain('Nothing was read for it, so no design input is shown.');
    expect(matrixRows()).toHaveLength(0);
  });

  it('a 503 says the project could not be checked', async () => {
    H.dcThrows = refusedWith(503, { success: false, error: 'VERIFICATION_UNAVAILABLE', message: 'The project ownership check could not be run.' });
    mount();
    const refusal = await within(await screen.findByTestId('eng-design-controls')).findByTestId('design-controls-project-refused');
    expect(refusal.textContent).toContain("This project couldn't be checked, so nothing was shown");
    H.dcThrows = null;
    fireEvent.click(within(refusal).getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(matrixRows()).toHaveLength(3));
  });
});

describe('a viewer is offered no write control', () => {
  it('no New design input, and says the trace is view only', async () => {
    H.user = { name: 'V. Viewer', permissions: [] };
    await loaded();
    expect(within(panel()).queryByRole('button', { name: /New design input/ })).toBeNull();
    expect(within(panel()).getByTestId('design-controls-view-only').textContent).toMatch(/View only/);
    expect(writes()).toEqual([]);
  });

  it('an editor is offered it', async () => {
    await loaded();
    expect(within(panel()).getByRole('button', { name: /New design input/ })).toBeTruthy();
    expect(within(panel()).queryByTestId('design-controls-view-only')).toBeNull();
  });
});
