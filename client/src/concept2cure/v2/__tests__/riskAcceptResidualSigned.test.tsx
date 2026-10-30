// @vitest-environment jsdom
/**
 * Accepting a hazard's residual risk is an electronic signature, on the screen
 * as on the server (D2, fold F1 slice A, 2026-10-29;
 * docs/evidence/D2-ONE-ANA/2026-10-29/fold-f1a-risk-design-controls-safety/).
 *
 * "Accept residual" sent PATCH /api/mdx/risk-items/:id { status: 'accepted' }
 * and nothing else, while the product tour calls the act a signed human
 * judgment. The server now refuses that unless it carries a password, a
 * meaning and a reason, so the control opens the shared signature dialog
 * (EsignModal, on useEsignature). Here:
 *   - the control opens the dialog without sending anything;
 *   - signing sends the acceptance and the signature components, and the
 *     hazard shows as accepted only after the server confirms it;
 *   - a refusal keeps the dialog open with the server's sentence, and a
 *     dropped connection is not called "nothing was signed".
 *
 * EsignModal's own re-authentication is covered by its own tests. Here it is a
 * stub that hands over what a signer typed, as in the labeling approval test.
 *
 * 2026-10-29 (D2, fold F1c): the Risk screen folded into Engineering evidence,
 * which mounts the same register (v2/surfaces/RiskRegister.tsx) for the open
 * project. These cases run against it as Engineering mounts it
 * (./engineeringPanels.harness.tsx); the read names the project and is keyed to it.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';

const H = vi.hoisted(() => ({
  apiRequest: vi.fn(),
  calls: [] as Array<{ method: string; path: string; body?: unknown }>,
  signed: null as unknown,
  signError: null as string | null,
}));

vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest: (...a: unknown[]) => H.apiRequest(...a),
}));
vi.mock('@/services/portal/authService', async original => ({ ...await original<typeof import('@/services/portal/authService')>(), useAuthUser: () => ({ name: 'A. Approver', mfaEnabled: false }) }));
vi.mock('../../_shared/components/EsignModal', () => ({
  esignSignerOf: (u: { name?: string } | null) => (u?.name ? { name: u.name } : undefined),
  EsignModal: (p: {
    action: string; target: string; targetMeta?: string; meanings?: string[]; defaultMeaning?: string;
    signer?: { name: string }; requireMfa?: boolean; onClose: () => void;
    onSign: (i: { meaning: string; reason: string; password: string; totp?: string }) => Promise<unknown>;
  }) => (
    <div role="dialog" aria-label={p.action} data-meanings={(p.meanings ?? []).join(',')} data-default={p.defaultMeaning}
      data-signer={p.signer?.name} data-mfa={String(p.requireMfa)}>
      <p>{p.target}</p><p>{p.targetMeta}</p>
      <button onClick={() => p.onSign({ meaning: 'approval', reason: 'Residual risk reviewed against the policy', password: 'pw', totp: '123456' })
        .then((m) => { H.signed = m; }).catch((e: Error) => { H.signError = e.message; })}>stub-sign</button>
      <button onClick={p.onClose}>stub-close</button>
    </div>
  ),
}));

import { ApiRequestError } from '@/lib/queryClient';
import { EngineeringRiskPanel, PANEL_PROGRAM_ID, RISK_READ, keyedToPanelProject } from './engineeringPanels.harness';

const HAZARD = {
  id: 41, program_id: PANEL_PROGRAM_ID, ref_code: 'HZ-41', hazard: 'Sensor drift during wear', hazardous_situation: 'Drift over 14 days',
  harm: 'Mis-dosing of insulin', sequence_of_events: '', severity: 4, probability: 3, detectability: 3,
  residual_probability: 1, control_strategy: 'design_reduce', source: 'fmea', status: 'verified', acceptable: null,
};
const SIGNED_ANSWER = {
  data: { ...HAZARD, status: 'accepted', acceptable: true },
  signatureId: 314, signedAt: '2026-10-29T10:00:00.000Z', meaning: 'approval', sha256Chain: 'c'.repeat(64),
};
const answer = (status: number, json: unknown) => ({ ok: status < 300, status, json: async () => json });

/** What the PATCH answers; the read always answers the one hazard. */
let patchAnswer: () => Promise<unknown>;

beforeEach(() => {
  H.calls.length = 0;
  H.signed = null;
  H.signError = null;
  patchAnswer = async () => answer(201, SIGNED_ANSWER);
  H.apiRequest.mockReset().mockImplementation(async (method: string, path: string, body?: unknown) => {
    H.calls.push({ method, path, body });
    if (method === 'PATCH') return patchAnswer();
    if (path === RISK_READ) return answer(200, keyedToPanelProject([HAZARD]));
    return answer(200, { data: null });
  });
});
afterEach(() => cleanup());

const patches = () => H.calls.filter((c) => c.method === 'PATCH');
const drawer = () => document.querySelector('.risk-drawer') as HTMLElement;

async function renderRisk() {
  render(<EngineeringRiskPanel onAsk={vi.fn()} />);
  await screen.findAllByText('Sensor drift during wear');
}
async function openAcceptance() {
  await renderRisk();
  fireEvent.click(within(drawer()).getByRole('button', { name: /Accept residual/ }));
  return screen.getByRole('dialog', { name: 'Accept the residual risk of HZ-41' });
}

