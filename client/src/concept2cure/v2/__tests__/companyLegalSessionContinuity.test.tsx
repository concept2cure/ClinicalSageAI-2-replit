// @vitest-environment jsdom
/** Legal forms keep their actual canonical owner across bearer rotation. */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { authService } from '@/services/portal/authService';
import type { CompanyDocumentProfile, CompanyLegalDocument } from '@shared/company-documents';
import { DEFAULT_TEMPLATE_SPEC } from '@shared/templates/template-spec';
import { COMPANY_SESSION_ACTOR, endCompanySession, rotateCompanyBearer, seedCompanySession } from './_company-session-fixture';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async original => ({ ...(await original<typeof import('@/lib/queryClient')>()), apiRequest }));
vi.mock('../surfaces/VaultLibraryResults', () => ({ VaultVersionPicker: () => <p>Current approved evidence picker</p> }));
import { LegalLifecycleEditor } from '../surfaces/company-documents/LegalLifecycleEditor';
import { LegalRequirementsEditor } from '../surfaces/company-documents/LegalRequirementsEditor';
import { useCompanyLegalResource } from '../surfaces/company-documents/useCompanyLegalResource';

const document: CompanyLegalDocument = { id: 'legal_a', title: 'Retained authorization', kind: 'authorization',
  programId: '11111111-1111-4111-8111-111111111111', vaultDocumentId: '22222222-2222-4222-8222-222222222222',
  contentHash: 'a'.repeat(64), version: '2', agencies: ['FDA'], countries: ['US'], submissionTypes: ['US_NDA'],
  language: 'en', effectiveOn: null, expiresOn: '2026-12-31', active: true, registeredAt: '2026-10-01', registeredBy: '42' };
const profile: CompanyDocumentProfile = { version: 1, revision: 3, companyName: 'Current company', address: '',
  contact: '', registrationDetails: '', letterhead: DEFAULT_TEMPLATE_SPEC, importedFrom: null,
  applyToReports: false, applyToSubmissionCorrespondence: false, legalDocuments: [document] };
const onSaved = vi.fn();
let token: string;
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
const receipt = () => ({ data: { ...profile, revision: 4 }, canManage: true });
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
function wire() {
  apiRequest.mockImplementation(async (method: string, path: string) => {
    if (method !== 'GET') return json(receipt());
    if (path.endsWith('/custodians')) return json({ data: [{ id: '8', name: 'Current custodian' }] });
    if (path.endsWith('/lifecycle')) return json({ document, renewal: { status: 'unassigned', daysRemaining: 69, dueOn: null }, placements: [], evidenceUnavailable: false });
    return json({ data: [], page: { total: 0, offset: 0, limit: 25, hasMore: false } });
  });
}
type Form = 'requirements' | 'lifecycle';
function FormHost({ kind, bearer = token }: { kind: Form; bearer?: string }) {
  return kind === 'requirements'
    ? <LegalRequirementsEditor profile={profile} token={bearer} canManage onSaved={onSaved} />
    : <LegalLifecycleEditor document={document} profile={profile} token={bearer} canManage onSaved={onSaved} />;
}
async function openForm(kind: Form) {
  if (kind === 'requirements') {
    fireEvent.click(screen.getByRole('button', { name: 'Add customer legal requirement' }));
    fireEvent.change(screen.getByLabelText('Requirement title'), { target: { value: 'Private requirement draft' } });
    fireEvent.change(screen.getByLabelText('Review rationale and reason for change'), { target: { value: 'Preserve the reviewed requirement reason.' } });
    return screen.getByRole('button', { name: 'Record requirement review' });
  }
  const details = screen.getByText('Lifecycle, signing evidence and affected filings').closest('details')!;
  details.open = true; fireEvent(details, new Event('toggle'));
  await screen.findByRole('option', { name: 'Current custodian' });
  fireEvent.change(screen.getByLabelText('Reason for lifecycle change or reminder'), { target: { value: 'Preserve the reviewed lifecycle reason.' } });
  return screen.getByRole('button', { name: 'Save legal lifecycle' });
}
const writes = () => apiRequest.mock.calls.filter(([method]) => method !== 'GET');
beforeEach(() => { localStorage.clear(); sessionStorage.clear(); apiRequest.mockReset(); onSaved.mockReset(); token = seedCompanySession(); wire(); });
afterEach(() => { cleanup(); endCompanySession(); vi.unstubAllGlobals(); });

