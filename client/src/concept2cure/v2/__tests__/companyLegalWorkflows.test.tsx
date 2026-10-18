// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { CompanyDocumentProfile, CompanyLegalDocument } from '@shared/company-documents';
import type { CompanyLegalReadinessResponse } from '@shared/company-legal-workflows';
import { DEFAULT_TEMPLATE_SPEC } from '@shared/templates/template-spec';
const m = vi.hoisted(() => ({ token: 'session-a', api: vi.fn() }));
vi.mock('@/utils/authToken', () => ({ getAuthToken: () => m.token, getJwtOrgId: () => 7 }));
vi.mock('../apiCall', () => ({ apiCall: m.api, apiErrorText: (result: { body?: { message?: string } }, fallback: string) => result.body?.message || fallback }));
vi.mock('../surfaces/company-documents/CompanyVaultPicker', () => ({ CompanyVaultPicker: () => <p>Approved supporting evidence picker</p> }));
import { LegalLifecycleEditor } from '../surfaces/company-documents/LegalLifecycleEditor';
import { CompanyLegalReadiness } from '../surfaces/company-documents/CompanyLegalReadiness';
import { PagedCompanyLegalPicker } from '../surfaces/company-documents/PagedCompanyLegalPicker';
import { LegalRequirementsEditor } from '../surfaces/company-documents/LegalRequirementsEditor';

const PATH = '/api/client-branding/company-documents';
const document: CompanyLegalDocument = { id: 'legal_a', title: 'Approved cover letter', kind: 'cover_letter', programId: 'program-a', vaultDocumentId: 'vault-a',
  contentHash: 'a'.repeat(64), version: '2', agencies: ['FDA'], countries: ['US'], submissionTypes: ['US_NDA'], language: 'en', effectiveOn: null,
  expiresOn: '2026-10-25', active: true, registeredAt: '2026-10-01', registeredBy: '3', transmitRefusal: null };
const profile: CompanyDocumentProfile = { version: 1, revision: 3, companyName: 'Sponsor', address: '', contact: '', registrationDetails: '', letterhead: DEFAULT_TEMPLATE_SPEC,
  importedFrom: null, applyToReports: false, applyToSubmissionCorrespondence: false, legalDocuments: [document] };
