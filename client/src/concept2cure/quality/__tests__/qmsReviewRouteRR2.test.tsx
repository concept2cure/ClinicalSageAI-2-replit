// @vitest-environment jsdom
/**
 * RR2 on a QMS controlled document's review route, in the register
 * (docs/design/REVIEW_ROUTING_2026-10-23.md §2.7, §2.10, §3; NEW-4). The
 * harness is qmsReviewRoute.test.tsx's.
 *
 *   - Send for review names reviewers one after another (ordered, each step
 *     dated) and two QMS approvers, and PATCHes the sequential route;
 *   - the sender adds a reviewer to the open route from its sheet
 *     (POST …/review-route/members, the candidates read …?for=add);
 *   - an approver whose approval is not the last is told so before signing.
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
  EsignModal: (p: { action: string; targetMeta?: string; meanings?: string[]; onSign: (i: { meaning: string; reason: string; password: string }) => Promise<unknown> }) => (
    <div role="dialog" aria-label={p.action}>
      <span data-testid="esign-meta">{p.targetMeta}</span>
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
    { id: 6, name: 'Rob Reviewer', reviewer: null, approver: { code: 'MEMBER_NOT_QMS_APPROVER', message: 'Rob Reviewer is not designated as a QMS approver in this organization.' } },
    { id: 10, name: 'Ava QA', reviewer: null, approver: null },
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


describe('QMS: reviewers one after another and two QMS approvers (RR2)', () => {
  it('orders the reviewers, dates each step, names two QMS approvers, and PATCHes the sequential route', async () => {
    H.docs = [DOC];
    renderRegister();
    fireEvent.click(within(rowOf('SOP-021')).getByRole('button', { name: /Send for review/ }));
    const form = await screen.findByTestId('qms-route-form');
    fireEvent.click(await within(form).findByTestId('qms-approver-8'));
    fireEvent.click(within(form).getByTestId('qms-approver-10'));
    fireEvent.click(within(form).getByTestId('qms-reviewer-6'));
    fireEvent.click(within(form).getByTestId('qms-reviewer-5'));
    fireEvent.click(within(form).getByTestId('qms-order-sequential'));
    const steps = within(form).getByTestId('qms-steps');
    fireEvent.click(within(steps).getByRole('button', { name: 'Move Rae Reviewer earlier' }));
    fireEvent.change(within(form).getByTestId('qms-step-due-0'), { target: { value: '2099-01-03' } });
    fireEvent.change(within(form).getByTestId('qms-step-due-1'), { target: { value: '2099-01-04' } });
    fireEvent.change(within(form).getByTestId('qms-approval-due'), { target: { value: '2099-01-06' } });
    fireEvent.change(within(form).getByTestId('qms-route-reason'), { target: { value: 'Ready for QA review before rollout.' } });
    fireEvent.click(within(form).getByTestId('qms-route-send'));
    await waitFor(() => expect(posted('PATCH', '/api/mdx/qms/documents/21')).toBeTruthy());
    expect(posted('PATCH', '/api/mdx/qms/documents/21')!.body).toEqual({
      status: 'in_review', reason: 'Ready for QA review before rollout.',
      route: { reviewers: [5, 6], approvers: [8, 10], order: 'sequential', reviewStepDueDates: ['2099-01-03', '2099-01-04'], approvalDueDate: '2099-01-06' },
    });
  });

  it('the sender adds a reviewer to the open route', async () => {
    H.docs = [{ ...DOC, status: 'in_review', reviewRoute: ROUTED }];
    answers['POST /api/mdx/qms/documents/21/review-route/members'] = () => ok({ ok: true, taskId: 'ROUTE-abcd1234-6', step: 1 });
    renderRegister();
    fireEvent.click(within(rowOf('SOP-021')).getByTestId('qms-route-open'));
    const panel = await screen.findByTestId('qms-route-panel');
    fireEvent.click(within(panel).getByRole('button', { name: 'Add a reviewer' }));
    const sheet = await screen.findByTestId('qms-route-add');
    await waitFor(() => expect(calls.some((c) => c.url === '/api/mdx/qms/documents/21/route-candidates?for=add')).toBe(true));
    fireEvent.click(await within(sheet).findByTestId('qms-add-6'));
    fireEvent.change(within(sheet).getByTestId('qms-add-due'), { target: { value: '2099-01-03' } });
    fireEvent.change(within(sheet).getByTestId('qms-add-reason'), { target: { value: 'Microbiology must review section 5' } });
    fireEvent.click(within(sheet).getByTestId('qms-add-confirm'));
    await waitFor(() => expect(posted('POST', '/api/mdx/qms/documents/21/review-route/members')).toBeTruthy());
    expect(posted('POST', '/api/mdx/qms/documents/21/review-route/members')!.body).toEqual({ assigneeId: 6, dueDate: '2099-01-03', reason: 'Microbiology must review section 5' });
  });

  it('an approver whose approval is not the last is told so before signing', async () => {
    H.me = { id: '8', name: 'Ann Approver', roles: ['approver'] };
    H.docs = [{ ...DOC, status: 'in_review', reviewRoute: round([
      member({ userId: 5, printedName: 'Rae Reviewer', outcome: 'signed', signature: { id: 41, printedName: 'Rae Reviewer', meaning: 'REVIEWED', signedAt: '2026-10-29T10:00:00.000Z' } }),
      member({ userId: 8, printedName: 'Ann Approver', role: 'approver', step: 2 }),
      member({ userId: 10, printedName: 'Ava QA', role: 'approver', step: 2 }),
    ]) }];
    renderRegister();
    fireEvent.click(within(rowOf('SOP-021')).getByTestId('qms-route-open'));
    const panel = await screen.findByTestId('qms-route-panel');
    expect(within(panel).queryByRole('button', { name: 'Add a reviewer' }), 'an approver does not add reviewers').toBeNull();
    fireEvent.click(within(panel).getByTestId('qms-route-approve'));
    const dialog = await screen.findByRole('dialog', { name: 'Approve controlled document' });
    expect(within(dialog).getByTestId('esign-meta').textContent).toContain('Your approval is 1 of 2 required');
    expect(within(dialog).getByTestId('esign-meta').textContent).toContain('becomes effective once every named QMS approver has signed');
  });
});
