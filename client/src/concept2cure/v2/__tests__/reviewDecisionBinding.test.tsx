// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { setAuthToken, clearAuthToken } from '@/utils/authToken';
import { actorToken, PEER_DOC, peerBoard, peerContext, peerRead, peerReceipt } from './peerReviewFixtures';

const mocks = vi.hoisted(() => ({ apiRequest: vi.fn(), user: { id: 7, organizationId: 7 } }));
vi.mock('@/services/portal/authService', () => ({ useAuthUser: () => mocks.user }));
vi.mock('@/lib/queryClient', async (original) => ({ ...await original<typeof import('@/lib/queryClient')>(), apiRequest: mocks.apiRequest }));
import { Review } from '../surfaces/Review';
import { getSurface } from '@shared/constants/ui-surface-registry';
import { ReviewDecisionDialog } from '../surfaces/ReviewDecisionDialog';
import { usePeerReviewDecision } from '../surfaces/usePeerReviewDecision';
import { applySurfaceAction, __resetSurfaceActionBus } from '../surfaceActions';

let answer: unknown;
const boardReads = () => mocks.apiRequest.mock.calls.filter((call) => String(call[1]).startsWith('/api/review/board')).length;
const writes = () => mocks.apiRequest.mock.calls.filter((call) => call[0] === 'POST');

beforeEach(() => {
  mocks.apiRequest.mockReset(); mocks.user = { id: 7, organizationId: 7 };
  setAuthToken(actorToken()); answer = { success: true };
  mocks.apiRequest.mockImplementation(async (method: string, url: string) => ({ ok: true, status: 200,
    json: async () => method === 'POST' ? answer : url.startsWith('/api/review/board') ? { success: true, data: peerBoard }
      : url.endsWith('/reviews') ? peerRead() : { success: true, data: { threads: [], tasks: [] } },
  }));
});
afterEach(() => { cleanup(); clearAuthToken(); __resetSurfaceActionBus(); });

async function open() {
  render(<Review surface={getSurface('review')!} segment="biopharma" onAsk={vi.fn()} onNav={vi.fn()} />);
  fireEvent.click(await screen.findByRole('button', { name: /Record review decision/ }));
  await screen.findByLabelText('Decision');
}

describe('saved-content-bound human review', () => {
  it('shows the complete saved section and table before a decision', async () => {
    await open();
    expect(await screen.findByText('Saved cohort 42')).toBeTruthy();
    expect(screen.getByText(/Dose rationale/)).toBeTruthy();
    expect(screen.getByText(/Revision 3/)).toBeTruthy();
  });

  it('posts the captured request and saved snapshot binding', async () => {
    await open();
    fireEvent.change(screen.getByLabelText('Decision'), { target: { value: 'approved' } });
    fireEvent.click(screen.getByRole('button', { name: /Record approval/ }));
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0][1]).toBe(`/api/authoring/documents/${PEER_DOC}/review`);
    expect(writes()[0][2]).toEqual({ review_status: 'approved', expected: {
      reviewId: peerContext.myReview!.reviewId, requestedAt: peerContext.myReview!.requestedAt,
      snapshotHash: peerContext.snapshotHash, bindingBasis: peerContext.bindingBasis,
    } });
  });

  it('does not announce or refresh success from an unaudited success flag', async () => {
    await open();
    const before = boardReads();
    fireEvent.change(screen.getByLabelText('Decision'), { target: { value: 'approved' } });
    fireEvent.click(screen.getByRole('button', { name: /Record approval/ }));
    await waitFor(() => expect(writes()).toHaveLength(1));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/confirm|reload/i));
    expect(boardReads()).toBe(before);
    expect(screen.queryByText(/Approval recorded on the document/)).toBeNull();
  });
});

function dialog(props: Partial<React.ComponentProps<typeof ReviewDecisionDialog>> = {}) {
  return <ReviewDecisionDialog documentId={PEER_DOC} onClose={vi.fn()} onRecorded={vi.fn()} {...props} />;
}

async function chooseApproval() {
  fireEvent.change(await screen.findByLabelText('Decision'), { target: { value: 'approved' } });
  fireEvent.click(screen.getByRole('button', { name: /Record approval/ }));
}

