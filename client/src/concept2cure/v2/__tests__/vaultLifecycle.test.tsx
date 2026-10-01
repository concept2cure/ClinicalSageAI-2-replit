// @vitest-environment jsdom
/**
 * Review and approval of a Vault version, in the Vault (VR-13).
 *
 * A version's review stage is shown apart from its filing, with each
 * sign-off's printed name, meaning and time. The current version offers the
 * next step: Send for review, Sign as reviewed, Approve. Signing runs the
 * shared Part 11 dialog and forwards meaning, reason and password to the one
 * lifecycle route. The page says before anyone signs that the uploader and the
 * reviewer may not approve. A confirmed filing no longer counts as settled.
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

import { ApiRequestError } from '@/lib/queryClient';
import { Vault, isSettled } from '../surfaces/Vault';
import { PID, DOC_ID, ok, uploadDoc, cabinetTree, vaultPayload, props } from './_vault-surface-fixtures';

const V1 = '33333333-3333-4333-8333-333333333333';
const VERSIONS_URL = `/api/c2c/project-vault/${PID}/documents/${DOC_ID}/versions`;
const REASON = 'Checked against the protocol';
const head = uploadDoc({ ver: 'v2.0', versionCount: 2, lifecycleStage: null, details: { documentTitle: 'Stability summary', documentType: 'OTHER', classification: 'INTERNAL' } });

const version = (over: Record<string, unknown> = {}) => ({
  id: DOC_ID, version: '2.0', contentHash: 'b'.repeat(64), fileSize: 2048, fileName: 's.pdf', uploader: 'Uma Uploader',
  uploaderId: 3, createdAt: '2026-09-30T10:00:00.000Z', current: true, link: 'verified', lifecycle: null, ...over,
});
const earlier = version({ id: V1, version: '1.0', current: false, link: 'none' });
const signOff = (name: string, meaning: string, signerId: number) =>
  ({ printedName: name, meaning, signedAt: '2026-10-01T10:00:00.000Z', signatureRef: 'esig:9', signerId });

const calls: Array<{ method: string; url: string; body?: unknown }> = [];
let versions: unknown[] = [];
let answers: Record<string, () => Response> = {};
/** A refusal as apiRequest delivers it in production: thrown, with the body as payload. */
const refuse = (status: number, payload: Record<string, unknown>) => () => {
  throw new ApiRequestError(String(payload.message ?? 'Refused'), status, payload, String(payload.error ?? ''));
};

function mockApi() {
  calls.length = 0;
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (method: string, url: string, body?: unknown) => {
    calls.push({ method, url, body });
    if (answers[`${method} ${url}`]) return answers[`${method} ${url}`]();
    if (url === `/api/c2c/project-vault/${PID}` && method === 'GET') return ok(vaultPayload({ tree: cabinetTree([head]) }));
    if (url === VERSIONS_URL) return ok({ success: true, data: { versions } });
    return ok({ success: true, data: { entries: [], chain: { ok: true } } });
  });
}

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <Vault {...props()} />
    </QueryClientProvider>,
  );
}

/** The password pre-check the dialog runs (POST /api/esignature/verify-password). */
function stubPasswordCheck() {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ valid: true }) }) as Response));
}

beforeEach(() => {
  (window as any).C2C_PROJECT = { id: PID, title: 'BX-301' };
  answers = {};
  me.id = '7';
  me.roles = ['member'];
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); delete (window as any).C2C_PROJECT; });

