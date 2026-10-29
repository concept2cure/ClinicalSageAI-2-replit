// @vitest-environment jsdom
/**
 * RR2 on a Vault version's review route (docs/design/REVIEW_ROUTING_2026-10-23.md
 * §2.6, §2.10, §2.12, §3; NEW-4). The harness is vaultReviewRoute.test.tsx's.
 *
 *   - the route form names reviewers "one after another": an ordered list,
 *     each reviewer moved earlier or later by a button (a 44 px target at a
 *     phone's width, not drag), each step with its own due date; and more than
 *     one approver. Send posts the sequential route;
 *   - the sender adds a reviewer to the open route from its round: a sheet that
 *     reads whom the addition would admit (…?for=add), asks a person, a due
 *     date and a reason, and posts them; not offered once an approver signed;
 *   - an approver's dialog says which approval theirs is: "Your approval is 1
 *     of 2 required".
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
const ADD_CANDIDATES_URL = `${CANDIDATES_URL}?for=add`;
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
    { id: 10, name: 'Ava Approver', reviewer: null, approver: null },
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
    if (url === CANDIDATES_URL || url === ADD_CANDIDATES_URL) return ok(CANDIDATES);
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


describe('the route form names reviewers one after another, and more than one approver (RR2, §2.6, §3)', () => {
  it('orders the reviewers with earlier and later buttons, dates each step, names two approvers, and sends the sequential route', async () => {
    versions = [version()];
    mockApi();
    answers['POST /api/regulatory/documents'] = () => ok({ ok: true, canonicalId: 'C-9', created: true });
    answers['POST /api/regulatory/documents/C-9/advance'] = () => ok({ ok: true, stage: 'in_review', routeId: 'r-1' });
    mount();
    fireEvent.click(await screen.findByRole('button', { name: /^Send for review:/ }));
    const form = await screen.findByTestId('vault-route-form');
    fireEvent.click(await within(form).findByTestId('vr-reviewer-6'));
    expect(within(form).queryByTestId('vr-order-sequential'), 'no order to choose with one reviewer').toBeNull();
    fireEvent.click(within(form).getByTestId('vr-reviewer-5'));
    fireEvent.click(within(form).getByTestId('vr-order-sequential'));
    expect(within(form).queryByTestId('vr-review-due'), 'one after another, each step has its own date').toBeNull();
    const steps = within(form).getByTestId('vr-steps');
    expect(Array.from(steps.querySelectorAll('li')).map((li) => li.querySelector('.vr-step-name')!.textContent)).toEqual(['Step 1 · Rob Reviewer', 'Step 2 · Rae Reviewer']);
    expect((within(steps).getByRole('button', { name: 'Move Rob Reviewer earlier' }) as HTMLButtonElement).disabled).toBe(true);
    const later = within(steps).getByRole('button', { name: 'Move Rae Reviewer later' }) as HTMLButtonElement;
    expect(later.disabled).toBe(true);
    expect(later.className).toContain('vr-move');
    fireEvent.click(within(steps).getByRole('button', { name: 'Move Rae Reviewer earlier' }));
    expect(Array.from(steps.querySelectorAll('li')).map((li) => li.querySelector('.vr-step-name')!.textContent)).toEqual(['Step 1 · Rae Reviewer', 'Step 2 · Rob Reviewer']);

    fireEvent.click(within(form).getByTestId('vr-approver-8'));
    fireEvent.click(within(form).getByTestId('vr-approver-10'));
    expect((within(form).getByTestId('vr-approver-5') as HTMLInputElement).disabled, 'a reviewer is not an approver').toBe(true);
    fireEvent.change(within(form).getByTestId('vr-approval-due'), { target: { value: '2099-11-06' } });
    fireEvent.change(within(form).getByTestId('vr-reason'), { target: { value: REASON } });
    const send = within(form).getByTestId('vr-send') as HTMLButtonElement;
    expect(send.disabled).toBe(true);
    expect(within(form).getByTestId('vr-send-note').textContent).toContain('Give each step’s due date.');
    fireEvent.change(within(form).getByTestId('vr-step-due-0'), { target: { value: '2099-11-03' } });
    fireEvent.change(within(form).getByTestId('vr-step-due-1'), { target: { value: '2099-11-02' } });
    expect(within(form).getByTestId('vr-send-note').textContent).toContain('Each step is due on or after the step before it.');
    fireEvent.change(within(form).getByTestId('vr-step-due-1'), { target: { value: '2099-11-04' } });
    expect(send.disabled).toBe(false);
    fireEvent.click(send);
    await waitFor(() => expect(posted('/api/regulatory/documents/C-9/advance')).toBeTruthy());
    expect(posted('/api/regulatory/documents/C-9/advance')!.body).toEqual({
      to: 'in_review', reason: REASON,
      route: { reviewers: [5, 6], approvers: [8, 10], order: 'sequential', reviewStepDueDates: ['2099-11-03', '2099-11-04'], approvalDueDate: '2099-11-06' },
    });
  });
});

describe('adding a reviewer to the open route (RR2, §2.10)', () => {
  const rae = member({ userId: 5, printedName: 'Rae Reviewer', outcome: 'signed', signature: signature('Rae Reviewer', 'REVIEWED', '2026-10-29T14:02:31.000Z') });
  const ann = member({ userId: 8, printedName: 'Ann Approver', role: 'approver', step: 2 });

  it('the sender adds one: the sheet offers whom the addition admits and posts the person, the due date and the reason', async () => {
    me.id = '3';
    versions = [version(lifecycle(round([rae, ann], {}, { reviewComplete: true })))];
    mockApi();
    answers['POST /api/regulatory/documents/C-1/review-route/members'] = () => ok({ ok: true, taskId: 'ROUTE-abcd1234-6', step: 1 });
    mount();
    const panel = await screen.findByTestId('vault-route-round');
    fireEvent.click(within(panel).getByRole('button', { name: 'Add a reviewer' }));
    const sheet = await screen.findByTestId('vault-route-add');
    await waitFor(() => expect(calls.some((c) => c.url === ADD_CANDIDATES_URL)).toBe(true));
    expect(sheet.textContent).toContain('Ann Approver waits again');
    const confirm = within(sheet).getByTestId('vr-add-confirm') as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    fireEvent.click(await within(sheet).findByTestId('vr-add-6'));
    fireEvent.change(within(sheet).getByTestId('vr-add-due'), { target: { value: '2099-11-03' } });
    expect(confirm.disabled).toBe(true);
    fireEvent.change(within(sheet).getByTestId('vr-add-reason'), { target: { value: 'Biostatistics must see the PK tables' } });
    expect(confirm.disabled).toBe(false);
    fireEvent.click(confirm);
    await waitFor(() => expect(posted('/api/regulatory/documents/C-1/review-route/members')).toBeTruthy());
    expect(posted('/api/regulatory/documents/C-1/review-route/members')!.body).toEqual({ assigneeId: 6, dueDate: '2099-11-03', reason: 'Biostatistics must see the PK tables' });
  });

  it('is not offered once an approver has signed, nor to a reader who neither sent it nor administers', async () => {
    me.id = '3';
    const annSigned = { ...ann, outcome: 'signed', signature: signature('Ann Approver', 'APPROVED', '2026-10-30T09:15:00.000Z') };
    const ava = member({ userId: 10, printedName: 'Ava Approver', role: 'approver', step: 2 });
    versions = [version(lifecycle(round([rae, annSigned, ava], {}, { reviewComplete: true })))];
    mockApi();
    mount();
    const panel = await screen.findByTestId('vault-route-round');
    expect(within(panel).getByTestId('vault-route-member-8').textContent).toContain('Approved (1 of 2 required)');
    expect(within(panel).queryByRole('button', { name: 'Add a reviewer' })).toBeNull();
    cleanup();
    me.id = '6';
    versions = [version(lifecycle(round([rae, ann], {}, { reviewComplete: true })))];
    mockApi();
    mount();
    await screen.findByTestId('vault-route-round');
    expect(screen.queryByRole('button', { name: 'Add a reviewer' })).toBeNull();
  });
});

describe("an approver's dialog says which approval theirs is (RR2, NEW-4)", () => {
  it('"Your approval is 1 of 2 required" while another approver is still to sign', async () => {
    me.id = '8';
    versions = [version(lifecycle(round([
      member({ userId: 5, printedName: 'Rae Reviewer', outcome: 'signed', signature: signature('Rae Reviewer', 'REVIEWED', '2026-10-29T14:02:31.000Z') }),
      member({ userId: 8, printedName: 'Ann Approver', role: 'approver', step: 2 }),
      member({ userId: 10, printedName: 'Ava Approver', role: 'approver', step: 2 }),
    ], {}, { reviewComplete: true })))];
    mockApi();
    mount();
    expect((await screen.findByTestId('vault-route-headline')).textContent).toBe('Your turn: approve.');
    fireEvent.click(screen.getByRole('button', { name: /^Approve:/ }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog.textContent).toContain('Your approval is 1 of 2 required');
    expect(dialog.textContent).toContain('approved once every named approver has signed');
  });
});
