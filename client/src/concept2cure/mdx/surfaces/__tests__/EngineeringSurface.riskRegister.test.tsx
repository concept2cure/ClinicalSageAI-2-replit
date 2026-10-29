// @vitest-environment jsdom
/**
 * Engineering carries the project's whole ISO 14971 risk file (D2, fold F1
 * slice B, 2026-10-29; docs/evidence/D2-ONE-ANA/2026-10-29/fold-f1b-engineering-parity/).
 *
 * The Risk screen (v2/surfaces/Risk.tsx) held the register: every hazard on a
 * 5x5 matrix with an initial/residual toggle, the hazard drawer, the metrics,
 * add hazard, add control, the signed Accept residual, AnA's three matrix
 * actions and the hazard entity context. Engineering showed four rows and a
 * residual-only heatmap. Both screens now mount one register
 * (v2/surfaces/RiskRegister.tsx). Here, on Engineering for an open project:
 *   - every read and write names the project, and nothing is read for a
 *     project Engineering's own route refused;
 *   - each of the register's functions is present;
 *   - a read not keyed to the project, or refused, says so and draws nothing;
 *   - a viewer is offered no write control.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const H = vi.hoisted(() => ({
  apiRequest: vi.fn(),
  calls: [] as Array<{ method: string; path: string; body?: unknown }>,
  user: null as Record<string, unknown> | null,
  riskAnswer: null as unknown,
  riskThrows: null as unknown,
  signed: null as unknown,
}));

vi.mock('@/utils/authToken', () => ({ getAuthToken: () => 'test-token', getOrgId: () => '7' }));
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest: (...a: unknown[]) => H.apiRequest(...a),
}));
vi.mock('@/services/portal/authService', () => ({ useAuthUser: () => H.user }));
vi.mock('../../../_shared/components/EsignModal', () => ({
  esignSignerOf: (u: { name?: string } | null) => (u?.name ? { name: u.name } : undefined),
  EsignModal: (p: {
    action: string; onClose: () => void;
    onSign: (i: { meaning: string; reason: string; password: string }) => Promise<unknown>;
  }) => (
    <div role="dialog" aria-label={p.action}>
      <button onClick={() => p.onSign({ meaning: 'approval', reason: 'Reviewed', password: 'pw' }).then((m) => { H.signed = m; })}>stub-sign</button>
    </div>
  ),
}));

import { ApiRequestError, extractApiError } from '@/lib/queryClient';
import { GOVERNED_WRITE_PERMISSION } from '@shared/constants/permissions';
import { resolveSurfaceAction } from '@shared/navigation/surface-actions';
import { EngineeringSurface } from '../EngineeringSurface';
import { __resetSurfaceActionBus, applySurfaceAction, registeredSurfaceId } from '../../../v2/surfaceActions';
import type { Program } from '../../data/programs';

const PROGRAM = { id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', title: 'ENG-1 Sensor', code: 'ENG-1' } as unknown as Program;
const RISK_PATH = `/api/mdx/risk-items?program_id=${PROGRAM.id}`;
const DC_PATH = `/api/design-controls?program_id=${PROGRAM.id}`;

/** Six hazards: more than the four rows Engineering used to show. */
const hazard = (n: number, over: Record<string, unknown> = {}) => ({
  id: n, ref_code: `HZ-0${n}`, hazard: `Hazard ${n}`, hazardous_situation: `Situation ${n}`, harm: `Harm ${n}`,
  sequence_of_events: '', severity: 3, probability: 3, detectability: 3, residual_probability: 1,
  control_strategy: 'design_reduce', source: 'fmea', status: 'open', acceptable: null, ...over,
});
const HAZARDS = [1, 2, 3, 4, 5, 6].map((n) => hazard(n));
const keyed = (data: unknown[]) => ({ data, meta: { count: data.length, scope: 'program', programId: PROGRAM.id } });

/** Engineering's own route: admitted, risk file per project. */
const ENGINEERING = {
  data: {
    summary: { dhfCompletion: 0, openEcrs: 0, openRisks: 6, openIssues: 0, riskLastUpdated: null },
    dhf: [], trace: [], risks: [], ecrs: [], issues: [], documents: [],
  },
  meta: { scopes: { risks: 'program', trace: 'program', dhf: 'organization', ecrs: 'organization', issues: 'organization', documents: 'organization' }, unavailable: [] },
};

