// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { CompanyDocumentProfile } from '@shared/company-documents';
import { normalizeTemplateSpec } from '@shared/templates/template-spec';

const apiRequest = vi.hoisted(() => vi.fn());
const apiUpload = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (original) => ({ ...(await original<typeof import('@/lib/queryClient')>()), apiRequest, apiUpload }));
import { CompanyDocumentSettings } from '../surfaces/CompanyDocumentSettings';
import { AdminAccess } from '../surfaces/AdminAccess';

const PATH = '/api/client-branding/company-documents';
const READ_PATH = `${PATH}?includeLegal=false`;
const PROGRAM = '11111111-1111-4111-8111-111111111111';
const DOCUMENT = '22222222-2222-4222-8222-222222222222';
const profile = (): CompanyDocumentProfile => ({
  version: 1, revision: 3, companyName: 'Northwind Pharma', address: '1 Research Way', contact: 'regulatory@example.invalid', registrationDetails: '',
  letterhead: normalizeTemplateSpec({ header: { alignment: 'left' } }), importedFrom: null,
  applyToReports: false, applyToSubmissionCorrespondence: false, legalDocuments: [],
});
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
let stored: CompanyDocumentProfile;
let canManage: boolean;
let writeStatus: number;
let readStatus: number;
let searchStatus: number;
let capabilities: { manageBrand: boolean; manageLegal: boolean; managePermissions: boolean } | undefined;
let legacyPreview: { available: boolean; sourceHash: string | null; candidate: unknown; warnings: string[] };

function knownRead(url: string): Response | null {
    if (url === '/api/mdx/admin') return json({ data: { organizationId: 1, kpis: [], members: [{ id: 'u-1', initials: 'OW', name: 'Org Owner', email: 'owner@example.invalid', role: 'Owner', groups: [], sso: '', mfa: true, lastSeen: '', state: 'active' }], roles: [], grants: [], apiKeys: [], audit: [], settings: [], sso: null } });
    if (url.includes('/claude-connector')) return json({ connector: { enabled: false, canChange: true } });
    if (url === `${PATH}/legacy-adoption`) return json(legacyPreview);
    if (url === READ_PATH) return readStatus === 200 ? json({ data: { ...globalThis.structuredClone(stored), legalDocuments: [] }, canManage, capabilities, legalDocumentsIncluded: false }) : json({ message: 'Settings service unavailable.' }, readStatus);
    if (url.startsWith(`${PATH}/legal-documents?`)) {
      const data = stored.legalDocuments.filter(document => document.active || url.includes('includeArchived=true'));
      return json({ data, page: { total: data.length, availableTotal: data.length, limit: 10, offset: 0, hasMore: false, nextOffset: null }, facets: { agencies: [], languages: [] } });
    }
    if (url.startsWith('/api/c2c/project-vault/search')) return searchStatus === 200 ? json({ success: true, data: { scope: 'verified-accessible-programs', query: 'Authorization', total: 1, limit: 25, results: [{ id: DOCUMENT, title: 'Authorization original', version: '2', current: true, program: { id: PROGRAM, name: 'Oncology IND' } }] } }) : json({ message: 'Search service unavailable.' }, searchStatus);
  return null;
}

