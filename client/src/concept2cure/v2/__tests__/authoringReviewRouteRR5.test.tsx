// @vitest-environment jsdom
/**
 * RR5 of docs/design/REVIEW_ROUTING_2026-10-23.md, in the Authoring workbench:
 *
 *   · Send for review makes ONE write: request-review carries the route's
 *     review due date (and the task's instructions and priority), and the
 *     server writes each reviewer's route task on the request's own
 *     transaction. The dialog's second write (POST /api/tasks/tasks per
 *     reviewer) is gone; the receipt names the tasks the server's answer names.
 *   · Send waits for the review due date, which is the end of that day in the
 *     sender's time zone, named on the form.
 *   · Who may be chosen is the route's one member validator's answer: a member
 *     it would refuse is shown disabled with its reason.
 *   · The document's Tasks rail shows the route's round with the shared
 *     reviewRoute words, lets a named reviewer hand back and the sender
 *     reassign, and a route task is never offered Start or Complete (its
 *     review signature closes it).
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
vi.mock('@/services/portal/authService', async original => ({
  ...(await original<typeof import('@/services/portal/authService')>()),
  useAuth: () => ({ user: { displayName: 'Test Author', email: 'author@test.co' } }),
}));

import { SendForReviewDialog } from '../editor/SendForReviewDialog';
import { ReviewTasksPanel } from '../editor/ReviewTasksPanel';

const DOC = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const PID = '5ac45b38-a1d8-4a41-9488-fac39a57b852';
const REASON = 'Ready for medical review before the pre-IND package.';
const REQUEST_URL = `/api/authoring/documents/${DOC}/request-review`;
const ROUND_URL = `/api/authoring/documents/${DOC}/review-route`;
const CANDIDATES_URL = `/api/authoring/documents/${DOC}/route-candidates`;
const DUE = '2026-11-20';
const ok = (payload: unknown, status = 200) => ({ ok: status < 400, status, json: async () => payload }) as Response;
const ROSTER = [{ id: '42', name: 'OQ Signer' }, { id: '7', name: 'Dana Chen' }, { id: '9', name: 'Ira Patel' }];
const CANDIDATES = {
  success: true, timeZone: 'America/New_York', canonicalId: null, candidates: [
    { id: 42, name: 'OQ Signer', reviewer: null, approver: null },
    { id: 7, name: 'Dana Chen', reviewer: null, approver: null },
    { id: 9, name: 'Ira Patel', reviewer: { code: 'MEMBER_CANNOT_SIGN', message: 'Ira Patel does not hold signing authority, so cannot be named to review or approve.' }, approver: null },
  ],
};

let round: unknown = null;
let tasks: Array<Record<string, unknown>> = [];

function routeRound(over: Record<string, unknown> = {}) {
  return {
    route: { id: 'route-1', round: 1, senderId: 5, senderName: 'Avery Author', order: 'parallel', status: 'open', statusReason: null, statusBy: null,
      statusAt: null, reviewDueAt: '2026-11-21T04:59:59.999Z', approvalDueAt: null, createdAt: '2026-10-29T09:00:00.000Z' },
    members: [
      { taskId: 'ROUTE-route-1-42', userId: 42, role: 'reviewer', step: 1, printedName: 'OQ Signer', outcome: 'signed', stepOpen: true,
        dueDate: '2026-11-21T04:59:59.999Z', signature: { id: 'aaaaaaaa-0000-4000-8000-000000000001', printedName: 'OQ Signer', meaning: 'REVIEWER', signedAt: '2026-10-30T14:02:00.000Z' }, actId: null },
      { taskId: 'ROUTE-route-1-7', userId: 7, role: 'reviewer', step: 1, printedName: 'Dana Chen', outcome: 'pending', stepOpen: true,
        dueDate: '2026-11-21T04:59:59.999Z', signature: null, actId: null },
    ],
    reviewComplete: false, approvalComplete: false,
    history: [{ action: 'send', at: '2026-10-29T09:00:00.000Z', actorId: 5, actorName: 'Avery Author', reason: REASON,
      members: [{ userId: 42, role: 'reviewer', printedName: 'OQ Signer' }, { userId: 7, role: 'reviewer', printedName: 'Dana Chen' }] }],
    ...over,
  };
}

/** The server's answer to request-review: the rows, and the route tasks it wrote with them (RR5). */
function requested(body?: Record<string, unknown>): Response {
  const reviewers = (body?.reviewers ?? []) as Array<{ id: string; name: string }>;
  return ok({
    success: true,
    reviews: reviewers.map((r, i) => ({ id: `rev-${i + 1}`, doc_id: DOC, reviewer_id: r.id, reviewer_name: r.name, review_status: 'pending', requested_by: '5' })),
    grants: [],
    route: { id: 'route-1', added: false, timeZone: 'America/New_York', tasks: reviewers.map(r => ({ userId: Number(r.id), taskId: `ROUTE-route-1-${r.id}`, dueDate: '2026-11-21T04:59:59.999Z' })) },
  });
}