describe('real legal form continuity through canonical bearer refresh', () => {
  it('preserves an open requirement title, rationale and supporting-review choices without reloading', async () => {
    const view = render(<FormHost kind="requirements" />); await openForm('requirements');
    fireEvent.click(screen.getByLabelText('Reviewed signing-authority evidence'));
    const reads = apiRequest.mock.calls.length;
    let refreshed = '';
    await act(async () => { refreshed = await rotateCompanyBearer(); });
    view.rerender(<FormHost kind="requirements" bearer={refreshed} />);
    expect((screen.getByLabelText('Requirement title') as HTMLInputElement).value).toBe('Private requirement draft');
    expect((screen.getByLabelText('Review rationale and reason for change') as HTMLTextAreaElement).value).toBe('Preserve the reviewed requirement reason.');
    expect((screen.getByLabelText('Reviewed signing-authority evidence') as HTMLInputElement).checked).toBe(true);
    expect(apiRequest).toHaveBeenCalledTimes(reads);
    expect(writes()).toHaveLength(0);
  });

  it('preserves an open lifecycle reason, custodian and reminder intervals without reloading', async () => {
    const view = render(<FormHost kind="lifecycle" />); await openForm('lifecycle');
    fireEvent.change(screen.getByLabelText('Renewal custodian'), { target: { value: '8' } });
    fireEvent.change(screen.getByLabelText('Reminder days before expiry'), { target: { value: '45, 14, 0' } });
    const reads = apiRequest.mock.calls.length;
    let refreshed = '';
    await act(async () => { refreshed = await rotateCompanyBearer(); });
    view.rerender(<FormHost kind="lifecycle" bearer={refreshed} />);
    expect((screen.getByLabelText('Reason for lifecycle change or reminder') as HTMLTextAreaElement).value).toBe('Preserve the reviewed lifecycle reason.');
    expect((screen.getByLabelText('Renewal custodian') as HTMLSelectElement).value).toBe('8');
    expect((screen.getByLabelText('Reminder days before expiry') as HTMLInputElement).value).toBe('45, 14, 0');
    expect(apiRequest).toHaveBeenCalledTimes(reads);
  });

  it.each(['requirements', 'lifecycle'] as const)('confirms a pending %s write exactly once after legitimate refresh', async kind => {
    const sent = deferred<Response>();
    const view = render(<FormHost kind={kind} />); const save = await openForm(kind);
    const normal = apiRequest.getMockImplementation()!;
    apiRequest.mockImplementation((method: string, ...args: unknown[]) => method !== 'GET' ? sent.promise : normal(method, ...args));
    fireEvent.click(save); await waitFor(() => expect(writes()).toHaveLength(1));
    let refreshed = '';
    await act(async () => { refreshed = await rotateCompanyBearer(); });
    view.rerender(<FormHost kind={kind} bearer={refreshed} />);
    await act(async () => sent.resolve(json(receipt())));
    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
    expect(writes()).toHaveLength(1);
    expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ revision: 4 }) }));
  });
});