beforeEach(() => {
  localStorage.clear(); sessionStorage.clear(); stored = profile(); canManage = true; writeStatus = 200; readStatus = 200; searchStatus = 200;
  capabilities = undefined;
  legacyPreview = { available: false, sourceHash: null, candidate: null, warnings: [] };
  apiRequest.mockReset(); apiUpload.mockReset();
  apiRequest.mockImplementation(async (method: string, url: string, body?: any) => {
    if (method === 'GET') { const response = knownRead(url); if (response) return response; }
    if (url === `${PATH}/legacy-adoption` && method === 'POST') {
      stored = { ...stored, ...(legacyPreview.candidate as Partial<CompanyDocumentProfile>), brandingAdopted: true, revision: stored.revision + 1 };
      return json({ data: globalThis.structuredClone(stored), canManage, capabilities });
    }
    if (url === PATH && method === 'PUT') {
      if (writeStatus !== 200) return json({ error: writeStatus === 409 ? 'REVISION_CONFLICT' : 'ADMIN_REQUIRED', message: writeStatus === 409 ? 'Revision conflict.' : 'Only an administrator can change company documents.' }, writeStatus);
      const { expectedRevision, ...settings } = body;
      delete settings.reason;
      delete settings.legacyDecision;
      stored = { ...stored, ...settings, revision: expectedRevision + 1 };
      return json({ data: globalThis.structuredClone(stored), canManage, capabilities });
    }
    if (url === `${PATH}/legal-documents` && method === 'POST') {
      stored = { ...stored, revision: stored.revision + 1, legalDocuments: [{ ...body, id: 'entry-1', contentHash: 'abc123', version: '2', active: true, registeredAt: '2026-10-17T00:00:00Z', registeredBy: 'Owner', transmitRefusal: 'The source document requires approval before filing.' }] };
      return json({ data: globalThis.structuredClone(stored), canManage });
    }
    return json({});
  });
});
afterEach(cleanup);
const open = async () => { render(<CompanyDocumentSettings />); return screen.findByLabelText('Company legal name'); };
const editAndReason = async () => {
  const name = await open(); fireEvent.change(name, { target: { value: 'Northwind Life Sciences' } });
  fireEvent.change(screen.getByLabelText('Reason for company document change'), { target: { value: 'Update company letterhead' } });
};

describe('Company document settings', () => {
  it('is reachable inside the existing Admin Settings tab', async () => {
    render(<AdminAccess surface={{ id: 'admin-console', label: 'Admin' } as any} onAsk={vi.fn()} onNav={vi.fn()} segment="biopharma" />);
    const settings = await waitFor(() => {
      const found = Array.from(document.querySelectorAll('.adm-tab')).find(button => button.textContent?.includes('Settings'));
      expect(found).toBeTruthy(); return found!;
    });
    fireEvent.click(settings);
    expect(await screen.findByLabelText('Company legal name')).toBeTruthy();
  });

  it('saves the exact revision and audited reason, then reads the stored profile', async () => {
    await editAndReason();
    expect(screen.getByLabelText('Letterhead preview').textContent).toContain('Northwind Life Sciences');
    fireEvent.click(screen.getByRole('button', { name: 'Save company documents' }));
    await screen.findByText('Company identity and letterhead saved · revision 4.');
    const call = apiRequest.mock.calls.find(([method]) => method === 'PUT');
    expect(call?.[2]).toMatchObject({ expectedRevision: 3, reason: 'Update company letterhead', companyName: 'Northwind Life Sciences' });
    expect(call?.[2]).not.toHaveProperty('legalDocuments');
    expect(apiRequest.mock.calls.filter(([m, p]) => m === 'GET' && p === READ_PATH)).toHaveLength(2);
  });

  it('keeps a refused draft and does not announce it saved', async () => {
    writeStatus = 403; await editAndReason();
    fireEvent.click(screen.getByRole('button', { name: 'Save company documents' }));
    await screen.findByRole('alert');
    expect((screen.getByLabelText('Company legal name') as HTMLInputElement).value).toBe('Northwind Life Sciences');
    expect(screen.queryByText(/saved · revision/)).toBeNull();
    expect(screen.getByText('Unsaved draft')).toBeTruthy();
  });

  it('keeps a conflicting draft and requires deliberate reload before retry', async () => {
    writeStatus = 409; await editAndReason();
    fireEvent.click(screen.getByRole('button', { name: 'Save company documents' }));
    expect(await screen.findByText(/Another administrator changed this profile/)).toBeTruthy();
    expect((screen.getByLabelText('Company legal name') as HTMLInputElement).value).toBe('Northwind Life Sciences');
    expect((screen.getByRole('button', { name: 'Save company documents' }) as HTMLButtonElement).disabled).toBe(true);
    stored.companyName = 'Updated by another administrator'; stored.revision = 4;
    fireEvent.click(screen.getByRole('button', { name: 'Discard draft and reload saved profile' }));
    await waitFor(() => expect((screen.getByLabelText('Company legal name') as HTMLInputElement).value).toBe('Updated by another administrator'));
  });

  it('disables management for a reader and shows a failed read as unavailable', async () => {
    canManage = false; await open();
    expect((screen.getByLabelText('Company legal name').closest('fieldset') as InstanceType<typeof window.HTMLFieldSetElement>).disabled).toBe(true);
    expect(screen.getByText(/Only an organization owner, administrator or assigned company-document custodian/)).toBeTruthy();
    cleanup(); readStatus = 500; render(<CompanyDocumentSettings />);
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.queryByLabelText('Company legal name')).toBeNull();
  });

});

