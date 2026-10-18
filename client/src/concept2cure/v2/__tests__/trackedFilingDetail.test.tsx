// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TaskFilingHome } from '@shared/types/task-filing-home';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { ApiRequestError } from '@/lib/queryClient';
import { TrackedFilingDetail } from '../surfaces/TrackedFilingDetail';

const FIRST = '11111111-1111-4111-8111-111111111111';
const SECOND = '22222222-2222-4222-8222-222222222222';
const PROGRAM = '33333333-3333-4333-8333-333333333333';
const DOCUMENT = '44444444-4444-4444-8444-444444444444';
const HASH = 'b'.repeat(64);
const saved = (id = FIRST, title = 'Recorded device filing'): TaskFilingHome => ({
  filing: {
    id, title, catalogKey: '510k-traditional-device', programType: '510k', variant: 'device',
    status: 'under_review', decision: 'Recorded decision', fdaTrackingNumber: 'K260123',
    filedAt: '2026-08-01T12:00:00.000Z', reviewGoalDays: 90,
    decisionDueAt: '2026-10-30T12:00:00.000Z',
    filedArtifactDocumentId: DOCUMENT, filedArtifactSha256: HASH,
    notes: 'Recorded note\nSecond line', createdAt: '2026-07-15T12:00:00.000Z', updatedAt: '2026-08-02T12:00:00.000Z',
  },
  home: { source: 'filing', nativeId: id, projectId: 42, programId: PROGRAM, programTitle: 'Device programme' },
});
const reply = (status: number, data: unknown) => ({
  ok: status >= 200 && status < 300, status, json: async () => data,
}) as Response;
const success = (data = saved()) => reply(200, { success: true, data });
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

beforeEach(() => { apiRequest.mockReset(); });
afterEach(cleanup);

