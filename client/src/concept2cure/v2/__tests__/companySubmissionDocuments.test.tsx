// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { normalizeTemplateSpec } from '@shared/templates/template-spec';
import type { CompanyDocumentsResponse, CompanyLegalDocument } from '@shared/company-documents';
import { endCompanySession, seedCompanySession } from './_company-session-fixture';

const apiRequest = vi.hoisted(() => vi.fn());
const downloadBlob = vi.hoisted(() => vi.fn(() => true));
vi.mock('@/lib/queryClient', async original => ({ ...(await original<typeof import('@/lib/queryClient')>()), apiRequest }));
vi.mock('../download', async original => ({ ...(await original<typeof import('../download')>()), downloadBlob }));
vi.mock('../surfaces/CompanyFilingIdentityReview', () => ({ CompanyFilingIdentityReview: () => null }));
vi.mock('../surfaces/CompanyCorrespondenceVariants', () => ({ CompanyCorrespondenceVariants: () => null }));
vi.mock('../surfaces/company-documents/CompanyLegalReadiness', () => ({ CompanyLegalReadiness: () => null }));
import { CompanySubmissionDocuments } from '../surfaces/CompanySubmissionDocuments';

const PATH = '/api/client-branding/company-documents';
const PROGRAM = '11111111-1111-4111-8111-111111111111';
const OTHER = '33333333-3333-4333-8333-333333333333';
const SOURCE = '22222222-2222-4222-8222-222222222222';
const seq = { id: 7, sequenceNumber: '0000', status: 'draft', region: 'fda' };
const submission = { id: 3, title: 'Oncology IND', applicationType: 'ind', programId: PROGRAM };
const document = (patch: Partial<CompanyLegalDocument> = {}): CompanyLegalDocument => ({
  id: 'legal-1', title: 'Sponsor authorization', kind: 'authorization', programId: PROGRAM, vaultDocumentId: SOURCE,
  contentHash: 'a'.repeat(64), version: '2', agencies: ['FDA'], countries: ['US'], submissionTypes: ['ind'],
  language: 'en', effectiveOn: null, expiresOn: null, active: true, registeredAt: '2026-10-17T00:00:00Z', registeredBy: 'Owner', transmitRefusal: null, ...patch,
});
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
let profile: CompanyDocumentsResponse;
let actionStatus: number;
let actionBody: unknown;
let readStatus: number;
let templateStatus: number;
const onDone = vi.fn();
beforeEach(() => {
  sessionStorage.clear(); localStorage.clear(); apiRequest.mockReset(); onDone.mockReset(); downloadBlob.mockClear(); actionStatus = 200; readStatus = 200; templateStatus = 200;
  seedCompanySession();
  profile = { canManage: true, data: { version: 1, revision: 2, companyName: 'Sponsor', address: '', contact: '', registrationDetails: '', letterhead: normalizeTemplateSpec({}), importedFrom: null, applyToReports: false, applyToSubmissionCorrespondence: false, legalDocuments: [document()] } };
  actionBody = { id: 10, sequenceId: 7, sectionCode: '1.2', lifecycleOp: 'new', documentTable: 'vault_documents', documentUuid: SOURCE, auditTrail: { persisted: true, chained: true } };
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (method === 'GET' && url === `${PATH}?includeLegal=false`) return readStatus === 200 ? json({ ...profile, legalDocumentsIncluded: false, data: { ...profile.data, legalDocuments: [] } }) : json({ message: 'The library is unavailable.' }, readStatus);
    if (method === 'GET' && url.startsWith(`${PATH}/legal-documents?`)) {
      const params = new URL(url, 'https://example.test').searchParams;
      const matches = profile.data.legalDocuments.filter(document => document.active && (!params.get('programId') || document.programId === params.get('programId'))
        && document.title.toLowerCase().includes((params.get('q') ?? '').toLowerCase()));
      const offset = Number(params.get('offset') ?? 0), limit = Number(params.get('limit') ?? 25);
      return json({ data: matches.slice(offset, offset + limit), page: { total: matches.length, availableTotal: matches.length, offset, limit, hasMore: offset + limit < matches.length, nextOffset: offset + limit < matches.length ? offset + limit : null }, facets: { agencies: [], languages: [] } });
    }
    if (url === `${PATH}/letterhead/render`) return templateStatus === 200 ? new Response('word-template', { headers: { 'content-type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' } }) : json({ message: 'The template export could not be recorded.' }, templateStatus);
    return json(actionBody, actionStatus);
  });
});
afterEach(() => { cleanup(); endCompanySession(); });
const open = async (sequence = seq) => {
  render(<CompanySubmissionDocuments seq={sequence} submission={submission} onDone={onDone} />);
  return screen.findByRole('radio', { name: 'Sponsor authorization' });
};
const chooseAndFill = async () => {
  fireEvent.click(await open());
  fireEvent.change(screen.getByLabelText('Company document filing section'), { target: { value: '1.2' } });
  fireEvent.change(screen.getByLabelText(/Reason for this placement/), { target: { value: 'Include approved sponsor authorization' } });
};