describe('Company letterhead and legal library', () => {
  it('imports canonical formatting into a draft and displays extraction warnings', async () => {
    await open(); fireEvent.click(screen.getByRole('button', { name: 'Letterhead designer' }));
    apiUpload.mockResolvedValueOnce(json({ spec: normalizeTemplateSpec({ page: { size: 'a4' }, header: { text: 'Imported legal header' } }), confidence: .65, warnings: ['PDF fonts were approximated.'] }));
    fireEvent.change(screen.getByLabelText('Import existing Word or PDF letterhead'), { target: { files: [new File(['%PDF'], 'Company-letterhead.pdf', { type: 'application/pdf' })] } });
    expect(await screen.findByText('PDF fonts were approximated.')).toBeTruthy();
    expect((screen.getByLabelText('Page size') as HTMLSelectElement).value).toBe('a4');
    expect(screen.getByLabelText('Letterhead preview').textContent).toContain('Imported legal header');
    expect(apiRequest.mock.calls.filter(([m]) => m === 'PUT')).toHaveLength(0);
  });

  it('rejects an SVG logo before reading or uploading it', async () => {
    await open();
    fireEvent.change(screen.getByLabelText('Company logo · PNG, JPEG or GIF, up to 2 MB'), { target: { files: [new File(['<svg/>'], 'logo.svg', { type: 'image/svg+xml' })] } });
    expect(await screen.findByText('Choose a PNG, JPEG or GIF logo up to 2 MB.')).toBeTruthy();
    expect(apiUpload).not.toHaveBeenCalled();
  });

  it('registers the selected immutable Vault version without inventing approval', async () => {
    await open(); fireEvent.click(screen.getByRole('button', { name: 'Legal document library' }));
    fireEvent.click(screen.getByText('Register a legal document from Vault'));
    fireEvent.change(screen.getByLabelText('Search your accessible Vaults'), { target: { value: 'Authorization' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search Vault' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Select document' }));
    fireEvent.click(within(screen.getByRole('group', { name: 'Agencies' })).getByLabelText('FDA'));
    fireEvent.click(within(screen.getByRole('group', { name: 'Agencies' })).getByLabelText('EMA'));
    fireEvent.change(screen.getByLabelText('Reason for legal document registration'), { target: { value: 'Register signed sponsor authorization' } });
    fireEvent.click(screen.getByRole('button', { name: 'Register Vault version' }));
    expect(await screen.findByText('The source document requires approval before filing.')).toBeTruthy();
    const call = apiRequest.mock.calls.find(([m, p]) => m === 'POST' && p === `${PATH}/legal-documents`);
    expect(call?.[2]).toMatchObject({ expectedRevision: 3, programId: PROGRAM, vaultDocumentId: DOCUMENT, agencies: ['FDA', 'EMA'], title: 'Authorization original' });
    expect(call?.[2]).not.toHaveProperty('contentHash'); expect(call?.[2]).not.toHaveProperty('transmitRefusal');
    expect(screen.getByText(/Registration does not approve or sign/)).toBeTruthy();
  });

  it('does not turn a Vault search outage into an empty library', async () => {
    searchStatus = 500; await open(); fireEvent.click(screen.getByRole('button', { name: 'Legal document library' }));
    fireEvent.click(screen.getByText('Register a legal document from Vault'));
    fireEvent.change(screen.getByLabelText('Search your accessible Vaults'), { target: { value: 'Authorization' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search Vault' }));
    expect(await screen.findByText('Search service unavailable.')).toBeTruthy();
    expect(screen.queryByText('No matching documents in your accessible projects.')).toBeNull();
  });

  it('shows a superseded-source refusal without claiming another administrator changed the profile', async () => {
    await open(); fireEvent.click(screen.getByRole('button', { name: 'Legal document library' }));
    fireEvent.click(screen.getByText('Register a legal document from Vault'));
    fireEvent.change(screen.getByLabelText('Legal document title'), { target: { value: 'Sponsor authorization' } });
    fireEvent.change(screen.getByLabelText('Source project UUID'), { target: { value: PROGRAM } });
    fireEvent.change(screen.getByLabelText('Vault document version UUID'), { target: { value: DOCUMENT } });
    fireEvent.change(screen.getByLabelText('Reason for legal document registration'), { target: { value: 'Register legal original' } });
    apiRequest.mockImplementationOnce(async () => json({ error: 'VAULT_VERSION_UNVERIFIED', message: 'This source version has been superseded. Select its current version.' }, 409));
    fireEvent.click(screen.getByRole('button', { name: 'Register Vault version' }));
    expect(await screen.findByText('This source version has been superseded. Select its current version.')).toBeTruthy();
    expect(screen.queryByText(/Another administrator changed this profile/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Discard draft and reload saved profile' })).toBeNull();
    expect((screen.getByLabelText('Legal document title') as HTMLInputElement).value).toBe('Sponsor authorization');
  });

  it('clears unsaved reasons, extraction warnings and archived selection when the signed-in session changes', async () => {
    const view = render(<CompanyDocumentSettings />);
    await screen.findByLabelText('Company legal name');
    fireEvent.change(screen.getByLabelText('Reason for company document change'), { target: { value: 'Private reason from the previous account' } });
    fireEvent.click(screen.getByRole('button', { name: 'Letterhead designer' }));
    apiUpload.mockResolvedValueOnce(json({ spec: normalizeTemplateSpec({ header: { text: 'Previous account draft' } }), warnings: ['Previous account extraction warning'] }));
    fireEvent.change(screen.getByLabelText('Import existing Word or PDF letterhead'), { target: { files: [new File(['%PDF'], 'previous-account.pdf', { type: 'application/pdf' })] } });
    await screen.findByText('Previous account extraction warning');
    fireEvent.click(screen.getByRole('button', { name: 'Legal document library' }));
    fireEvent.click(screen.getByText('Register a legal document from Vault'));
    fireEvent.change(screen.getByLabelText('Reason for legal document registration'), { target: { value: 'Previous account registration reason' } });
    fireEvent.click(screen.getByLabelText('Show archived library entries'));
    stored = { ...profile(), companyName: 'New Account Company' };
    const payload = btoa(JSON.stringify({ organizationId: 2, id: 44 }));
    sessionStorage.setItem('trialsage_access_token', `header.${payload}.signature`);
    view.rerender(<CompanyDocumentSettings />);
    await screen.findByDisplayValue('New Account Company');
    expect((screen.getByLabelText('Reason for company document change') as HTMLInputElement).value).toBe('');
    fireEvent.click(screen.getByRole('button', { name: 'Letterhead designer' }));
    expect(screen.queryByText('Previous account extraction warning')).toBeNull();
    expect((screen.getByLabelText('Running header') as HTMLTextAreaElement).value).toBe('');
    fireEvent.click(screen.getByRole('button', { name: 'Legal document library' }));
    expect((screen.getByLabelText('Show archived library entries') as HTMLInputElement).checked).toBe(false);
    expect((screen.getByLabelText('Reason for legal document registration') as HTMLInputElement).value).toBe('');
    expect(apiRequest.mock.calls.filter(([method]) => method !== 'GET')).toHaveLength(0);
  });
});

describe('Delegated company capabilities and legacy adoption', () => {
  it('lets a delegated brand manager edit stationery without legal management controls', async () => {
    canManage = false; capabilities = { manageBrand: true, manageLegal: false, managePermissions: false };
    await open();
    expect((screen.getByLabelText('Company legal name').closest('fieldset') as InstanceType<typeof window.HTMLFieldSetElement>).disabled).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Legal document library' }));
    expect(screen.queryByText('Register a legal document from Vault')).toBeNull();
  });

  it('lets a delegated legal custodian register originals while company presentation stays read-only', async () => {
    canManage = false; capabilities = { manageBrand: false, manageLegal: true, managePermissions: false };
    await open();
    expect((screen.getByLabelText('Company legal name').closest('fieldset') as InstanceType<typeof window.HTMLFieldSetElement>).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Legal document library' }));
    expect(screen.getByText('Register a legal document from Vault')).toBeTruthy();
  });

  it('previews old assets without adopting until an explicit reasoned action', async () => {
    legacyPreview = { available: true, sourceHash: 'legacy-source-hash', warnings: ['Review extracted fonts.'], candidate: { companyName: 'Legacy Company', address: 'Legacy office', contact: '', registrationDetails: '', letterhead: normalizeTemplateSpec({}), importedFrom: 'Legacy branding' } };
    await open();
    expect(await screen.findByText('Existing company branding was found')).toBeTruthy();
    expect((screen.getByLabelText('Company legal name') as HTMLInputElement).value).toBe('Northwind Pharma');
    expect(apiRequest.mock.calls.filter(([method]) => method !== 'GET')).toHaveLength(0);
    fireEvent.change(screen.getByLabelText('Reason for legacy branding adoption'), { target: { value: 'Preserve reviewed existing stationery' } });
    fireEvent.click(screen.getByRole('button', { name: 'Adopt reviewed legacy branding' }));
    await screen.findByDisplayValue('Legacy Company');
    expect(apiRequest).toHaveBeenCalledWith('POST', `${PATH}/legacy-adoption`, { expectedRevision: 3, sourceHash: 'legacy-source-hash', reason: 'Preserve reviewed existing stationery' });
  });

  it('carries an explicit replacement decision only when the user selects it', async () => {
    legacyPreview = { available: true, sourceHash: 'legacy-hash', candidate: null, warnings: ['The old artwork needs manual review.'] };
    await open();
    fireEvent.click(await screen.findByRole('button', { name: 'Use my current design instead' }));
    fireEvent.change(screen.getByLabelText('Reason for company document change'), { target: { value: 'Replace obsolete stationery after review' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save company documents' }));
    await waitFor(() => expect(apiRequest.mock.calls.some(([method]) => method === 'PUT')).toBe(true));
    expect(apiRequest.mock.calls.find(([method]) => method === 'PUT')?.[2]).toMatchObject({ legacyDecision: 'replace', reason: 'Replace obsolete stationery after review' });
  });
});

describe('Legal library lifecycle refusal summaries', () => {
  it('shows a recorded revocation even while the immutable source still has current Vault approval', async () => {
    stored.legalDocuments = [{ id: 'revoked-entry', title: 'Revoked authorization', kind: 'authorization', programId: PROGRAM, vaultDocumentId: DOCUMENT, contentHash: 'a'.repeat(64), version: '1', agencies: ['FDA'], countries: ['US'], submissionTypes: ['ind'], language: 'en', effectiveOn: null, expiresOn: null, active: true, registeredAt: '2026-10-17', registeredBy: 'Owner', transmitRefusal: null,
      workflow: { custodianUserId: null, reminderDays: [], replacementId: null, revokedAt: '2026-10-18T00:00:00Z', revokedBy: 'Owner', revocationReason: 'Authority withdrawn', authority: null, signatureEvidence: null, translationOfId: null, certifiedTranslationEvidence: null, updatedAt: '2026-10-18T00:00:00Z', updatedBy: 'Owner' } }];
    await open(); fireEvent.click(screen.getByRole('button', { name: 'Legal document library' }));
    expect(await screen.findByText('This company legal document has been revoked.')).toBeTruthy();
    expect(screen.queryByText(/Current Vault approval verified/)).toBeNull();
    expect(screen.queryByText(/No legal documents are available/)).toBeNull();
  });
});
