// @vitest-environment jsdom
/** Retained correspondence handlers keep the account and filing that admitted them. */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { endCompanySession, seedCompanySession } from './_company-session-fixture';
import { authService } from '@/services/portal/authService';
import { getAuthToken } from '@/utils/authToken';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async original => ({ ...(await original<typeof import('@/lib/queryClient')>()), apiRequest }));
import { CompanyCorrespondenceDraft } from '../surfaces/CompanyCorrespondenceDraft';
import { CompanyCorrespondenceVariants } from '../surfaces/CompanyCorrespondenceVariants';
import { CompanyFilingIdentityReview } from '../surfaces/CompanyFilingIdentityReview';
import { EDITOR_TARGET_EVENT } from '../editorTarget';

const PROGRAM = '11111111-1111-4111-8111-111111111111';
const DOC = '22222222-2222-4222-8222-222222222222';
const VARIANT = '33333333-3333-4333-8333-333333333333';
const OTHER_VARIANT = '44444444-4444-4444-8444-444444444444';
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const onNav = vi.fn();
const onVariant = vi.fn();
let currentProfileRevision = 4;
const draftReceipt = (sequenceId = 9, variantId?: string) => ({ authoringDocId: DOC, programId: PROGRAM, sequenceId, documentStatus: 'draft', filedInVault: false, ...(variantId ? { variantId } : {}) });
const identity = (sequenceId = 9, profileRevision = 4, variantId?: string) => ({ sequenceId, profileRevision, profileHash: 'a'.repeat(64), filingHash: 'b'.repeat(64), variantId,
  status: 'needs_review', filing: { applicantName: 'Private recorded applicant', sponsorAddress: 'Recorded address', applicationNumber: 'IND123456' },
  differences: [{ field: 'name', companyValue: 'Private parent brand', filingValue: 'Private recorded applicant', missing: false }], review: null,
  explanation: 'A role review does not change the filing identity.' });
const design = { id: VARIANT, name: 'Private published company design', state: 'published', templateId: 'template-one',
  scope: { programId: null, market: null, language: null, subsidiary: null }, sha256: 'c'.repeat(64), createdBy: 42,
  createdAt: '2026-10-01T00:00:00Z', reviewedBy: 43, reviewedAt: '2026-10-02T00:00:00Z', publishedBy: 42,
  publishedAt: '2026-10-03T00:00:00Z', publishedRevision: 4, publishedProfileHash: 'd'.repeat(64) };
const posts = () => apiRequest.mock.calls.filter(([method]) => method === 'POST');
const designReads = () => apiRequest.mock.calls.filter(([method, path]) => method === 'GET' && path.includes('/designs?'));
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
function draft(sequenceId = 9, variantId?: string) { return <CompanyCorrespondenceDraft sequenceId={sequenceId} programId={PROGRAM} submissionTitle="Recorded filing" onNav={onNav} variantId={variantId} />; }
function fillDraft() {
  fireEvent.click(screen.getByRole('button', { name: 'Prepare correspondence in Authoring' }));
  fireEvent.change(screen.getByLabelText('Draft correspondence text'), { target: { value: 'Private reviewed response.' } });
  fireEvent.change(screen.getByLabelText('Reason for creating correspondence'), { target: { value: 'Prepare the response for review' } });
  return screen.getByRole('button', { name: 'Save correspondence draft' });
}
async function fillReview() {
  await screen.findByText('Private parent brand');
  fireEvent.change(screen.getByLabelText('Company role'), { target: { value: 'parent_brand' } });
  fireEvent.change(screen.getByLabelText('Reason this role explains the difference'), { target: { value: 'Private explanation of the parent brand' } });
  return screen.getByRole('button', { name: 'Record reviewed role difference' });
}
/** Retain the real rendered callback, independently of later React event delegation. */
function retainedClick(element: HTMLElement): () => void {
  const key = Object.keys(element).find(name => name.startsWith('__reactProps$'));
  if (!key) throw new Error('The rendered control has no React event props.');
  const callback = (element as unknown as Record<string, { onClick: () => void }>)[key].onClick;
  if (typeof callback !== 'function') throw new Error('The rendered control has no click callback.');
  return callback;
}
function replaceOwner(kind: string) {
  if (kind === 'browser bearer') sessionStorage.setItem('trialsage_access_token', 'unadopted-browser-bearer');
  else if (kind === 'sign out') endCompanySession();
  else seedCompanySession({ organizationId: '7', ...(kind === 'session' ? {} : { id: '43', email: 'replacement@example.test' }) }, 'replacement');
}
beforeEach(() => {
  localStorage.clear(); sessionStorage.clear(); seedCompanySession({ organizationId: '7' });
  currentProfileRevision = 4;
  apiRequest.mockReset().mockImplementation(async (method: string, path: string, body?: { sequenceId?: number; variantId?: string }) => {
    const params = new URL(path, 'http://fixture').searchParams;
    if (method === 'GET' && path.includes('/designs?')) return json({ data: [design], nextBefore: 'next-page' });
    if (method === 'GET' && path.includes('/identity?')) return json(identity(Number(params.get('sequenceId')), currentProfileRevision, params.get('variantId') ?? undefined));
    if (path.endsWith('/identity/review')) return json({ ...identity(body?.sequenceId, 4, body?.variantId), status: 'reviewed_difference',
      review: { company_role: 'parent_brand', reviewed_by: 42, reviewed_at: '2026-10-23', reason: 'Private explanation of the parent brand' } });
    return json(draftReceipt(body?.sequenceId, body?.variantId), 201);
  });
  onNav.mockReset(); onVariant.mockReset(); delete window.C2C_EDITOR_TARGET;
});