describe('Submission company legal documents', () => {
  it('downloads correspondence with the submission presentation preference and explicit draft guidance', async () => {
    profile.canManage = false;
    await open();
    fireEvent.click(screen.getByRole('button', { name: 'Download correspondence Word template' }));
    await waitFor(() => expect(downloadBlob).toHaveBeenCalledWith('Oncology_IND-correspondence.docx', expect.objectContaining({ size: 13, type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })));
    expect(apiRequest).toHaveBeenCalledWith('POST', `${PATH}/letterhead/render`, { purpose: 'submission', sequenceId: 7, title: 'Oncology IND — correspondence' });
    expect(await screen.findByText(/Correspondence Word template downloaded using the saved company presentation preference/)).toBeTruthy();
    expect(onDone).not.toHaveBeenCalled();
    expect(apiRequest.mock.calls.some(([, url]) => String(url).endsWith('/place'))).toBe(false);
  });

  it('does not save a browser file when the correspondence download is refused', async () => {
    templateStatus = 503; await open();
    fireEvent.click(screen.getByRole('button', { name: 'Download correspondence Word template' }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(downloadBlob).not.toHaveBeenCalled(); expect(onDone).not.toHaveBeenCalled();
  });

  it('shows exact target scope, approval and expiry refusals and omits archived entries', async () => {
    profile.data.legalDocuments.push(
      document({ id: 'expired', title: 'Expired authority', expiresOn: '2000-01-01' }),
      document({ id: 'wrong-scope', title: 'European authority', agencies: ['EMA'] }),
      document({ id: 'draft', title: 'Unapproved authority', transmitRefusal: 'The original has not been approved.' }),
      document({ id: 'archived', title: 'Archived authority', active: false }),
    );
    await open();
    expect(screen.getByText(/FDA · US · IND/)).toBeTruthy();
    expect(screen.getByText('This document has expired.')).toBeTruthy();
    expect(screen.getByText('The selected agency is outside this document’s scope.')).toBeTruthy();
    expect(screen.getByText('The original has not been approved.')).toBeTruthy();
    expect(screen.queryByRole('radio', { name: 'Archived authority' })).toBeNull();
    fireEvent.click(screen.getByRole('radio', { name: 'European authority' }));
    expect((screen.getByRole('button', { name: 'Place company document in sequence' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('places an eligible original with explicit section and reason and signals a confirmed write', async () => {
    await chooseAndFill();
    fireEvent.click(screen.getByRole('button', { name: 'Place company document in sequence' }));
    await waitFor(() => expect(onDone).toHaveBeenCalledWith(expect.objectContaining({ tone: 'ok', text: expect.stringContaining('Original “Sponsor authorization” placed at 1.2') }), { changed: true, sequenceChanged: false }));
    expect(apiRequest).toHaveBeenCalledWith('POST', `${PATH}/legal-documents/legal-1/place`, { sequenceId: 7, sectionCode: '1.2', reason: 'Include approved sponsor authorization' });
  });

  it('does not announce placement after refusal or a receipt for another source', async () => {
    actionStatus = 409; actionBody = { message: 'The original approval was revoked.' }; await chooseAndFill();
    fireEvent.click(screen.getByRole('button', { name: 'Place company document in sequence' }));
    expect(await screen.findByRole('alert')).toBeTruthy(); expect(onDone).not.toHaveBeenCalled();
    actionStatus = 200; actionBody = { id: 20, sequenceId: 7, sectionCode: '1.2', lifecycleOp: 'new', documentTable: 'vault_documents', documentUuid: 'some-other-source' };
    fireEvent.click(screen.getByRole('button', { name: 'Place company document in sequence' }));
    expect(await screen.findByText(/Placement was not confirmed/)).toBeTruthy(); expect(onDone).not.toHaveBeenCalled();
  });

  it('keeps a frozen sequence immutable and never posts a placement', async () => {
    const radio = await open({ ...seq, status: 'frozen' });
    expect((radio.closest('fieldset') as InstanceType<typeof window.HTMLFieldSetElement>).disabled).toBe(true);
    expect(screen.getByText(/This sequence is frozen/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Place company document in sequence' })).toBeNull();
    expect(apiRequest.mock.calls.filter(([m]) => m === 'POST')).toHaveLength(0);
  });

  it('reports the copied-but-unregistered outcome without transferring approval or placing it', async () => {
    profile.data.legalDocuments = [document({ programId: OTHER })];
    actionBody = { document: { id: 'new-copy' }, registered: false, reviewRequired: true, message: 'The bytes were copied, but library registration was not confirmed. Review and register the new version in Vault.' };
    render(<CompanySubmissionDocuments seq={seq} submission={submission} onDone={onDone} />);
    await screen.findByText('No matching documents');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Include other accessible projects for copying' }));
    fireEvent.click(await screen.findByRole('radio', { name: 'Sponsor authorization' }));
    fireEvent.change(screen.getByLabelText(/Reason for this placement/), { target: { value: 'Reuse original in target program' } });
    fireEvent.click(screen.getByRole('button', { name: 'Copy original to this project for review' }));
    expect(await screen.findByText('The bytes were copied, but library registration was not confirmed. Review and register the new version in Vault.')).toBeTruthy();
    expect(apiRequest).toHaveBeenCalledWith('POST', `${PATH}/legal-documents/legal-1/copy-to-program`, { programId: PROGRAM, expectedRevision: 2, reason: 'Reuse original in target program' });
    expect(onDone).not.toHaveBeenCalled();
    expect(apiRequest.mock.calls.some(([, url]) => String(url).endsWith('/place'))).toBe(false);
  });

  it('shows a library outage without stale entries or an invented empty result', async () => {
    readStatus = 500;
    render(<CompanySubmissionDocuments seq={seq} submission={submission} onDone={onDone} />);
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.queryByRole('radio')).toBeNull();
    expect(screen.queryByText(/No active company legal documents/)).toBeNull();
  });

  it('loads a bounded inventory page and searches across later registered versions', async () => {
    profile.data.legalDocuments = Array.from({ length: 30 }, (_, index) => document({ id: `legal-${index}`, title: `Authorization ${index}` }));
    render(<CompanySubmissionDocuments seq={seq} submission={submission} onDone={onDone} />);
    await screen.findByText('1–25 of 30 matching documents');
    expect(screen.queryByRole('radio', { name: 'Authorization 29' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Next legal documents' }));
    await screen.findByText('26–30 of 30 matching documents');
    expect(screen.getByRole('radio', { name: 'Authorization 29' })).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Search company legal documents'), { target: { value: 'Authorization 29' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search legal inventory' }));
    await screen.findByText('1–1 of 1 matching documents');
    expect(screen.queryByRole('radio', { name: 'Authorization 28' })).toBeNull();
    expect(apiRequest.mock.calls.some(([method, url]) => method === 'GET' && String(url).includes('q=Authorization+29') && String(url).includes(`programId=${PROGRAM}`))).toBe(true);
  });

  it('ignores a late library response after switching sequence context', async () => {
    let resolveFirst!: (response: Response) => void;
    apiRequest.mockImplementationOnce(() => new Promise<Response>(resolve => { resolveFirst = resolve; }));
    const view = render(<CompanySubmissionDocuments seq={seq} submission={submission} onDone={onDone} />);
    view.rerender(<CompanySubmissionDocuments seq={{ ...seq, id: 9, region: 'eu' }} submission={submission} onDone={onDone} />);
    await screen.findByText('The selected agency is outside this document’s scope.');
    resolveFirst(json({ ...profile, data: { ...profile.data, legalDocuments: [document({ title: 'Stale source', agencies: [] })] } }));
    await waitFor(() => expect(screen.queryByRole('radio', { name: 'Stale source' })).toBeNull());
    expect(screen.getByText(/EMA · EU · IND/)).toBeTruthy();
  });
});
