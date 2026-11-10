// @vitest-environment jsdom
/**
 * P-93 (founder, 2026-11-02; docs/LAUNCH_DEFINITION_OF_DONE.md, "P-93 — FDA
 * sequences over 1 GiB are out of scope for launch"): an FDA sequence over the
 * launch ceiling is refused before signing, from the transmit precheck
 * (sequenceTransmitReadiness).
 *
 * What this pins is the screen: the Dispatch tab's read names no environment
 * and is not measured; the click's precheck names one, refuses with the
 * server's sentence, and no e-signature opens. The server's own tests carry the
 * red (server/services/submission-service/__tests__/launch-sequence-size.pglite.test.ts).
 *
 * Same idiom as submissionCenterLifecycleQa: apiRequest mocked at the module
 * boundary, the e-signature's re-auth hook mocked.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
vi.mock('../../hooks/useEsignature', () => ({
  useEsignature: () => ({
    verifyPassword: vi.fn(async () => ({ valid: true })), verifyMfa: vi.fn(async () => ({ valid: true })), sign: vi.fn(),
    verifyingPassword: false, verifyingMfa: false, signing: false, signError: null,
  }),
}));

import { SubmissionCenter } from '../surfaces/SubmissionCenter';

const SUBS = [{ id: 7, title: 'ZX-9 First-in-Human', productName: 'Zexanib', applicationType: 'ind', clientType: 'biotech', primaryRegion: 'fda', status: 'active', lifecycleStage: 'original' }];
const SEQ = { id: 21, sequenceNumber: '0000', type: 'original', status: 'dispatched', region: 'fda', validationStatus: 'passed' };
const CLEAR = { cleared: true, blockers: [] };
const READINESS = {
  sequenceId: 21, region: 'fda', sequenceStatus: 'dispatched', validationErrors: 0, unacknowledgedShadowCriticals: 0,
  shadowReviewRunCount: 1, shadowReviewMissing: false, gate: CLEAR, freezeGate: CLEAR, dispatchGateOnSigning: CLEAR,
  readiness: { errors: 0, warnings: 0, infos: 0, findings: [] }, leafCount: 1, signer: { state: 'independent', sources: [] },
};
const TRANSMIT = {
  sequenceStatus: 'dispatched', dispatchStatus: 'pending', route: { ok: true, region: 'fda', gateway: 'esg' },
  configured: { staging: true, production: false }, recordedApplicationNumber: '000512', gate: CLEAR, refusal: null,
};
const SIZE = 'Refusing to transmit: the package is 1.27 GiB, and at launch Concept2Cure sends packages of up to 1 GiB ' +
  'to FDA. The sequence is dispatched, so its leaves can no longer be changed, and it cannot be sent as it is.';
const TEST_SEND_BUTTON = /Send sequence 0000 to the agency's test environment \(Part 11 e-signature\)/;
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body, headers: new Headers() }) as unknown as Response;
const calledWith = (method: string, url: string) => apiRequest.mock.calls.filter((c) => c[0] === method && c[1] === url);

afterEach(cleanup);

describe('an FDA package over 1 GiB is refused before anyone signs (P-93)', () => {
  it('the click’s precheck refuses with the server’s sentence, and no signature is asked for', async () => {
    const prechecks: Array<{ step?: string; environment?: string }> = [];
    apiRequest.mockImplementation(async (method: string, url: string, body?: unknown) => {
      if (method === 'POST' && url === '/api/submissions/sequences/21/governed-precheck') {
        const asked = body as { step?: string; environment?: string };
        prechecks.push(asked);
        return ok(asked.environment
          ? { step: 'transmit', cleared: false, refusal: SIZE, transmit: TRANSMIT }
          : { step: 'transmit', cleared: true, refusal: null, transmit: TRANSMIT });
      }
      if (method === 'GET' && url === '/api/submissions') return ok(SUBS);
      if (method === 'GET' && url === '/api/submissions/7/sequences') return ok([SEQ]);
      if (method === 'GET' && url === '/api/510k/estar/submissions') return ok({ submissions: [] });
      if (method === 'POST' && url === '/api/510k/estar/assemble') return ok({ artifactKind: 'none', blockers: [] });
      if (method === 'GET' && url === '/api/submissions/sequences/21/dispatch-readiness') return ok(READINESS);
      return ok([]);
    });
    render(<SubmissionCenter onAsk={vi.fn()} onNav={vi.fn()} />);
    await waitFor(() => expect(document.body.textContent).toContain('ZX-9 First-in-Human'));
    fireEvent.click(screen.getByRole('tab', { name: 'Dispatch' }));
    const transmit = await screen.findByRole('button', { name: TEST_SEND_BUTTON });
    await waitFor(() => expect((transmit as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(transmit);
    await waitFor(() => expect(document.body.textContent).toContain(`Transmit of sequence 0000 not started — ${SIZE} Nothing was signed.`));
    expect(prechecks[0]?.environment).toBeUndefined();
    expect(prechecks.at(-1)).toMatchObject({ step: 'transmit', environment: 'staging' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(calledWith('POST', '/api/c2c/actions/sign')).toHaveLength(0);
    expect(calledWith('POST', '/api/submissions/sequences/21/transmit')).toHaveLength(0);
  });
});
