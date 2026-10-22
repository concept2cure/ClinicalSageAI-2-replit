// @vitest-environment jsdom
/**
 * The Submission Center's package download (Dispatch → PackageDownload) sends
 * the review the export gate requires, from the signed-in user's confirmation.
 *
 * Until 2026-10-15 it posted { sequenceNumber } alone to
 * POST /api/ectd/export/:submissionId. The export review gate refuses an
 * export with no review in production (403 HUMAN_REVIEW_REQUIRED), so the
 * one download control the Submission Center has could not deliver there. It
 * now sends `governance`: not reviewed until the person ticks the
 * confirmation, then their session name and role and the moment they ticked.
 *
 * Same idiom as submissionCenterLifecycleQa: apiRequest mocked at the module
 * boundary, the real SubmissionCenter rendered.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
const session = vi.hoisted(() => ({ user: null as Record<string, unknown> | null }));
vi.mock('@/services/portal/authService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/portal/authService')>()),
  useAuthUser: () => session.user,
}));
const downloadBlob = vi.hoisted(() => vi.fn(() => true));
vi.mock('../download', () => ({ downloadBlob }));

import { SubmissionCenter } from '../surfaces/SubmissionCenter';

const DANA = { id: '3', email: 'dana@example.com', displayName: 'Dana Reviewer', roles: ['regulatory_affairs', 'user'], organizationId: '7' };
const TICKED = '2026-10-15T09:00:00.000Z';
const PRESSED = '2026-10-15T09:30:00.000Z';

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
  configured: { staging: false, production: false }, recordedApplicationNumber: '000512', gate: CLEAR,
  refusal: 'No gateway credentials are configured for this organization, so nothing can be sent.',
};
const ok = (body: unknown, status = 200) => ({ ok: true, status, json: async () => body, headers: new Headers() }) as unknown as Response;

function serve() {
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (method === 'GET' && url === '/api/submissions') return ok(SUBS);
    if (method === 'GET' && url === '/api/submissions/7/sequences') return ok([SEQ]);
    if (method === 'GET' && url === '/api/510k/estar/submissions') return ok({ submissions: [] });
    if (method === 'POST' && url === '/api/510k/estar/assemble') return ok({ artifactKind: 'none', blockers: [] });
    if (method === 'GET' && url === '/api/submissions/sequences/21/dispatch-readiness') return ok(READINESS);
    if (method === 'POST' && url === '/api/submissions/sequences/21/governed-precheck') return ok({ step: 'transmit', cleared: false, refusal: 'x', transmit: TRANSMIT });
    if (method === 'POST' && url === '/api/ectd/export/7') {
      return { ok: true, status: 200, blob: async () => new Blob(['PK']), headers: new Headers({ 'Content-Disposition': 'attachment; filename="ind-000512-0000.zip"' }) } as unknown as Response;
    }
    return ok([]);
  });
}
const exportBodies = () =>
  apiRequest.mock.calls.filter((c) => c[0] === 'POST' && c[1] === '/api/ectd/export/7').map((c) => c[2] as Record<string, unknown>);

async function dispatchTab() {
  render(<SubmissionCenter onAsk={vi.fn()} onNav={vi.fn()} />);
  await waitFor(() => expect(document.body.textContent).toContain('ZX-9 First-in-Human'));
  fireEvent.click(screen.getByRole('tab', { name: 'Dispatch' }));
  return screen.findByRole('button', { name: /Download the eCTD package \(zip\)/ });
}

beforeEach(() => {
  session.user = DANA;
  downloadBlob.mockClear();
  serve();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('Submission Center package download: the review is the signed-in user’s confirmation', () => {
  it('says it was not reviewed until the person confirms, then sends their name, role and confirmation time', async () => {
    const download = await dispatchTab();

    fireEvent.click(download);
    await waitFor(() => expect(exportBodies()).toHaveLength(1));
    expect(exportBodies()[0].governance, 'the package download sent no review block').toEqual({ humanReviewApproved: false });

    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(TICKED));
    fireEvent.click(screen.getByRole('checkbox', { name: /I confirm my review of sequence 0000's package/ }));
    vi.setSystemTime(new Date(PRESSED));
    fireEvent.click(download);
    await waitFor(() => expect(exportBodies()).toHaveLength(2));
    expect(exportBodies()[1]).toEqual({
      sequenceNumber: '0000',
      governance: { humanReviewApproved: true, reviewerName: 'Dana Reviewer', reviewerRole: 'regulatory_affairs', reviewTimestamp: TICKED },
    });
  });

  it('with no signed-in user known, offers no confirmation and sends not reviewed', async () => {
    session.user = null;
    const download = await dispatchTab();
    expect(screen.queryByRole('checkbox', { name: /I confirm my review/ })).toBeNull();
    fireEvent.click(download);
    await waitFor(() => expect(exportBodies()).toHaveLength(1));
    expect(exportBodies()[0].governance).toEqual({ humanReviewApproved: false });
  });
});
