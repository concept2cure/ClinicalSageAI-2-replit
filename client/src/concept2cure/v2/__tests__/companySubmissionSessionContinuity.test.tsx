// @vitest-environment jsdom
/** The real filing parent must preserve, retire and re-admit its legal forms. */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { authService } from '@/services/portal/authService';
import { getAuthToken } from '@/utils/authToken';
import type { CompanyDocumentsResponse, CompanyLegalDocument } from '@shared/company-documents';
import { DEFAULT_TEMPLATE_SPEC } from '@shared/templates/template-spec';
import { COMPANY_SESSION_ACTOR, endCompanySession, rotateCompanyBearer, seedCompanySession } from './_company-session-fixture';
const apiRequest = vi.hoisted(() => vi.fn());
const downloadBlob = vi.hoisted(() => vi.fn(() => true));
vi.mock('@/lib/queryClient', async original => ({ ...(await original<typeof import('@/lib/queryClient')>()), apiRequest }));
vi.mock('../download', async original => ({ ...(await original<typeof import('../download')>()), downloadBlob }));
vi.mock('../surfaces/CompanyCorrespondenceDraft', () => ({ CompanyCorrespondenceDraft: () => null }));
vi.mock('../surfaces/CompanyCorrespondenceVariants', () => ({ CompanyCorrespondenceVariants: () => null }));
vi.mock('../surfaces/CompanyFilingIdentityReview', () => ({ CompanyFilingIdentityReview: () => null }));
import { CompanySubmissionDocuments } from '../surfaces/CompanySubmissionDocuments';
import { useCompanySubmissionLibrary, type CompanyLibrary } from '../surfaces/useCompanySubmissionLibrary';

const PATH = '/api/client-branding/company-documents';
const PROGRAM = '11111111-1111-4111-8111-111111111111';
const OTHER = '33333333-3333-4333-8333-333333333333';
const document: CompanyLegalDocument = { id: 'legal_a', title: 'Sponsor authorization', kind: 'authorization', programId: PROGRAM,
  vaultDocumentId: '22222222-2222-4222-8222-222222222222', contentHash: 'a'.repeat(64), version: '2', agencies: ['FDA'],
  countries: ['US'], submissionTypes: ['IND'], language: 'en', effectiveOn: null, expiresOn: null, active: true,
  registeredAt: '2026-10-23', registeredBy: '42', transmitRefusal: null };
const profile: CompanyDocumentsResponse = { canManage: true, capabilities: { manageBrand: true, manageLegal: true, managePermissions: true },
  data: { version: 1, revision: 3, companyName: 'Current sponsor', address: '', contact: '', registrationDetails: '',
    letterhead: DEFAULT_TEMPLATE_SPEC, importedFrom: null, applyToReports: false, applyToSubmissionCorrespondence: false, legalDocuments: [] } };
const seq = { id: 7, sequenceNumber: '0000', status: 'draft', region: 'fda' };
const submission = { id: 3, title: 'Actual filing', applicationType: 'ind', programId: PROGRAM };
const onDone = vi.fn();
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
let originals: CompanyLegalDocument[];
function readiness() { return { target: { programId: PROGRAM, submissionId: 3, sequenceId: 7, agency: 'FDA', country: 'US', submissionType: 'IND' },
  ready: false, coverage: 'regional_marketing_checklist', findings: [], disclaimer: 'Recorded customer review only.', items: [{
    requirement: { id: 'customer-requirement', sequenceId: 7, programId: PROGRAM, title: 'Actual filing authorization', source: 'customer',
      regionalCode: null, kind: 'authorization', agencies: ['FDA'], countries: ['US'], submissionTypes: ['IND'], language: null,
      sectionCode: '1.2', applicability: 'unresolved', rationale: 'Review required.', legalDocumentIds: [], reviewedBy: null, reviewedAt: null },
    status: 'unresolved', matchedDocumentIds: [], findings: [] }] }; }
function wire() {
  apiRequest.mockImplementation(async (method: string, path: string) => {
    if (method !== 'GET') return json({ success: true });
    if (path === `${PATH}?includeLegal=false`) return json({ ...profile, legalDocumentsIncluded: false });
    if (path.includes('/readiness?')) return json(readiness());
    if (path.startsWith(`${PATH}/legal-documents?`)) {
      const params = new URL(path, 'http://fixture').searchParams;
      const data = originals.filter(item => !params.get('programId') || item.programId === params.get('programId'));
      return json({ data, page: { total: data.length, availableTotal: data.length, offset: 0, limit: 25, hasMore: false, nextOffset: null } });
    }
    return json({});
  });
}
const Parent = () => <CompanySubmissionDocuments seq={seq} submission={submission} onDone={onDone} />;
const writes = () => apiRequest.mock.calls.filter(([method]) => method !== 'GET');
async function selectOriginal() { fireEvent.click(await screen.findByRole('radio', { name: document.title })); }
function placementReason() { fireEvent.change(screen.getByLabelText(/Reason for this placement/), { target: { value: 'Use the reviewed sponsor authorization.' } }); }
beforeEach(() => { localStorage.clear(); sessionStorage.clear(); seedCompanySession(); apiRequest.mockReset(); onDone.mockReset(); downloadBlob.mockReset(); originals = [document]; wire(); });
afterEach(() => { cleanup(); endCompanySession(); vi.unstubAllGlobals(); });