function readiness(sequenceId = 4, title = 'Reviewed cover-letter requirement'): CompanyLegalReadinessResponse {
  return { target: { programId: 'program-a', submissionId: 2, sequenceId, agency: 'FDA', country: 'US', submissionType: 'NDA' }, coverage: 'regional_marketing_checklist', ready: false,
    items: [{ requirement: { id: `regional:us_cover_letter:US_NDA:sequence:${sequenceId}`, sequenceId, programId: 'program-a', title,
      source: 'regional', regionalCode: 'us_cover_letter', kind: 'cover_letter', agencies: ['FDA'], countries: ['US'], submissionTypes: ['US_NDA'], language: null, sectionCode: 'm1.2',
      applicability: 'unresolved', rationale: 'Review applicability.', legalDocumentIds: [], reviewedBy: null, reviewedAt: null }, status: 'unresolved', matchedDocumentIds: [], findings: ['Applicability review is unresolved.'] }],
    findings: [], disclaimer: 'This readiness check does not establish agency acceptance or cryptographic signature validity.' };
}
const ok = (body: unknown) => ({ ok: true, status: 200, body, networkError: false });
beforeEach(() => {
  m.token = 'session-a'; m.api.mockReset();
  m.api.mockImplementation(async (method: string, url: string) => {
    if (url.endsWith('/custodians')) return ok({ data: [{ id: '8', name: 'Legal Custodian' }] });
    if (method === 'GET' && url.endsWith('/lifecycle')) return ok({ document, renewal: { status: 'unassigned', daysRemaining: 7, dueOn: '2026-09-25' }, placements: [], evidenceUnavailable: false });
    if (url.includes('/readiness?')) return ok(readiness());
    if (method === 'GET' && url.includes('/legal-documents?')) return ok({ data: [document], page: { total: 1, offset: 0, limit: 25, hasMore: false } });
    return ok({ data: { ...profile, revision: 4 }, canManage: false, capabilities: { manageBrand: false, manageLegal: true, managePermissions: false } });
  });
});
afterEach(cleanup);
describe('legal lifecycle management', () => {
  it('records an explicit revocation with the saved revision, reason and selected eligible custodian', async () => {
    const onSaved = vi.fn();
    render(<LegalLifecycleEditor document={document} profile={profile} token={m.token} canManage onSaved={onSaved} />);
    const details = screen.getByText('Lifecycle, signing evidence and affected filings').closest('details')!;
    details.open = true; fireEvent(details, new Event('toggle'));
    await screen.findByRole('option', { name: 'Legal Custodian' });
    fireEvent.change(screen.getByLabelText('Renewal custodian'), { target: { value: '8' } });
    fireEvent.change(screen.getByLabelText('Reason for lifecycle change or reminder'), { target: { value: 'Signatory authorization was withdrawn.' } });
    fireEvent.click(screen.getByRole('checkbox', { name: /Revoke this exact legal version/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Record revocation and lifecycle' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
    const mutation = m.api.mock.calls.find(([method]) => method === 'PUT');
    expect(mutation).toMatchObject(['PUT', `${PATH}/legal-documents/legal_a/lifecycle`, { expectedRevision: 3,
      workflow: { custodianUserId: '8', revocation: { reason: 'Signatory authorization was withdrawn.' } } }]);
  });
  it('keeps external signature reports distinct from application cryptographic verification', async () => {
    render(<LegalLifecycleEditor document={document} profile={profile} token={m.token} canManage onSaved={vi.fn()} />);
    const details = screen.getByText('Lifecycle, signing evidence and affected filings').closest('details')!;
    details.open = true; fireEvent(details, new Event('toggle'));
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Record signature verification evidence' }));
    expect(screen.getByText(/does not cryptographically validate/)).toBeTruthy();
    expect((screen.getByLabelText('Reported result') as HTMLSelectElement).value).toBe('inconclusive');
  });
});
describe('filing-bound legal requirement review', () => {
  it('renders an absent review explicitly without inventing a date or reviewer', () => {
    render(<LegalRequirementsEditor profile={{ ...profile, legalRequirements: [readiness().items[0].requirement] }} token={m.token} canManage={false} onSaved={vi.fn()} />);
    expect(screen.getByText('No legal review recorded')).toBeTruthy();
  });
  it('shows unresolved coverage and records an explicit mapping bound to the displayed actual sequence', async () => {
    const onSaved = vi.fn();
    render(<CompanyLegalReadiness sequenceId={4} profile={profile} token={m.token} canManage onSaved={onSaved} />);
    await screen.findByText('Reviewed cover-letter requirement');
    expect(screen.getByText(/Company companion review or remediation is required/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Review applicability and mapped versions' }));
    fireEvent.change(screen.getByLabelText('Applicability review'), { target: { value: 'required' } });
    fireEvent.click(await screen.findByRole('checkbox', { name: /Approved cover letter · v2 · en/ }));
    fireEvent.change(screen.getByLabelText('Review rationale and reason for change'), { target: { value: 'Reviewed against the actual filing checklist.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Record requirement review' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
    const mutation = m.api.mock.calls.find(([method]) => method === 'POST');
    expect(mutation?.[2]).toMatchObject({ expectedRevision: 3, requirement: { sequenceId: 4, agencies: ['FDA'], countries: ['US'], submissionTypes: ['NDA'], applicability: 'required', legalDocumentIds: ['legal_a'] } });
    expect(mutation?.[2].requirement).not.toHaveProperty('reviewedBy');
  });
  it('discards a late response after switching the sequence context', async () => {
    let resolveFirst!: (value: unknown) => void;
    m.api.mockImplementation((_method: string, url: string) => url.endsWith('sequenceId=4') ? new Promise(resolve => { resolveFirst = resolve; }) : Promise.resolve(ok(readiness(5, 'Current filing requirement'))));
    const { rerender } = render(<CompanyLegalReadiness sequenceId={4} profile={profile} token={m.token} canManage={false} onSaved={vi.fn()} />);
    rerender(<CompanyLegalReadiness sequenceId={5} profile={profile} token={m.token} canManage={false} onSaved={vi.fn()} />);
    await screen.findByText('Current filing requirement');
    resolveFirst(ok(readiness(4, 'Earlier private filing requirement')));
    await waitFor(() => expect(screen.queryByText('Earlier private filing requirement')).toBeNull());
    expect(screen.queryByRole('button', { name: 'Review applicability and mapped versions' })).toBeNull();
  });
});
describe('paged exact-version selection', () => {
  it('searches in the admitted program and preserves selected IDs when moving to another server page', async () => {
    const change = vi.fn();
    m.api.mockImplementation(async (_method: string, url: string) => {
      const parsed = new URL(url, 'https://example.invalid');
      expect(parsed.searchParams.get('programId')).toBe('program-a');
      const offset = Number(parsed.searchParams.get('offset'));
      return ok({ data: [{ ...document, id: offset ? 'legal_next' : 'legal_first', title: offset ? 'Next legal version' : 'First legal version' }], page: { total: 26, offset, limit: 25, hasMore: offset === 0 } });
    });
    render(<PagedCompanyLegalPicker token={m.token} programId="program-a" kind="cover_letter" selected={['legal_already_selected']} onChange={change} multiple disabled={false} label="Mapped originals" />);
    await screen.findByText(/First legal version · v2/);
    expect(screen.getByText(/Selected: legal_already_selected/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Next legal versions' }));
    fireEvent.click(await screen.findByRole('checkbox', { name: /Next legal version · v2/ }));
    expect(change).toHaveBeenCalledWith(['legal_already_selected', 'legal_next']);
  });
});