const answer = (status: number, json: unknown) => ({ ok: status < 300, status, json: async () => json, text: async () => JSON.stringify(json) });
/** A refusal, thrown the way apiRequest throws one (assertApiResponseOk). */
const refusedWith = (status: number, body: unknown) => {
  const { message, code } = extractApiError(body, status);
  return new ApiRequestError(message, status, body, code);
};

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  H.calls.length = 0;
  H.user = { name: 'E. Editor', permissions: [GOVERNED_WRITE_PERMISSION] };
  H.riskAnswer = keyed(HAZARDS);
  H.riskThrows = null;
  H.signed = null;
  H.apiRequest.mockReset().mockImplementation(async (method: string, path: string, body?: unknown) => {
    H.calls.push({ method, path, body });
    if (method === 'GET' && path === RISK_PATH) {
      if (H.riskThrows) throw H.riskThrows;
      return answer(200, H.riskAnswer);
    }
    if (method === 'GET' && path === DC_PATH) return answer(200, keyed([]));
    if (method === 'POST' && path === '/api/mdx/risk-items') {
      return answer(201, { data: hazard(7, { ...(body as Record<string, unknown>), id: 7, ref_code: 'HZ-07', hazard: 'Battery swelling', harm: 'Burn' }) });
    }
    if (method === 'POST' && /\/controls$/.test(path)) {
      return answer(201, { data: { id: 91, description: 'Dual-sensor check', control_type: 'protective_measure', status: 'proposed' } });
    }
    if (method === 'PATCH') {
      return answer(200, { data: hazard(1, { status: 'accepted', acceptable: true }), signedAt: '2026-10-29T10:00:00.000Z', sha256Chain: 'c'.repeat(64) });
    }
    return answer(200, { data: [] });
  });
  fetchMock = vi.fn(async () => answer(200, ENGINEERING));
  vi.stubGlobal('fetch', fetchMock);
  (window as unknown as { C2C?: unknown }).C2C = { setContext: vi.fn() };
});
afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
  __resetSurfaceActionBus();
  delete (window as unknown as { C2C?: unknown }).C2C;
});

const onAskAna = vi.fn();
function mount() {
  return render(<EngineeringSurface program={PROGRAM} onAskAna={onAskAna} onOpenEditor={() => {}} />);
}
const register = () => screen.getByTestId('eng-risk-register');
const drawer = () => register().querySelector('.risk-drawer') as HTMLElement;
const dots = () => Array.from(register().querySelectorAll<HTMLButtonElement>('.riskmx-dot'));
async function loaded() {
  mount();
  await waitFor(() => expect(dots().length).toBe(6));
}
const writes = () => H.calls.filter((c) => c.method !== 'GET');
function directive(actionId: string, params: Record<string, unknown> = {}) {
  const res = resolveSurfaceAction(actionId, params);
  if (!res.ok) throw new Error(`${actionId} does not resolve: ${res.error}`);
  return res.directive;
}

describe("Engineering reads the open project's risk file", () => {
  it('reads it by the project, and only after its own route has admitted the project', async () => {
    await loaded();
    expect(H.calls.filter((c) => c.method === 'GET' && c.path.startsWith('/api/mdx/risk-items')).map((c) => c.path)).toEqual([RISK_PATH]);
  });

  it('reads nothing for a project its own route refused', async () => {
    fetchMock.mockImplementation(async () => answer(404, { error: 'Project not found' }));
    mount();
    await screen.findByTestId('eng-project-refused');
    expect(H.calls).toEqual([]);
  });
});

