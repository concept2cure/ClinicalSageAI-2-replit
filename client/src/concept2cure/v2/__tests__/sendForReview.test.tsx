// @vitest-environment jsdom
/**
 * Authoring can send a document for review (docs/SURFACE_DECISIONS_2026-10-08.md
 * build order step 3; docs/design/ONE_ANA_ONE_CANVAS.md §4.7).
 *
 * Before 2026-10-08 nothing in the client called
 * POST /api/authoring/documents/:id/request-review. The workbench's "Assign
 * review" created a task, and the Review board does not read tasks, so an
 * authored document never reached the board. These tests pin the act that
 * replaces it:
 *   · Send for review POSTs request-review for the open document, with the
 *     reviewer identity the board matches on (the roster's user id) and the
 *     person's reason, and shows the review rows the server returned;
 *   · each reviewer's My work task is created only after the server confirmed
 *     the request, and a task that failed is never reported as created;
 *   · a refusal is shown in the server's words, an unknown outcome as unknown,
 *     and a receipt for another document is not a receipt;
 *   · the reason is required at the server's floor.
 *
 * Review round (2026-10-08):
 *   · a task whose answer was lost is unknown in the receipt and the toast,
 *     never "no task" and never counted as not created;
 *   · the route keeps an earlier verdict on a second request (ON CONFLICT
 *     refreshes requested_at only), so a member who already has a request on
 *     the document is shown with it and cannot be chosen, and a row that comes
 *     back with a verdict gets no task and is never reported as requested;
 *   · a roster, or existing requests, that could not be read can be read again;
 *   · each task says the verdict is recorded on the Review board.
 *
 * Wave 2D (2026-10-08): the route reopens a recorded verdict on a new request
 * (the row is pending again; the verdict keeps its own audit row), so a member
 * whose verdict is recorded can be asked again and is told the verdict stays in
 * the record; only a member whose review is pending cannot be chosen. A
 * reviewer's verdict now completes their review task, and the task says so.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { ApiRequestError } from '@/lib/queryClient';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
vi.mock('@/services/portal/authService', () => ({
  useAuth: () => ({ user: { displayName: 'Test Author', email: 'author@test.co' } }),
}));
vi.mock('../surfaces/AuthoringCollab', () => ({ AuthoringCollab: () => null }));
vi.mock('../surfaces/AuthoringFilingBar', () => ({ AuthoringFilingBar: () => null }));
vi.mock('../surfaces/AuthoringCreateExport', () => ({ AuthoringCreateExport: () => null }));
vi.mock('../surfaces/AuthoringPlaceIntoFiling', () => ({ AuthoringPlaceIntoFiling: () => null }));

const emptyRects = function () { return [] as unknown as DOMRectList; };
for (const proto of [Range.prototype, Element.prototype, Text.prototype] as unknown as Array<Record<string, unknown>>) {
  if (typeof proto.getClientRects !== 'function') proto.getClientRects = emptyRects;
  if (typeof proto.getBoundingClientRect !== 'function') {
    proto.getBoundingClientRect = function () {
      return { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0 } as DOMRect;
    };
  }
}

import { DocumentAuthoring } from '../surfaces/DocumentAuthoring';
import { SendForReviewDialog } from '../editor/SendForReviewDialog';

const PID = '5ac45b38-a1d8-4a41-9488-fac39a57b852';
const DOC = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const SEC = 'ssssssss-ssss-4sss-8sss-ssssssssssss';
const REASON = 'Ready for medical review before the pre-IND package.';
const REQUEST_URL = `/api/authoring/documents/${DOC}/request-review`;
const REVIEWS_URL = `/api/authoring/documents/${DOC}/reviews`;
const ok = (payload: unknown, status = 200) => ({ ok: status < 400, status, json: async () => payload }) as Response;

let ledger: Array<Record<string, unknown>> = [];
/** What the mock server answers to request-review; replaced per test. */
let answerRequest: (body: { reviewers: Array<{ id: string; name?: string }>; reason?: string }) => Response | Promise<Response>;
/** What the mock server answers to a task create; replaced per test. */
let answerTask: (body: Record<string, unknown>) => Response | Promise<Response>;
/** What the mock server answers to the document's existing review requests; replaced per test. */
let answerReviews: () => Response | Promise<Response>;
/** What the mock server answers to the roster; replaced per test. */
let answerRoster: () => Response | Promise<Response>;
const ROSTER = [{ id: '42', name: 'OQ Signer' }, { id: '7', name: 'Dana Chen' }, { id: '9', name: 'Ira Patel' }];

