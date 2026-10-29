// @vitest-environment jsdom
/**
 * Reassign and hand back on a Vault version's review route (RR3 of
 * docs/design/REVIEW_ROUTING_2026-10-23.md §2.10, §2.12; findings M3, M6).
 *
 *   - the sender, or an administrator, is offered Reassign on every member
 *     who has not signed (a member who handed back included), never on one
 *     who signed; anyone else is offered none;
 *   - Reassign opens a sheet that reads whom the reassignment would admit
 *     (…/route-candidates/:vaultId?for=reassign), offers only those for the
 *     member's role, says why the others are not offered, waits for a person
 *     and a reason, posts the assignment and the person, and says a refusal
 *     in the server's words;
 *   - a named member is offered Hand back, which asks for a reason; once
 *     handed back they are offered no signature, and the round says who is
 *     waiting on whom;
 *   - the round shows the naming history by printed name.
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
const me = vi.hoisted(() => ({ id: '3', displayName: 'Uma Uploader', email: 'uma@example.test', mfaEnabled: false, roles: ['member'] as string[] }));
vi.mock('@/services/portal/authService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/portal/authService')>()),
  useAuthUser: () => me,
}));

import { Vault } from '../surfaces/Vault';
import { PID, DOC_ID, ok, uploadDoc, cabinetTree, vaultPayload, props } from './_vault-surface-fixtures';

const VERSIONS_URL = `/api/c2c/project-vault/${PID}/documents/${DOC_ID}/versions`;
const REASSIGN_CANDIDATES_URL = `/api/regulatory/documents/route-candidates/${DOC_ID}?for=reassign`;
const REASON = 'Rae is on leave until next month';
const head = uploadDoc({ ver: 'v2.0', versionCount: 1, lifecycleStage: null, details: { documentTitle: 'Stability summary', documentType: 'OTHER', classification: 'INTERNAL' } });

const version = (lifecycle: unknown) => ({
  id: DOC_ID, version: '2.0', contentHash: 'b'.repeat(64), fileSize: 2048, fileName: 's.pdf', uploader: 'Uma Uploader',
  uploaderId: 3, createdAt: '2026-09-30T10:00:00.000Z', current: true, link: 'none', lifecycle,
});
const refused = (code: string, message: string) => ({ code, message });
const CANDIDATES = {
  ok: true, timeZone: 'UTC', canonicalId: 'C-1',
  candidates: [
    { id: 3, name: 'Uma Uploader', reviewer: refused('MEMBER_IS_AUTHOR', 'Uma Uploader is an author of this document (Vault uploader), so cannot review or approve it.'), approver: refused('MEMBER_IS_AUTHOR', 'x') },
    { id: 5, name: 'Rae Reviewer', reviewer: refused('MEMBER_ALREADY_NAMED', 'Rae Reviewer is already named on this route.'), approver: refused('MEMBER_ALREADY_NAMED', 'x') },
    { id: 6, name: 'Rob Reviewer', reviewer: refused('MEMBER_ALREADY_NAMED', 'Rob Reviewer is already named on this route.'), approver: refused('MEMBER_REVIEWED_THIS_CONTENT', 'Rob Reviewer signed a review of this content, so a different person approves it.') },
    { id: 8, name: 'Ann Approver', reviewer: refused('MEMBER_ALREADY_NAMED', 'Ann Approver is already named on this route.'), approver: refused('MEMBER_ALREADY_NAMED', 'x') },
    { id: 10, name: 'Ria Reviewer', reviewer: null, approver: null },
    { id: 11, name: 'Pat Peer', reviewer: null, approver: null },
  ],
};

const member = (over: Record<string, unknown>) => ({
  taskId: `ROUTE-abcd1234-${over.userId}`, step: 1, outcome: 'pending', stepOpen: true, dueDate: '2026-11-03T23:59:59.999Z',
  signature: null, actId: null, printedName: null, role: 'reviewer', ...over,
});
const rae = (over: Record<string, unknown> = {}) => member({ userId: 5, printedName: 'Rae Reviewer', ...over });
const rob = member({
  userId: 6, printedName: 'Rob Reviewer', outcome: 'signed',
  signature: { id: 41, printedName: 'Rob Reviewer', meaning: 'REVIEWED', signedAt: '2026-10-29T14:02:00.000Z' },
});
const ann = member({ userId: 8, printedName: 'Ann Approver', role: 'approver', step: 2, stepOpen: false, status: 'blocked' });
const SEND = {
  action: 'send', at: '2026-10-29T09:00:00.000Z', actorId: 3, actorName: 'Uma Uploader', reason: 'Ready for medical and QA review',
  members: [{ userId: 5, role: 'reviewer', printedName: 'Rae Reviewer' }, { userId: 6, role: 'reviewer', printedName: 'Rob Reviewer' }, { userId: 8, role: 'approver', printedName: 'Ann Approver' }],
};
const round = (members: unknown[], history: unknown[] = [SEND]) => ({
  route: {
    id: 'abcd1234-0000-4000-8000-000000000001', round: 1, senderId: 3, senderName: 'Uma Uploader', status: 'open',
    statusReason: null, statusBy: null, statusAt: null, reviewDueAt: '2026-11-03T23:59:59.999Z', approvalDueAt: '2026-11-05T23:59:59.999Z',
    createdAt: '2026-10-29T09:00:00.000Z',
  },
  members, reviewComplete: false, approvalComplete: false, history,
});
const lifecycle = (r: unknown) => ({ canonicalId: 'C-1', stage: 'in_review', creatorId: 3, review: null, approval: null, round: r, roundUnread: false });

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
    if (url === REASSIGN_CANDIDATES_URL) return ok(CANDIDATES);
    return ok({ success: true, data: { entries: [], chain: { ok: true } } });
  });
}
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}><Vault {...props()} /></QueryClientProvider>);
}
const posted = (url: string) => calls.find((c) => c.method === 'POST' && c.url === url);
const versionReads = () => calls.filter((c) => c.url === VERSIONS_URL).length;

beforeEach(() => {
  (window as any).C2C_PROJECT = { id: PID, title: 'BX-301' };
  answers = {};
  me.id = '3';
  me.roles = ['member'];
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); delete (window as any).C2C_PROJECT; });

describe('who is offered Reassign (RR3, §2.10)', () => {
  it('the sender: on every member who has not signed, never on one who signed', async () => {
    versions = [version(lifecycle(round([rae(), rob, ann])))];
    mockApi();
    mount();
    const panel = await screen.findByTestId('vault-route-round');
    expect(within(panel).getByRole('button', { name: 'Reassign Rae Reviewer' })).toBeTruthy();
    expect(within(panel).getByRole('button', { name: 'Reassign Ann Approver' })).toBeTruthy();
    expect(within(panel).queryByRole('button', { name: 'Reassign Rob Reviewer' })).toBeNull();
  });

  it('an administrator who did not send it is offered it; any other reader is not', async () => {
    versions = [version(lifecycle(round([rae(), rob, ann])))];
    me.id = '12';
    me.roles = ['admin'];
    mockApi();
    mount();
    const panel = await screen.findByTestId('vault-route-round');
    expect(within(panel).getByRole('button', { name: 'Reassign Rae Reviewer' })).toBeTruthy();
    cleanup();
    me.roles = ['member'];
    mockApi();
    mount();
    const other = await screen.findByTestId('vault-route-round');
    expect(within(other).queryByRole('button', { name: /^Reassign/ })).toBeNull();
  });
});

describe('Reassign: a sheet with the people the reassignment admits and a reason (RR3, §2.5, §2.10)', () => {
  it('offers only those admitted for the role, says why the others are not, waits for a person and a reason, and posts them', async () => {
    versions = [version(lifecycle(round([rae(), rob, ann])))];
    mockApi();
    answers['POST /api/regulatory/documents/C-1/review-route/reassign'] = () =>
      ok({ ok: true, routeId: 'r', taskId: 'ROUTE-abcd1234-5', role: 'reviewer', from: 5, to: 10, actId: 'act_1' });
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Reassign Rae Reviewer' }));
    const sheet = await screen.findByTestId('vault-route-reassign');
    expect(sheet.closest('.de-bd')?.classList.contains('de-sheet'), 'a sheet at a phone’s width').toBe(true);
    expect(within(sheet).getByText(/Reassign Rae Reviewer’s review/)).toBeTruthy();
    await within(sheet).findByTestId('vr-reassign-10');
    expect(calls.some((c) => c.url === REASSIGN_CANDIDATES_URL)).toBe(true);
    for (const id of [3, 5, 6, 8]) expect(within(sheet).queryByTestId(`vr-reassign-${id}`)).toBeNull();
    const notOffered = within(sheet).getByTestId('vr-reassign-not-offered');
    expect(notOffered.textContent).toMatch(/4 members are not offered/);
    expect(notOffered.textContent).toContain('Rae Reviewer is already named on this route.');
    expect(notOffered.textContent).toContain('Uma Uploader is an author of this document');

    const confirm = within(sheet).getByTestId('vr-reassign-confirm') as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    expect(within(sheet).getByTestId('vr-reassign-note').textContent).toContain('Choose who takes it over.');
    fireEvent.click(within(sheet).getByTestId('vr-reassign-10'));
    expect(confirm.disabled).toBe(true);
    expect(within(sheet).getByTestId('vr-reassign-note').textContent).toMatch(/reason of at least 8 characters/);
    fireEvent.change(within(sheet).getByTestId('vr-reassign-reason'), { target: { value: REASON } });
    expect(confirm.disabled).toBe(false);
    const before = versionReads();
    fireEvent.click(confirm);
    await waitFor(() => expect(posted('/api/regulatory/documents/C-1/review-route/reassign')).toBeTruthy());
    expect(posted('/api/regulatory/documents/C-1/review-route/reassign')!.body).toEqual({ taskId: 'ROUTE-abcd1234-5', assigneeId: 10, reason: REASON });
    await waitFor(() => expect(screen.queryByTestId('vault-route-reassign')).toBeNull());
    await waitFor(() => expect(versionReads()).toBeGreaterThan(before));
  });

  it('an approver is reassigned from the people admitted as approver; a refusal is said in the server’s words', async () => {
    versions = [version(lifecycle(round([rae(), rob, ann])))];
    mockApi();
    answers['POST /api/regulatory/documents/C-1/review-route/reassign'] = () => new Response(JSON.stringify({
      ok: false, error: 'MEMBER_NO_PROJECT_ACCESS', message: 'Pat Peer cannot open this document’s project. Nothing was changed.',
    }), { status: 409, headers: { 'Content-Type': 'application/json' } });
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Reassign Ann Approver' }));
    const sheet = await screen.findByTestId('vault-route-reassign');
    await within(sheet).findByTestId('vr-reassign-11');
    expect(within(sheet).getByTestId('vr-reassign-not-offered').textContent).toContain('Rob Reviewer signed a review of this content');
    fireEvent.click(within(sheet).getByTestId('vr-reassign-11'));
    fireEvent.change(within(sheet).getByTestId('vr-reassign-reason'), { target: { value: 'The approver moved programmes' } });
    fireEvent.click(within(sheet).getByTestId('vr-reassign-confirm'));
    const error = await within(sheet).findByTestId('vr-reassign-error');
    expect(error.textContent).toContain('Pat Peer cannot open this document’s project. Nothing was changed.');
    expect(screen.getByTestId('vault-route-reassign')).toBeTruthy();
  });

  it('who may be named could not be read: no one is offered, and it says so', async () => {
    versions = [version(lifecycle(round([rae(), rob, ann])))];
    mockApi();
    answers[`GET ${REASSIGN_CANDIDATES_URL}`] = () => new Response('{}', { status: 500 });
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Reassign Rae Reviewer' }));
    const sheet = await screen.findByTestId('vault-route-reassign');
    expect((await within(sheet).findByRole('alert')).textContent).toMatch(/could not be read, so no one can be chosen/);
    expect((within(sheet).getByTestId('vr-reassign-confirm') as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('Hand back: a member returns their own assignment to the sender (RR3, §2.10, M6)', () => {
  it('a named member is offered Hand back, which asks for a reason and posts it', async () => {
    versions = [version(lifecycle(round([rae(), rob, ann])))];
    me.id = '5';
    mockApi();
    answers['POST /api/regulatory/documents/C-1/review-route/hand-back'] = () => ok({ ok: true, routeId: 'r', taskId: 'ROUTE-abcd1234-5', role: 'reviewer', actId: 'act_2' });
    mount();
    fireEvent.click(await screen.findByRole('button', { name: /^Hand back:/ }));
    const dialog = await screen.findByTestId('vault-route-hand-back');
    expect(dialog.textContent).toMatch(/The sender is told and reassigns it/);
    const confirm = within(dialog).getByTestId('vr-act-confirm') as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    fireEvent.change(within(dialog).getByTestId('vr-act-reason'), { target: { value: 'I am on leave for the review window' } });
    fireEvent.click(confirm);
    await waitFor(() => expect(posted('/api/regulatory/documents/C-1/review-route/hand-back')!.body).toEqual({ reason: 'I am on leave for the review window' }));
  });

  it('once handed back: no signature is offered to them, and the round says who waits on whom', async () => {
    const handed = rae({ outcome: 'handed back', actId: 'act_2', status: 'blocked' });
    const history = [SEND, { action: 'hand-back', at: '2026-10-29T11:00:00.000Z', actorId: 5, actorName: 'Rae Reviewer', role: 'reviewer', reason: 'I am on leave for the review window' }];
    versions = [version(lifecycle(round([handed, rob, ann], history)))];
    me.id = '5';
    mockApi();
    mount();
    const panel = await screen.findByTestId('vault-route-round');
    expect(screen.getByTestId('vault-route-headline').textContent).toBe('You handed this back; waiting for Uma Uploader to reassign it.');
    expect(within(panel).getByTestId('vault-route-member-5').textContent).toContain('Rae Reviewer · reviewer · Handed it back to the sender, who reassigns it');
    expect(screen.queryByRole('button', { name: /^Sign review:/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Hand back:/ })).toBeNull();
    cleanup();

    me.id = '3';
    mockApi();
    mount();
    expect((await screen.findByTestId('vault-route-headline')).textContent).toBe('Rae Reviewer handed their assignment back: reassign it.');
    expect(screen.getByRole('button', { name: 'Reassign Rae Reviewer' })).toBeTruthy();
  });
});

describe('the naming history, by name (RR3, §2.12, M3)', () => {
  it('says who sent it naming whom, who handed back, and who reassigned what from whom to whom, each with the time and reason', async () => {
    const history = [
      SEND,
      { action: 'hand-back', at: '2026-10-29T11:00:00.000Z', actorId: 5, actorName: 'Rae Reviewer', role: 'reviewer', reason: 'I am on leave for the review window' },
      { action: 'reassign', at: '2026-10-29T12:30:00.000Z', actorId: 3, actorName: 'Uma Uploader', role: 'reviewer', fromName: 'Rae Reviewer', toName: 'Ria Reviewer', reason: REASON },
    ];
    versions = [version(lifecycle(round([member({ userId: 10, printedName: 'Ria Reviewer' }), rob, ann], history)))];
    mockApi();
    mount();
    const list = await screen.findByTestId('vault-route-history');
    const lines = within(list).getAllByRole('listitem').map((li) => li.textContent);
    expect(lines).toEqual([
      'Uma Uploader sent it for review naming Rae Reviewer (reviewer), Rob Reviewer (reviewer) and Ann Approver (approver) · 2026-10-29 09:00:00 UTC · Ready for medical and QA review',
      'Rae Reviewer handed back their review · 2026-10-29 11:00:00 UTC · I am on leave for the review window',
      `Uma Uploader reassigned the review from Rae Reviewer to Ria Reviewer · 2026-10-29 12:30:00 UTC · ${REASON}`,
    ]);
  });
});