describe('every function of the risk register, on Engineering', () => {
  it('draws the whole register, not four rows: every hazard on the 5x5 matrix', async () => {
    await loaded();
    expect(dots().map((d) => d.title)).toEqual(HAZARDS.map((h) => `HZ-0${h.id} / Hazard ${h.id}`));
    expect(register().querySelectorAll('.riskmx-cell')).toHaveLength(25);
  });

  it('switches the matrix between the initial and the residual assessment', async () => {
    await loaded();
    expect(register().querySelector('.riskmx-dot[data-moved]')).toBeNull();
    fireEvent.click(within(register()).getByRole('button', { name: 'Residual' }));
    expect(register().querySelectorAll('.riskmx-dot[data-moved]')).toHaveLength(6);
    expect(register().textContent).toMatch(/after risk controls \(ISO 14971 section 7\)/);
    fireEvent.click(within(register()).getByRole('button', { name: 'Initial' }));
    expect(register().querySelector('.riskmx-dot[data-moved]')).toBeNull();
  });

  it('opens a hazard in the drawer, and sets the hazard as the entity in context', async () => {
    await loaded();
    fireEvent.click(dots()[3]);
    expect(drawer().querySelector('.dr-title')?.textContent).toBe('Hazard 4');
    expect(drawer().textContent).toMatch(/Situation 4/);
    const setContext = (window as unknown as { C2C: { setContext: ReturnType<typeof vi.fn> } }).C2C.setContext;
    expect(setContext).toHaveBeenLastCalledWith({ entityType: 'risk', entityId: 'HZ-04', entityLabel: 'HZ-04 — Hazard 4' });
  });

  it('shows the metrics of the register', async () => {
    await loaded();
    const metrics = register().querySelector('.metrics') as HTMLElement;
    expect(metrics.textContent).toMatch(/Hazards identified\s*6/);
    expect(metrics.textContent).toMatch(/Residual acceptable\s*0 \/ 6/);
    expect(metrics.textContent).toMatch(/Open evaluations\s*6/);
  });

  it('adds a hazard to the project', async () => {
    await loaded();
    fireEvent.click(within(register()).getByRole('button', { name: /New hazard/ }));
    fireEvent.change(screen.getByLabelText(/^Hazard\*?$/), { target: { value: 'Battery swelling' } });
    fireEvent.change(screen.getByLabelText(/^Harm\*?$/), { target: { value: 'Burn' } });
    fireEvent.change(screen.getByLabelText(/^Severity/), { target: { value: 'Critical' } });
    fireEvent.change(screen.getByLabelText(/^Probability/), { target: { value: 'Remote' } });
    fireEvent.click(screen.getByRole('button', { name: /Add hazard/ }));
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0]).toMatchObject({
      method: 'POST', path: '/api/mdx/risk-items',
      body: { hazard: 'Battery swelling', harm: 'Burn', severity: 4, probability: 2, programId: PROGRAM.id },
    });
    await waitFor(() => expect(drawer().querySelector('.dr-title')?.textContent).toBe('Battery swelling'));
  });

  it('adds a risk control to the selected hazard', async () => {
    await loaded();
    fireEvent.click(within(drawer()).getByRole('button', { name: /Add risk control/ }));
    fireEvent.change(screen.getByLabelText(/^Control description/), { target: { value: 'Dual-sensor check' } });
    fireEvent.change(screen.getByLabelText(/^Control type/), { target: { value: 'protective_measure' } });
    fireEvent.click(screen.getByRole('button', { name: /Add control/ }));
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0]).toMatchObject({ method: 'POST', path: '/api/mdx/risk-items/1/controls', body: { description: 'Dual-sensor check' } });
    await waitFor(() => expect(drawer().textContent).toMatch(/Dual-sensor check/));
  });

  it('accepts residual risk only through the signature dialog (the signed act)', async () => {
    await loaded();
    fireEvent.click(within(drawer()).getByRole('button', { name: /Accept residual/ }));
    expect(writes()).toEqual([]);
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Accept the residual risk of HZ-01' })).getByText('stub-sign'));
    await waitFor(() => expect(H.signed).not.toBeNull());
    expect(writes()).toEqual([{
      method: 'PATCH', path: '/api/mdx/risk-items/1',
      body: { status: 'accepted', meaning: 'approval', reason: 'Reviewed', password: 'pw' },
    }]);
    await waitFor(() => expect(within(drawer()).queryByRole('button', { name: /Accept residual/ })).toBeNull());
  });
});

