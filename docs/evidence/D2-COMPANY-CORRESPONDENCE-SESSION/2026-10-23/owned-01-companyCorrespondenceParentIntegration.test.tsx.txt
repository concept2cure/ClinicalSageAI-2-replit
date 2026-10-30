// @vitest-environment jsdom
/** The real company filing parent reaches all three correspondence forms. */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { CompanyDocumentsResponse } from '@shared/company-documents';
import { DEFAULT_TEMPLATE_SPEC } from '@shared/templates/template-spec';
import { endCompanySession, rotateCompanyBearer, seedCompanySession } from './_company-session-fixture';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async original => ({ ...(await original<typeof import('@/lib/queryClient')>()), apiRequest }));
vi.mock('../surfaces/company-documents/CompanyLegalReadiness', () => ({ CompanyLegalReadiness: () => <p>Separate legal requirements panel</p> }));
import { CompanySubmissionDocuments } from '../surfaces/CompanySubmissionDocuments';

const PATH = '/api/client-branding/company-documents';
const PROGRAM = '11111111-1111-4111-8111-111111111111', DOC = '22222222-2222-4222-8222-222222222222';
const VARIANT = '44444444-4444-4444-8444-444444444444';
const seq = { id: 9, sequenceNumber: '0000', status: 'draft', region: 'fda' };
const submission = { id: 3, title: 'Recorded filing', applicationType: 'ind', programId: PROGRAM };
const onNav = vi.fn(), onDone = vi.fn();
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const profile: CompanyDocumentsResponse = { canManage: true, capabilities: { manageBrand: true, manageLegal: true, managePermissions: true },
  data: { version: 1, revision: 4, companyName: 'Current company', address: 'Company address', contact: '', registrationDetails: '',
    letterhead: DEFAULT_TEMPLATE_SPEC, importedFrom: null, applyToReports: false, applyToSubmissionCorrespondence: false, legalDocuments: [] } };
const design = { id: VARIANT, name: 'Published sequence design', templateId: 'template-one', state: 'published',
  scope: { programId: PROGRAM, market: null, language: null, subsidiary: null }, sha256: 'c'.repeat(64),
  createdBy: 42, createdAt: '2026-10-01', reviewedBy: 43, reviewedAt: '2026-10-02', publishedBy: 43, publishedAt: '2026-10-03', publishedRevision: 4, publishedProfileHash: 'a'.repeat(64) };
function identity(variantId?: string | null) {
  return { sequenceId: 9, profileRevision: 4, profileHash: 'a'.repeat(64), filingHash: 'b'.repeat(64), variantId: variantId || null,
    status: 'needs_review', filing: { applicantName: 'Recorded applicant', sponsorAddress: 'Recorded address', applicationNumber: 'IND123456' },
    differences: [{ field: 'name', companyValue: variantId ? 'Chosen sequence brand' : 'Current company brand', filingValue: 'Recorded applicant', missing: false }],
    review: null, explanation: 'The filing identity remains unchanged.' };
}
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
function Parent() { return <CompanySubmissionDocuments seq={seq} submission={submission} onNav={onNav} onDone={onDone} />; }
const reads = () => apiRequest.mock.calls.filter(([method]) => method === 'GET');
const creates = () => apiRequest.mock.calls.filter(([method, path]) => method === 'POST' && path.endsWith('/correspondence/drafts'));
async function chooseAndPrepare() {
  await screen.findByRole('option', { name: 'Published sequence design' });
  fireEvent.change(screen.getByLabelText('Correspondence stationery for this output'), { target: { value: VARIANT } });
  await screen.findByText('Chosen sequence brand');
  fireEvent.click(screen.getByRole('button', { name: 'Prepare correspondence in Authoring' }));
  fireEvent.change(screen.getByLabelText('Correspondence title'), { target: { value: 'Private parent response title' } });
  fireEvent.change(screen.getByLabelText('Draft correspondence text'), { target: { value: 'Private parent response paragraphs.' } });
  fireEvent.change(screen.getByLabelText('Reason for creating correspondence'), { target: { value: 'Preserve this parent creation reason' } });
}
beforeEach(() => {
  localStorage.clear(); sessionStorage.clear(); seedCompanySession({ organizationId: '7' });
  onNav.mockReset(); onDone.mockReset(); delete window.C2C_EDITOR_TARGET;
  apiRequest.mockReset().mockImplementation(async (method: string, path: string, body: unknown) => {
    if (method === 'GET' && path === `${PATH}?includeLegal=false`) return json({ ...profile, legalDocumentsIncluded: false });
    if (method === 'GET' && path.startsWith(`${PATH}/legal-documents?`)) return json({ data: [], page: { total: 0, availableTotal: 0, offset: 0, limit: 25, hasMore: false, nextOffset: null } });
    if (method === 'GET' && path.startsWith(`${PATH}/designs?`)) return json({ data: [design], nextBefore: null });
    if (method === 'GET' && path.startsWith(`${PATH}/identity?`)) return json(identity(new URL(path, 'http://fixture').searchParams.get('variantId')));
    if (method === 'POST' && path === `${PATH}/correspondence/drafts`) return json({ authoringDocId: DOC, programId: PROGRAM, sequenceId: 9,
      documentStatus: 'draft', filedInVault: false, ...((body as { variantId?: string }).variantId ? { variantId: (body as { variantId: string }).variantId } : {}) }, 201);
    throw new Error(`Unexpected parent fixture request: ${method} ${path}`);
  });
});
afterEach(() => { cleanup(); endCompanySession(); vi.unstubAllGlobals(); });

