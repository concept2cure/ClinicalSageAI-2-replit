// @vitest-environment jsdom
/** Correspondence keeps its canonical account while an access bearer rotates. */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { endCompanySession, rotateCompanyBearer, seedCompanySession } from './_company-session-fixture';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async original => ({ ...(await original<typeof import('@/lib/queryClient')>()), apiRequest }));
import { CompanyCorrespondenceDraft } from '../surfaces/CompanyCorrespondenceDraft';
import { CompanyCorrespondenceVariants } from '../surfaces/CompanyCorrespondenceVariants';
import { CompanyFilingIdentityReview } from '../surfaces/CompanyFilingIdentityReview';

const PROGRAM = '11111111-1111-4111-8111-111111111111';
const DOC = '22222222-2222-4222-8222-222222222222';
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const onNav = vi.fn();
const PATH = '/api/client-branding/company-documents';
const FIRST = '44444444-4444-4444-8444-444444444444', SECOND = '55555555-5555-4555-8555-555555555555';
const posts = () => apiRequest.mock.calls.filter(([method]) => method === 'POST');
const reads = () => apiRequest.mock.calls.filter(([method]) => method === 'GET');
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
function fillDraft() {
  fireEvent.click(screen.getByRole('button', { name: 'Prepare correspondence in Authoring' }));
  fireEvent.change(screen.getByLabelText('Draft correspondence text'), { target: { value: 'Reviewed response draft.' } });
  fireEvent.change(screen.getByLabelText('Reason for creating correspondence'), { target: { value: 'Prepare agency response for review' } });
  return screen.getByRole('button', { name: 'Save correspondence draft' });
}
const draftReceipt = (variantId?: string) => ({ authoringDocId: DOC, programId: PROGRAM, sequenceId: 9, documentStatus: 'draft', filedInVault: false, ...(variantId ? { variantId } : {}) });
const design = (id: string, name: string) => ({ id, name, templateId: 'template-one', state: 'published', scope: { programId: PROGRAM, market: null, language: null, subsidiary: null },
  sha256: 'a'.repeat(64), createdBy: 42, createdAt: '2026-10-01', reviewedBy: 43, reviewedAt: '2026-10-02', publishedBy: 43, publishedAt: '2026-10-03', publishedRevision: 4, publishedProfileHash: 'b'.repeat(64) });
const identity = () => ({ sequenceId: 9, profileRevision: 4, profileHash: 'a'.repeat(64), filingHash: 'b'.repeat(64), status: 'needs_review', variantId: null,
  filing: { applicantName: 'Recorded applicant', sponsorAddress: 'Recorded address', applicationNumber: 'IND123456' },
  differences: [{ field: 'name', companyValue: 'Parent company brand', filingValue: 'Recorded applicant', missing: false }], review: null,
  explanation: 'A reviewed role difference does not rewrite the filing.' });
function Draft() { return <CompanyCorrespondenceDraft sequenceId={9} programId={PROGRAM} submissionTitle="Recorded filing" onNav={onNav} />; }
beforeEach(() => {
  localStorage.clear(); sessionStorage.clear(); seedCompanySession({ organizationId: '7' });
  apiRequest.mockReset().mockImplementation(async () => json({ authoringDocId: DOC, programId: PROGRAM, sequenceId: 9, documentStatus: 'draft', filedInVault: false }, 201));
  onNav.mockReset(); delete window.C2C_EDITOR_TARGET;
});