describe('a Vault version\'s review and approval (VR-13)', () => {
  it("shows each version's stage and sign-offs, apart from its filing", async () => {
    versions = [
      version({ lifecycle: { canonicalId: 'C-2', stage: 'approved', review: signOff('Rae Reviewer', 'REVIEWED', 5), approval: signOff('Abe Approver', 'APPROVED', 7) } }),
      { ...earlier, lifecycle: { canonicalId: 'C-1', stage: 'superseded', review: null, approval: signOff('Abe Approver', 'APPROVED', 7) } },
    ];
    mockApi();
    mount();
    const list = await screen.findByTestId('vault-versions');
    await waitFor(() => expect(list.textContent).toContain('Approval signed by Abe Approver · meaning: approved · 2026-10-01 10:00:00 UTC'));
    expect(list.textContent).toContain('Review signed by Rae Reviewer · meaning: reviewed · 2026-10-01 10:00:00 UTC');
    expect(list.textContent).toContain('Superseded');
    // The superseded version's approval is kept, and marked as no longer current.
    expect(list.textContent).toMatch(/Superseded.*Approval signed by Abe Approver · meaning: approved · 2026-10-01 10:00:00 UTC · no longer current/);
    // Approved is the last step here: no action is offered.
    expect(screen.queryByRole('button', { name: /^(Send for review|Sign review|Approve):/ })).toBeNull();
    // The header shows the stage as its own chip, apart from the filing chip.
    expect(screen.getByLabelText('Review and approval: Not sent for review')).toBeTruthy();
  });

  it('sends a version nobody started for review, after saying what that means: starts its record, then moves it to In review', async () => {
    versions = [version(), earlier];
    mockApi();
    answers[`POST /api/regulatory/documents`] = () => ({ ok: true, status: 201, json: async () => ({ ok: true, canonicalId: 'C-9', created: true }) }) as Response;
    answers[`POST /api/regulatory/documents/C-9/advance`] = () => ({ ok: true, status: 200, json: async () => ({ ok: true, stage: 'in_review' }) }) as Response;
    mount();
    const list = await screen.findByTestId('vault-versions');
    await waitFor(() => expect(list.textContent).toContain('Not sent for review'));
    const treeReads = () => calls.filter((c) => c.url === `/api/c2c/project-vault/${PID}`).length;
    const before = treeReads();
    fireEvent.click(screen.getByRole('button', { name: /^Send for review:/ }));
    // Nothing is sent until confirmed; the confirmation names the file and the consequence.
    const confirm = screen.getByRole('group', { name: 'Confirm sending for review' });
    expect(confirm.textContent).toContain('SHA-256 bbbbbbbbbbbb');
    expect(confirm.textContent).toContain('a different person reviews and approves it');
    expect(calls.some((c) => c.url === '/api/regulatory/documents')).toBe(false);
    fireEvent.click(within(confirm).getByRole('button', { name: 'Send for review' }));
    await waitFor(() => expect(calls.some((c) => c.url === '/api/regulatory/documents/C-9/advance')).toBe(true));
    const startCall = calls.find((c) => c.url === '/api/regulatory/documents')!;
    expect(startCall.body).toEqual({ sources: { vault_documents: { nativeId: DOC_ID, role: 'artifact' } } });
    expect(calls.find((c) => c.url === '/api/regulatory/documents/C-9/advance')!.body).toMatchObject({ to: 'in_review' });
    await waitFor(() => expect(treeReads()).toBeGreaterThan(before));
  });

  it('signs the review through the e-signature dialog: meaning, reason and password go to the lifecycle route', async () => {
    versions = [version({ lifecycle: { canonicalId: 'C-3', stage: 'in_review', review: null, approval: null } }), earlier];
    mockApi();
    stubPasswordCheck();
    answers[`POST /api/regulatory/documents/C-3/sign`] = () =>
      ({ ok: true, status: 200, json: async () => ({ ok: true, signature: { signedAt: '2026-10-01T11:00:00.000Z' } }) }) as Response;
    mount();
    fireEvent.click(await screen.findByRole('button', { name: /^Sign review:/ }));
    const dialog = await screen.findByRole('dialog');
    const offered = within(dialog).getAllByRole('radio').map((r) => (r.textContent ?? '').replace(/You .*/, '').trim());
    expect(offered).toEqual(['Review']);
    fireEvent.change(within(dialog).getByLabelText(/Reason for this action/), { target: { value: REASON } });
    fireEvent.change(within(dialog).getByLabelText(/Password/), { target: { value: 'correct horse' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /Sign and commit/ }));
    await waitFor(() => expect(calls.some((c) => c.url === '/api/regulatory/documents/C-3/sign')).toBe(true));
    expect(calls.find((c) => c.url === '/api/regulatory/documents/C-3/sign')!.body).toEqual({
      meaning: 'reviewed', reason: REASON, password: 'correct horse', mfaToken: undefined,
    });
  });

  it('a refused approval shows the server\'s reason, in the dialog', async () => {
    versions = [version({ lifecycle: { canonicalId: 'C-4', stage: 'in_review', review: signOff('Rae Reviewer', 'REVIEWED', 5), approval: null } }), earlier];
    mockApi();
    stubPasswordCheck();
    answers[`POST /api/regulatory/documents/C-4/advance`] = refuse(409, {
      ok: false, error: 'VERSION_NOT_CURRENT',
      message: 'Version 2.0 is no longer the current version, so it cannot be reviewed or approved. Use the current version. Nothing was signed.',
    });
    mount();
    fireEvent.click(await screen.findByRole('button', { name: /^Approve:/ }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getAllByRole('radio').map((r) => (r.textContent ?? '').replace(/You .*/, '').trim())).toEqual(['Approval']);
    fireEvent.change(within(dialog).getByLabelText(/Reason for this action/), { target: { value: REASON } });
    fireEvent.change(within(dialog).getByLabelText(/Password/), { target: { value: 'correct horse' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /Sign and commit/ }));
    expect(await within(dialog).findByText(/is no longer the current version, so it cannot be reviewed or approved/)).toBeTruthy();
    expect(calls.find((c) => c.url === '/api/regulatory/documents/C-4/advance')!.body).toMatchObject({ to: 'approved', reason: REASON });
  });

});

describe('who may take the next step, and what each step says (VR-13)', () => {
  it('says before signing that the reviewer, and the uploader, do not approve', async () => {
    me.id = '5';
    versions = [version({ lifecycle: { canonicalId: 'C-5', stage: 'in_review', review: signOff('Rae Reviewer', 'REVIEWED', 5), approval: null } }), earlier];
    mockApi();
    const first = mount();
    const approve = await screen.findByRole('button', { name: /^Approve:/ });
    expect((approve as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('You signed the review, so a different person approves it.')).toBeTruthy();
    first.unmount();

    me.id = '3';
    versions = [version({ lifecycle: { canonicalId: 'C-6', stage: 'in_review', review: null, approval: null } }), earlier];
    mockApi();
    mount();
    const review = await screen.findByRole('button', { name: /^Sign review:/ });
    expect((review as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('You uploaded this version, so a different person reviews it.')).toBeTruthy();
  });

  it('says who sent it for review, and a role without authoring rights, may not act', async () => {
    me.id = '8';
    versions = [version({ lifecycle: { canonicalId: 'C-7', stage: 'in_review', creatorId: 8, review: null, approval: null } }), earlier];
    mockApi();
    const first = mount();
    expect(((await screen.findByRole('button', { name: /^Sign review:/ })) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('You sent this version for review, so a different person reviews it.')).toBeTruthy();
    first.unmount();

    me.id = '9';
    me.roles = ['viewer'];
    versions = [version(), earlier];
    mockApi();
    mount();
    expect(((await screen.findByRole('button', { name: /^Send for review:/ })) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/Your role does not send, review or approve documents/)).toBeTruthy();
  });

  it('names the earlier approved version an approval supersedes', async () => {
    versions = [
      version({ lifecycle: { canonicalId: 'C-8', stage: 'in_review', review: signOff('Rae Reviewer', 'REVIEWED', 5), approval: null } }),
      { ...earlier, lifecycle: { canonicalId: 'C-1', stage: 'submitted', review: null, approval: signOff('Abe Approver', 'APPROVED', 6) } },
    ];
    mockApi();
    mount();
    fireEvent.click(await screen.findByRole('button', { name: /^Approve:/ }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog.textContent).toContain('v1.0 (Approved, submitted) becomes superseded when you sign.');
  });

  it('a dropped connection says the outcome is not known, never that nothing happened', async () => {
    versions = [version(), earlier];
    mockApi();
    answers[`POST /api/regulatory/documents`] = () => { throw new TypeError('Failed to fetch'); };
    mount();
    fireEvent.click(await screen.findByRole('button', { name: /^Send for review:/ }));
    fireEvent.click(within(screen.getByRole('group', { name: 'Confirm sending for review' })).getByRole('button', { name: 'Send for review' }));
    expect(await screen.findByText(/it is not known whether this was recorded/)).toBeTruthy();
  });

  it('the list row says the stage beside the filing', async () => {
    versions = [version(), earlier];
    mockApi();
    mount();
    expect(await screen.findByText(/v2\.0, 2 versions · Not sent for review/)).toBeTruthy();
  });
});

describe('what counts as settled in a folder (VR-13, FD4)', () => {
  it('an upload counts only once approved; a confirmed filing is not an approval', () => {
    const up = (stage: string | null) => uploadDoc({ status: 'confirmed', lifecycleStage: stage }) as never;
    expect(isSettled(up(null))).toBe(false);
    expect(isSettled(up('in_review'))).toBe(false);
    expect(isSettled(up('superseded'))).toBe(false);
    expect(isSettled(up('approved'))).toBe(true);
    expect(isSettled(up('placed'))).toBe(true);
    expect(isSettled({ ...uploadDoc({ src: 'authored', status: 'final' }) } as never)).toBe(true);
  });
});