describe('retained account and navigation admission', () => {
  it.each(['session', 'browser bearer', 'sign out'])('blocks a retained draft create after %s changes', kind => {
    render(draft()); const create = fillDraft();
    act(() => { replaceOwner(kind); fireEvent.click(create); });
    expect(posts()).toHaveLength(0); expect(onNav).not.toHaveBeenCalled();
  });

  it('retires a role snapshot with the same bearer and auth revision before create', async () => {
    render(draft()); const create = fillDraft();
    const guard = authService.captureSessionReadGuard(), token = getAuthToken();
    vi.stubGlobal('fetch', vi.fn(async () => json({ authenticated: true, user: { ...authService.getUser(), roles: ['viewer'] } })));
    await act(async () => { expect((await authService.refreshUser()).success).toBe(true); fireEvent.click(create); });
    expect(guard.sameRevision()).toBe(true); expect(getAuthToken()).toBe(token); expect(posts()).toHaveLength(0);
  });

  it.each(['confirmed', 'recovery', 'unidentified'])('blocks stale %s Authoring navigation after owner replacement', async mode => {
    if (mode !== 'confirmed') apiRequest.mockResolvedValue(json({ error: { message: 'Check the existing draft before retrying.' },
      ...(mode === 'recovery' ? { recovery: { documentId: DOC, programId: PROGRAM, organizationId: 7 } } : {}) }, 503));
    render(draft()); fireEvent.click(fillDraft());
    const open = await screen.findByRole('button', { name: mode === 'unidentified' ? 'Check this project’s Authoring documents' : 'Open identified correspondence in Authoring' });
    delete window.C2C_EDITOR_TARGET; onNav.mockClear();
    act(() => { replaceOwner('account'); fireEvent.click(open); });
    expect(window.C2C_EDITOR_TARGET).toBeUndefined(); expect(onNav).not.toHaveBeenCalled();
  });

  it('rechecks ownership after the actual editor-target event before navigating', async () => {
    render(draft()); fireEvent.click(fillDraft());
    const open = await screen.findByRole('button', { name: 'Open identified correspondence in Authoring' });
    let targetAtEvent: string | null | undefined;
    const replaceAtTarget = vi.fn(() => { targetAtEvent = window.C2C_EDITOR_TARGET?.docId; replaceOwner('account'); });
    window.addEventListener(EDITOR_TARGET_EVENT, replaceAtTarget, { once: true });
    try {
      act(() => fireEvent.click(open));
      expect(replaceAtTarget).toHaveBeenCalledOnce(); expect(targetAtEvent).toBe(DOC);
      expect(onNav).not.toHaveBeenCalled();
    } finally { window.removeEventListener(EDITOR_TARGET_EVENT, replaceAtTarget); }
  });

  it('withdraws private draft fields on the first replacement layout', () => {
    const snapshots: string[] = [];
    function Probe({ turn }: { turn: number }) {
      const host = React.useRef<HTMLDivElement>(null);
      React.useLayoutEffect(() => { if (turn) snapshots.push(host.current?.innerHTML ?? ''); }, [turn]);
      return <div ref={host}>{draft()}</div>;
    }
    const view = render(<Probe turn={0} />); fillDraft();
    act(() => { replaceOwner('account'); view.rerender(<Probe turn={1} />); });
    expect(snapshots).toHaveLength(1); expect(snapshots[0]).not.toContain('Private reviewed response.');
    expect(snapshots[0]).not.toContain('Prepare the response for review');
  });
});

