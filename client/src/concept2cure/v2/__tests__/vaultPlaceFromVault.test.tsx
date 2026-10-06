// @vitest-environment jsdom
/**
 * Place into submission, opened from the Vault's own control.
 *
 * The dialog's unit tests pass `filing` and `projectId` by hand, so they cannot
 * show that the Vault passes them. Here the real surface opens the dialog: a
 * document whose filing is confirmed at 3.2.P.8.3 arrives with that section
 * already in the Section code field, and the dialog reads this version's stage
 * from the project's versions route — the read that tells the person, before
 * they place it, whether the server would transmit it.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { Vault } from '../surfaces/Vault';
import { PID, DOC_ID, ok, uploadDoc, cabinetTree, vaultPayload, props } from './_vault-surface-fixtures';

const VERSIONS_URL = `/api/c2c/project-vault/${PID}/documents/${DOC_ID}/versions`;

const filed = (placementStatus: string) =>
  uploadDoc({
    mimeType: 'application/pdf',
    filing: { ...uploadDoc().filing, ctdSection: '3.2.P.8.3', placementStatus },
  });

const versionsAnswer = () =>
  ok({
    success: true,
    data: {
      versions: [{
        id: DOC_ID, version: '1.0', contentHash: 'a'.repeat(64), fileSize: 1024, fileName: 'stability-summary-24m.pdf',
        uploader: 'Ada Author', createdAt: '2026-09-30T10:00:00.000Z', current: true, link: 'none',
        lifecycle: { canonicalId: 'c-1', stage: 'in_review', review: null, approval: null },
        transmitRefusal: 'in_review, not approved', placements: [],
      }],
    },
  });

function mockApi(doc: unknown, loseReply = false) {
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (url === `/api/c2c/project-vault/${PID}` && method === 'GET') return ok(vaultPayload({ tree: cabinetTree([doc]) }));
    if (url === VERSIONS_URL && method === 'GET') return versionsAnswer();
    if (url === '/api/submissions') return ok([{ id: 4, title: 'Our IND', applicationType: 'ind', primaryRegion: 'us', status: 'open', programId: PID }]);
    if (url === '/api/submissions/4/sequences') return ok([{ id: 9, sequenceNumber: '0000', type: 'original', status: 'draft', region: 'us' }]);
    if (method === 'PUT' && loseReply) throw new Error('lost reply');
    return ok({});
  });
}

const versionReads = () => apiRequest.mock.calls.filter(([m, u]) => m === 'GET' && u === VERSIONS_URL).length;

/** Open the dialog from the Vault's control, once the detail pane has made its own read. */
async function openDialog(surfaceProps = props()) {
  render(<Vault {...surfaceProps} />);
  const control = await screen.findByTestId('vault-place-into-submission');
  // The detail pane's version list reads the same route, so the dialog's read
  // is shown by the count going up after the click, not by the call existing.
  await waitFor(() => expect(versionReads()).toBeGreaterThan(0));
  const before = versionReads();
  fireEvent.click(control);
  const dialog = await screen.findByRole('dialog', { name: /place into submission/i });
  return { dialog, before };
}

beforeEach(() => { (window as any).C2C_PROJECT = { id: PID, title: 'BX-301' }; });
afterEach(() => { cleanup(); delete (window as any).C2C_PROJECT; });

describe('Place into submission from the Vault', () => {
  it('opens the existing Submission Center to check a lost placement reply', async () => {
    mockApi(filed('confirmed'), true);
    const surfaceProps = props();
    const { dialog } = await openDialog(surfaceProps);
    fireEvent.change(await within(dialog).findByLabelText('Target submission'), { target: { value: '4' } });
    await within(dialog).findByLabelText('Sequence');
    fireEvent.change(within(dialog).getByLabelText(/^Reason for this placement/), { target: { value: 'Approved stability summary for IND' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /^Place into submission$/ }));
    fireEvent.click(await within(dialog).findByRole('button', { name: 'Check filing status' }));
    expect(surfaceProps.onNav).toHaveBeenCalledWith('submission-center');
    expect(screen.queryByRole('dialog', { name: /place into submission/i })).toBeNull();
  });

  it('opens with a confirmed filing\'s section filled in, and reads this version\'s stage', async () => {
    mockApi(filed('confirmed'));
    const { dialog, before } = await openDialog();

    expect((within(dialog).getByLabelText(/^Section code/) as HTMLInputElement).value).toBe('3.2.P.8.3');
    expect(within(dialog).getByText("Pre-filled from this document's confirmed filing.")).toBeTruthy();

    await waitFor(() => expect(versionReads()).toBeGreaterThan(before));
    expect(apiRequest).toHaveBeenCalledWith('GET', VERSIONS_URL);
    expect(await within(dialog).findByText('Review and approval: In review.')).toBeTruthy();
    expect(within(dialog).getByText(/This version would not be transmitted: in_review, not approved\./)).toBeTruthy();
  });

  it('leaves a suggested filing\'s section for the person to enter', async () => {
    mockApi(filed('suggested'));
    const { dialog } = await openDialog();

    expect((within(dialog).getByLabelText(/^Section code/) as HTMLInputElement).value).toBe('');
    expect(within(dialog).getByText(/The filing suggests 3\.2\.P\.8\.3\. It is not confirmed/)).toBeTruthy();
  });
});