describe('decision ceremony ownership', () => {
  it('prevents duplicate writes and ignores Escape and backdrop while a verdict is in flight', async () => {
    let resolve!: (response: Response) => void;
    const onClose = vi.fn(); const onRecorded = vi.fn();
    mocks.apiRequest.mockImplementation(async (method: string) => method === 'POST' ? new Promise<Response>((done) => { resolve = done; }) :
      { ok: true, status: 200, json: async () => peerRead() });
    render(dialog({ onClose, onRecorded }));
    await chooseApproval();
    fireEvent.click(screen.getByRole('button', { name: 'Recording…' }));
    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.click(document.querySelector('.esign-bd')!);
    expect(onClose).not.toHaveBeenCalled(); expect(writes()).toHaveLength(1);
    await act(async () => { resolve({ ok: true, status: 200, json: async () => peerReceipt() } as Response); });
    expect(await screen.findByLabelText('Your recorded decision')).toBeTruthy();
    expect(onRecorded).toHaveBeenCalledOnce();
  });

  it('keeps a saved-content refusal open, disables retry, and clears the choice on explicit reload', async () => {
    const onRecorded = vi.fn();
    mocks.apiRequest.mockImplementation(async (method: string) => ({ ok: method !== 'POST', status: method === 'POST' ? 409 : 200,
      json: async () => method === 'POST' ? { error: 'The saved document changed. Reload before deciding.' } : peerRead(),
    }));
    render(dialog({ onRecorded })); await chooseApproval();
    expect((await screen.findByRole('alert')).textContent).toMatch(/saved document changed/i);
    expect((screen.getByRole('button', { name: 'Record approval' }) as HTMLButtonElement).disabled).toBe(true);
    expect(onRecorded).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Reload review record' }));
    expect((await screen.findByLabelText('Decision') as HTMLSelectElement).value).toBe('');
  });

  it('shows the authoritative refusal alongside the full read without offering a verdict', async () => {
    mocks.apiRequest.mockResolvedValue({ ok: true, status: 200, json: async () => peerRead({ ...peerContext, canReview: false, unavailableReason: 'An independent reviewer is required.' }) });
    render(dialog());
    expect(await screen.findByText('Saved cohort 42')).toBeTruthy();
    expect(screen.getByText('An independent reviewer is required.')).toBeTruthy();
    expect(screen.queryByLabelText('Decision')).toBeNull(); expect(writes()).toHaveLength(0);
  });

  it('rejects a same-tick account token swap before posting the displayed person’s choice', async () => {
    render(dialog()); await screen.findByLabelText('Decision');
    await act(async () => { setAuthToken(actorToken(8, 7)); await chooseApproval(); });
    expect((await screen.findByRole('alert')).textContent).toMatch(/account|organization/i);
    expect(writes()).toHaveLength(0);
  });

  it('refuses AnA document selection while this governed dialog owns the canvas', async () => {
    await open();
    const result = applySurfaceAction({ actionType: 'surface_action', surfaceId: 'review', actionId: 'review.select-document', label: 'Select document', params: { document: PEER_DOC } }, vi.fn());
    expect(result).toMatchObject({ status: 'failed', reason: expect.stringMatching(/dialog.*open/i) });
  });

  it('preserves the confirmed receipt when the refreshed board no longer contains the document', async () => {
    let reads = 0;
    mocks.apiRequest.mockImplementation(async (method: string, url: string) => ({ ok: true, status: 200, json: async () =>
      method === 'POST' ? peerReceipt() : url.startsWith('/api/review/board') ?
        { success: true, data: ++reads === 1 ? peerBoard : { queue: [], workflows: {}, thread: [] } } :
        url.endsWith('/reviews') ? peerRead() : { success: true, data: { threads: [], tasks: [] } },
    }));
    await open(); await chooseApproval();
    expect(await screen.findByLabelText('Your recorded decision')).toBeTruthy();
    await waitFor(() => expect(boardReads()).toBeGreaterThan(1));
    expect(screen.getByLabelText('Your recorded decision')).toBeTruthy();
  });
});

describe('replacement document and actor contexts', () => {
  it('does not publish a delayed previous-document read into its replacement', async () => {
    const otherId = '3f2c1a10-0000-4000-8000-000000000099';
    const other = { ...peerContext, documentId: otherId, snapshot: { ...peerContext.snapshot, id: otherId, title: 'Replacement document', sections: [] } };
    let resolve!: (response: Response) => void;
    mocks.apiRequest.mockImplementation(async (_method: string, url: string) => url.includes(otherId) ?
      { ok: true, status: 200, json: async () => peerRead(other) } : new Promise<Response>((done) => { resolve = done; }));
    const view = render(dialog());
    view.rerender(dialog({ documentId: otherId }));
    expect(await screen.findByText('Replacement document')).toBeTruthy();
    await act(async () => { resolve({ ok: true, status: 200, json: async () => peerRead() } as Response); });
    await waitFor(() => expect(screen.queryByText('Saved cohort 42')).toBeNull());
  });

  it('retires a late verdict after an actor replacement without reporting success', async () => {
    let resolve!: (response: Response) => void;
    const onRecorded = vi.fn();
    mocks.apiRequest.mockImplementation(async (method: string) => method === 'POST' ? new Promise<Response>((done) => { resolve = done; }) :
      { ok: true, status: 200, json: async () => peerRead({ ...peerContext, actorId: String(mocks.user.id) }) });
    const view = render(dialog({ onRecorded })); await chooseApproval();
    mocks.user = { id: 8, organizationId: 7 }; setAuthToken(actorToken(8, 7));
    view.rerender(dialog({ onRecorded })); await screen.findByLabelText('Decision');
    await act(async () => { resolve({ ok: true, status: 200, json: async () => peerReceipt() } as Response); });
    await waitFor(() => expect(onRecorded).not.toHaveBeenCalled());
    expect(screen.queryByLabelText('Your recorded decision')).toBeNull();
  });
});

describe('synchronous verdict dispatch boundary', () => {
  it.each([true, false])('prevents a stale click callback from retrying before React commits (confirmed=%s)', async (confirmed) => {
    answer = confirmed ? peerReceipt() : { success: true };
    const onRecorded = vi.fn();
    const { result } = renderHook(() => usePeerReviewDecision({ documentId: PEER_DOC, userId: 7, organizationId: 7 }, () => true, onRecorded));
    await waitFor(() => expect(result.current.context).toBeTruthy());
    act(() => { result.current.setDecision('approved'); });
    const staleClick = result.current.record;
    await act(async () => { await staleClick(); await staleClick(); });
    expect(writes()).toHaveLength(1);
    expect(onRecorded).toHaveBeenCalledTimes(confirmed ? 1 : 0);
  });
});