describe('retired draft responses and operation locks', () => {
  it.each(['account', 'filing ABA', 'unmount'])('does not decode an old create response after %s retirement', async kind => {
    const pending = deferred<Response>(); apiRequest.mockReturnValue(pending.promise);
    const view = render(draft()); fireEvent.click(fillDraft());
    if (kind === 'account') act(() => replaceOwner(kind));
    else if (kind === 'unmount') view.unmount();
    else { view.rerender(draft(10)); view.rerender(draft()); }
    const response = json(draftReceipt(), 201), decode = vi.spyOn(response, 'json');
    await act(async () => { pending.resolve(response); });
    expect(decode).not.toHaveBeenCalled(); expect(onNav).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Open identified correspondence in Authoring' })).toBeNull();
  });

  it('discards a draft JSON body that finishes after the account changes', async () => {
    const body = deferred<unknown>(), response = json({}), decode = vi.spyOn(response, 'json').mockReturnValue(body.promise);
    apiRequest.mockResolvedValue(response); render(draft()); fireEvent.click(fillDraft());
    await waitFor(() => expect(decode).toHaveBeenCalledOnce()); act(() => replaceOwner('account'));
    await act(async () => { body.resolve(draftReceipt()); });
    expect(screen.queryByText(/Correspondence saved as an Authoring draft/)).toBeNull();
    expect(window.C2C_EDITOR_TARGET).toBeUndefined(); expect(onNav).not.toHaveBeenCalled();
  });

  it('does not unlock a newer pending draft when a prior owner’s request completes', async () => {
    const old = deferred<Response>(), fresh = deferred<Response>(); let count = 0;
    apiRequest.mockImplementation(() => ++count === 1 ? old.promise : fresh.promise);
    render(draft()); fireEvent.click(fillDraft()); act(() => replaceOwner('account'));
    fireEvent.click(fillDraft()); expect(posts()).toHaveLength(2);
    await act(async () => { old.resolve(json(draftReceipt(), 201)); });
    expect(screen.getByRole('button', { name: 'Saving draft…' }).closest('fieldset')).toHaveProperty('disabled', true);
    fireEvent.click(screen.getByRole('button', { name: 'Saving draft…' })); expect(posts()).toHaveLength(2);
    await act(async () => { fresh.resolve(json(draftReceipt(), 201)); });
    expect(await screen.findByRole('button', { name: 'Open identified correspondence in Authoring' })).toBeTruthy();
  });

  it('cannot revive an earlier stationery-visit create callback after variant A to B to A', () => {
    const view = render(draft(9, VARIANT)); const oldCreate = retainedClick(fillDraft());
    view.rerender(draft(9, OTHER_VARIANT)); view.rerender(draft(9, VARIANT));
    act(() => oldCreate()); expect(posts()).toHaveLength(0);
    expect(screen.getByDisplayValue('Private reviewed response.')).toBeTruthy();
  });
});