describe('correspondence sent operation and uncertain hold continuity', () => {
  it('confirms one pending create after actual bearer refresh and opens its exact Authoring document', async () => {
    const sent = deferred<Response>(); apiRequest.mockImplementation(() => sent.promise);
    const view = render(<Draft />); const button = fillDraft();
    act(() => { fireEvent.click(button); fireEvent.click(button); });
    expect(posts()).toHaveLength(1);
    await act(async () => { await rotateCompanyBearer(); }); view.rerender(<Draft />);
    expect(screen.getByLabelText('Draft correspondence text')).toHaveProperty('value', 'Reviewed response draft.');
    await act(async () => { sent.resolve(json(draftReceipt(), 201)); });
    fireEvent.click(await screen.findByRole('button', { name: 'Open identified correspondence in Authoring' }));
    expect(window.C2C_EDITOR_TARGET).toMatchObject({ docId: DOC, programId: PROGRAM });
    expect(onNav).toHaveBeenCalledWith('document-authoring'); expect(posts()).toHaveLength(1);
  });

  it('retains an unconfirmed create hold across refresh and changing stationery without sending another copy', async () => {
    apiRequest.mockImplementation(async () => json({ message: 'The creation receipt is unavailable.' }, 503));
    const props = { sequenceId: 9, programId: PROGRAM, submissionTitle: 'Recorded filing', onNav };
    const view = render(<CompanyCorrespondenceDraft {...props} variantId={FIRST} />); fireEvent.click(fillDraft());
    await screen.findByRole('alert');
    await act(async () => { await rotateCompanyBearer(); });
    view.rerender(<CompanyCorrespondenceDraft {...props} variantId={SECOND} />);
    view.rerender(<CompanyCorrespondenceDraft {...props} variantId={FIRST} />);
    const create = screen.getByRole('button', { name: 'Save correspondence draft' });
    expect(create.closest('fieldset')).toHaveProperty('disabled', true); fireEvent.click(create);
    fireEvent.click(screen.getByRole('button', { name: 'Check this project’s Authoring documents' }));
    expect(posts()).toHaveLength(1); expect(onNav).toHaveBeenCalledWith('document-authoring');
    expect(window.C2C_EDITOR_TARGET).toBeUndefined();
  });

  it('retains an identified committed recovery handoff through refresh and a new stationery choice', async () => {
    apiRequest.mockImplementation(async () => json({ creationOutcome: 'committed', retryAllowed: false,
      recovery: { documentId: DOC, programId: PROGRAM, organizationId: 7 }, message: 'The document was created; reload the identified draft.' }, 503));
    const props = { sequenceId: 9, programId: PROGRAM, submissionTitle: 'Recorded filing', onNav };
    const view = render(<CompanyCorrespondenceDraft {...props} variantId={FIRST} />); fireEvent.click(fillDraft());
    await screen.findByRole('alert'); await act(async () => { await rotateCompanyBearer(); });
    view.rerender(<CompanyCorrespondenceDraft {...props} variantId={SECOND} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open identified correspondence in Authoring' }));
    expect(window.C2C_EDITOR_TARGET).toMatchObject({ docId: DOC, programId: PROGRAM });
    expect(screen.getByRole('button', { name: 'Save correspondence draft' }).closest('fieldset')).toHaveProperty('disabled', true);
    expect(posts()).toHaveLength(1);
  });
});

describe('stationery intent belongs to the correspondence operation', () => {
  it('preserves unsaved text when a new stationery choice is used for the next create', async () => {
    apiRequest.mockImplementation(async () => json(draftReceipt(SECOND), 201));
    const props = { sequenceId: 9, programId: PROGRAM, submissionTitle: 'Recorded filing', onNav };
    const view = render(<CompanyCorrespondenceDraft {...props} variantId={FIRST} />); fillDraft();
    view.rerender(<CompanyCorrespondenceDraft {...props} variantId={SECOND} />);
    expect(screen.getByLabelText('Draft correspondence text')).toHaveProperty('value', 'Reviewed response draft.');
    fireEvent.click(screen.getByRole('button', { name: 'Save correspondence draft' }));
    await screen.findByRole('button', { name: 'Open identified correspondence in Authoring' });
    expect(posts()[0][2]).toMatchObject({ variantId: SECOND, paragraphs: ['Reviewed response draft.'] });
  });

  it('settles a sent receipt against its original stationery after selection changes and keeps the duplicate hold', async () => {
    const sent = deferred<Response>(); apiRequest.mockImplementation(() => sent.promise);
    const props = { sequenceId: 9, programId: PROGRAM, submissionTitle: 'Recorded filing', onNav };
    const view = render(<CompanyCorrespondenceDraft {...props} variantId={FIRST} />); fireEvent.click(fillDraft());
    view.rerender(<CompanyCorrespondenceDraft {...props} variantId={SECOND} />);
    await act(async () => { sent.resolve(json(draftReceipt(FIRST), 201)); });
    fireEvent.click(await screen.findByRole('button', { name: 'Open identified correspondence in Authoring' }));
    expect(posts()[0][2]).toMatchObject({ variantId: FIRST });
    expect(window.C2C_EDITOR_TARGET).toMatchObject({ docId: DOC, programId: PROGRAM });
    expect(screen.getByRole('button', { name: 'Save correspondence draft' }).closest('fieldset')).toHaveProperty('disabled', true);
    expect(screen.getByText(/already saved|when saving|when.*sav|sav.*when|selection.*saved draft/i)).toBeTruthy();
    expect(posts()).toHaveLength(1);
  });

  it('does not accept another stationery identity as the confirmed receipt for the sent operation', async () => {
    apiRequest.mockImplementation(async () => json(draftReceipt(SECOND), 201));
    render(<CompanyCorrespondenceDraft sequenceId={9} programId={PROGRAM} submissionTitle="Recorded filing" onNav={onNav} variantId={FIRST} />);
    fireEvent.click(fillDraft()); await screen.findByRole('alert');
    expect(screen.queryByRole('button', { name: 'Open identified correspondence in Authoring' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Save correspondence draft' }).closest('fieldset')).toHaveProperty('disabled', true);
    expect(posts()).toHaveLength(1); expect(onNav).not.toHaveBeenCalled();
  });
});

describe('sequence-admitted published stationery continuity', () => {
  function Choices() { const [value, change] = React.useState(''); return <CompanyCorrespondenceVariants sequenceId={9} value={value} onChange={change} />; }
  function wirePages() {
    apiRequest.mockImplementation(async (_method: string, path: string) => path.includes('before=second-page')
      ? json({ data: [design(SECOND, 'Second published design')], nextBefore: null })
      : json({ data: [design(FIRST, 'First published design')], nextBefore: 'second-page' }));
  }

  it('keeps the explicit selection and loaded pages across real bearer refresh without a new read', async () => {
    wirePages(); const view = render(<Choices />);
    await screen.findByRole('option', { name: 'First published design' });
    fireEvent.change(screen.getByLabelText('Correspondence stationery for this output'), { target: { value: FIRST } });
    fireEvent.click(screen.getByRole('button', { name: 'Load more published variants' }));
    await screen.findByRole('option', { name: 'Second published design' }); const count = reads().length;
    await act(async () => { await rotateCompanyBearer(); }); view.rerender(<Choices />);
    expect(screen.getByLabelText('Correspondence stationery for this output')).toHaveProperty('value', FIRST);
    expect(screen.getByRole('option', { name: 'Second published design' })).toBeTruthy(); expect(reads()).toHaveLength(count);
    expect(reads()[0][1]).toBe(`${PATH}/designs?state=published&sequenceId=9&limit=25`);
  });

  it('accepts only a loaded published ID or the explicit saved-preference default', async () => {
    wirePages(); const change = vi.fn(); render(<CompanyCorrespondenceVariants sequenceId={9} value="" onChange={change} />);
    await screen.findByRole('option', { name: 'First published design' });
    const select = screen.getByLabelText('Correspondence stationery for this output');
    const forged = document.createElement('option'); forged.value = SECOND; forged.textContent = 'Unadmitted design'; select.appendChild(forged);
    fireEvent.change(select, { target: { value: SECOND } }); expect(change).not.toHaveBeenCalled();
    fireEvent.change(select, { target: { value: FIRST } }); expect(change).toHaveBeenLastCalledWith(FIRST);
    fireEvent.change(select, { target: { value: '' } }); expect(change).toHaveBeenLastCalledWith('');
  });

  it('retries a current stationery failure and never turns it into an empty successful inventory', async () => {
    let fail = true; apiRequest.mockImplementation(async () => fail ? json({ message: 'Stationery is temporarily unavailable.' }, 503)
      : json({ data: [design(FIRST, 'Recovered published design')], nextBefore: null }));
    render(<Choices />); expect((await screen.findByRole('alert')).textContent).toContain('Stationery is temporarily unavailable.');
    expect(screen.queryByRole('option', { name: 'Recovered published design' })).toBeNull();
    fail = false; fireEvent.click(screen.getByRole('button', { name: 'Retry stationery variants' }));
    expect(await screen.findByRole('option', { name: 'Recovered published design' })).toBeTruthy(); expect(reads()).toHaveLength(2);
  });
});

describe('filing identity review continuity', () => {
  async function fillIdentity() {
    await screen.findByText('Parent company brand');
    fireEvent.change(screen.getByLabelText('Company role'), { target: { value: 'parent_brand' } });
    fireEvent.change(screen.getByLabelText('Reason this role explains the difference'), { target: { value: 'Parent brand represents the subsidiary' } });
  }

  it('keeps a chosen role and review reason through real bearer refresh without rereading the comparison', async () => {
    apiRequest.mockImplementation(async () => json(identity()));
    const view = render(<CompanyFilingIdentityReview sequenceId={9} profileRevision={4} canReview />); await fillIdentity();
    const count = reads().length; await act(async () => { await rotateCompanyBearer(); });
    view.rerender(<CompanyFilingIdentityReview sequenceId={9} profileRevision={4} canReview />);
    expect(screen.getByLabelText('Company role')).toHaveProperty('value', 'parent_brand');
    expect(screen.getByLabelText('Reason this role explains the difference')).toHaveProperty('value', 'Parent brand represents the subsidiary');
    expect(reads()).toHaveLength(count); expect(posts()).toHaveLength(0);
  });

  it('confirms one pending review through actual bearer refresh with the exact displayed hashes and revision', async () => {
    const sent = deferred<Response>(); apiRequest.mockImplementation(async (method: string) => method === 'GET' ? json(identity()) : sent.promise);
    const view = render(<CompanyFilingIdentityReview sequenceId={9} profileRevision={4} canReview />); await fillIdentity();
    const save = screen.getByRole('button', { name: 'Record reviewed role difference' });
    act(() => { fireEvent.click(save); fireEvent.click(save); }); expect(posts()).toHaveLength(1);
    await act(async () => { await rotateCompanyBearer(); }); view.rerender(<CompanyFilingIdentityReview sequenceId={9} profileRevision={4} canReview />);
    await act(async () => { sent.resolve(json({ ...identity(), status: 'reviewed_difference', review: { company_role: 'parent_brand', reason: 'Parent brand represents the subsidiary', reviewed_by: 42, reviewed_at: '2026-10-23' } })); });
    await waitFor(() => expect(screen.getByText(/A role difference has been reviewed/)).toBeTruthy());
    expect(posts()[0]).toEqual(['POST', `${PATH}/identity/review`, { sequenceId: 9, expectedRevision: 4, profileHash: 'a'.repeat(64), filingHash: 'b'.repeat(64), companyRole: 'parent_brand', reason: 'Parent brand represents the subsidiary' }]);
    expect(reads()).toHaveLength(1);
  });
});
afterEach(() => { cleanup(); endCompanySession(); vi.unstubAllGlobals(); });

describe('canonical correspondence draft continuity', () => {
  it('preserves unsaved correspondence through real bearer refresh and the same parent rerender', async () => {
    const view = render(<Draft />);
    fireEvent.click(screen.getByRole('button', { name: 'Prepare correspondence in Authoring' }));
    fireEvent.change(screen.getByLabelText('Correspondence title'), { target: { value: 'Private unsaved response title' } });
    fireEvent.change(screen.getByLabelText('Draft correspondence text'), { target: { value: 'Private unsaved response paragraphs.' } });
    fireEvent.change(screen.getByLabelText('Reason for creating correspondence'), { target: { value: 'Preserve the reviewed creation reason' } });
    await act(async () => { await rotateCompanyBearer(); });
    view.rerender(<Draft />);
    expect(screen.queryByDisplayValue('Private unsaved response paragraphs.')).not.toBeNull();
    expect(screen.queryByDisplayValue('Private unsaved response title')).not.toBeNull();
    expect(screen.queryByDisplayValue('Preserve the reviewed creation reason')).not.toBeNull();
    expect(apiRequest).not.toHaveBeenCalled();
  });
});