describe('real filing parent and correspondence children', () => {
  it('preserves chosen stationery, draft text and identity review fields on real bearer refresh without rereads', async () => {
    render(<Parent />); await chooseAndPrepare();
    fireEvent.change(screen.getByLabelText('Company role'), { target: { value: 'parent_brand' } });
    fireEvent.change(screen.getByLabelText('Reason this role explains the difference'), { target: { value: 'Private parent role review reason' } });
    const count = reads().length; await act(async () => { await rotateCompanyBearer(); });
    expect(screen.getByLabelText('Correspondence stationery for this output')).toHaveProperty('value', VARIANT);
    expect(screen.getByLabelText('Correspondence title')).toHaveProperty('value', 'Private parent response title');
    expect(screen.getByLabelText('Draft correspondence text')).toHaveProperty('value', 'Private parent response paragraphs.');
    expect(screen.getByLabelText('Reason for creating correspondence')).toHaveProperty('value', 'Preserve this parent creation reason');
    expect(screen.getByLabelText('Company role')).toHaveProperty('value', 'parent_brand');
    expect(screen.getByLabelText('Reason this role explains the difference')).toHaveProperty('value', 'Private parent role review reason');
    expect(reads()).toHaveLength(count); expect(creates()).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Save correspondence draft' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Open identified correspondence in Authoring' }));
    expect(creates()[0][2]).toMatchObject({ sequenceId: 9, variantId: VARIANT, title: 'Private parent response title', paragraphs: ['Private parent response paragraphs.'] });
    expect(window.C2C_EDITOR_TARGET).toMatchObject({ docId: DOC, programId: PROGRAM });
  });

  it('keeps the same filing draft and sent result while an unrelated inventory search withholds parent admission', async () => {
    render(<Parent />); await chooseAndPrepare();
    const sent = deferred<Response>(), freshProfile = deferred<Response>();
    const normal = apiRequest.getMockImplementation()!;
    apiRequest.mockImplementation((method: string, path: string, ...rest: unknown[]) => method === 'POST' && path.endsWith('/correspondence/drafts') ? sent.promise
      : method === 'GET' && path === `${PATH}?includeLegal=false` ? freshProfile.promise : normal(method, path, ...rest));
    fireEvent.click(screen.getByRole('button', { name: 'Save correspondence draft' }));
    fireEvent.change(screen.getByLabelText('Search company legal documents'), { target: { value: 'Another legal title' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search legal inventory' }));
    await waitFor(() => expect(apiRequest.mock.calls.filter(([, path]) => path === `${PATH}?includeLegal=false`)).toHaveLength(2));
    expect(screen.queryByDisplayValue('Private parent response paragraphs.')).toBeNull();
    await act(async () => { sent.resolve(json({ authoringDocId: DOC, programId: PROGRAM, sequenceId: 9, variantId: VARIANT, documentStatus: 'draft', filedInVault: false }, 201)); });
    expect(screen.queryByRole('button', { name: 'Open identified correspondence in Authoring' })).toBeNull();
    await act(async () => { freshProfile.resolve(json({ ...profile, legalDocumentsIncluded: false })); });
    expect(await screen.findByDisplayValue('Private parent response paragraphs.')).toBeTruthy();
    fireEvent.click(await screen.findByRole('button', { name: 'Open identified correspondence in Authoring' }));
    expect(creates()).toHaveLength(1); expect(creates()[0][2]).toMatchObject({ variantId: VARIANT });
    expect(window.C2C_EDITOR_TARGET).toMatchObject({ docId: DOC, programId: PROGRAM });
    expect(screen.getByRole('button', { name: 'Save correspondence draft' }).closest('fieldset')).toHaveProperty('disabled', true);
  });
});