describe('legal forms retire replacement owners and stale save handlers', () => {
  it('refuses retained local requirement setters during storage-only bearer drift', async () => {
    render(<FormHost kind="requirements" />); await openForm('requirements');
    const title = screen.getByLabelText('Requirement title') as HTMLInputElement;
    const rationale = screen.getByLabelText('Review rationale and reason for change') as HTMLTextAreaElement;
    const account = authService.getUser(), session = authService.captureSessionReadGuard();
    const previous = sessionStorage.getItem('trialsage_access_token');
    act(() => {
      sessionStorage.setItem('trialsage_access_token', 'unadopted-browser-bearer');
      fireEvent.change(title, { target: { value: 'Retired handler changed the title' } });
      fireEvent.change(rationale, { target: { value: 'Retired handler changed the rationale' } });
      if (previous === null) sessionStorage.removeItem('trialsage_access_token');
      else sessionStorage.setItem('trialsage_access_token', previous);
    });
    expect(authService.getUser()).toBe(account); expect(session.sameRevision()).toBe(true);
    expect(title.value).toBe('Private requirement draft');
    expect(rationale.value).toBe('Preserve the reviewed requirement reason.');
    expect(writes()).toHaveLength(0); expect(onSaved).not.toHaveBeenCalled();
  });

  it.each(['requirements', 'lifecycle'] as const)('blocks an old %s Save in the same frame as account replacement', async kind => {
    render(<FormHost kind={kind} />); const save = await openForm(kind);
    act(() => { seedCompanySession({ id: '43' }, 'replacement'); fireEvent.click(save); });
    expect(writes()).toHaveLength(0); expect(onSaved).not.toHaveBeenCalled();
    expect(screen.queryByDisplayValue(/Preserve the reviewed/)).toBeNull();
  });

  it.each(['requirements', 'lifecycle'] as const)('withdraws the %s draft after a role snapshot replacement without bearer rotation', async kind => {
    render(<FormHost kind={kind} />); await openForm(kind);
    const revision = authService.captureSessionReadGuard();
    vi.stubGlobal('fetch', vi.fn(async () => json({ authenticated: true, user: { ...COMPANY_SESSION_ACTOR, roles: ['member'], permissions: [] } })));
    await act(async () => { expect((await authService.refreshUser()).success).toBe(true); });
    expect(revision.sameRevision()).toBe(true);
    expect(screen.queryByDisplayValue(/Preserve the reviewed/)).toBeNull();
    expect(writes()).toHaveLength(0); expect(onSaved).not.toHaveBeenCalled();
  });

  it('discards a sent lifecycle reply after replacement, without invoking the old saved callback', async () => {
    const sent = deferred<Response>(); render(<FormHost kind="lifecycle" />); const save = await openForm('lifecycle');
    apiRequest.mockImplementation(async (method: string) => method === 'PUT' ? sent.promise : json({ data: [] }));
    fireEvent.click(save); await waitFor(() => expect(writes()).toHaveLength(1));
    await act(async () => { seedCompanySession({ id: '43' }, 'replacement'); });
    await act(async () => sent.resolve(json(receipt())));
    expect(onSaved).not.toHaveBeenCalled(); expect(writes()).toHaveLength(1);
    expect(screen.queryByText(/Legal workflow recorded/)).toBeNull();
  });
});

function ResourceProbe({ path, revision = 1, bearer = token }: { path: string; revision?: number; bearer?: string }) {
  const result = useCompanyLegalResource<{ name: string }>(path, bearer, `revision:${revision}`);
  return <p>{result.data?.name ?? 'No current legal source'}</p>;
}
describe('legal source ownership retains path, revision and unmount boundaries', () => {
  it.each(['path', 'revision'] as const)('rejects an old A reply after A → B → A %s visits', async boundary => {
    const original = deferred<Response>();
    apiRequest.mockImplementation(async () => json({ name: 'Current legal source' }));
    apiRequest.mockImplementationOnce(() => original.promise);
    const view = render(<ResourceProbe path="/probe/a" />);
    await waitFor(() => expect(apiRequest).toHaveBeenCalledTimes(1));
    view.rerender(<ResourceProbe path={boundary === 'path' ? '/probe/b' : '/probe/a'} revision={2} />);
    await screen.findByText('Current legal source');
    view.rerender(<ResourceProbe path="/probe/a" />);
    await waitFor(() => expect(apiRequest).toHaveBeenCalledTimes(3));
    await act(async () => original.resolve(json({ name: 'Obsolete private source' })));
    expect(screen.queryByText('Obsolete private source')).toBeNull();
    expect(screen.getByText('Current legal source')).toBeTruthy();
  });

  it('does not parse a delayed legal read response after unmount', async () => {
    const pending = deferred<Response>(); const body = vi.fn(async () => ({ name: 'Unmounted private source' }));
    apiRequest.mockReturnValue(pending.promise);
    const view = render(<ResourceProbe path="/probe/a" />);
    await waitFor(() => expect(apiRequest).toHaveBeenCalledOnce()); view.unmount();
    await act(async () => pending.resolve({ ok: true, status: 200, json: body } as unknown as Response));
    expect(body).not.toHaveBeenCalled();
  });

  it('rejects a legal JSON body finishing after replacement without exposing its source', async () => {
    const pending = deferred<{ name: string }>(); const body = vi.fn(() => pending.promise);
    apiRequest.mockResolvedValue({ ok: true, status: 200, json: body } as unknown as Response);
    render(<ResourceProbe path="/probe/a" />); await waitFor(() => expect(body).toHaveBeenCalledOnce());
    await act(async () => { seedCompanySession({ id: '43' }, 'replacement'); });
    await act(async () => pending.resolve({ name: 'Previous account legal source' }));
    expect(screen.queryByText('Previous account legal source')).toBeNull();
  });
});
