// @vitest-environment jsdom
/**
 * The review route on a QMS controlled document, in the register (RR4 of
 * docs/design/REVIEW_ROUTING_2026-10-23.md §2.7–§2.12; NEW-4).
 *
 *   - Send for review opens the route form: Send waits for a QMS approver, the
 *     approval due date and a reason; reviewers are optional, and naming one
 *     asks for the review due date; the picker lists only the people the
 *     server's validator admits, says why the others are not offered, and the
 *     send is PATCH {status:'in_review', route};
 *   - a document in review on a route shows its round under its status, and
 *     its sheet lists every member with what each has done;
 *   - a named reviewer whose turn it is signs the review (POST …/review,
 *     meaning REVIEWED); the approver at their turn approves; Approve is not
 *     offered to anyone else on a routed document;
 *   - the sender returns, withdraws and reassigns, each with a reason;
 *   - a document in review with no route keeps today's Approve, and offers
 *     Name reviewers.
 */
import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const H = vi.hoisted(() => ({
  docs: null as unknown[] | null,
  apiRequest: vi.fn(),
  refresh: vi.fn(),
  me: { id: '7', name: 'Sam Sender', roles: ['member'] as string[] },
  signed: [] as Array<{ action: string; meanings: string[] }>,
}));

vi.mock('../hooks', () => ({
  useSopRegister: () => ({ docs: H.docs, loading: false, error: null, refresh: H.refresh }),
  useSopTemplates: () => ({ templates: [], loading: false, error: null }),
  useReviewDue: () => ({ rows: [], loading: false, error: null, refresh: vi.fn() }),
  useTrainingCompliance: () => ({ rows: [], loading: false, error: null, refresh: vi.fn() }),
  useTrainingExpiring: () => ({ rows: [], failed: false, error: null, refresh: vi.fn() }),
}));
vi.mock('@/services/portal/authService', () => ({ useAuthUser: () => H.me }));
vi.mock('@/lib/queryClient', () => {
  class ApiRequestError extends Error { constructor(readonly status: number, readonly payload: unknown) { super(String((payload as { error?: string })?.error ?? status)); } }
  return {
    apiRequest: (...a: unknown[]) => H.apiRequest(...a),
    ApiRequestError,
    serverMessage: (p: { error?: string } | null) => p?.error ?? null,
    redactInternals: (m: string | null | undefined, fallback?: string) => m ?? fallback ?? '',
  };
});
vi.mock('../../_shared/components/EsignModal', () => ({
  esignSignerOf: (u: { name?: string } | null) => (u?.name ? { name: u.name } : undefined),
  EsignModal: (p: { action: string; meanings?: string[]; onSign: (i: { meaning: string; reason: string; password: string }) => Promise<unknown> }) => (
    <div role="dialog" aria-label={p.action}>
      <button onClick={() => { H.signed.push({ action: p.action, meanings: p.meanings ?? [] }); void p.onSign({ meaning: p.meanings?.[0] ?? 'approval', reason: 'I reviewed the procedure as written.', password: 'pw' }).catch(() => undefined); }}>stub-sign</button>
    </div>
  ),
}));

import { SopRegister } from '../SopRegister';

const ok = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body });
const DOC = { id: 21, docNumber: 'SOP-021', title: 'Deviation handling', docType: 'sop', category: null, version: '1.0', status: 'draft',
  effectiveDate: null, nextReviewDate: null, updatedAt: null, authoringDocumentId: null };
