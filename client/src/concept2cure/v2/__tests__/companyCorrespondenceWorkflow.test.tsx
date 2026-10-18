// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async original => ({ ...(await original<typeof import('@/lib/queryClient')>()), apiRequest }));
import { CompanyCorrespondenceDraft } from '../surfaces/CompanyCorrespondenceDraft';
import { CompanyFilingIdentityReview } from '../surfaces/CompanyFilingIdentityReview';
import { CompanyLegalCommunicationLinks } from '../surfaces/CompanyLegalCommunicationLinks';

const PROGRAM = '11111111-1111-4111-8111-111111111111', DOC = '22222222-2222-4222-8222-222222222222';
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const onNav = vi.fn();
beforeEach(() => { apiRequest.mockReset(); onNav.mockReset(); sessionStorage.clear(); localStorage.clear(); delete window.C2C_EDITOR_TARGET; });
afterEach(cleanup);
const fillDraft = () => {
  fireEvent.click(screen.getByRole('button', { name: 'Prepare correspondence in Authoring' }));
  fireEvent.change(screen.getByLabelText('Draft correspondence text'), { target: { value: 'Reviewed response draft.' } });
  fireEvent.change(screen.getByLabelText('Reason for creating correspondence'), { target: { value: 'Prepare agency response for review' } });
};