const recorded = (body: { reviewers: Array<{ id: string; name?: string }> }, docId = DOC) => ok({
  success: true,
  reviews: body.reviewers.map((r, i) => ({
    id: `rev-${i + 1}`, doc_id: docId, reviewer_id: r.id, reviewer_name: r.name ?? null, reviewer_email: null,
    review_status: 'pending', requested_by: 'author@test.co',
  })),
  message: `Review requested from ${body.reviewers.length} reviewer(s)`,
});

/** The workbench's own reads of the document, or null for any other URL. */
function documentRead(url: string): Response | null {
  if (url.startsWith('/api/authoring/docs?')) {
    return ok({ documents: [{ id: DOC, title: 'Module 2.5 Clinical Overview', module: 'M2', product_code: null, status: 'draft', updated_at: null, section_count: 1 }] });
  }
  if (url === `/api/authoring/docs/${DOC}`) return ok({ success: true, document: { id: DOC, title: 'Module 2.5 Clinical Overview', module: 'M2', status: 'draft', provenance: null } });
  if (url === `/api/authoring/docs/${DOC}/sections`) {
    return ok({ sections: [{ id: SEC, doc_id: DOC, code: '2.5.1', title: 'Rationale', content: '<p>The product rationale.</p>', order_index: 0, comment_count: 0, revision_count: 0, citation_count: 0, updated_at: null }] });
  }
  if (url === `/api/c2c/projects/${PID}`) return ok({ id: PID, name: 'C2C-101', phase: 'planning' });
  if (url.startsWith('/api/c2c/documents/')) return ok({ success: false }, 404);
  return null;
}

function mockApi() {
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (method: string, url: string, body?: Record<string, unknown>) => {
    const doc = documentRead(url);
    if (doc) return doc;
    if (url === '/api/task-management/assignees') return answerRoster();
    if (method === 'GET' && url === REVIEWS_URL) return answerReviews();
    if (method === 'POST' && url === REQUEST_URL) return answerRequest(body as never);
    if (method === 'POST' && url === '/api/tasks/tasks') return answerTask(body ?? {});
    if (method === 'GET' && url === '/api/tasks/tasks/by-module/Authoring') return ok({ success: true, data: ledger, count: ledger.length });
    return ok({ success: true, sources: [], revisions: [], comments: [] });
  });
}

const props = () => ({ surface: { id: 'document-authoring', label: 'Authoring' } as any, onAsk: vi.fn(), onNav: vi.fn(), segment: 'biotech' });
const calls = (method: string, url: string) => apiRequest.mock.calls.filter(c => c[0] === method && c[1] === url);
const callIndex = (method: string, url: string) => apiRequest.mock.calls.findIndex(c => c[0] === method && c[1] === url);

beforeEach(() => {
  (window as any).C2C_PROJECT = { id: PID, title: 'C2C-101' };
  ledger = [];
  answerRequest = body => recorded(body);
  answerReviews = () => ok({ success: true, reviews: [] });
  answerRoster = () => ok({ success: true, data: ROSTER, total: ROSTER.length });
  answerTask = body => {
    const row = { id: ledger.length + 1, taskId: `TASK-1758-${ledger.length + 1}`, organizationId: 2, status: 'pending', assigneeName: body.assigneeId === 42 ? 'OQ Signer' : 'Dana Chen', createdAt: '2026-10-08T10:00:00Z', ...body };
    ledger.push(row);
    return ok({ success: true, data: row });
  };
  mockApi();
});
afterEach(() => {
  cleanup();
  delete (window as any).C2C_PROJECT;
});

/** Open the dialog from the workbench header and wait for the roster. */
async function openDialog(p = props()) {
  render(<DocumentAuthoring {...p} />);
  await screen.findAllByText('Rationale');
  fireEvent.click(await screen.findByTestId('send-for-review-open'));
  const dlg = await screen.findByTestId('send-for-review-dialog');
  await within(dlg).findByTestId('sfr-reviewer-42');
  return dlg;
}

