// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { setAuthToken, clearAuthToken } from '@/utils/authToken';
import { actorToken, PEER_DOC, peerBoard, peerContext, peerRead, peerReceipt } from './peerReviewFixtures';
import type { AuthoringReviewContext, IndependentCheckContext } from '@shared/authoring/peer-review';

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

/* J3 human test, 2026-11-06: the board's "Request changes..." opened the dialog at
   "Not stated — choose", the same as "Record review decision". */
describe('the board opens the decision the reviewer pressed', () => {
  it('"Request changes..." opens with Request changes chosen and asks for the reason', async () => {
    render(<Review surface={getSurface('review')!} segment="biopharma" onAsk={vi.fn()} onNav={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: /Request changes/ }));
    await waitFor(() => expect((screen.getByLabelText('Decision') as HTMLSelectElement).value).toBe('changes_requested'));
    expect(screen.getByLabelText('Reason (required)')).toBeTruthy();
    expect(writes()).toHaveLength(0);
  });

  it('"Record review decision" still opens with nothing chosen', async () => {
    await open();
    await waitFor(() => expect(screen.getByRole('button', { name: /Record decision/ })).toBeTruthy());
    expect((screen.getByLabelText('Decision') as HTMLSelectElement).value).toBe('');
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

const CHECK_RECEIPT = '3f2c1a10-0000-4000-8000-000000000088';
const FINDING = 'b'.repeat(64);
const independentCheck = (over: Partial<IndependentCheckContext> = {}): IndependentCheckContext => ({ required: true,
  receiptId: CHECK_RECEIPT, snapshotHash: peerContext.snapshotHash, checkerVersion: 'test-checker-v1', standing: 'current',
  semanticVerified: false, hardBlockCount: 0, findings: [], ...over });
const independentContext = (check = independentCheck()): AuthoringReviewContext => ({ ...peerContext, canRunIndependentChecks: true, independentCheck: check });
const hardFinding = { findingId: FINDING, category: 'missing_source', severity: 'high' as const, hard: true, open: true,
  current: true, sectionId: peerContext.snapshot.sections[0].id, description: 'The recorded source link needs correction.' };
const response = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body }) as Response;

describe('independent findings within the existing human review dialog', () => {
  it('runs checks without a model, refreshes the server receipt and unlocks an eligible approval', async () => {
    let context = independentContext(independentCheck({ standing: 'missing', receiptId: null }));
    const onRecorded = vi.fn();
    mocks.apiRequest.mockImplementation(async (method: string, _url: string, body?: { action?: string }) => {
      if (method === 'GET') return response(peerRead(context));
      if (body?.action === 'run_independent_checks') { context = independentContext(); return response({ success: true, independentCheck: context.independentCheck }); }
      return response(peerReceipt());
    });
    render(dialog({ onRecorded }));
    fireEvent.change(await screen.findByLabelText('Decision'), { target: { value: 'approved' } });
    expect((screen.getByRole('button', { name: 'Record approval' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Run independent checks' }));
    await screen.findByText('Checks are current. No blocking findings remain open.');
    expect(writes()).toHaveLength(1);
    expect(writes()[0][2]).toEqual({ action: 'run_independent_checks', expectedSnapshotHash: peerContext.snapshotHash });
    expect(onRecorded).not.toHaveBeenCalled();
    expect((screen.getByRole('button', { name: 'Record approval' }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByText(/Scientific and clinical meaning still require human review/)).toBeTruthy();
  });

  it('retains a human disagreement without letting it waive a current blocking finding', async () => {
    const context = independentContext(independentCheck({ findings: [hardFinding], hardBlockCount: 1 }));
    mocks.apiRequest.mockImplementation(async method => response(method === 'GET' ? peerRead(context) : peerReceipt('changes_requested')));
    render(dialog()); await screen.findByLabelText('Decision');
    expect(screen.getByText('The recorded source link needs correction.')).toBeTruthy();
    expect((screen.getByRole('option', { name: /Resolve after the checks/ }) as HTMLOptionElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Decision for finding 1'), { target: { value: 'rejected' } });
    fireEvent.change(screen.getByLabelText('Reason for finding 1 (required)'), { target: { value: 'The source owner should review this disagreement.' } });
    fireEvent.change(screen.getByLabelText('Decision'), { target: { value: 'approved' } });
    expect((screen.getByRole('button', { name: 'Record approval' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/does not waive this blocking finding/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Decision'), { target: { value: 'changes_requested' } });
    fireEvent.change(screen.getByLabelText('Reason (required)'), { target: { value: 'The dose rationale requires revision.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Record change request' }));
    await screen.findByLabelText('Your recorded decision');
    expect(writes()[0][2]).toMatchObject({ independent_findings: { receiptId: CHECK_RECEIPT, snapshotHash: peerContext.snapshotHash,
      dispositions: [{ findingId: FINDING, decision: 'rejected', reason: 'The source owner should review this disagreement.' }] } });
  });

  it('allows a reasoned human resolution only after the latest checks no longer reproduce the finding', async () => {
    const context = independentContext(independentCheck({ findings: [{ ...hardFinding, current: false }], hardBlockCount: 1 }));
    mocks.apiRequest.mockImplementation(async method => response(method === 'GET' ? peerRead(context) : peerReceipt()));
    render(dialog()); await screen.findByLabelText('Decision');
    fireEvent.change(screen.getByLabelText('Decision'), { target: { value: 'approved' } });
    fireEvent.change(screen.getByLabelText('Decision for finding 1'), { target: { value: 'resolved' } });
    fireEvent.change(screen.getByLabelText('Reason for finding 1 (required)'), { target: { value: 'Corrected source link was verified after the rerun.' } });
    expect((screen.getByRole('button', { name: 'Record approval' }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Record approval' }));
    await screen.findByLabelText('Your recorded decision');
    expect(writes()[0][2]).toMatchObject({ independent_findings: { dispositions: [{ findingId: FINDING, decision: 'resolved' }] } });
  });
});

describe('independent check mutation reconciliation and session fencing', () => {
  it('holds an unknown check outcome until an explicit reload recovers its actual server receipt', async () => {
    let context = independentContext(independentCheck({ standing: 'missing', receiptId: null }));
    mocks.apiRequest.mockImplementation(async method => {
      if (method === 'GET') return response(peerRead(context));
      context = independentContext(); return response({ error: 'Response interrupted after commit' }, 503);
    });
    render(dialog()); await screen.findByLabelText('Decision');
    fireEvent.click(screen.getByRole('button', { name: 'Run independent checks' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/whether independent checks were recorded/);
    expect((screen.getByRole('button', { name: 'Run independent checks' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Run independent checks' }));
    expect(writes()).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Reload review record' }));
    await screen.findByText('Checks are current. No blocking findings remain open.');
    expect((screen.getByLabelText('Decision') as HTMLSelectElement).value).toBe('');
  });

  it('fences a stale approval and stale rerun callback immediately after a new blocking receipt', async () => {
    let context = independentContext();
    mocks.apiRequest.mockImplementation(async method => {
      if (method === 'GET') return response(peerRead(context));
      context = independentContext(independentCheck({ findings: [hardFinding], hardBlockCount: 1 }));
      return response({ success: true, independentCheck: context.independentCheck });
    });
    const onRecorded = vi.fn();
    const { result } = renderHook(() => usePeerReviewDecision({ documentId: PEER_DOC, userId: 7, organizationId: 7 }, () => true, onRecorded));
    await waitFor(() => expect(result.current.context).toBeTruthy());
    act(() => result.current.setDecision('approved'));
    const oldRecord = result.current.record; const oldRun = result.current.runChecks;
    await act(async () => { await oldRun(); await oldRecord(); await oldRun(); });
    expect(writes()).toHaveLength(1); expect(onRecorded).not.toHaveBeenCalled();
    expect(result.current.independentReady).toBe(false);
  });

  it('does not publish a delayed former actor’s findings into the replacement session', async () => {
    let resolve!: (value: Response) => void;
    mocks.apiRequest.mockImplementation(async method => method === 'POST' ? new Promise<Response>(done => { resolve = done; })
      : response(peerRead({ ...independentContext(), actorId: String(mocks.user.id) })));
    const view = render(dialog()); await screen.findByLabelText('Decision');
    fireEvent.click(screen.getByRole('button', { name: 'Run independent checks' }));
    mocks.user = { id: 8, organizationId: 7 }; setAuthToken(actorToken(8, 7)); view.rerender(dialog());
    await screen.findByLabelText('Decision');
    await act(async () => resolve(response({ success: true, independentCheck: independentCheck({ findings: [{ ...hardFinding, description: 'Retired actor finding canary' }], hardBlockCount: 1 }) })));
    expect(screen.queryByText('Retired actor finding canary')).toBeNull();
  });
});

/* J3 human test R10 (docs/evidence/HUMAN-TEST/J3/README.md): the receipt read "Revision not recorded" on every
   authoring document, because nothing writes authoring_documents.version. The verdict is bound to the saved text by
   its digest, which the receipt already says, so a missing revision number is left unsaid, not called unrecorded. */
describe('a document with no revision number (J3 R10)', () => {
  const unversioned = { ...peerContext, snapshot: { ...peerContext.snapshot, version: null } };
  it('names no revision before or after the decision, and says nothing was left unrecorded', async () => {
    const receipt = peerReceipt();
    answer = { ...receipt, review: { ...receipt.review, reviewed_snapshot: unversioned.snapshot } };
    mocks.apiRequest.mockImplementation(async (method: string, url: string) => ({ ok: true, status: 200,
      json: async () => method === 'POST' ? answer : url.startsWith('/api/review/board') ? { success: true, data: peerBoard }
        : url.endsWith('/reviews') ? peerRead(unversioned) : { success: true, data: { threads: [], tasks: [] } },
    }));
    await open();
    const dialog = screen.getByRole('dialog');
    expect(dialog.textContent).toContain('M2 · en · TEST');
    fireEvent.change(screen.getByLabelText('Decision'), { target: { value: 'approved' } });
    fireEvent.click(screen.getByRole('button', { name: /Record approval/ }));
    const recorded = await screen.findByLabelText('Your recorded decision');
    expect(recorded.textContent).toMatch(/Recorded/);
    expect(dialog.textContent).not.toMatch(/Revision|not recorded/);
  });

  it('still names the revision when the document carries one', async () => {
    answer = peerReceipt();
    await open();
    fireEvent.change(screen.getByLabelText('Decision'), { target: { value: 'approved' } });
    fireEvent.click(screen.getByRole('button', { name: /Record approval/ }));
    expect((await screen.findByLabelText('Your recorded decision')).textContent).toMatch(/Revision 3 · Recorded/);
  });
});