describe('Tracked filing detail', () => {
  it('loads only the requested record and renders its saved fields without lifecycle actions', async () => {
    const pending = deferred<Response>();
    apiRequest.mockReturnValue(pending.promise);
    const onClose = vi.fn();
    render(<TrackedFilingDetail filingId={FIRST} onClose={onClose} />);
    expect(screen.getByRole('status').textContent).toContain('Loading tracked filing');
    expect(apiRequest).toHaveBeenCalledWith('GET', `/api/task-management/filings/${FIRST}`);
    pending.resolve(success());
    await screen.findByRole('heading', { name: 'Recorded device filing' });
    for (const value of ['510k-traditional-device', 'under_review', 'Recorded decision', 'K260123', '90 days', DOCUMENT, HASH, FIRST, PROGRAM]) {
      expect(screen.getByRole('table', { name: 'Recorded filing details' }).textContent).toContain(value);
    }
    expect(screen.getByText(/Device programme/).textContent).toContain(PROGRAM);
    expect(screen.getByText(/Recorded note/).textContent).toBe('Recorded note\nSecond line');
    expect(document.querySelector('time[datetime="2026-10-30T12:00:00.000Z"]')).not.toBeNull();
    expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual(['Close tracked filing']);
    fireEvent.click(screen.getByRole('button', { name: 'Close tracked filing' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows unknown saved statuses verbatim and does not fabricate missing bindings, dates or notes', async () => {
    const data = saved();
    Object.assign(data.filing, {
      title: null, status: 'legacy_status_unmapped', decision: null, fdaTrackingNumber: null,
      filedAt: null, reviewGoalDays: null, decisionDueAt: null,
      filedArtifactDocumentId: null, filedArtifactSha256: null, notes: null,
    });
    Object.assign(data.home, { projectId: null, programId: null, programTitle: null });
    apiRequest.mockResolvedValue(success(data));
    render(<TrackedFilingDetail filingId={FIRST} onClose={vi.fn()} />);
    await screen.findByRole('heading', { name: '510k-traditional-device' });
    expect(screen.getByText('legacy_status_unmapped')).toBeTruthy();
    expect(screen.getByText('No filed artifact document recorded')).toBeTruthy();
    expect(screen.getByText('No filed artifact hash recorded')).toBeTruthy();
    expect(screen.getByText('No programme binding recorded')).toBeTruthy();
    expect(screen.getByText('No project binding recorded')).toBeTruthy();
    expect(screen.getByText('No notes recorded')).toBeTruthy();
    expect(screen.queryByText(/Decision due 2026/)).toBeNull();
  });

  it.each([
    [401, /session has expired/], [403, /do not have access/],
    [404, /not found or is not available/], [503, /service is unavailable/],
    [500, /could not be read/],
  ])('distinguishes an HTTP %s response from a missing or empty record', async (status, message) => {
    apiRequest.mockResolvedValue(reply(status as number, { success: false }));
    render(<TrackedFilingDetail filingId={FIRST} onClose={vi.fn()} />);
    expect((await screen.findByRole('alert')).textContent).toMatch(message as RegExp);
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.getByRole('button', { name: 'Retry tracked filing' })).toBeTruthy();
  });

  it.each([403, 404, 503])('preserves status semantics when apiRequest throws HTTP %s', async (status) => {
    apiRequest.mockImplementation(async () => { throw new ApiRequestError('Internal detail must not appear', status); });
    render(<TrackedFilingDetail filingId={FIRST} onClose={vi.fn()} />);
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(status === 403 ? /do not have access/ : status === 404 ? /not found/ : /service is unavailable/);
    expect(alert.textContent).not.toContain('Internal detail');
  });

  it('reports network failure and retries the exact record', async () => {
    apiRequest.mockRejectedValueOnce(new Error('Failed to fetch')).mockResolvedValueOnce(success());
    render(<TrackedFilingDetail filingId={FIRST} onClose={vi.fn()} />);
    expect((await screen.findByRole('alert')).textContent).toMatch(/could not be read/);
    fireEvent.click(screen.getByRole('button', { name: 'Retry tracked filing' }));
    await screen.findByRole('heading', { name: 'Recorded device filing' });
    expect(apiRequest.mock.calls).toEqual([
      ['GET', `/api/task-management/filings/${FIRST}`],
      ['GET', `/api/task-management/filings/${FIRST}`],
    ]);
  });

});

describe('Tracked filing response and navigation integrity', () => {
  it.each([
    ['missing data', () => ({ success: true })],
    ['false success', () => ({ success: false, data: saved() })],
    ['wrong native row', () => ({ success: true, data: saved(SECOND, 'Wrong filing') })],
    ['wrong home source', () => ({ success: true, data: { ...saved(), home: { ...saved().home, source: 'submission' } } })],
    ['missing field', () => { const data = saved(); delete (data.filing as Partial<TaskFilingHome['filing']>).notes; return { success: true, data }; }],
    ['invalid date', () => ({ success: true, data: { ...saved(), filing: { ...saved().filing, filedAt: 'not-a-date' } } })],
  ])('refuses malformed HTTP 200: %s', async (_name, body) => {
    apiRequest.mockResolvedValue(reply(200, body()));
    render(<TrackedFilingDetail filingId={FIRST} onClose={vi.fn()} />);
    expect((await screen.findByRole('alert')).textContent).toMatch(/incomplete or did not match/);
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('reports an unreadable JSON response explicitly', async () => {
    apiRequest.mockResolvedValue(new Response('{', { status: 200, headers: { 'Content-Type': 'application/json' } }));
    render(<TrackedFilingDetail filingId={FIRST} onClose={vi.fn()} />);
    expect((await screen.findByRole('alert')).textContent).toMatch(/incomplete or did not match/);
  });

  it('removes the previous record immediately on ID change while the next record loads', async () => {
    const next = deferred<Response>();
    apiRequest.mockResolvedValueOnce(success()).mockReturnValueOnce(next.promise);
    let paintedOldRecord: boolean | undefined;
    function Host({ id }: { id: string }) {
      // Observe the committed DOM before passive effects can clear old state.
      React.useLayoutEffect(() => {
        if (id === SECOND) paintedOldRecord = Boolean(screen.queryByRole('heading', { name: 'Recorded device filing' }));
      }, [id]);
      return <TrackedFilingDetail filingId={id} onClose={vi.fn()} />;
    }
    const { rerender } = render(<Host id={FIRST} />);
    await screen.findByRole('heading', { name: 'Recorded device filing' });
    rerender(<Host id={SECOND} />);
    expect(paintedOldRecord).toBe(false);
    expect(screen.queryByRole('heading', { name: 'Recorded device filing' })).toBeNull();
    expect(screen.getByRole('status').textContent).toContain('Loading');
    next.resolve(success(saved(SECOND, 'New target filing')));
    await screen.findByRole('heading', { name: 'New target filing' });
    expect(apiRequest.mock.calls[1]).toEqual(['GET', `/api/task-management/filings/${SECOND}`]);
  });

  it.each(['success', 'failure'])('ignores a stale old-target %s after the new target resolves', async (result) => {
    const old = deferred<Response>();
    apiRequest.mockReturnValueOnce(old.promise).mockResolvedValueOnce(success(saved(SECOND, 'New target filing')));
    const { rerender } = render(<TrackedFilingDetail filingId={FIRST} onClose={vi.fn()} />);
    rerender(<TrackedFilingDetail filingId={SECOND} onClose={vi.fn()} />);
    await screen.findByRole('heading', { name: 'New target filing' });
    await act(async () => {
      if (result === 'success') old.resolve(success());
      else old.reject(new ApiRequestError('Old record was refused', 403));
    });
    expect(screen.getByRole('heading', { name: 'New target filing' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Recorded device filing' })).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('clears the previous record failure on ID change', async () => {
    const next = deferred<Response>();
    apiRequest.mockResolvedValueOnce(reply(403, {})).mockReturnValueOnce(next.promise);
    const { rerender } = render(<TrackedFilingDetail filingId={FIRST} onClose={vi.fn()} />);
    await screen.findByRole('alert');
    rerender(<TrackedFilingDetail filingId={SECOND} onClose={vi.fn()} />);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('status')).toBeTruthy();
    next.resolve(success(saved(SECOND, 'New target filing')));
    await screen.findByRole('heading', { name: 'New target filing' });
  });

  it('survives StrictMode cleanup without publishing programme or navigation events', async () => {
    apiRequest.mockResolvedValue(success());
    const dispatch = vi.spyOn(window, 'dispatchEvent');
    try {
      render(<React.StrictMode><TrackedFilingDetail filingId={FIRST} onClose={vi.fn()} /></React.StrictMode>);
      await screen.findByRole('heading', { name: 'Recorded device filing' });
      await waitFor(() => expect(screen.queryByRole('status')).toBeNull());
      expect(apiRequest.mock.calls.every(([method, path]) => method === 'GET' && path === `/api/task-management/filings/${FIRST}`)).toBe(true);
      expect(dispatch).not.toHaveBeenCalled();
    } finally { dispatch.mockRestore(); }
  });
});
