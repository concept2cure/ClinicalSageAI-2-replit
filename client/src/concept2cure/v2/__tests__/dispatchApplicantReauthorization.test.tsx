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
function mount(overrides: Record<string, unknown> = {}, onGoverned = vi.fn(), region = 'fda') {
  request.mockImplementation(async (_method, path) => ({ ok: true, status: 200, json: async () => ({ success: true, data: String(path).endsWith('/dispatch-readiness') ? { ...assessment, region, ...overrides } : [] }) }));
  render(<DispatchWorkspace sub={{ ...sub, primaryRegion: region }} seq={{ ...seq, region }} onGoverned={onGoverned} />);
  return onGoverned;
}
beforeEach(() => request.mockReset());
afterEach(cleanup);
describe('existing dispatch action renews only a server-authorized unsent release', () => {
  it.each(['fda', 'ema', 'jp'])('reaches the existing governed dispatch chain for current recorded %s facts', async region => {
    const onGoverned = mount({}, vi.fn(), region);
    const button = await screen.findByRole('button', { name: 'Re-sign release for current recorded facts (Part 11 e-signature)' });
    fireEvent.click(button);
    expect(onGoverned).toHaveBeenCalledWith({ ...seq, region }, 'dispatch');
    expect(screen.getByText(/earlier release signature does not cover the current recorded facts/i)).toBeTruthy();
  });
  it.each(['fda', 'ema', 'jp', 'unknown'])('hides %s renewal without explicit server authorization', async region => {
    mount({ dispatchAuthorization: undefined }, vi.fn(), region);
    await screen.findByText(/Dispatch gate clear except/);
    expect(screen.queryByRole('button', { name: /Re-sign release/ })).toBeNull();
  });
  it.each(['ema', 'jp'])('shows a refused %s renewal without asking for a signature', async region => {
    const onGoverned = mount({ dispatchAuthorization: {
      reauthorizing: true, eligible: false, refusal: 'A transmission has already been attempted.',
    } }, vi.fn(), region);
    await screen.findByText('A transmission has already been attempted.');
    expect(screen.queryByRole('button', { name: /Re-sign release/ })).toBeNull();
    expect(onGoverned).not.toHaveBeenCalled();
  });
  it('does not infer renewal from eligibility alone', async () => {
    mount({ dispatchAuthorization: { reauthorizing: false, eligible: true, refusal: null } }, vi.fn(), 'ema');
    await screen.findByText(/Dispatch gate clear except/);
    expect(screen.queryByRole('button', { name: /Re-sign release/ })).toBeNull();
  });
  it.each(['fda', 'ema', 'jp'])('does not offer %s renewal while another dispatch gate blocks', async region => {
    mount({ dispatchGateOnSigning: { cleared: false, blockers: ['A completed Shadow Review is required.'] } }, vi.fn(), region);
    await screen.findByText(/Dispatch blocked/);
    expect(screen.queryByRole('button', { name: /Re-sign release/ })).toBeNull();
  });
  it('does not offer unnecessary renewal for a currently valid release', async () => {
    mount({ gate: clear, releaseSignature: { required: true, verdict: 'valid', cleared: true } });
    await screen.findByText(/Dispatch gate clear/);
    expect(screen.queryByRole('button', { name: /Re-sign release/ })).toBeNull();
  });
  it.each(['fda', 'ema', 'jp'])('shows the independent signer requirement for a %s renewal', async region => {
    mount({ signer: { state: 'author' } }, vi.fn(), region);
    await screen.findByText(/you cannot re-sign its release/i);
    expect(screen.queryByRole('button', { name: /Re-sign release/ })).toBeNull();
  });
});