describe('connected correspondence draft', () => {
  it('saves the actual sequence and opens only the confirmed canonical Authoring document', async () => {
    apiRequest.mockResolvedValue(json({ authoringDocId: DOC, programId: PROGRAM, sequenceId: 9, documentStatus: 'draft', filedInVault: false }, 201));
    render(<CompanyCorrespondenceDraft sequenceId={9} programId={PROGRAM} submissionTitle="Recorded filing" onNav={onNav} />);
    fillDraft(); fireEvent.click(screen.getByRole('button', { name: 'Save correspondence draft' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Open identified correspondence in Authoring' }));
    expect(apiRequest).toHaveBeenCalledWith('POST', '/api/client-branding/company-documents/correspondence/drafts',
      { sequenceId: 9, title: 'Recorded filing — correspondence', paragraphs: ['Reviewed response draft.'], reason: 'Prepare agency response for review' });
    expect(window.C2C_EDITOR_TARGET).toMatchObject({ docId: DOC, programId: PROGRAM }); expect(onNav).toHaveBeenCalledWith('document-authoring');
    expect((screen.getByRole('button', { name: 'Save correspondence draft' }).closest('fieldset') as HTMLFieldSetElement).disabled).toBe(true);
  });

  it('keeps a committed but unconfirmed handoff identifiable and blocks a duplicate create', async () => {
    apiRequest.mockResolvedValue(json({ ok: false, creationOutcome: 'committed', retryAllowed: false,
      recovery: { documentId: DOC, programId: PROGRAM, organizationId: 7 }, message: 'The document was created; reload the identified draft before continuing.' }, 503));
    render(<CompanyCorrespondenceDraft sequenceId={9} programId={PROGRAM} submissionTitle="Recorded filing" onNav={onNav} />);
    fillDraft(); fireEvent.click(screen.getByRole('button', { name: 'Save correspondence draft' }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Save correspondence draft' }).closest('fieldset') as HTMLFieldSetElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Open identified correspondence in Authoring' }));
    expect(window.C2C_EDITOR_TARGET?.docId).toBe(DOC); expect(apiRequest).toHaveBeenCalledTimes(1);
  });

  it('ignores a late create receipt after changing the filing', async () => {
    let finish!: (response: Response) => void;
    apiRequest.mockImplementation(() => new Promise<Response>(resolve => { finish = resolve; }));
    const view = render(<CompanyCorrespondenceDraft sequenceId={9} programId={PROGRAM} submissionTitle="First filing" onNav={onNav} />);
    fillDraft(); fireEvent.click(screen.getByRole('button', { name: 'Save correspondence draft' }));
    view.rerender(<CompanyCorrespondenceDraft sequenceId={10} programId={PROGRAM} submissionTitle="Second filing" onNav={onNav} />);
    finish(json({ authoringDocId: DOC, programId: PROGRAM, sequenceId: 9, documentStatus: 'draft', filedInVault: false }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Open identified correspondence in Authoring' })).toBeNull()); expect(onNav).not.toHaveBeenCalled();
  });
});

const identity = { sequenceId: 9, profileRevision: 4, profileHash: 'a'.repeat(64), filingHash: 'b'.repeat(64), status: 'needs_review',
  filing: { applicantName: 'Recorded applicant', sponsorAddress: 'Recorded address', applicationNumber: 'IND123456' },
  differences: [{ field: 'name', companyValue: 'Parent company brand', filingValue: 'Recorded applicant', missing: false }], review: null,
  explanation: 'A reviewed role difference does not rewrite the filing.' };
describe('filing identity review', () => {
  it('uses the selected variant and clears a previous variant’s reviewed difference', async () => {
    const first = '44444444-4444-4444-8444-444444444444', second = '55555555-5555-4555-8555-555555555555';
    apiRequest.mockImplementation(async (_method: string, url: string) => json(url.includes(first)
      ? { ...identity, variantId: first, status: 'reviewed_difference', review: { company_role: 'parent_brand', reason: 'First variant review', reviewed_by: 3, reviewed_at: '2026-10-18' } }
      : { ...identity, variantId: second, differences: [{ field: 'name', companyValue: 'Second subsidiary brand', filingValue: 'Recorded applicant', missing: false }] }));
    const view = render(<CompanyFilingIdentityReview sequenceId={9} profileRevision={4} canReview variantId={first} />);
    expect(await screen.findByText(/First variant review/)).toBeTruthy();
    view.rerender(<CompanyFilingIdentityReview sequenceId={9} profileRevision={4} canReview variantId={second} />);
    expect(await screen.findByText('Second subsidiary brand')).toBeTruthy(); expect(screen.queryByText(/First variant review/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Record reviewed role difference' })).toBeTruthy();
    expect(apiRequest.mock.calls.at(-1)?.[1]).toBe(`/api/client-branding/company-documents/identity?sequenceId=9&variantId=${second}`);
  });

  it('shows actual differences and binds an explicit role review to both current hashes', async () => {
    apiRequest.mockImplementation(async (method: string) => json(method === 'GET' ? identity : { ...identity, status: 'reviewed_difference', review: { company_role: 'parent_brand', reason: 'Parent brand represents the subsidiary', reviewed_by: 3, reviewed_at: '2026-10-18' } }));
    render(<CompanyFilingIdentityReview sequenceId={9} profileRevision={4} canReview />);
    expect(await screen.findByText('Parent company brand')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Company role'), { target: { value: 'parent_brand' } });
    fireEvent.change(screen.getByLabelText('Reason this role explains the difference'), { target: { value: 'Parent brand represents the subsidiary' } });
    fireEvent.click(screen.getByRole('button', { name: 'Record reviewed role difference' }));
    expect(await screen.findByText(/A role difference has been reviewed/)).toBeTruthy();
    expect(apiRequest).toHaveBeenCalledWith('POST', '/api/client-branding/company-documents/identity/review', { sequenceId: 9, expectedRevision: 4,
      profileHash: 'a'.repeat(64), filingHash: 'b'.repeat(64), companyRole: 'parent_brand', reason: 'Parent brand represents the subsidiary' });
  });

  it('does not offer an acknowledgment for missing identity facts', async () => {
    apiRequest.mockResolvedValue(json({ ...identity, status: 'unresolved', filing: { ...identity.filing, applicantName: null }, differences: [{ field: 'name', companyValue: 'Brand', filingValue: null, missing: true }] }));
    render(<CompanyFilingIdentityReview sequenceId={9} profileRevision={4} canReview />);
    expect(await screen.findByText(/Identity is incomplete/)).toBeTruthy(); expect(screen.queryByRole('button', { name: 'Record reviewed role difference' })).toBeNull();
  });
});

describe('company legal versions on agency communications', () => {
  it('reads only the admitted project inventory and submits IDs and outcome without claiming a hash or approval', async () => {
    const legal = { id: 'legal-1', title: 'Original power of attorney', programId: PROGRAM, vaultDocumentId: DOC, version: '2', active: true };
    const link = { registryId: 'legal-1', programId: PROGRAM, vaultDocumentId: DOC, version: '2', contentHash: 'a'.repeat(64), linkedAt: '2026-10-18', linkedBy: 3, outcome: 'rejected', reason: 'Agency requested a corrected authority' };
    apiRequest.mockImplementation(async (method: string) => method === 'GET'
      ? json({ data: [legal], page: { total: 1, availableTotal: 1, offset: 0, limit: 25, hasMore: false, nextOffset: null } })
      : json({ data: { id: 'event-1', companyLegalDocuments: [link], message: 'Exact version linked. Vault approval did not change.' } }));
    render(<CompanyLegalCommunicationLinks projectId={PROGRAM} recordId="event-1" kind="agency" />);
    fireEvent.click(screen.getByRole('button', { name: 'Link company legal document' }));
    await screen.findByRole('option', { name: 'Original power of attorney · v2' });
    fireEvent.change(screen.getByLabelText('Company legal original'), { target: { value: 'legal-1' } });
    fireEvent.change(screen.getByLabelText('Recorded outcome'), { target: { value: 'rejected' } });
    fireEvent.change(screen.getByLabelText('Reason for linking this version'), { target: { value: 'Agency requested a corrected authority' } });
    fireEvent.click(screen.getByRole('button', { name: 'Link exact legal version' }));
    expect(await screen.findByText('Exact version linked. Vault approval did not change.')).toBeTruthy();
    expect(apiRequest.mock.calls[0][1]).toContain(`/projects/${PROGRAM}/company-legal-documents?`);
    expect(apiRequest).toHaveBeenCalledWith('POST', `/api/concept2cure/projects/${PROGRAM}/agency-communications/event-1/legal-documents`,
      { registryIds: ['legal-1'], outcome: 'rejected', reason: 'Agency requested a corrected authority' });
    expect(screen.getByText(`SHA-256 ${'a'.repeat(64)}`)).toBeTruthy();
  });
});