function fill(dlg: HTMLElement, reviewers: string[], reason = REASON) {
  for (const id of reviewers) fireEvent.click(within(dlg).getByTestId(`sfr-reviewer-${id}`));
  fireEvent.change(within(dlg).getByTestId('sfr-reason'), { target: { value: reason } });
}

describe('Send for review — the workbench records a review request the Review board reads', () => {
  it('POSTs request-review for the open document with the reviewer’s user id and the reason, and shows the server’s answer', async () => {
    const dlg = await openDialog();
    fill(dlg, ['42']);
    fireEvent.change(within(dlg).getByTestId('sfr-instructions'), { target: { value: 'Check the efficacy claims against the SAP.' } });
    fireEvent.click(within(dlg).getByTestId('sfr-submit'));

    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith('POST', REQUEST_URL, {
      reviewers: [{ id: '42', name: 'OQ Signer' }],
      reason: REASON,
    }));
    // The server's own rows are what the dialog shows: who, the state, the request id.
    const result = await within(dlg).findByTestId('sfr-result');
    expect(within(result).getByTestId('sfr-reviews').textContent).toContain('OQ Signer · Pending');
    expect(within(result).getByTestId('sfr-reviews').textContent).toContain('request rev-1');
    expect(result.textContent).toContain('listed on the Review board');

    // The reviewer's My work task: created after the request, linked to the
    // document, and carrying the reason with the instructions.
    await waitFor(() => expect(calls('POST', '/api/tasks/tasks')).toHaveLength(1));
    expect(callIndex('POST', REQUEST_URL)).toBeLessThan(callIndex('POST', '/api/tasks/tasks'));
    const task = calls('POST', '/api/tasks/tasks')[0][2] as Record<string, unknown>;
    expect(task).toMatchObject({ assigneeId: 42, sourceEntityType: 'authoring_document', sourceEntityId: DOC, taskType: 'review' });
    expect(String(task.description)).toContain('Check the efficacy claims against the SAP.');
    expect(String(task.description)).toContain(`Reason for the review request: ${REASON}`);
    expect((await within(result).findByTestId('sfr-tasks')).textContent).toContain('Task TASK-1758-1 in OQ Signer’s My work');

    // Done closes the receipt; the document's Tasks rail lists the task.
    fireEvent.click(within(dlg).getByTestId('sfr-done'));
    await waitFor(() => expect(screen.queryByTestId('send-for-review-dialog')).toBeNull());
    const rail = await screen.findByRole('complementary', { name: 'Review tasks' });
    expect((await within(rail).findByTestId('rt-row')).textContent).toContain('assigned to OQ Signer');
  });

  it('sends every chosen reviewer in one request, and gives each a task', async () => {
    const dlg = await openDialog();
    fill(dlg, ['42', '7']);
    fireEvent.click(within(dlg).getByTestId('sfr-submit'));
    await waitFor(() => expect(calls('POST', REQUEST_URL)).toHaveLength(1));
    expect(calls('POST', REQUEST_URL)[0][2]).toEqual({
      reviewers: [{ id: '42', name: 'OQ Signer' }, { id: '7', name: 'Dana Chen' }],
      reason: REASON,
    });
    const tasks = await within(dlg).findByTestId('sfr-tasks');
    await waitFor(() => expect(tasks.querySelectorAll('li')).toHaveLength(2));
    expect(calls('POST', '/api/tasks/tasks').map(c => (c[2] as { assigneeId: number }).assigneeId)).toEqual([42, 7]);
  });

  it('requires a reviewer and a reason at the server’s floor before anything is sent', async () => {
    const dlg = await openDialog();
    const submit = within(dlg).getByTestId('sfr-submit') as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    expect(within(dlg).getByTestId('sfr-send-note').textContent).toContain('Choose at least one reviewer.');
    fireEvent.click(within(dlg).getByTestId('sfr-reviewer-42'));
    fireEvent.change(within(dlg).getByTestId('sfr-reason'), { target: { value: 'short' } });
    expect(submit.disabled).toBe(true);
    expect(within(dlg).getByTestId('sfr-send-note').textContent).toBe('A reason of at least 8 characters is required.');
    expect(submit.getAttribute('aria-describedby')).toBe('sfr-send-note');
    fireEvent.click(submit);
    expect(calls('POST', REQUEST_URL)).toHaveLength(0);
    fireEvent.change(within(dlg).getByTestId('sfr-reason'), { target: { value: REASON } });
    expect(submit.disabled).toBe(false);
    expect(within(dlg).queryByTestId('sfr-send-note')).toBeNull();
  });

});