const CANDIDATES = {
  ok: true, timeZone: 'Europe/London', documentId: 21,
  candidates: [
    { id: 5, name: 'Rae Reviewer', reviewer: null, approver: { code: 'MEMBER_NOT_QMS_APPROVER', message: 'Rae Reviewer is not designated as a QMS approver in this organization.' } },
    { id: 8, name: 'Ann Approver', reviewer: null, approver: null },
    { id: 7, name: 'Sam Sender', reviewer: { code: 'MEMBER_IS_AUTHOR', message: 'Sam Sender is an author of this document (QMS document author), so cannot review or approve it.' },
      approver: { code: 'MEMBER_IS_AUTHOR', message: 'Sam Sender is an author of this document (QMS document author), so cannot review or approve it.' } },
  ],
};
const member = (over: Record<string, unknown>) => ({
  taskId: `ROUTE-abcd1234-${over.userId}`, step: 1, outcome: 'pending', stepOpen: true, dueDate: '2026-11-03T23:59:59.999Z',
  signature: null, actId: null, printedName: null, role: 'reviewer', ...over,
});
const round = (members: unknown[], over: Record<string, unknown> = {}) => ({
  route: { id: 'abcd1234-0000-4000-8000-000000000001', round: 1, senderId: 7, senderName: 'Sam Sender', status: 'open', statusReason: null,
    statusBy: null, statusAt: null, reviewDueAt: '2026-11-03T23:59:59.999Z', approvalDueAt: '2026-11-05T23:59:59.999Z', createdAt: '2026-10-29T09:00:00.000Z', ...over },
  members, reviewComplete: false, approvalComplete: false,
  history: [{ action: 'send', at: '2026-10-29T09:00:00.000Z', actorId: 7, actorName: 'Sam Sender', reason: 'Ready for QA review',
    members: [{ userId: 5, role: 'reviewer', printedName: 'Rae Reviewer' }, { userId: 8, role: 'approver', printedName: 'Ann Approver' }] }],
});
const ROUTED = round([
  member({ userId: 5, printedName: 'Rae Reviewer' }),
  member({ userId: 8, printedName: 'Ann Approver', role: 'approver', step: 2, stepOpen: false }),
]);

const calls: Array<{ method: string; url: string; body?: unknown }> = [];
let answers: Record<string, () => unknown> = {};
function mockApi() {
  calls.length = 0;
  H.apiRequest.mockReset();
  H.apiRequest.mockImplementation(async (method: string, url: string, body?: unknown) => {
    calls.push({ method, url, body });
    const answer = answers[`${method} ${url}`];
    if (answer) return answer();
    if (method === 'GET' && url.startsWith('/api/mdx/qms/documents/21/route-candidates')) return ok(CANDIDATES);
    return ok({ ok: true });
  });
}
const renderRegister = () => render(<div className="c2c-v2"><SopRegister onAsk={vi.fn()} filter="all" onFilterChange={vi.fn()} /></div>);
const rowOf = (n: string) => (Array.from(document.querySelectorAll('.qms-row')) as HTMLElement[]).find((r) => r.textContent?.includes(n))!;
const posted = (method: string, url: string) => calls.find((c) => c.method === method && c.url === url);

beforeEach(() => { answers = {}; H.signed = []; H.refresh.mockReset(); H.me = { id: '7', name: 'Sam Sender', roles: ['member'] }; mockApi(); });
afterEach(() => cleanup());

