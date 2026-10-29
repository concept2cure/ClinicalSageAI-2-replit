// @vitest-environment jsdom
/**
 * The Risk and Design controls screens mount the same register and trace as
 * Engineering (D2, fold F1 slice B, 2026-10-29;
 * docs/evidence/D2-ONE-ANA/2026-10-29/fold-f1b-engineering-parity/), so what
 * the shared panels do holds on these screens too until they fold:
 *   - Risk reads the open project's risk file and names the project on a new
 *     hazard (slice A left it reading the organization's register); with no
 *     project open it reads the organization's, as before;
 *   - a risk read not keyed to the open project draws no hazard;
 *   - a viewer is offered no write control on either screen.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const H = vi.hoisted(() => ({
  apiRequest: vi.fn(),
  calls: [] as Array<{ method: string; path: string; body?: unknown }>,
  user: null as Record<string, unknown> | null,
  riskAnswer: null as unknown,
}));
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest: (...a: unknown[]) => H.apiRequest(...a),
}));
vi.mock('@/services/portal/authService', () => ({ useAuthUser: () => H.user }));

import { GOVERNED_WRITE_PERMISSION } from '@shared/constants/permissions';
import { Risk } from '../surfaces/Risk';
import { DesignControls } from '../surfaces/DesignControls';
import { __resetSurfaceActionBus } from '../surfaceActions';
import { clearShellProject, publishShellProject } from '../shellProject';

const PROGRAM_ID = '0b6f1c1e-4d2a-4c55-9a1e-3f7b2d9c8e10';
const HAZARD = {
  id: 3, ref_code: 'HZ-03', hazard: 'Sensor drift', hazardous_situation: 'Drift over 14 days', harm: 'Mis-dosing',
  sequence_of_events: '', severity: 4, probability: 3, detectability: 3, residual_probability: 1,
  control_strategy: 'design_reduce', source: 'fmea', status: 'open', acceptable: null,
};
const INPUT = { id: 'DI-01', cat: 'performance', req: 'Battery lasts 14 days', riskRef: null, outputs: [], ver: null, verRef: null, val: null, valRef: null };
const keyed = (data: unknown[]) => ({ data, meta: { count: data.length, scope: 'program', programId: PROGRAM_ID } });
const answer = (status: number, json: unknown) => ({ ok: status < 300, status, json: async () => json });

beforeEach(() => {
  H.calls.length = 0;
  H.user = { name: 'E. Editor', permissions: [GOVERNED_WRITE_PERMISSION] };
  H.riskAnswer = keyed([HAZARD]);
  H.apiRequest.mockReset().mockImplementation(async (method: string, path: string, body?: unknown) => {
    H.calls.push({ method, path, body });
    if (method === 'GET' && path.startsWith('/api/mdx/risk-items')) return answer(200, H.riskAnswer);
    if (method === 'GET' && path.startsWith('/api/design-controls')) return answer(200, keyed([INPUT]));
    if (method === 'POST') return answer(201, { data: { ...HAZARD, id: 4, ref_code: 'HZ-04', hazard: 'Battery swelling', harm: 'Burn' } });
    return answer(200, { data: [] });
  });
});
afterEach(() => { cleanup(); clearShellProject(); __resetSurfaceActionBus(); });

const props = () => ({ surface: { id: 'x' }, onAsk: vi.fn(), onNav: vi.fn() } as unknown as React.ComponentProps<typeof Risk>);
const dots = () => document.querySelectorAll('.riskmx-dot');

describe('Risk reads the open project', () => {
  it("reads that project's risk file, by its id, and names the project on a new hazard", async () => {
    publishShellProject({ id: PROGRAM_ID });
    render(<Risk {...props()} />);
    await waitFor(() => expect(dots()).toHaveLength(1));
    expect(H.calls.filter((c) => c.method === 'GET').map((c) => c.path)).toEqual([`/api/mdx/risk-items?program_id=${PROGRAM_ID}`]);
    expect(document.body.textContent).toContain('This project’s risk register.');

    fireEvent.click(screen.getByRole('button', { name: /New hazard/ }));
    fireEvent.change(screen.getByLabelText(/^Hazard\*?$/), { target: { value: 'Battery swelling' } });
    fireEvent.change(screen.getByLabelText(/^Harm\*?$/), { target: { value: 'Burn' } });
    fireEvent.change(screen.getByLabelText(/^Severity/), { target: { value: 'Critical' } });
    fireEvent.change(screen.getByLabelText(/^Probability/), { target: { value: 'Remote' } });
    fireEvent.click(screen.getByRole('button', { name: /Add hazard/ }));
    await waitFor(() => expect(H.calls.some((c) => c.method === 'POST')).toBe(true));
    expect(H.calls.find((c) => c.method === 'POST')).toMatchObject({ path: '/api/mdx/risk-items', body: { programId: PROGRAM_ID } });
  });

  it('draws no hazard from an answer that is not the open project’s, and offers no New hazard to act on it', async () => {
    H.riskAnswer = { data: [HAZARD], meta: { count: 1, scope: 'organization' } };
    publishShellProject({ id: PROGRAM_ID });
    render(<Risk {...props()} />);
    await screen.findByText("Couldn't load this project's risk file");
    expect(dots()).toHaveLength(0);
    expect((screen.getByRole('button', { name: /New hazard/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("with no project open, reads the organization's register, as before, and names no project", async () => {
    render(<Risk {...props()} />);
    await waitFor(() => expect(dots()).toHaveLength(1));
    expect(H.calls.map((c) => c.path)).toEqual(['/api/mdx/risk-items']);
    expect(document.body.textContent).toContain('Organization-wide risk register.');
  });
});

describe('a viewer, on the screens that still mount the panels', () => {
  it('Risk offers no New hazard, Add risk control or Accept residual', async () => {
    H.user = { name: 'V. Viewer', permissions: [] };
    render(<Risk {...props()} />);
    await waitFor(() => expect(dots()).toHaveLength(1));
    for (const name of [/New hazard/, /Add risk control/, /Accept residual/]) {
      expect(screen.queryByRole('button', { name }), String(name)).toBeNull();
    }
    expect(screen.getByTestId('risk-view-only').textContent).toMatch(/View only/);
  });

  it('Design controls offers no New design input', async () => {
    H.user = { name: 'V. Viewer', permissions: [] };
    publishShellProject({ id: PROGRAM_ID });
    render(<DesignControls {...props()} />);
    await screen.findByText('Battery lasts 14 days');
    expect(screen.queryByRole('button', { name: /New design input/ })).toBeNull();
    expect(screen.getByTestId('design-controls-view-only').textContent).toMatch(/View only/);
    expect(H.calls.filter((c) => c.method !== 'GET')).toEqual([]);
  });
});