describe('identity comparison authority and exact scope', () => {
  it('blocks an old review save in the same frame as account replacement', async () => {
    render(<CompanyFilingIdentityReview sequenceId={9} profileRevision={4} canReview />); const save = await fillReview();
    act(() => { replaceOwner('account'); fireEvent.click(save); }); expect(posts()).toHaveLength(0);
  });

  it('checks current review authority before a retained save', async () => {
    const view = render(<CompanyFilingIdentityReview sequenceId={9} profileRevision={4} canReview />);
    const save = retainedClick(await fillReview());
    view.rerender(<CompanyFilingIdentityReview sequenceId={9} profileRevision={4} canReview={false} />);
    act(() => save()); expect(posts()).toHaveLength(0);
  });

  it('dispatches a review once for duplicate same-frame clicks', async () => {
    const pending = deferred<Response>(), normal = apiRequest.getMockImplementation()!;
    apiRequest.mockImplementation((method: string, ...args: unknown[]) => method === 'POST' ? pending.promise : normal(method, ...args));
    render(<CompanyFilingIdentityReview sequenceId={9} profileRevision={4} canReview />); const save = await fillReview();
    act(() => { fireEvent.click(save); fireEvent.click(save); }); expect(posts()).toHaveLength(1);
    await act(async () => { pending.resolve(json({ ...identity(), status: 'reviewed_difference',
      review: { company_role: 'parent_brand', reviewed_by: 42, reviewed_at: '2026-10-23', reason: 'Private explanation of the parent brand' } })); });
  });

  it.each(['profile', 'variant'])('does not decode a comparison from an earlier %s A to B to A visit', async scope => {
    const pending = deferred<Response>(), normal = apiRequest.getMockImplementation()!; let reads = 0;
    apiRequest.mockImplementation((method: string, ...args: unknown[]) => method === 'GET' && ++reads === 1 ? pending.promise : normal(method, ...args));
    const base = { sequenceId: 9, profileRevision: 4, canReview: true, variantId: VARIANT };
    const view = render(<CompanyFilingIdentityReview {...base} />);
    if (scope === 'profile') currentProfileRevision = 5;
    view.rerender(<CompanyFilingIdentityReview {...base} {...(scope === 'profile' ? { profileRevision: 5 } : { variantId: OTHER_VARIANT })} />);
    currentProfileRevision = 4;
    view.rerender(<CompanyFilingIdentityReview {...base} />);
    const response = json({ ...identity(9, 4, VARIANT), explanation: 'Old private comparison marker' }), decode = vi.spyOn(response, 'json');
    await act(async () => { pending.resolve(response); });
    expect(decode).not.toHaveBeenCalled(); expect(screen.queryByText('Old private comparison marker')).toBeNull();
  });

  it('drops a delayed private review error body when its presentation changes', async () => {
    const body = deferred<unknown>(), response = json({}, 409), decode = vi.spyOn(response, 'json').mockReturnValue(body.promise);
    const normal = apiRequest.getMockImplementation()!;
    apiRequest.mockImplementation((method: string, ...args: unknown[]) => method === 'POST' ? response : normal(method, ...args));
    const view = render(<CompanyFilingIdentityReview sequenceId={9} profileRevision={4} canReview variantId={VARIANT} />);
    fireEvent.click(await fillReview()); await waitFor(() => expect(decode).toHaveBeenCalledOnce());
    view.rerender(<CompanyFilingIdentityReview sequenceId={9} profileRevision={4} canReview variantId={OTHER_VARIANT} />);
    await act(async () => { body.resolve({ error: { message: 'Previous private role reason' } }); });
    expect(screen.queryByText('Previous private role reason')).toBeNull();
  });
});

