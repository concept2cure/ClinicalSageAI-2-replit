// @vitest-environment jsdom
/**
 * The review route on a Vault version, in the Vault (RR1b of
 * docs/design/REVIEW_ROUTING_2026-10-23.md §2.6, §2.10–§2.13, §5 RR1b).
 *
 *   - Send for review opens the route form: Send is disabled, and says why,
 *     until there are reviewers, an approver, both due dates and a reason; the
 *     picker lists only the people the server's validator admits (never the
 *     uploader or the sender), says why the others are not offered, and is
 *     searchable; Send starts the record and moves it into review on the route;
 *   - the version shows the route: every named member with printed name,
 *     meaning, UTC time and outcome; "You signed at …; waiting for B"; the
 *     approver as "Approved (1 of 1 required)"; "Reviewers could not be read"
 *     on a failed read, with no step offered;
 *   - Withdraw and Return for revision each ask for a reason and refuse
 *     without one;
 *   - a named approver approves by signing on the route;
 *   - a version in review with no route offers Name reviewers;
 *   - the sender reminds a member whose turn it is.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
const me = vi.hoisted(() => ({ id: '7', displayName: 'Abe Approver', email: 'abe@example.test', mfaEnabled: false, roles: ['member'] as string[] }));
vi.mock('@/services/portal/authService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/portal/authService')>()),
  useAuthUser: () => me,
}));

import { Vault } from '../surfaces/Vault';
import { PID, DOC_ID, ok, uploadDoc, cabinetTree, vaultPayload, props } from './_vault-surface-fixtures';

const VERSIONS_URL = `/api/c2c/project-vault/${PID}/documents/${DOC_ID}/versions`;
const CANDIDATES_URL = `/api/regulatory/documents/route-candidates/${DOC_ID}`;
const REASON = 'Ready for medical and QA review';
const head = uploadDoc({ ver: 'v2.0', versionCount: 1, lifecycleStage: null, details: { documentTitle: 'Stability summary', documentType: 'OTHER', classification: 'INTERNAL' } });

const version = (lifecycle: unknown = null) => ({
  id: DOC_ID, version: '2.0', contentHash: 'b'.repeat(64), fileSize: 2048, fileName: 's.pdf', uploader: 'Uma Uploader',
  uploaderId: 3, createdAt: '2026-09-30T10:00:00.000Z', current: true, link: 'none', lifecycle,
});
const refused = (code: string, message: string) => ({ code, message });
const CANDIDATES = {
  ok: true, timeZone: 'America/New_York', canonicalId: null,
  candidates: [
    { id: 3, name: 'Uma Uploader', reviewer: refused('MEMBER_IS_AUTHOR', 'Uma Uploader is an author of this document (Vault uploader), so cannot review or approve it.'), approver: refused('MEMBER_IS_AUTHOR', 'x') },
    { id: 5, name: 'Rae Reviewer', reviewer: null, approver: null },
    { id: 6, name: 'Rob Reviewer', reviewer: null, approver: null },
    { id: 7, name: 'Abe Approver', reviewer: refused('MEMBER_IS_SENDER', 'You are sending this document, so you cannot also review or approve it.'), approver: refused('MEMBER_IS_SENDER', 'x') },
    { id: 8, name: 'Ann Approver', reviewer: null, approver: null },
    { id: 9, name: 'Mo Member', reviewer: refused('MEMBER_CANNOT_SIGN', 'Mo Member does not hold signing authority, so cannot be named to review or approve.'), approver: refused('MEMBER_CANNOT_SIGN', 'x') },
  ],
};

const signature = (name: string, meaning: string, at: string) => ({ id: 41, printedName: name, meaning, signedAt: at });
const member = (over: Record<string, unknown>) => ({
  taskId: `ROUTE-abcd1234-${over.userId}`, step: 1, outcome: 'pending', stepOpen: true, dueDate: '2026-11-03T03:59:59.999Z',
  signature: null, actId: null, printedName: null, role: 'reviewer', ...over,
});
const round = (members: unknown[], over: Record<string, unknown> = {}, flags: Record<string, unknown> = {}) => ({
  route: {
    id: 'abcd1234-0000-4000-8000-000000000001', round: 1, senderId: 3, senderName: 'Uma Uploader', status: 'open',
    statusReason: null, statusBy: null, statusAt: null, reviewDueAt: '2026-11-03T03:59:59.999Z', approvalDueAt: '2026-11-05T04:59:59.999Z',
    createdAt: '2026-10-29T09:00:00.000Z', ...over,
  },
  members, reviewComplete: false, approvalComplete: false, ...flags,
});
const lifecycle = (r: unknown, over: Record<string, unknown> = {}) => ({ canonicalId: 'C-1', stage: 'in_review', creatorId: 3, review: null, approval: null, round: r, roundUnread: false, ...over });

const calls: Array<{ method: string; url: string; body?: unknown }> = [];
let versions: unknown[] = [];
let answers: Record<string, () => Response> = {};
function mockApi() {
  calls.length = 0;
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (method: string, url: string, body?: unknown) => {
    calls.push({ method, url, body });
    if (answers[`${method} ${url}`]) return answers[`${method} ${url}`]();
    if (url === `/api/c2c/project-vault/${PID}` && method === 'GET') return ok(vaultPayload({ tree: cabinetTree([head]) }));
    if (url === VERSIONS_URL) return ok({ success: true, data: { versions } });
    if (url === CANDIDATES_URL) return ok(CANDIDATES);
    return ok({ success: true, data: { entries: [], chain: { ok: true } } });
  });
}
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}><Vault {...props()} /></QueryClientProvider>);
}
const posted = (url: string) => calls.find((c) => c.method === 'POST' && c.url === url);

beforeEach(() => {
  (window as any).C2C_PROJECT = { id: PID, title: 'BX-301' };
  answers = {};
  me.id = '7';
  me.roles = ['member'];
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); delete (window as any).C2C_PROJECT; });

describe('Send for review opens the route form (RR1b, §2.6)', () => {
  it('Send waits for reviewers, an approver, both due dates and a reason, and then sends the route', async () => {
    versions = [version()];
    mockApi();
    answers['POST /api/regulatory/documents'] = () => ok({ ok: true, canonicalId: 'C-9', created: true });
    answers['POST /api/regulatory/documents/C-9/advance'] = () => ok({ ok: true, stage: 'in_review', routeId: 'r-1' });
    mount();
    fireEvent.click(await screen.findByRole('button', { name: /^Send for review:/ }));
    const form = await screen.findByTestId('vault-route-form');
    await within(form).findByTestId('vr-reviewer-5');
    const send = within(form).getByTestId('vr-send') as HTMLButtonElement;
    expect(send.disabled).toBe(true);
    expect(within(form).getByTestId('vr-send-note').textContent).toContain('Choose at least one reviewer.');

    // Only the people the validator admits are offered; the others are said, with why.
    for (const id of [3, 7, 9]) expect(within(form).queryByTestId(`vr-reviewer-${id}`)).toBeNull();
    expect(within(form).getByTestId('route-not-offered').textContent).toMatch(/3 members are not offered/);
    expect(within(form).getByTestId('route-not-offered').textContent).toContain('Uma Uploader is an author of this document');
    expect(within(form).getByTestId('vr-zone').textContent).toContain('America/New_York');

    // The picker is searchable.
    fireEvent.change(within(form).getByTestId('vr-reviewer-search'), { target: { value: 'rob' } });
    expect(within(form).queryByTestId('vr-reviewer-5')).toBeNull();
    fireEvent.click(within(form).getByTestId('vr-reviewer-6'));
    fireEvent.change(within(form).getByTestId('vr-reviewer-search'), { target: { value: '' } });
    fireEvent.click(within(form).getByTestId('vr-reviewer-5'));
    expect(send.disabled).toBe(true);
    // A reviewer is not offered as the approver.
    expect((within(form).getByTestId('vr-approver-5') as HTMLInputElement).disabled).toBe(true);
    fireEvent.click(within(form).getByTestId('vr-approver-8'));
    fireEvent.change(within(form).getByTestId('vr-review-due'), { target: { value: '2099-11-02' } });
    expect(send.disabled).toBe(true);
    fireEvent.change(within(form).getByTestId('vr-approval-due'), { target: { value: '2099-11-04' } });
    expect(send.disabled).toBe(true);
    expect(within(form).getByTestId('vr-send-note').textContent).toMatch(/reason of at least 8 characters/);
    fireEvent.change(within(form).getByTestId('vr-reason'), { target: { value: REASON } });
    expect(send.disabled).toBe(false);
    expect(calls.some((c) => c.method === 'POST')).toBe(false);

    fireEvent.click(send);
    await waitFor(() => expect(posted('/api/regulatory/documents/C-9/advance')).toBeTruthy());
    expect(posted('/api/regulatory/documents')!.body).toEqual({ sources: { vault_documents: { nativeId: DOC_ID, role: 'artifact' } } });
    expect(posted('/api/regulatory/documents/C-9/advance')!.body).toEqual({
      to: 'in_review', reason: REASON,
      route: { reviewers: [6, 5], approvers: [8], order: 'parallel', reviewDueDate: '2099-11-02', approvalDueDate: '2099-11-04' },
    });
    await waitFor(() => expect(screen.queryByTestId('vault-route-form')).toBeNull());
  });

  it("a refusal is said in the server's words, and the form stays open", async () => {
    versions = [version()];
    mockApi();
    answers['POST /api/regulatory/documents'] = () => ok({ ok: true, canonicalId: 'C-9', created: true });
    answers['POST /api/regulatory/documents/C-9/advance'] = () => ({ ok: false, status: 409, json: async () => ({ ok: false, error: 'MEMBER_NO_PROJECT_ACCESS', message: 'Rae Reviewer cannot open this document’s project. Nothing was sent.' }) }) as Response;
    mount();
    fireEvent.click(await screen.findByRole('button', { name: /^Send for review:/ }));
    const form = await screen.findByTestId('vault-route-form');
    fireEvent.click(await within(form).findByTestId('vr-reviewer-5'));
    fireEvent.click(within(form).getByTestId('vr-approver-8'));
    fireEvent.change(within(form).getByTestId('vr-review-due'), { target: { value: '2099-11-02' } });
    fireEvent.change(within(form).getByTestId('vr-approval-due'), { target: { value: '2099-11-02' } });
    fireEvent.change(within(form).getByTestId('vr-reason'), { target: { value: REASON } });
    fireEvent.click(within(form).getByTestId('vr-send'));
    expect((await within(form).findByTestId('vr-error')).textContent).toContain('cannot open this document’s project');
  });

  it('a candidate list that could not be read offers no one, and says so', async () => {
    versions = [version()];
    mockApi();
    answers[`GET ${CANDIDATES_URL}`] = () => ({ ok: false, status: 503, json: async () => ({}) }) as Response;
    mount();
    fireEvent.click(await screen.findByRole('button', { name: /^Send for review:/ }));
    const form = await screen.findByTestId('vault-route-form');
    expect(await within(form).findByText(/could not be read, so no one can be chosen/)).toBeTruthy();
    expect((within(form).getByTestId('vr-send') as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('the version shows its route (RR1b, §2.12)', () => {
  it('every member with printed name, meaning, UTC time and outcome; "You signed at …; waiting for B"', async () => {
    me.id = '5';
    versions = [version(lifecycle(round([
      member({ userId: 5, printedName: 'Rae Reviewer', outcome: 'signed', signature: signature('Rae Reviewer', 'REVIEWED', '2026-10-29T14:02:31.000Z') }),
      member({ userId: 6, printedName: 'Rob Reviewer' }),
      member({ userId: 8, printedName: 'Ann Approver', role: 'approver', step: 2, stepOpen: false, dueDate: '2026-11-05T04:59:59.999Z' }),
    ])))];
    mockApi();
    mount();
    expect((await screen.findByTestId('vault-route-headline')).textContent).toBe('You signed at 14:02 UTC; waiting for Rob Reviewer.');
    expect(screen.getByTestId('vault-route-member-5').textContent).toContain('Rae Reviewer · reviewer · Reviewed · meaning: reviewed · 2026-10-29 14:02:31 UTC');
    expect(screen.getByTestId('vault-route-member-6').textContent).toContain('Rob Reviewer · reviewer · Waiting for their review · due 2026-11-03 03:59:59 UTC');
    expect(screen.getByTestId('vault-route-member-8').textContent).toContain('Ann Approver · approver · Waits for the review');
    // A member who has signed is offered no step, and is not the sender: no Withdraw.
    expect(screen.queryByRole('button', { name: /^Sign review:/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Withdraw:/ })).toBeNull();
  });

  it('the approver reads "Approved (1 of 1 required)"', async () => {
    versions = [version(lifecycle(round([
      member({ userId: 5, printedName: 'Rae Reviewer', outcome: 'signed', signature: signature('Rae Reviewer', 'REVIEWED', '2026-10-29T14:02:31.000Z') }),
      member({ userId: 8, printedName: 'Ann Approver', role: 'approver', step: 2, outcome: 'signed', signature: signature('Ann Approver', 'APPROVED', '2026-10-30T09:15:00.000Z') }),
    ], { status: 'complete', statusBy: 8, statusAt: '2026-10-30T09:15:00.000Z' }, { reviewComplete: true, approvalComplete: true }), { stage: 'approved' }))];
    mockApi();
    mount();
    expect((await screen.findByTestId('vault-route-member-8')).textContent)
      .toContain('Ann Approver · approver · Approved (1 of 1 required) · meaning: approved · 2026-10-30 09:15:00 UTC');
  });

  it('"Reviewers could not be read" on a failed read: never "no reviewers", and no step is offered', async () => {
    me.id = '5';
    versions = [version(lifecycle(null, { roundUnread: true }))];
    mockApi();
    mount();
    expect((await screen.findByTestId('vault-route-round')).textContent).toContain('Reviewers could not be read');
    expect(screen.queryByRole('button', { name: /^(Sign review|Approve|Name reviewers):/ })).toBeNull();
    expect(screen.queryByText(/Not assigned to one person/)).toBeNull();
  });

  it('a named approver whose turn it is approves by signing on the route', async () => {
    me.id = '8';
    versions = [version(lifecycle(round([
      member({ userId: 5, printedName: 'Rae Reviewer', outcome: 'signed', signature: signature('Rae Reviewer', 'REVIEWED', '2026-10-29T14:02:31.000Z') }),
      member({ userId: 8, printedName: 'Ann Approver', role: 'approver', step: 2 }),
    ], {}, { reviewComplete: true })))];
    mockApi();
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ valid: true }) }) as Response));
    answers['POST /api/regulatory/documents/C-1/sign'] = () => ok({ ok: true, approvalComplete: true, signature: { signedAt: '2026-10-30T09:15:00.000Z' } });
    mount();
    expect((await screen.findByTestId('vault-route-headline')).textContent).toBe('Your turn: approve.');
    fireEvent.click(screen.getByRole('button', { name: /^Approve:/ }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText(/Reason for this action/), { target: { value: 'Approved for the IND' } });
    fireEvent.change(within(dialog).getByLabelText(/Password/), { target: { value: 'correct horse' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /Sign and commit/ }));
    await waitFor(() => expect(posted('/api/regulatory/documents/C-1/sign')).toBeTruthy());
    expect(posted('/api/regulatory/documents/C-1/sign')!.body).toMatchObject({ meaning: 'approved', reason: 'Approved for the IND' });
    expect(calls.some((c) => c.url === '/api/regulatory/documents/C-1/advance')).toBe(false);
  });
});

describe('Withdraw and Return for revision (RR1b, §2.9–§2.10)', () => {
  const live = () => version(lifecycle(round([
    member({ userId: 5, printedName: 'Rae Reviewer' }),
    member({ userId: 8, printedName: 'Ann Approver', role: 'approver', step: 2, stepOpen: false }),
  ])));

  it.each([
    ['Withdraw', 'withdraw', '3'],
    ['Return for revision', 'return', '5'],
  ])('%s asks for a reason and refuses without one', async (label, act, who) => {
    me.id = who;
    versions = [live()];
    mockApi();
    answers[`POST /api/regulatory/documents/C-1/review-route/${act}`] = () => ok({ ok: true, status: act === 'withdraw' ? 'withdrawn' : 'returned' });
    mount();
    fireEvent.click(await screen.findByRole('button', { name: new RegExp(`^${label}:`) }));
    const dialog = await screen.findByTestId(`vault-route-${act}`);
    const confirm = within(dialog).getByTestId('vr-act-confirm') as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    fireEvent.change(within(dialog).getByTestId('vr-act-reason'), { target: { value: 'short' } });
    expect(confirm.disabled).toBe(true);
    fireEvent.click(confirm);
    expect(posted(`/api/regulatory/documents/C-1/review-route/${act}`)).toBeUndefined();
    fireEvent.change(within(dialog).getByTestId('vr-act-reason'), { target: { value: 'The approver is on leave this month' } });
    fireEvent.click(confirm);
    await waitFor(() => expect(posted(`/api/regulatory/documents/C-1/review-route/${act}`)).toBeTruthy());
    expect(posted(`/api/regulatory/documents/C-1/review-route/${act}`)!.body).toEqual({ reason: 'The approver is on leave this month' });
  });

  it('the sender reminds a member whose turn it is, through the task notify route', async () => {
    me.id = '3';
    versions = [live()];
    mockApi();
    answers['POST /api/tasks/tasks/ROUTE-abcd1234-5/notify'] = () => ok({ success: true });
    mount();
    expect(screen.queryByRole('button', { name: 'Remind Ann Approver' })).toBeNull();
    fireEvent.click(await screen.findByRole('button', { name: 'Remind Rae Reviewer' }));
    expect(await screen.findByText('Rae Reviewer was reminded.')).toBeTruthy();
    expect((posted('/api/tasks/tasks/ROUTE-abcd1234-5/notify')!.body as { message: string }).message).toMatch(/your review of stability-summary-24m v2\.0 is waiting/);
  });
});

describe('a version in review with no route (legacy, §2.13)', () => {
  it('keeps "Not assigned to one person" and offers Name reviewers, which names a route on its record', async () => {
    me.id = '5';
    versions = [version(lifecycle(null))];
    mockApi();
    answers['POST /api/regulatory/documents/C-1/review-route'] = () => ok({ ok: true, routeId: 'r-2', stage: 'in_review' });
    mount();
    fireEvent.click(await screen.findByRole('button', { name: /^Name reviewers:/ }));
    const form = await screen.findByTestId('vault-route-form');
    fireEvent.click(await within(form).findByTestId('vr-reviewer-6'));
    fireEvent.click(within(form).getByTestId('vr-approver-8'));
    fireEvent.change(within(form).getByTestId('vr-review-due'), { target: { value: '2099-11-02' } });
    fireEvent.change(within(form).getByTestId('vr-approval-due'), { target: { value: '2099-11-03' } });
    fireEvent.change(within(form).getByTestId('vr-reason'), { target: { value: REASON } });
    fireEvent.click(within(form).getByTestId('vr-send'));
    await waitFor(() => expect(posted('/api/regulatory/documents/C-1/review-route')).toBeTruthy());
    expect(posted('/api/regulatory/documents/C-1/review-route')!.body).toMatchObject({ reason: REASON, route: { reviewers: [6], approvers: [8] } });
    expect(calls.some((c) => c.url === '/api/regulatory/documents')).toBe(false);
  });
});