describe('Send for review names the route (RR4, §2.7)', () => {
  it('waits for a QMS approver, the approval date and a reason; reviewers are optional; then PATCHes the route', async () => {
    H.docs = [DOC];
    renderRegister();
    fireEvent.click(within(rowOf('SOP-021')).getByRole('button', { name: /Send for review/ }));
    const form = await screen.findByTestId('qms-route-form');
    await within(form).findByTestId('qms-approver-8');
    const send = within(form).getByTestId('qms-route-send') as HTMLButtonElement;
    expect(send.disabled).toBe(true);
    expect(within(form).getByTestId('qms-route-note').textContent).toContain('Choose the QMS approver.');
    // Only the members the validator admits as approver can be chosen there; the non-designated one is shown disabled, with why.
    expect((within(form).getByTestId('qms-approver-5') as HTMLInputElement).disabled).toBe(true);
    expect(form.textContent).toContain('Rae Reviewer is not designated as a QMS approver in this organization.');
    expect(within(form).getByTestId('qms-reviewer-5')).toBeTruthy();
    expect(within(form).getByTestId('qms-route-not-offered').textContent).toContain('Sam Sender is an author of this document');
    expect(within(form).getByTestId('qms-route-zone').textContent).toContain('Europe/London');
    fireEvent.click(within(form).getByTestId('qms-approver-8'));
    expect(within(form).queryByTestId('qms-review-due')).toBeNull();
    fireEvent.change(within(form).getByTestId('qms-approval-due'), { target: { value: '2099-01-05' } });
    fireEvent.change(within(form).getByTestId('qms-route-reason'), { target: { value: 'Ready for QA review before rollout.' } });
    expect(send.disabled).toBe(false);
    // Naming a reviewer asks for the reviews' date.
    fireEvent.click(within(form).getByTestId('qms-reviewer-5'));
    expect(send.disabled).toBe(true);
    expect(within(form).getByTestId('qms-route-note').textContent).toContain('Give the date the reviews are due.');
    fireEvent.change(within(form).getByTestId('qms-review-due'), { target: { value: '2099-01-03' } });
    fireEvent.click(send);
    await waitFor(() => expect(posted('PATCH', '/api/mdx/qms/documents/21')).toBeTruthy());
    expect(posted('PATCH', '/api/mdx/qms/documents/21')!.body).toEqual({
      status: 'in_review', reason: 'Ready for QA review before rollout.',
      route: { reviewers: [5], approvers: [8], order: 'parallel', reviewDueDate: '2099-01-03', approvalDueDate: '2099-01-05' },
    });
    await waitFor(() => expect(H.refresh).toHaveBeenCalled());
    expect(screen.getByRole('status').textContent).toMatch(/SOP-021 was sent for review on its route/);
  });

  it('says the server’s refusal and keeps the form open', async () => {
    H.docs = [DOC];
    answers['PATCH /api/mdx/qms/documents/21'] = () => ok({ error: 'Ann Approver is not designated as a QMS approver in this organization. Nothing was sent.' }, 409);
    renderRegister();
    fireEvent.click(within(rowOf('SOP-021')).getByRole('button', { name: /Send for review/ }));
    const form = await screen.findByTestId('qms-route-form');
    fireEvent.click(await within(form).findByTestId('qms-approver-8'));
    fireEvent.change(within(form).getByTestId('qms-approval-due'), { target: { value: '2099-01-05' } });
    fireEvent.change(within(form).getByTestId('qms-route-reason'), { target: { value: 'Ready for QA review before rollout.' } });
    fireEvent.click(within(form).getByTestId('qms-route-send'));
    expect((await within(form).findByTestId('qms-route-error')).textContent).toContain('is not designated as a QMS approver');
    expect(H.refresh).not.toHaveBeenCalled();
  });
});