describe('published variant and parent admission boundaries', () => {
  it('blocks stale selection and page reads after account replacement', async () => {
    render(<CompanyCorrespondenceVariants sequenceId={9} value="" onChange={onVariant} />);
    await screen.findByRole('option', { name: design.name });
    const select = screen.getByRole('combobox', { name: 'Correspondence stationery for this output' });
    const next = screen.getByRole('button', { name: 'Load more published variants' }), before = designReads().length;
    let readsBeforeReactCommit = 0;
    act(() => { replaceOwner('account'); fireEvent.change(select, { target: { value: VARIANT } }); fireEvent.click(next); readsBeforeReactCommit = designReads().length; });
    expect(onVariant.mock.calls.some(([id]) => id === VARIANT)).toBe(false);
    expect(readsBeforeReactCommit).toBe(before);
  });

  it('does not revive an old sequence’s variant response on filing A to B to A', async () => {
    const old = deferred<Response>(), normal = apiRequest.getMockImplementation()!; let reads = 0;
    apiRequest.mockImplementation((method: string, ...args: unknown[]) => method === 'GET' && ++reads === 1 ? old.promise : normal(method, ...args));
    const view = render(<CompanyCorrespondenceVariants sequenceId={9} value="" onChange={onVariant} />);
    view.rerender(<CompanyCorrespondenceVariants sequenceId={10} value="" onChange={onVariant} />);
    view.rerender(<CompanyCorrespondenceVariants sequenceId={9} value="" onChange={onVariant} />);
    const response = json({ data: [{ ...design, name: 'Old private variant marker' }], nextBefore: null }), decode = vi.spyOn(response, 'json');
    await act(async () => { old.resolve(response); });
    expect(decode).not.toHaveBeenCalled(); expect(screen.queryByText('Old private variant marker')).toBeNull();
  });

  it('blocks a retained identity retry after unadopted browser bearer drift', async () => {
    apiRequest.mockResolvedValue(json({ error: { message: 'The comparison is temporarily unavailable.' } }, 503));
    render(<CompanyFilingIdentityReview sequenceId={9} profileRevision={4} canReview />);
    const retry = await screen.findByRole('button', { name: 'Retry identity comparison' }), before = apiRequest.mock.calls.length;
    act(() => { replaceOwner('browser bearer'); fireEvent.click(retry); });
    expect(apiRequest.mock.calls).toHaveLength(before);
  });

  it('withholds parent-admitted forms without losing the same filing’s unsaved draft', async () => {
    let admitted = true; const current = () => admitted;
    function Host() { return <>
      <CompanyCorrespondenceDraft sequenceId={9} programId={PROGRAM} submissionTitle="Recorded filing" onNav={onNav} current={current} />
      <CompanyCorrespondenceVariants sequenceId={9} value="" onChange={onVariant} current={current} />
      <CompanyFilingIdentityReview sequenceId={9} profileRevision={4} canReview current={current} />
    </>; }
    const view = render(<Host />); const create = fillDraft(), review = await fillReview();
    await screen.findByRole('option', { name: design.name }); const next = screen.getByRole('button', { name: 'Load more published variants' });
    const before = apiRequest.mock.calls.length;
    act(() => { admitted = false; fireEvent.click(create); fireEvent.click(review); fireEvent.click(next); view.rerender(<Host />); });
    expect(apiRequest.mock.calls).toHaveLength(before);
    expect(screen.queryByDisplayValue('Private reviewed response.')).toBeNull(); expect(screen.queryByText('Private parent brand')).toBeNull();
    admitted = true; view.rerender(<Host />);
    expect(screen.getByDisplayValue('Private reviewed response.')).toBeTruthy();
  });
});
afterEach(() => { cleanup(); endCompanySession(); vi.unstubAllGlobals(); });

describe('canonical correspondence captured account', () => {
  it('does not dispatch a retained create click in the same frame as account replacement', () => {
    render(<CompanyCorrespondenceDraft sequenceId={9} programId={PROGRAM} submissionTitle="Recorded filing" onNav={onNav} />);
    fireEvent.click(screen.getByRole('button', { name: 'Prepare correspondence in Authoring' }));
    fireEvent.change(screen.getByLabelText('Draft correspondence text'), { target: { value: 'Private reviewed response.' } });
    fireEvent.change(screen.getByLabelText('Reason for creating correspondence'), { target: { value: 'Prepare the response for review' } });
    const create = screen.getByRole('button', { name: 'Save correspondence draft' });
    act(() => {
      seedCompanySession({ id: '43', organizationId: '7', email: 'replacement@example.test' }, 'replacement');
      fireEvent.click(create);
    });
    expect(apiRequest.mock.calls.filter(([method]) => method === 'POST')).toHaveLength(0);
    expect(onNav).not.toHaveBeenCalled();
  });
});