/** The reads the dialog and the panel make. */
function read(url: string): Response | null {
  if (url === '/api/task-management/assignees') return ok({ success: true, data: ROSTER, total: ROSTER.length });
  if (url === `/api/authoring/documents/${DOC}/reviews`) return ok({ success: true, reviews: [] });
  if (url === CANDIDATES_URL || url.startsWith(`${CANDIDATES_URL}?for=reassign`)) return ok(CANDIDATES);
  if (url === ROUND_URL) return round === 'fail' ? ok({ success: false }, 503) : ok({ success: true, round });
  if (url === '/api/tasks/tasks/by-module/Authoring') return ok({ success: true, data: tasks, count: tasks.length });
  return null;
}

function mockApi() {
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (method: string, url: string, body?: Record<string, unknown>) => {
    if (method === 'GET') return read(url) ?? ok({ success: true });
    if (url === REQUEST_URL) return requested(body);
    return ok({ success: true });
  });
}

const calls = (method: string, url: string) => apiRequest.mock.calls.filter(c => c[0] === method && c[1] === url);

beforeEach(() => {
  round = null;
  tasks = [];
  mockApi();
});
afterEach(() => cleanup());

async function openDialog() {
  const fireToast = vi.fn();
  render(<SendForReviewDialog docId={DOC} docTitle="Module 2.5 Clinical Overview" programId={PID} sectionCode="2.5.1"
    onClose={vi.fn()} fireToast={fireToast} onCheckTasks={vi.fn()} onOpenBoard={vi.fn()} />);
  const dlg = await screen.findByTestId('send-for-review-dialog');
  await within(dlg).findByTestId('sfr-reviewer-42');
  return { dlg, fireToast };
}

describe('Send for review writes once: the request, its route and the tasks, on the server (RR5)', () => {
  it('waits for the review due date, names the time zone, and sends the route with the request', async () => {
    const { dlg } = await openDialog();
    fireEvent.click(within(dlg).getByTestId('sfr-reviewer-42'));
    fireEvent.click(within(dlg).getByTestId('sfr-reviewer-7'));
    fireEvent.change(within(dlg).getByTestId('sfr-reason'), { target: { value: REASON } });
    const submit = within(dlg).getByTestId('sfr-submit') as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    expect(within(dlg).getByTestId('sfr-send-note').textContent).toContain('Choose the review due date.');
    await waitFor(() => expect(dlg.textContent).toContain('America/New_York'));
    fireEvent.change(within(dlg).getByTestId('sfr-due'), { target: { value: DUE } });
    fireEvent.change(within(dlg).getByTestId('sfr-instructions'), { target: { value: 'Check the efficacy claims against the SAP.' } });
    expect(submit.disabled).toBe(false);
    fireEvent.click(submit);

    await waitFor(() => expect(calls('POST', REQUEST_URL)).toHaveLength(1));
    const body = calls('POST', REQUEST_URL)[0][2] as Record<string, unknown>;
    expect(body).toMatchObject({
      reviewers: [{ id: '42', name: 'OQ Signer' }, { id: '7', name: 'Dana Chen' }],
      reason: REASON,
      route: { reviewDueDate: DUE },
      priority: 'medium',
    });
    expect(String(body.instructions)).toContain('Check the efficacy claims against the SAP.');
    // The receipt names the tasks the server wrote; the dialog writes no task itself.
    const lines = await within(dlg).findByTestId('sfr-tasks');
    expect(lines.textContent).toContain('Task ROUTE-route-1-42 in OQ Signer’s tasks');
    expect(lines.textContent).toContain('Task ROUTE-route-1-7 in Dana Chen’s tasks');
    expect(calls('POST', '/api/tasks/tasks')).toHaveLength(0);
  });

  it('shows a member the route would refuse disabled, with the validator’s reason', async () => {
    const { dlg } = await openDialog();
    const box = await within(dlg).findByTestId('sfr-reviewer-9');
    await waitFor(() => expect((box as HTMLInputElement).disabled).toBe(true));
    expect(dlg.textContent).toContain('Ira Patel does not hold signing authority, so cannot be named to review or approve.');
  });

  it('a reviewer the answer names no task for is reported unconfirmed, never as having one', async () => {
    apiRequest.mockImplementation(async (method: string, url: string, body?: Record<string, unknown>) => {
      if (method === 'POST' && url === REQUEST_URL) {
        const reviewers = (body?.reviewers ?? []) as Array<{ id: string; name: string }>;
        return ok({ success: true, grants: [], route: { id: 'route-1', tasks: [] },
          reviews: reviewers.map((r, i) => ({ id: `rev-${i + 1}`, doc_id: DOC, reviewer_id: r.id, reviewer_name: r.name, review_status: 'pending' })) });
      }
      if (url === '/api/task-management/assignees') return ok({ success: true, data: ROSTER, total: ROSTER.length });
      if (method === 'GET' && url === CANDIDATES_URL) return ok(CANDIDATES);
      return ok({ success: true, reviews: [] });
    });
    const { dlg } = await openDialog();
    fireEvent.click(within(dlg).getByTestId('sfr-reviewer-42'));
    fireEvent.change(within(dlg).getByTestId('sfr-reason'), { target: { value: REASON } });
    fireEvent.change(within(dlg).getByTestId('sfr-due'), { target: { value: DUE } });
    fireEvent.click(within(dlg).getByTestId('sfr-submit'));
    const lines = await within(dlg).findByTestId('sfr-tasks');
    expect(lines.textContent).toContain('did not name this reviewer’s task on the review route');
    expect(lines.querySelector('[data-outcome="unknown"]')).not.toBeNull();
  });
});

