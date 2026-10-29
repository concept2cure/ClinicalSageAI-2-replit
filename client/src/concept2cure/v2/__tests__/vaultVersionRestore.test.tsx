// @vitest-environment jsdom
/**
 * Restore an earlier version as the next version (MR-08 Stage 5).
 *
 * An earlier version offers "Restore vN as a new version" to the roles the
 * route admits. The reason is held back until it is long enough. The answer
 * names the new version, and a refusal is the server's own words with
 * "Nothing was restored." A dropped connection says the outcome is unknown.
 * Server half: tests/db/vault-version-restore.dbtest.ts.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const H = vi.hoisted(() => ({ canWrite: true, apiRequest: vi.fn() }));
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest: H.apiRequest,
}));
vi.mock('../surfaces/VaultViewOnly', () => ({ useVaultCanWrite: () => H.canWrite }));

import { ApiRequestError } from '@/lib/queryClient';
import { RestoreVersionButton } from '../surfaces/VaultVersionRestore';

const PID = '11111111-1111-4111-8111-111111111111';
const CURRENT = '22222222-2222-4222-8222-222222222222';
const V1 = '33333333-3333-4333-8333-333333333333';
const URL = `/api/c2c/project-vault/${PID}/documents/${CURRENT}/versions/${V1}/restore`;
const REASON = 'Version 2 changed the dosing table in error.';
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

beforeEach(() => { H.canWrite = true; H.apiRequest.mockReset(); });
afterEach(cleanup);

function renderRestore(onRestored = vi.fn()) {
  render(<RestoreVersionButton projectId={PID} documentId={CURRENT} versionId={V1} versionLabel="v1.0" onRestored={onRestored} />);
  fireEvent.click(screen.getByRole('button', { name: 'Restore v1.0 as a new version' }));
  return onRestored;
}

describe('restoring an earlier version', () => {
  it('is not offered to a role the route refuses', () => {
    H.canWrite = false;
    render(<RestoreVersionButton projectId={PID} documentId={CURRENT} versionId={V1} versionLabel="v1.0" />);
    expect(screen.queryByRole('button', { name: /Restore/ })).toBeNull();
  });

  it('holds the request until the reason is long enough, then names the new version', async () => {
    H.apiRequest.mockResolvedValue(json(201, { success: true, data: { document: { version: '3.0' } } }));
    const onRestored = renderRestore();
    const send = screen.getByRole('button', { name: 'Restore v1.0' });
    fireEvent.change(screen.getByLabelText(/Reason for restoring v1.0/), { target: { value: 'undo' } });
    expect((send as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/Reason for restoring v1.0/), { target: { value: REASON } });
    fireEvent.click(send);
    expect((await screen.findByRole('status')).textContent).toContain('v1.0 was restored as v3.0. It has not been reviewed yet.');
    expect(H.apiRequest).toHaveBeenCalledWith('POST', URL, { reason: REASON });
    expect(onRestored).toHaveBeenCalledTimes(1);
  });

  it('says nothing was restored, in the server\'s words, when it is refused', async () => {
    H.apiRequest.mockRejectedValue(new ApiRequestError('HTTP 409', 409, {
      success: false, error: 'SOURCE_BYTES_UNVERIFIED',
      message: 'The stored file of version 1.0 does not match what was recorded for it, so it cannot be restored. Nothing was saved.',
    }));
    const onRestored = renderRestore();
    fireEvent.change(screen.getByLabelText(/Reason for restoring v1.0/), { target: { value: REASON } });
    fireEvent.click(screen.getByRole('button', { name: 'Restore v1.0' }));
    const alert = await screen.findByRole('alert');
    expect((alert).textContent).toContain('Nothing was restored.');
    expect((alert).textContent).toContain('does not match what was recorded');
    expect(onRestored).not.toHaveBeenCalled();
  });

  it('says the outcome is unknown when the connection drops', async () => {
    H.apiRequest.mockRejectedValue(new TypeError('Failed to fetch'));
    renderRestore();
    fireEvent.change(screen.getByLabelText(/Reason for restoring v1.0/), { target: { value: REASON } });
    fireEvent.click(screen.getByRole('button', { name: 'Restore v1.0' }));
    await waitFor(() => expect((screen.getByRole('alert')).textContent).toContain('it is not known whether the version was restored'));
  });
});