describe('AnA drives the matrix on Engineering', () => {
  it('registers under device-engineering and opens a hazard, switches the view and focuses a cell', async () => {
    await loaded();
    await waitFor(() => expect(registeredSurfaceId()).toBe('device-engineering'));
    let outcome: { status: string; detail?: string; reason?: string } = { status: '' };
    act(() => { outcome = applySurfaceAction(directive('device-engineering.select-hazard', { hazard: 'Hazard 5' }), vi.fn()) as typeof outcome; });
    expect(outcome).toEqual({ status: 'applied', detail: 'Opened HZ-05 — Hazard 5' });
    expect(drawer().querySelector('.dr-title')?.textContent).toBe('Hazard 5');

    act(() => { outcome = applySurfaceAction(directive('device-engineering.set-matrix-view', { view: 'residual' }), vi.fn()) as typeof outcome; });
    expect(outcome).toEqual({ status: 'applied', detail: 'Showing the residual matrix' });
    expect(register().querySelectorAll('.riskmx-dot[data-moved]')).toHaveLength(6);

    act(() => { outcome = applySurfaceAction(directive('device-engineering.focus-cell', { severity: 'Serious', probability: 'Improbable' }), vi.fn()) as typeof outcome; });
    expect(outcome.status).toBe('applied');
    expect(outcome.detail).toMatch(/^Focused HZ-01 — first of 6 hazards at Serious × Improbable/);
  });

  it('a hazard not in the project is refused with the hazards listed', async () => {
    await loaded();
    await waitFor(() => expect(registeredSurfaceId()).toBe('device-engineering'));
    let outcome: { status: string; reason?: string } = { status: '' };
    act(() => { outcome = applySurfaceAction(directive('device-engineering.select-hazard', { hazard: 'battery fire' }), vi.fn()) as typeof outcome; });
    expect(outcome.status).toBe('failed');
    expect(outcome.reason).toContain('No hazard matching "battery fire"');
  });
});

describe('a read that is not this project, or refused, says so', () => {
  it.each([
    ["the organization's scope", { data: HAZARDS, meta: { count: 6, scope: 'organization' } }],
    ["another project's scope", { data: HAZARDS, meta: { count: 6, scope: 'program', programId: '7c1d2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f' } }],
    ['no scope at all', { data: HAZARDS }],
  ])('draws no hazard from an answer with %s', async (_what, body) => {
    H.riskAnswer = body;
    mount();
    await waitFor(() => expect(register().textContent).toMatch(/Couldn't load this project's risk file/));
    expect(dots()).toHaveLength(0);
    expect(register().textContent).not.toMatch(/Hazard 1/);
  });

  it('a 404 for the project says it is not one this organization can see', async () => {
    H.riskThrows = refusedWith(404, { error: 'Project not found' });
    mount();
    const refusal = await within(await screen.findByTestId('eng-risk-register')).findByTestId('risk-project-refused');
    expect(refusal.textContent).toContain("This project isn't one this organization can see");
    expect(refusal.textContent).toContain('Nothing was read for it, so no risk record is shown.');
    expect(within(refusal).queryByRole('button', { name: 'Try again' })).toBeNull();
    expect(dots()).toHaveLength(0);
  });

  it('a 503 says the project could not be checked, and the retry reads again', async () => {
    H.riskThrows = refusedWith(503, { success: false, error: 'VERIFICATION_UNAVAILABLE', message: 'The project ownership check could not be run.' });
    mount();
    const refusal = await within(await screen.findByTestId('eng-risk-register')).findByTestId('risk-project-refused');
    expect(refusal.textContent).toContain("This project couldn't be checked, so nothing was shown");
    H.riskThrows = null;
    fireEvent.click(within(refusal).getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(dots()).toHaveLength(6));
  });
});

describe('a viewer is offered no write control', () => {
  it('no New hazard, Add risk control or Accept residual, and says the register is view only', async () => {
    H.user = { name: 'V. Viewer', permissions: [] };
    await loaded();
    expect(within(register()).queryByRole('button', { name: /New hazard/ })).toBeNull();
    expect(within(register()).queryByRole('button', { name: /Add risk control/ })).toBeNull();
    expect(within(register()).queryByRole('button', { name: /Accept residual/ })).toBeNull();
    expect(within(register()).getByTestId('risk-view-only').textContent).toMatch(/View only/);
    expect(writes()).toEqual([]);
  });

  it('an editor, and a session that does not say, are offered them', async () => {
    for (const user of [{ name: 'E. Editor', permissions: [GOVERNED_WRITE_PERMISSION] }, { name: 'Old Session' }]) {
      H.user = user;
      await loaded();
      expect(within(register()).getByRole('button', { name: /New hazard/ })).toBeTruthy();
      expect(within(drawer()).getByRole('button', { name: /Add risk control/ })).toBeTruthy();
      expect(within(drawer()).getByRole('button', { name: /Accept residual/ })).toBeTruthy();
      expect(within(register()).queryByTestId('risk-view-only')).toBeNull();
      cleanup();
    }
  });
});