function renderPanel(meId: number | null) {
  return render(<ReviewTasksPanel docId={DOC} docTitle="Module 2.5 Clinical Overview" refreshKey={0} onSendForReview={vi.fn()}
    onClose={vi.fn()} fireToast={vi.fn()} meId={meId} admin={false} />);
}

describe('the document’s review route in the workbench (RR5)', () => {
  it('shows the round in the shared route words: who signed, who is awaited, and the naming history', async () => {
    round = routeRound();
    renderPanel(5);
    const panel = await screen.findByTestId('ar-round');
    expect(within(panel).getByTestId('ar-round-headline').textContent).toBe('Waiting for Dana Chen.');
    expect(within(panel).getByTestId('ar-round-member-42').textContent).toContain('OQ Signer · reviewer · Reviewed · meaning: reviewer');
    expect(within(panel).getByTestId('ar-round-member-7').textContent).toContain('Dana Chen · reviewer · Waiting for their review');
    expect(panel.textContent).toContain('sent by you');
  });

  it('tells the named reviewer whose turn it is how to sign, and lets them hand it back with a reason', async () => {
    round = routeRound();
    renderPanel(7);
    const panel = await screen.findByTestId('ar-round');
    expect(within(panel).getByTestId('ar-round-headline').textContent).toBe('Your turn: sign the review.');
    expect(within(panel).getByTestId('ar-round-sign-note').textContent).toContain('E-sign');
    expect(within(panel).queryByRole('button', { name: /Reassign/ })).toBeNull();
    fireEvent.click(within(panel).getByTestId('ar-round-hand-back'));
    const sheet = await screen.findByTestId('vault-route-hand-back');
    fireEvent.change(within(sheet).getByTestId('vr-act-reason'), { target: { value: 'I am on leave for the review window' } });
    fireEvent.click(within(sheet).getByTestId('vr-act-confirm'));
    await waitFor(() => expect(calls('POST', `/api/authoring/documents/${DOC}/review-route/hand-back`)).toHaveLength(1));
    expect(calls('POST', `/api/authoring/documents/${DOC}/review-route/hand-back`)[0][2]).toEqual({ reason: 'I am on leave for the review window' });
  });

  it('offers the sender Reassign on an unsigned member, through the route’s candidates read', async () => {
    round = routeRound();
    renderPanel(5);
    const panel = await screen.findByTestId('ar-round');
    expect(within(panel).queryByRole('button', { name: 'Reassign OQ Signer' })).toBeNull();
    fireEvent.click(within(panel).getByRole('button', { name: 'Reassign Dana Chen' }));
    const sheet = await screen.findByTestId('vault-route-reassign');
    fireEvent.click(await within(sheet).findByTestId('vr-reassign-42'));
    fireEvent.change(within(sheet).getByTestId('vr-reassign-reason'), { target: { value: 'Dana is on leave until next month' } });
    fireEvent.click(within(sheet).getByTestId('vr-reassign-confirm'));
    await waitFor(() => expect(calls('POST', `/api/authoring/documents/${DOC}/review-route/reassign`)).toHaveLength(1));
    expect(calls('POST', `/api/authoring/documents/${DOC}/review-route/reassign`)[0][2])
      .toEqual({ taskId: 'ROUTE-route-1-7', assigneeId: 42, reason: 'Dana is on leave until next month' });
  });

  it('a completed review-only route reads as reviewed, not approved', async () => {
    round = routeRound({ route: { ...routeRound().route, status: 'complete', statusBy: 7, statusAt: '2026-10-30T15:00:00.000Z' } });
    renderPanel(5);
    expect((await screen.findByTestId('ar-round-headline')).textContent).toBe('Reviewed: every named reviewer signed.');
  });

  it('a route that could not be read says so, never that nobody is named', async () => {
    round = 'fail';
    renderPanel(5);
    expect((await screen.findByTestId('ar-round-unread')).textContent).toContain('Reviewers could not be read');
  });

  it('a route task is not offered Start or Complete: the review signature closes it', async () => {
    round = routeRound();
    tasks = [{ taskId: 'ROUTE-route-1-7', title: 'Review: Module 2.5 Clinical Overview', status: 'pending', assigneeName: 'Dana Chen', assigneeId: 7,
      sourceEntityType: 'authoring_document', sourceEntityId: DOC, taskType: 'review', reviewRouteId: 'route-1' }];
    renderPanel(5);
    const row = await screen.findByTestId('rt-row');
    expect(within(row).queryByRole('button', { name: /Start/ })).toBeNull();
    expect(within(row).queryByTestId('rt-complete')).toBeNull();
    expect(row.textContent).toContain('closes when its reviewer signs the review');
  });
});
