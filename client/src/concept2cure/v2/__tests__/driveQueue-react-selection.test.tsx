// @vitest-environment jsdom
/** Consecutive moves in one drive batch must read the newly selected submission. */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
vi.mock('@/services/portal/authService', () => ({ useAuthUser: () => ({ id: 7, firstName: 'Ada' }) }));
vi.mock('@/utils/authToken', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/utils/authToken')>()),
  getAuthHeaders: () => ({ Authorization: 'Bearer test', 'x-organization-id': '1' }),
}));

import { SubmissionCenter } from '../surfaces/SubmissionCenter';
import { createDriveQueue } from '../driveQueue';
import {
  __resetSurfaceActionBus,
  applySurfaceAction,
  cancelPendingSurfaceAction,
  registeredSurfaceId,
} from '../surfaceActions';
import { resolveSurfaceAction } from '@shared/navigation/surface-actions';

const submissions = [
  { id: 7, title: 'Alpha IND', productName: 'Alpha', applicationType: 'ind', clientType: 'biotech', primaryRegion: 'fda', status: 'active', lifecycleStage: 'original' },
  { id: 8, title: 'Beta IND', productName: 'Beta', applicationType: 'ind', clientType: 'biotech', primaryRegion: 'fda', status: 'active', lifecycleStage: 'original' },
];
const sequence = (id: number, sequenceNumber: string) => ({
  id, sequenceNumber, type: 'original', status: 'assembling', region: 'fda', validationStatus: 'pending',
});
const response = (data: unknown) => ({ ok: true, status: 200, json: async () => data }) as Response;
const betaSequences = [sequence(22, '0000'), sequence(23, '0001')];
let betaRead: Promise<Response> | undefined;
function directive(actionId: string, params: Record<string, string>) {
  const resolved = resolveSurfaceAction(actionId, params);
  if (!resolved.ok) throw new Error(resolved.error);
  return resolved.directive;
}

beforeEach(() => {
  betaRead = undefined;
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (_method: string, url: string) => {
    if (url === '/api/submissions') return response(submissions);
    if (url === '/api/submissions/7/sequences') return response([sequence(21, '0000')]);
    if (url === '/api/submissions/8/sequences') return betaRead ?? response(betaSequences);
    return response({});
  });
});
afterEach(() => { cleanup(); __resetSurfaceActionBus(); });

describe('a healthy drive batch across React selection state', () => {
  it.each([false, true])('selects a submission then its sequence without manual renders (delayed read: %s)', async delayed => {
    let releaseBeta!: (value: Response) => void;
    if (delayed) betaRead = new Promise(resolve => { releaseBeta = resolve; });
    render(<SubmissionCenter onAsk={vi.fn()} />);
    await screen.findByText('Alpha IND');
    await waitFor(() => expect(registeredSurfaceId()).toBe('submission-center'));
    act(() => {
      applySurfaceAction(directive('submissions.set-workspace', { workspace: 'validation' }), vi.fn());
    });
    expect((await screen.findByRole('combobox', { name: 'Working sequence' }) as HTMLSelectElement).value).toBe('21');

    const onApplied = vi.fn();
    const onFailed = vi.fn();
    const nav = vi.fn();
    const queue = createDriveQueue({
      navigate: nav,
      isShowing: () => true,
      perform: (move, onDeferred) => applySurfaceAction(move, nav, onDeferred, { waitForCommit: true }),
      cancelPending: cancelPendingSurfaceAction,
      canApply: () => true,
      onApplied,
      onFailed,
      onDropped: vi.fn(),
      sleep: ms => new Promise(resolve => setTimeout(resolve, ms)),
    });
    act(() => {
      queue.push({ kind: 'act', directive: directive('submissions.select-submission', { submission: 'Beta IND' }) });
      queue.push({ kind: 'act', directive: directive('submissions.select-sequence', { sequence: '0001' }) });
    });
    // Allow React to commit normally while the queue runs; do not hold its
    // renders inside an async act() that awaits the queue itself.
    if (delayed) {
      await waitFor(() => expect(onApplied).toHaveBeenCalledTimes(1));
      expect(onFailed).not.toHaveBeenCalled();
      expect(apiRequest).toHaveBeenCalledWith('GET', '/api/submissions/8/sequences');
      expect(queue.size()).toBe(1);
      await act(async () => { releaseBeta(response(betaSequences)); });
    }
    await waitFor(() => expect(onApplied.mock.calls.length + onFailed.mock.calls.length).toBe(2));
    expect(onFailed.mock.calls.map(([, reason]) => reason)).toEqual([]);
    expect(onApplied.mock.calls.map(([, detail]) => detail)).toEqual([
      'Selected Beta IND — the working sequence and any verdict notice were cleared',
      'Selected sequence 0001 as the working sequence',
    ]);
    expect((screen.getByRole('combobox', { name: 'Submission to work on' }) as HTMLSelectElement).value).toBe('8');
    expect((screen.getByRole('combobox', { name: 'Working sequence' }) as HTMLSelectElement).value).toBe('23');
  });
});