describe('the round in the register and its sheet (RR4, §2.12)', () => {
  it('shows the round under the status, every member in the sheet, and the sender’s acts; Approve is not the sender’s', async () => {
    H.docs = [{ ...DOC, status: 'in_review', reviewRoute: ROUTED }];
    renderRegister();
    const row = rowOf('SOP-021');
    expect(within(row).getByTestId('qms-route-line').textContent).toBe('Waiting for Rae Reviewer.');
    expect(within(row).queryByRole('button', { name: /^.*Approve$/ })).toBeNull();
    fireEvent.click(within(row).getByTestId('qms-route-open'));
    const panel = await screen.findByTestId('qms-route-panel');
    expect(within(panel).getByTestId('qms-route-member-5').textContent).toContain('Rae Reviewer · reviewer · Waiting for their review');
    expect(within(panel).getByTestId('qms-route-member-8').textContent).toContain('Ann Approver · approver · Waits for the review');
    expect(within(panel).getByTestId('vault-route-history').textContent).toContain('Sam Sender sent it for review naming Rae Reviewer (reviewer) and Ann Approver (approver)');
    expect(within(panel).queryByTestId('qms-route-sign')).toBeNull();
    expect(within(panel).queryByTestId('qms-route-approve')).toBeNull();
    expect(within(panel).getByRole('button', { name: 'Remind Rae Reviewer' })).toBeTruthy();
    expect(within(panel).getByRole('button', { name: 'Reassign Ann Approver' })).toBeTruthy();
    // Return asks for a reason, then posts it.
    fireEvent.click(within(panel).getByTestId('qms-route-return'));
    const act = await screen.findByTestId('qms-act-return');
    const confirm = within(act).getByTestId('qms-act-confirm') as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    fireEvent.change(within(act).getByTestId('qms-act-reason'), { target: { value: 'Section 4 cites the retired form.' } });
    fireEvent.click(confirm);
    await waitFor(() => expect(posted('POST', '/api/mdx/qms/documents/21/return')!.body).toEqual({ reason: 'Section 4 cites the retired form.' }));
  });

  it('the reviewer whose turn it is signs the review with meaning REVIEWED; they may hand back, not approve', async () => {
    H.me = { id: '5', name: 'Rae Reviewer', roles: ['reviewer'] };
    H.docs = [{ ...DOC, status: 'in_review', reviewRoute: ROUTED }];
    answers['POST /api/mdx/qms/documents/21/review'] = () => ok({ signatureId: 41, signedAt: '2026-10-29T10:00:00.000Z', meaning: 'REVIEWED' }, 201);
    renderRegister();
    expect(within(rowOf('SOP-021')).getByTestId('qms-route-line').textContent).toBe('Your turn: sign the review.');
    fireEvent.click(within(rowOf('SOP-021')).getByTestId('qms-route-open'));
    const panel = await screen.findByTestId('qms-route-panel');
    expect(within(panel).queryByTestId('qms-route-approve')).toBeNull();
    expect(within(panel).getByTestId('qms-route-hand-back')).toBeTruthy();
    expect(within(panel).queryByTestId('qms-route-withdraw')).toBeNull();
    fireEvent.click(within(panel).getByTestId('qms-route-sign'));
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'Sign the review' })).getByText('stub-sign'));
    await waitFor(() => expect(posted('POST', '/api/mdx/qms/documents/21/review')).toBeTruthy());
    expect(posted('POST', '/api/mdx/qms/documents/21/review')!.body).toMatchObject({ meaning: 'REVIEWED', password: 'pw', reason: 'I reviewed the procedure as written.' });
    expect(H.signed[0].meanings).toEqual(['review']);
  });

  it('the approver at their turn approves through the existing signed approval', async () => {
    H.me = { id: '8', name: 'Ann Approver', roles: ['approver'] };
    const reviewed = round([
      member({ userId: 5, printedName: 'Rae Reviewer', outcome: 'signed', signature: { id: 41, printedName: 'Rae Reviewer', meaning: 'REVIEWED', signedAt: '2026-10-29T10:00:00.000Z' } }),
      member({ userId: 8, printedName: 'Ann Approver', role: 'approver', step: 2, stepOpen: true }),
    ]);
    H.docs = [{ ...DOC, status: 'in_review', reviewRoute: { ...reviewed, reviewComplete: true } }];
    answers['POST /api/mdx/qms/documents/21/approve'] = () => ok({ data: { id: 21, status: 'effective' }, meta: { signature: { signedAt: '2026-10-29T11:00:00.000Z' } } });
    renderRegister();
    const row = rowOf('SOP-021');
    expect(within(row).getByTestId('qms-route-line').textContent).toBe('Your turn: approve.');
    fireEvent.click(within(row).getByTestId('qms-route-open'));
    const panel = await screen.findByTestId('qms-route-panel');
    expect(within(panel).getByTestId('qms-route-member-5').textContent).toMatch(/Rae Reviewer · reviewer · Reviewed · meaning: reviewed · 2026-10-29 10:00:00 UTC/);
    fireEvent.click(within(panel).getByTestId('qms-route-approve'));
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'Approve controlled document' })).getByText('stub-sign'));
    await waitFor(() => expect(posted('POST', '/api/mdx/qms/documents/21/approve')).toBeTruthy());
  });

  it('a document in review with no route keeps today’s Approve and offers Name reviewers; an unread route says so', async () => {
    H.docs = [{ ...DOC, status: 'in_review', reviewRoute: null }, { ...DOC, id: 22, docNumber: 'SOP-022', status: 'in_review', reviewRouteUnread: true }];
    renderRegister();
    const legacy = rowOf('SOP-021');
    expect(legacy.textContent).toContain('Not assigned to one person.');
    expect(within(legacy).getByRole('button', { name: /Approve/ })).toBeTruthy();
    expect(within(rowOf('SOP-022')).getByRole('alert').textContent).toBe('Reviewers could not be read.');
    fireEvent.click(within(legacy).getByTestId('qms-route-open'));
    const panel = await screen.findByTestId('qms-route-panel');
    expect(within(panel).getByTestId('qms-route-legacy').textContent).toMatch(/not assigned to one person/);
    fireEvent.click(within(panel).getByTestId('qms-route-resend'));
    expect(await screen.findByTestId('qms-route-form')).toBeTruthy();
  });
});