describe('Send for review — a refusal, an unknown outcome and a failed task are each told as what they are', () => {
  it('shows a refusal in the server’s words, creates no task, and lets the person send again', async () => {
    answerRequest = () => {
      throw new ApiRequestError('A reason for change of at least 8 characters is required.', 400, { success: false, error: 'A reason for change of at least 8 characters is required.', field: 'reason' });
    };
    const dlg = await openDialog();
    fill(dlg, ['42']);
    fireEvent.click(within(dlg).getByTestId('sfr-submit'));
    const alert = await within(dlg).findByTestId('sfr-error');
    expect(alert.textContent).toBe('The review request was refused: A reason for change of at least 8 characters is required.');
    expect(within(dlg).queryByTestId('sfr-result')).toBeNull();
    expect(calls('POST', '/api/tasks/tasks')).toHaveLength(0);
    expect((within(dlg).getByTestId('sfr-submit') as HTMLButtonElement).disabled).toBe(false);
  });

  it('the object gate’s refusal is said as what it means for this act, not as “the authoring object”', async () => {
    answerRequest = () => {
      throw new ApiRequestError(
        'You do not have permission to perform this action on the authoring object.', 403,
        { error: { code: 'AUTHORING_OBJECT_FORBIDDEN', message: 'You do not have permission to perform this action on the authoring object.' } },
        'AUTHORING_OBJECT_FORBIDDEN',
      );
    };
    const dlg = await openDialog();
    fill(dlg, ['42']);
    fireEvent.click(within(dlg).getByTestId('sfr-submit'));
    const alert = await within(dlg).findByTestId('sfr-error');
    expect(alert.textContent).toBe('The review request was refused: Sending this document for review needs an Owner or Author grant on it.');
    expect(alert.textContent).not.toContain('authoring object');
    expect(calls('POST', '/api/tasks/tasks')).toHaveLength(0);
  });

  it('an outcome nobody can confirm is unknown: no task, no second send, and the board is offered to check', async () => {
    answerRequest = () => { throw new ApiRequestError('Bad gateway', 502); };
    const p = props();
    const dlg = await openDialog(p);
    fill(dlg, ['42']);
    fireEvent.click(within(dlg).getByTestId('sfr-submit'));
    expect((await within(dlg).findByTestId('sfr-error')).textContent).toMatch(/^Whether the review request was recorded is unknown/);
    expect(within(dlg).getByTestId('sfr-error').textContent).not.toMatch(/refused|not recorded/);
    expect((within(dlg).getByTestId('sfr-submit') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(within(dlg).getByTestId('sfr-submit'));
    expect(calls('POST', REQUEST_URL)).toHaveLength(1);
    expect(calls('POST', '/api/tasks/tasks')).toHaveLength(0);
    fireEvent.click(within(dlg).getByRole('button', { name: 'Check the Review board' }));
    expect(p.onNav).toHaveBeenCalledWith('review');
  });

  it('a success that names another document is not a receipt for this one', async () => {
    answerRequest = body => recorded(body, 'another-document');
    const dlg = await openDialog();
    fill(dlg, ['42']);
    fireEvent.click(within(dlg).getByTestId('sfr-submit'));
    expect((await within(dlg).findByTestId('sfr-error')).textContent).toContain('did not confirm a review request on this document');
    expect(within(dlg).queryByTestId('sfr-result')).toBeNull();
    expect(calls('POST', '/api/tasks/tasks')).toHaveLength(0);
  });

  it('a task that failed after the request is reported as not created; the request still stands', async () => {
    answerTask = () => { throw new ApiRequestError('The audit write failed, so nothing was changed.', 500, {}, 'AUDIT_WRITE_FAILED'); };
    const dlg = await openDialog();
    fill(dlg, ['42']);
    fireEvent.click(within(dlg).getByTestId('sfr-submit'));
    const result = await within(dlg).findByTestId('sfr-result');
    expect(within(result).getByTestId('sfr-reviews').textContent).toContain('OQ Signer · Pending');
    const tasks = within(result).getByTestId('sfr-tasks');
    expect(tasks.textContent).toContain('OQ Signer: no task. The review task was refused');
    expect(tasks.textContent).not.toMatch(/Task TASK-/);
    // A refusal is known: nothing to reconcile.
    expect(within(dlg).queryByRole('button', { name: 'Check existing review tasks' })).toBeNull();
  });

  it('a task whose creation could not be confirmed offers the task list, not a retry', async () => {
    answerTask = () => { throw new ApiRequestError('Response lost after commit', 502); };
    const dlg = await openDialog();
    fill(dlg, ['42']);
    fireEvent.click(within(dlg).getByTestId('sfr-submit'));
    const result = await within(dlg).findByTestId('sfr-result');
    expect(within(result).getByTestId('sfr-tasks').textContent).toMatch(/outcome is unknown/);
    fireEvent.click(within(dlg).getByRole('button', { name: 'Check existing review tasks' }));
    await waitFor(() => expect(screen.queryByTestId('send-for-review-dialog')).toBeNull());
    expect(await screen.findByRole('complementary', { name: 'Review tasks' })).toBeTruthy();
  });

});

describe('Send for review — the Tasks rail', () => {
  it('the Tasks rail offers Send for review, not a task-only assignment', async () => {
    render(<DocumentAuthoring {...props()} />);
    await screen.findAllByText('Rationale');
    fireEvent.click(screen.getByTestId('tasks-rail-open'));
    const rail = await screen.findByRole('complementary', { name: 'Review tasks' });
    await within(rail).findByTestId('rt-empty');
    expect(within(rail).queryByText(/Assign review/)).toBeNull();
    fireEvent.click(within(rail).getByTestId('rt-send-review'));
    expect(await screen.findByTestId('send-for-review-dialog')).toBeTruthy();
  });
});

/* ── Review round ─────────────────────────────────────────────────────────── */

const standingRow = (reviewerId: string, name: string, status: string) => ({
  id: `old-${reviewerId}`, doc_id: DOC, reviewer_id: reviewerId, reviewer_name: name, reviewer_email: null, review_status: status,
  requested_at: '2026-10-01T09:00:00.000Z', reviewed_at: status === 'pending' ? null : '2026-10-03T09:00:00.000Z',
});

/** The dialog on its own, with the toast it fires. */
async function openOwnDialog() {
  const fireToast = vi.fn();
  const onCheckTasks = vi.fn();
  render(<SendForReviewDialog docId={DOC} docTitle="Module 2.5 Clinical Overview" programId={PID} sectionCode="2.5.1"
    onClose={vi.fn()} fireToast={fireToast} onCheckTasks={onCheckTasks} onOpenBoard={vi.fn()} />);
  const dlg = await screen.findByTestId('send-for-review-dialog');
  return { dlg, fireToast, onCheckTasks };
}

describe('Send for review — a task whose answer was lost is unknown, not absent', () => {
  it('says the outcome is unknown in the receipt and the toast, never "no task" and never "not created"', async () => {
    answerTask = body => {
      ledger.push({ taskId: 'TASK-LOST', ...body }); // the server committed it…
      throw new ApiRequestError('Response lost after commit', 502); // …and the answer was lost
    };
    const { dlg, fireToast } = await openOwnDialog();
    fill(dlg, ['42']);
    fireEvent.click(within(dlg).getByTestId('sfr-submit'));
    const tasks = await within(dlg).findByTestId('sfr-tasks');
    expect(ledger).toHaveLength(1);
    const line = tasks.querySelector('li') as HTMLElement;
    // The task may exist: its line never says there is none…
    expect(line.textContent).not.toMatch(/no task/i);
    expect(line.textContent).toContain('OQ Signer: The review task outcome is unknown');
    // …and the toast never counts it as not created.
    const toast = String(fireToast.mock.calls[0]?.[0]);
    expect(toast).not.toMatch(/0 of 1|not created|were created/);
    expect(toast).toContain('Review requested from OQ Signer.');
    expect(toast).toContain('Review tasks: 1 with an unknown outcome. Check the task list before sending again.');
    expect(line.getAttribute('data-outcome')).toBe('unknown');
    expect(line.className).not.toContain('de-err');
    expect(within(dlg).getByRole('button', { name: 'Check existing review tasks' })).toBeTruthy();
  });
});

describe('Send for review — a member who already has a review request', () => {
  it('a member whose review is pending cannot be chosen; one whose verdict is recorded can be asked again, and is told the verdict stays in the record', async () => {
    answerReviews = () => ok({ success: true, reviews: [standingRow('42', 'OQ Signer', 'changes_requested'), standingRow('7', 'Dana Chen', 'pending')] });
    const { dlg } = await openOwnDialog();
    // A recorded verdict: offered again, since a new request reopens the review (wave 2D).
    const decided = (await within(dlg).findByTestId('sfr-reviewer-42')) as HTMLInputElement;
    expect(decided.disabled).toBe(false);
    const decidedNote = within(dlg).getByTestId('sfr-prior-42');
    expect(decidedNote.textContent).toMatch(/^Changes requested on .+\. That verdict stays in the record; choosing them requests a new review\.$/);
    expect(decided.getAttribute('aria-describedby')).toBe(decidedNote.id);
    // A pending request: already asked, so not offered.
    const asked = within(dlg).getByTestId('sfr-reviewer-7') as HTMLInputElement;
    expect(asked.disabled).toBe(true);
    expect(within(dlg).getByTestId('sfr-prior-7').textContent).toMatch(/^Already asked on .+; their review is pending\.$/);
    const free = within(dlg).getByTestId('sfr-reviewer-9') as HTMLInputElement;
    expect(free.disabled).toBe(false);
    expect(within(dlg).queryByTestId('sfr-prior-9')).toBeNull();

    // A click on the member already asked chooses nobody; the member with a verdict is chosen.
    fireEvent.click(asked);
    fireEvent.change(within(dlg).getByTestId('sfr-reason'), { target: { value: REASON } });
    expect((within(dlg).getByTestId('sfr-submit') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(decided);
    expect(decided.checked).toBe(true);
    fireEvent.click(within(dlg).getByTestId('sfr-submit'));
    await waitFor(() => expect(calls('POST', REQUEST_URL)).toHaveLength(1));
    expect(calls('POST', REQUEST_URL)[0][2]).toEqual({ reviewers: [{ id: '42', name: 'OQ Signer' }], reason: REASON });
    // The server reopened the review (the row comes back pending), so the reviewer gets a new task.
    await waitFor(() => expect(calls('POST', '/api/tasks/tasks')).toHaveLength(1));
    expect((calls('POST', '/api/tasks/tasks')[0][2] as { assigneeId: number }).assigneeId).toBe(42);
    expect(within(await within(dlg).findByTestId('sfr-result')).getByTestId('sfr-reviews').textContent).toContain('OQ Signer · Pending');
  });

  it('a row that comes back with a verdict gets no task, and is never reported as requested', async () => {
    // A row that comes back with a verdict was not reopened. The route resets a
    // re-requested row to pending since wave 2D, so this is a server that did not;
    // the dialog still makes no task for it and says the verdict stands.
    answerRequest = body => ok({
      success: true,
      reviews: body.reviewers.map(r => ({ ...standingRow(r.id, r.name ?? r.id, r.id === '42' ? 'changes_requested' : 'pending'), id: `rev-${r.id}` })),
    });
    const { dlg, fireToast } = await openOwnDialog();
    fill(dlg, ['42', '7']);
    fireEvent.click(within(dlg).getByTestId('sfr-submit'));
    const result = await within(dlg).findByTestId('sfr-result');
    await waitFor(() => expect(calls('POST', '/api/tasks/tasks')).toHaveLength(1));
    expect((calls('POST', '/api/tasks/tasks')[0][2] as { assigneeId: number }).assigneeId).toBe(7);
    const reviews = within(result).getByTestId('sfr-reviews').textContent ?? '';
    expect(reviews).toContain('OQ Signer · Changes requested: their earlier verdict stands. This request did not reopen their review, so no task was created');
    expect(reviews).toContain('Dana Chen · Pending');
    expect(within(result).getByTestId('sfr-headline').textContent).toContain('One reviewer’s earlier verdict stands; it was not reopened.');
    const toast = String(fireToast.mock.calls[0]?.[0]);
    expect(toast).toContain('Review requested from Dana Chen.');
    expect(toast).not.toContain('Review requested from OQ Signer');
    expect(toast).toContain('Not reopened; the earlier verdict stands: OQ Signer (Changes requested).');
  });

  it('when no row was reopened, nothing is reported as requested and no task is made', async () => {
    answerRequest = body => ok({ success: true, reviews: body.reviewers.map(r => ({ ...standingRow(r.id, r.name ?? r.id, 'approved'), id: `rev-${r.id}` })) });
    const { dlg, fireToast } = await openOwnDialog();
    fill(dlg, ['42']);
    fireEvent.click(within(dlg).getByTestId('sfr-submit'));
    const result = await within(dlg).findByTestId('sfr-result');
    await waitFor(() => expect(fireToast).toHaveBeenCalled());
    expect(calls('POST', '/api/tasks/tasks')).toHaveLength(0);
    expect(fireToast).toHaveBeenCalledWith('Not reopened; the earlier verdict stands: OQ Signer (Approved).', 'error');
    expect(within(result).getByTestId('sfr-headline').textContent).toMatch(/^No review was reopened\./);
    expect(within(result).queryByTestId('sfr-tasks')).toBeNull();
  });
});

describe('Send for review — reads that failed can be read again', () => {
  it('existing requests that could not be read: no one can be chosen, and reading them again recovers', async () => {
    let fail = true;
    answerReviews = () => {
      if (fail) throw new ApiRequestError('Failed to load reviews', 500);
      return ok({ success: true, reviews: [] });
    };
    const { dlg } = await openOwnDialog();
    const failed = await within(dlg).findByTestId('sfr-standing-error');
    expect(failed.textContent).toContain('existing review requests could not be read');
    expect(within(dlg).queryByTestId('sfr-reviewer-42')).toBeNull();
    expect((within(dlg).getByTestId('sfr-submit') as HTMLButtonElement).disabled).toBe(true);
    fail = false;
    fireEvent.click(within(failed).getByRole('button', { name: 'Read them again' }));
    expect(await within(dlg).findByTestId('sfr-reviewer-42')).toBeTruthy();
    expect(within(dlg).queryByTestId('sfr-standing-error')).toBeNull();
  });

  it('a roster that could not be read offers to read it again, and does', async () => {
    let fail = true;
    answerRoster = () => (fail ? ok({ success: false, error: 'Failed to load assignees' }, 500) : ok({ success: true, data: ROSTER }));
    const { dlg } = await openOwnDialog();
    const failed = await within(dlg).findByTestId('sfr-roster-error');
    expect(failed.textContent).toContain('The reviewer roster could not be read, so no one can be chosen.');
    fail = false;
    fireEvent.click(within(failed).getByRole('button', { name: 'Read the roster again' }));
    expect(await within(dlg).findByTestId('sfr-reviewer-42')).toBeTruthy();
  });
});

describe('Send for review — the task says where the verdict goes', () => {
  it('each reviewer’s task says the verdict is recorded on the Review board and completes the task, not the other way round', async () => {
    const { dlg } = await openOwnDialog();
    fill(dlg, ['42']);
    fireEvent.click(within(dlg).getByTestId('sfr-submit'));
    await waitFor(() => expect(calls('POST', '/api/tasks/tasks')).toHaveLength(1));
    expect(String((calls('POST', '/api/tasks/tasks')[0][2] as { description: string }).description))
      .toContain('Record your verdict on the Review board; recording it completes this task. Completing the task does not record a verdict.');
  });
});

/* QA 2026-10-08 (browser walk j4-authoring, docs/evidence/QA-2026-10-08/authoring/).
   The author could ask herself to review, and the reviewer was granted nothing
   on the document. These cases were written against AssignReviewDialog's form
   (a056eb9ea), which sent the request itself; on the merge with the D2 ana-2c
   work, SendForReviewDialog is the one review-request path, and they pin it. */
const withGrant = (granted: boolean, reason?: string) => (body: { reviewers: Array<{ id: string; name?: string }> }) => ok({
  success: true,
  reviews: body.reviewers.map((r, i) => ({ id: `rev-${i + 1}`, doc_id: DOC, reviewer_id: r.id, reviewer_name: r.name ?? null, review_status: 'pending' })),
  grants: body.reviewers.map(r => (granted ? { reviewerId: r.id, granted: true, permissionId: 'p-1' } : { reviewerId: r.id, granted: false, reason })),
});

describe('Send for review — never from the author, and the reviewer’s access is stated', () => {
  it('does not offer the document’s author as a reviewer, and says why', async () => {
    const fireToast = vi.fn();
    render(<SendForReviewDialog docId={DOC} docTitle="Module 2.5 Clinical Overview" programId={PID} sectionCode="2.5.1"
      authorId="7" onClose={vi.fn()} fireToast={fireToast} />);
    const dlg = await screen.findByTestId('send-for-review-dialog');
    await within(dlg).findByTestId('sfr-reviewer-42');
    expect(within(dlg).queryByTestId('sfr-reviewer-7')).toBeNull();
    expect(within(dlg).getByTestId('sfr-author-note').textContent).toMatch(/a different person reviews/);
  });

  it('the workbench passes the document’s author, so she is not offered there either', async () => {
    const original = apiRequest.getMockImplementation()!;
    apiRequest.mockImplementation((method: string, url: string, body?: unknown) => url.startsWith('/api/authoring/docs?')
      ? Promise.resolve(ok({ documents: [{ id: DOC, title: 'Module 2.5 Clinical Overview', module: 'M2', product_code: null, status: 'draft', updated_at: null, section_count: 1, created_by: 9 }] }))
      : original(method, url, body));
    const dlg = await openDialog();
    expect(within(dlg).queryByTestId('sfr-reviewer-9')).toBeNull();
    expect(within(dlg).getByTestId('sfr-author-note')).toBeTruthy();
  });

  it('says the reviewer was given the Reviewer role when the server granted it', async () => {
    answerRequest = withGrant(true);
    const { dlg, fireToast } = await openOwnDialog();
    fill(dlg, ['42']);
    fireEvent.click(within(dlg).getByTestId('sfr-submit'));
    const result = await within(dlg).findByTestId('sfr-result');
    expect(within(result).getByTestId('sfr-access').textContent).toBe('OQ Signer has the Reviewer role on this document.');
    await waitFor(() => expect(fireToast).toHaveBeenCalled());
    expect(String(fireToast.mock.calls[0][0])).toMatch(/Review requested from OQ Signer\..*OQ Signer has the Reviewer role on this document/);
  });

  it('a requester who may not grant access is told, in the server’s words, that no access was granted', async () => {
    const note = 'No review access was granted: only the document’s owner or an administrator grants access to it.';
    answerRequest = withGrant(false, note);
    const { dlg, fireToast } = await openOwnDialog();
    fill(dlg, ['42']);
    fireEvent.click(within(dlg).getByTestId('sfr-submit'));
    expect((await within(dlg).findByTestId('sfr-access')).textContent).toBe(note);
    await waitFor(() => expect(fireToast).toHaveBeenCalled());
    expect(String(fireToast.mock.calls[0][0])).toContain(note);
  });

  it('an author refusal from the server is shown in its words and creates no task', async () => {
    answerRequest = () => {
      throw new ApiRequestError('The author of a document cannot review it. Choose someone else as the reviewer. Nothing was requested.', 409, {}, 'REVIEWER_IS_AUTHOR');
    };
    const { dlg, fireToast } = await openOwnDialog();
    fill(dlg, ['42']);
    fireEvent.click(within(dlg).getByTestId('sfr-submit'));
    expect((await within(dlg).findByTestId('sfr-error')).textContent).toMatch(/refused: The author of a document cannot review it/);
    expect(calls('POST', '/api/tasks/tasks')).toHaveLength(0);
    expect(fireToast).not.toHaveBeenCalled();
  });
});
