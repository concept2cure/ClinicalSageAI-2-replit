// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
const request = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async original => ({ ...(await original<typeof import('@/lib/queryClient')>()), apiRequest: request }));
import { DispatchWorkspace } from '../surfaces/SubmissionSeqWorkspaces';
const sub = { id: 3, title: 'Recorded IND', primaryRegion: 'fda', applicationType: 'ind' };
const seq = { id: 7, sequenceNumber: '0000', type: 'original', status: 'dispatched', region: 'fda', validationStatus: 'passed' };
const clear = { cleared: true, blockers: [] };
const assessment = {
  sequenceId: 7, region: 'fda', sequenceStatus: 'dispatched', validationErrors: 0,
  unacknowledgedShadowCriticals: 0, shadowReviewRunCount: 1, shadowReviewMissing: false,
  gate: { cleared: false, blockers: ['The current recorded identity needs a release signature.'] }, freezeGate: clear, dispatchGateOnSigning: clear,
  releaseSignature: { required: true, verdict: 'unsigned', cleared: false },
  readiness: { errors: 0, warnings: 0, infos: 0, findings: [] }, leafCount: 4,
  dispatchAuthorization: { reauthorizing: true, eligible: true, refusal: null }, signer: { state: 'independent' },
};
function mount(overrides: Record<string, unknown> = {}, onGoverned = vi.fn()) {
  request.mockImplementation(async (_method, path) => ({ ok: true, status: 200, json: async () => ({ success: true, data: String(path).endsWith('/dispatch-readiness') ? { ...assessment, ...overrides } : [] }) }));
  render(<DispatchWorkspace sub={sub} seq={seq} onGoverned={onGoverned} />);
  return onGoverned;
}
beforeEach(() => request.mockReset());
afterEach(cleanup);
describe('existing dispatch action renews only an eligible unsent FDA release', () => {
  it('reaches the existing governed dispatch chain for current recorded facts', async () => {
    const onGoverned = mount();
    const button = await screen.findByRole('button', { name: 'Re-sign release for current recorded facts (Part 11 e-signature)' });
    fireEvent.click(button);
    expect(onGoverned).toHaveBeenCalledWith(seq, 'dispatch');
    expect(screen.getByText(/earlier release signature does not cover the current recorded facts/i)).toBeTruthy();
  });
  it.each([undefined, { reauthorizing: true, eligible: false, refusal: 'A transmission has already been attempted.' }, { reauthorizing: false, eligible: true, refusal: null }])('hides renewal without explicit server authorization: %j', async authorization => {
    mount({ dispatchAuthorization: authorization });
    await screen.findByText(/Dispatch gate clear except/);
    expect(screen.queryByRole('button', { name: /Re-sign release/ })).toBeNull();
  });
  it('does not offer renewal while another dispatch gate blocks', async () => {
    mount({ dispatchGateOnSigning: { cleared: false, blockers: ['A completed Shadow Review is required.'] } });
    await screen.findByText(/Dispatch blocked/);
    expect(screen.queryByRole('button', { name: /Re-sign release/ })).toBeNull();
  });
  it('does not offer unnecessary renewal for a currently valid release', async () => {
    mount({ gate: clear, releaseSignature: { required: true, verdict: 'valid', cleared: true } });
    await screen.findByText(/Dispatch gate clear/);
    expect(screen.queryByRole('button', { name: /Re-sign release/ })).toBeNull();
  });
  it('shows the independent signer requirement for a renewal', async () => {
    mount({ signer: { state: 'author' } });
    await screen.findByText(/you cannot re-sign its release/i);
    expect(screen.queryByRole('button', { name: /Re-sign release/ })).toBeNull();
  });
});