describe('Accept residual opens the signature dialog', () => {
  it('opens the dialog for what is signed, with the acceptance meanings, and sends nothing yet', async () => {
    const dialog = await openAcceptance();
    expect(dialog.getAttribute('data-meanings')).toBe('approval,responsibility');
    expect(dialog.getAttribute('data-default')).toBe('approval');
    expect(dialog.getAttribute('data-signer')).toBe('A. Approver');
    expect(dialog.textContent).toContain('HZ-41');
    expect(dialog.textContent).toContain('Sensor drift during wear');
    expect(dialog.textContent).toContain('accepts this hazard’s residual risk as it stands');
    expect(patches()).toEqual([]);
  });

  it('closing the dialog sends nothing and leaves the hazard unaccepted', async () => {
    const dialog = await openAcceptance();
    fireEvent.click(within(dialog).getByText('stub-close'));
    expect(screen.queryByRole('dialog', { name: 'Accept the residual risk of HZ-41' })).toBeNull();
    expect(patches()).toEqual([]);
    expect(within(drawer()).getByRole('button', { name: /Accept residual/ })).toBeTruthy();
  });
});

describe('the signed acceptance', () => {
  it('sends the acceptance and the signature components to the signed route', async () => {
    const dialog = await openAcceptance();
    fireEvent.click(within(dialog).getByText('stub-sign'));
    await waitFor(() => expect(H.signed).not.toBeNull());
    expect(patches()).toEqual([{
      method: 'PATCH',
      path: `/api/mdx/risk-items/41?program_id=${PANEL_PROGRAM_ID}`,
      body: {
        status: 'accepted', meaning: 'approval', reason: 'Residual risk reviewed against the policy',
        password: 'pw', mfaToken: '123456',
      },
    }]);
    // The confirmation carries the signature row's time, never the browser's.
    expect(H.signed).toEqual({
      meaning: 'approval', reason: 'Residual risk reviewed against the policy',
      signedAt: '2026-10-29T10:00:00.000Z', hash: 'c'.repeat(64),
    });
  });

  it('shows the hazard accepted once the server confirms it', async () => {
    const dialog = await openAcceptance();
    fireEvent.click(within(dialog).getByText('stub-sign'));
    await waitFor(() => expect(within(drawer()).queryByRole('button', { name: /Accept residual/ })).toBeNull());
    expect(within(drawer()).getByText('Accepted')).toBeTruthy();
    // The residual acceptability is the server's, set by the same signed act.
    expect(within(drawer()).getByText('Acceptable')).toBeTruthy();
  });

  it("a refusal keeps the dialog open with the server's sentence, and the hazard stays unaccepted", async () => {
    patchAnswer = async () => {
      throw new ApiRequestError(
        'Your role does not permit applying an electronic signature (21 CFR Part 11 §11.10(g)). Nothing was signed.',
        403, null, 'ESIGNATURE_NO_AUTHORITY',
      );
    };
    const dialog = await openAcceptance();
    fireEvent.click(within(dialog).getByText('stub-sign'));
    await waitFor(() => expect(H.signError).not.toBeNull());
    expect(H.signError).toBe('Your role does not permit applying an electronic signature (21 CFR Part 11 §11.10(g)). Nothing was signed.');
    expect(screen.getByRole('dialog', { name: 'Accept the residual risk of HZ-41' })).toBeTruthy();
    expect(within(drawer()).getByRole('button', { name: /Accept residual/ })).toBeTruthy();
  });

  it('a password the ceremony did not accept (401) is said once, ending "Nothing was signed."', async () => {
    patchAnswer = async () => answer(401, { error: { code: 'PASSWORD_VERIFICATION_FAILED', message: 'The password was not accepted. Nothing was signed.' } });
    const dialog = await openAcceptance();
    fireEvent.click(within(dialog).getByText('stub-sign'));
    await waitFor(() => expect(H.signError).not.toBeNull());
    expect(H.signError).toBe('The password was not accepted. Nothing was signed.');
    expect(within(drawer()).getByRole('button', { name: /Accept residual/ })).toBeTruthy();
  });

  it('a dropped connection says the outcome is unconfirmed, not that nothing was signed', async () => {
    patchAnswer = async () => { throw new TypeError('Failed to fetch'); };
    const dialog = await openAcceptance();
    fireEvent.click(within(dialog).getByText('stub-sign'));
    await waitFor(() => expect(H.signError).not.toBeNull());
    expect(H.signError).toMatch(/did not confirm the acceptance/);
    expect(H.signError).not.toMatch(/Failed to fetch|Nothing was signed/);
  });

  it('an answer that carries no signature is not shown as accepted', async () => {
    patchAnswer = async () => answer(200, { data: { ...HAZARD, status: 'accepted' } });
    const dialog = await openAcceptance();
    fireEvent.click(within(dialog).getByText('stub-sign'));
    await waitFor(() => expect(H.signError).not.toBeNull());
    expect(H.signError).toMatch(/did not confirm the acceptance/);
    expect(within(drawer()).getByRole('button', { name: /Accept residual/ })).toBeTruthy();
  });
});