describe('actual submission parent preserves and re-admits legal forms', () => {
  it('keeps the selected original, filing reason and open legal rationale through canonical refresh', async () => {
    const view = render(<Parent />); await selectOriginal(); placementReason();
    fireEvent.change(screen.getByLabelText('Company document filing section'), { target: { value: '1.2' } });
    fireEvent.click(await screen.findByRole('button', { name: 'Review applicability and mapped versions' }));
    fireEvent.change(screen.getByLabelText('Review rationale and reason for change'), { target: { value: 'Keep the unsaved actual filing review.' } });
    const reads = apiRequest.mock.calls.length;
    await act(async () => { await rotateCompanyBearer(); }); view.rerender(<Parent />);
    expect((screen.getByRole('radio', { name: document.title }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText(/Reason for this placement/) as HTMLTextAreaElement).value).toBe('Use the reviewed sponsor authorization.');
    expect((screen.getByLabelText('Review rationale and reason for change') as HTMLTextAreaElement).value).toBe('Keep the unsaved actual filing review.');
    expect(apiRequest).toHaveBeenCalledTimes(reads);
  });

  it('hides the old library on a same-bearer account-object replacement, then remounts the current legal review', async () => {
    render(<Parent />); await selectOriginal();
    fireEvent.click(await screen.findByRole('button', { name: 'Review applicability and mapped versions' }));
    fireEvent.change(screen.getByLabelText('Review rationale and reason for change'), { target: { value: 'Old private rationale.' } });
    const fresh = deferred<Response>(); const normal = apiRequest.getMockImplementation()!;
    apiRequest.mockImplementation((method: string, path: string, ...rest: unknown[]) => path === `${PATH}?includeLegal=false` ? fresh.promise : normal(method, path, ...rest));
    const bearer = getAuthToken();
    vi.stubGlobal('fetch', vi.fn(async () => json({ authenticated: true, user: { ...COMPANY_SESSION_ACTOR, displayName: 'Current account snapshot' } })));
    await act(async () => { expect((await authService.refreshUser()).success).toBe(true); });
    expect(getAuthToken()).toBe(bearer);
    expect(screen.queryByRole('radio', { name: document.title })).toBeNull();
    expect(screen.queryByDisplayValue('Old private rationale.')).toBeNull();
    await act(async () => fresh.resolve(json({ ...profile, legalDocumentsIncluded: false })));
    await screen.findByRole('radio', { name: document.title });
    fireEvent.click(await screen.findByRole('button', { name: 'Review applicability and mapped versions' }));
    expect((screen.getByLabelText('Review rationale and reason for change') as HTMLTextAreaElement).value).toBe('');
    fireEvent.change(screen.getByLabelText('Review rationale and reason for change'), { target: { value: 'Current owner may review again.' } });
    expect((screen.getByRole('button', { name: 'Record requirement review' }) as HTMLButtonElement).disabled).toBe(false);
  });
});

describe('same-frame retained submission actions use their captured owner', () => {
  it.each(['account', 'raw-bearer'] as const)('does not dispatch a retained correspondence download after %s replacement', async change => {
    render(<Parent />); await screen.findByRole('radio', { name: document.title });
    const download = screen.getByRole('button', { name: 'Download correspondence Word template' });
    act(() => { if (change === 'account') seedCompanySession({ id: '43' }, 'replacement'); else sessionStorage.setItem('trialsage_access_token', 'unadopted-browser-bearer'); fireEvent.click(download); });
    expect(writes()).toHaveLength(0); expect(downloadBlob).not.toHaveBeenCalled();
  });
  it('does not place through an old selected source after account replacement', async () => {
    render(<Parent />); await selectOriginal(); placementReason();
    fireEvent.change(screen.getByLabelText('Company document filing section'), { target: { value: '1.2' } });
    const place = screen.getByRole('button', { name: 'Place company document in sequence' });
    expect((place as HTMLButtonElement).disabled).toBe(false);
    act(() => { seedCompanySession({ id: '43' }, 'replacement'); fireEvent.click(place); });
    expect(writes()).toHaveLength(0); expect(onDone).not.toHaveBeenCalled();
  });
  it('does not copy another project’s original through a retired handler', async () => {
    originals = [{ ...document, programId: OTHER }]; render(<Parent />);
    await screen.findByText('No matching documents'); fireEvent.click(screen.getByLabelText('Include other accessible projects for copying'));
    await selectOriginal(); placementReason();
    const copy = screen.getByRole('button', { name: 'Copy original to this project for review' });
    expect((copy as HTMLButtonElement).disabled).toBe(false);
    act(() => { seedCompanySession({ id: '43' }, 'replacement'); fireEvent.click(copy); });
    expect(writes()).toHaveLength(0); expect(onDone).not.toHaveBeenCalled();
  });
});

let currentLibrary: CompanyLibrary;
function LibraryProbe({ owner = 'filing-a', onSnapshot }: { owner?: string; onSnapshot?: (snapshot: string) => void }) {
  currentLibrary = useCompanySubmissionLibrary(owner, PROGRAM);
  React.useLayoutEffect(() => { onSnapshot?.(JSON.stringify({
    searchText: currentLibrary.searchText, selectedId: currentLibrary.selectedId, variantId: currentLibrary.variantId,
    section: currentLibrary.section, reason: currentLibrary.reason, note: currentLibrary.note,
    response: currentLibrary.response, rawResponse: currentLibrary.state.response,
  })); });
  return <p>{currentLibrary.reason || 'No current private reason'}</p>;
}
describe('library callbacks keep their original account and filing visit', () => {
  it('masks every old private value on the first replacement-owner layout and subsequent reads', async () => {
    let replacing = false;
    const snapshots: string[] = [];
    render(<LibraryProbe onSnapshot={snapshot => { if (replacing) snapshots.push(snapshot); }} />);
    await waitFor(() => expect(currentLibrary.state.loading).toBe(false));
    act(() => {
      currentLibrary.setSearchText('Old private search'); currentLibrary.setSelectedId('Old private selection');
      currentLibrary.setVariantId('Old private variant'); currentLibrary.setSection('Old private section');
      currentLibrary.setReason('Old private reason'); currentLibrary.setNote({ tone: 'warn', text: 'Old private notice' });
      currentLibrary.setResponse({ ...profile, data: { ...profile.data, companyName: 'Old private profile' } });
    });
    expect(currentLibrary.response?.data.companyName).toBe('Old private profile');
    expect(currentLibrary.searchText).toBe('Old private search');
    act(() => { replacing = true; seedCompanySession({ id: '43' }, 'replacement'); });
    await waitFor(() => expect(currentLibrary.state.loading).toBe(false));
    expect(snapshots.length).toBeGreaterThan(0);
    expect(snapshots.every(snapshot => !snapshot.includes('Old private'))).toBe(true);
  });

  it('starts replacement-owner reads with fresh filters even when the caller owner string is unchanged', async () => {
    render(<LibraryProbe />); await waitFor(() => expect(currentLibrary.state.loading).toBe(false));
    act(() => currentLibrary.setSearchText('Old private query'));
    act(() => currentLibrary.search()); await waitFor(() => expect(currentLibrary.state.loading).toBe(false));
    act(() => currentLibrary.setAllPrograms(true)); await waitFor(() => expect(currentLibrary.state.loading).toBe(false));
    act(() => currentLibrary.goToOffset(25)); await waitFor(() => expect(currentLibrary.state.loading).toBe(false));
    const inventoryReads = () => apiRequest.mock.calls.filter(([method, path]) => method === 'GET' && String(path).startsWith(`${PATH}/legal-documents?`));
    const oldQuery = new URL(String(inventoryReads().at(-1)![1]), 'http://fixture').searchParams;
    expect(oldQuery.get('q')).toBe('Old private query'); expect(oldQuery.get('offset')).toBe('25');
    expect(oldQuery.has('programId')).toBe(false);
    const count = inventoryReads().length;
    act(() => { seedCompanySession({ id: '43' }, 'replacement'); });
    await waitFor(() => expect(currentLibrary.state.loading).toBe(false));
    const fresh = inventoryReads().slice(count);
    expect(fresh.length).toBeGreaterThan(0);
    for (const [, path] of fresh) {
      const query = new URL(String(path), 'http://fixture').searchParams;
      expect(query.get('q')).toBe(''); expect(query.get('offset')).toBe('0'); expect(query.get('programId')).toBe(PROGRAM);
    }
  });

  it('refuses a retained Retry during raw browser bearer drift without an account event', async () => {
    render(<LibraryProbe />); await waitFor(() => expect(currentLibrary.state.loading).toBe(false));
    const retry = currentLibrary.retry; const reads = apiRequest.mock.calls.length;
    act(() => { sessionStorage.setItem('trialsage_access_token', 'unadopted-browser-bearer'); retry(); });
    expect(apiRequest).toHaveBeenCalledTimes(reads);
  });
  it('does not let an old setter alter the replacement account before rerender', async () => {
    const view = render(<LibraryProbe />); await waitFor(() => expect(currentLibrary.state.loading).toBe(false));
    const setReason = currentLibrary.setReason;
    act(() => { seedCompanySession({ id: '43' }, 'replacement'); setReason('Retired private reason'); });
    view.rerender(<LibraryProbe />);
    expect(screen.queryByText('Retired private reason')).toBeNull();
  });
  it('does not let a retained A callback revive after A → B → A visits', async () => {
    const view = render(<LibraryProbe />); await waitFor(() => expect(currentLibrary.state.loading).toBe(false));
    const setReason = currentLibrary.setReason;
    view.rerender(<LibraryProbe owner="filing-b" />); await waitFor(() => expect(currentLibrary.state.loading).toBe(false));
    view.rerender(<LibraryProbe />); await waitFor(() => expect(currentLibrary.state.loading).toBe(false));
    act(() => setReason('Retired A visit reason'));
    expect(screen.queryByText('Retired A visit reason')).toBeNull();
  });
});
