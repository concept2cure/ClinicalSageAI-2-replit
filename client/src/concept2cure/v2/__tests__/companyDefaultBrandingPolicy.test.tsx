// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { CompanyDocumentProfile } from '@shared/company-documents';
import type { CompanyDesignDetail } from '@shared/company-document-designs';
import { normalizeTemplateSpec } from '@shared/templates/template-spec';
import { companyDesignCandidate } from '../surfaces/company-documents/CompanyDesignEditor';
const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async original => ({ ...(await original<typeof import('@/lib/queryClient')>()), apiRequest }));
import { CompanyDocumentSettings } from '../surfaces/CompanyDocumentSettings';
const PATH = '/api/client-branding/company-documents';
const ID = '11111111-1111-4111-8111-111111111111';
const HASH = 'a'.repeat(64);
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const profile = (): CompanyDocumentProfile => ({ version: 1, revision: 3, brandingAdopted: true, brandingApprovalRequired: false, approvedDefaultDesignId: ID, companyName: 'Current organization default', address: '', contact: '', registrationDetails: '', letterhead: normalizeTemplateSpec({}), importedFrom: null, applyToReports: true, applyToSubmissionCorrespondence: false, legalDocuments: [] });
const design = (): CompanyDesignDetail => ({ design: { id: ID, name: 'Reviewed organization design', templateId: 'template', scope: { programId: null, market: null, language: null, subsidiary: null }, state: 'published', sha256: HASH, createdBy: 1, createdAt: '2026-10-18', reviewedBy: 2, reviewedAt: '2026-10-18', publishedBy: 2, publishedAt: '2026-10-18', publishedRevision: 1, publishedProfileHash: HASH }, candidate: { ...companyDesignCandidate(profile()), companyName: 'Approved organization default' }, changedFields: ['companyName'], canReview: false, canPublish: false, canActivateDefault: true, reviewBlocker: null, publishBlocker: null, activationBlocker: null });
let stored: CompanyDocumentProfile;
let activationRefused: boolean;
const receipt = () => ({ data: globalThis.structuredClone(stored), canManage: true, capabilities: { manageBrand: true, manageLegal: true, managePermissions: true }, legalDocumentsIncluded: false });
function serveRead(url: string) {
  if (url.startsWith(`${PATH}?`)) return json(receipt());
  if (url === `${PATH}/permissions`) return json({ data: [] });
  if (url.startsWith(`${PATH}/designs?`)) return json({ data: [design().design], nextBefore: null });
  if (url === `${PATH}/designs/${ID}`) return json({ data: design() });
  if (url.startsWith('/api/c2c/projects')) return json({ data: [], meta: { hasMore: false } });
  return json({});
}
beforeEach(() => {
  localStorage.clear(); sessionStorage.clear(); apiRequest.mockReset(); stored = profile(); activationRefused = false;
  apiRequest.mockImplementation(async (method, url, body) => {
    if (method === 'GET') return serveRead(String(url));
    if (String(url).endsWith('/activate-default')) {
      if (activationRefused) return json({ message: 'This design is no longer eligible for default activation.' }, 403);
      stored = { ...stored, ...design().candidate, approvedDefaultDesignId: ID, revision: stored.revision + 1, applyToReports: body.applyToReports, applyToSubmissionCorrespondence: body.applyToSubmissionCorrespondence };
    } else if (String(url).endsWith('/branding-policy')) stored = { ...stored, brandingApprovalRequired: body.requireIndependentReview, revision: stored.revision + 1 };
    else stored = { ...stored, applyToReports: body.applyToReports, applyToSubmissionCorrespondence: body.applyToSubmissionCorrespondence, revision: stored.revision + 1 };
    return json(receipt());
  });
});
afterEach(cleanup);
async function openSettings() { render(<CompanyDocumentSettings />); return screen.findByLabelText('Company legal name'); }
const reason = () => fireEvent.change(screen.getByLabelText('Reason for company document change'), { target: { value: 'Update approved branding preferences' } });

describe('Optional independent review of the organization default', () => {
  it('blocks a protected identity change early and keeps the draft available for independent review', async () => {
    stored.brandingApprovalRequired = true;
    fireEvent.change(await openSettings(), { target: { value: 'Unreviewed company identity' } }); reason();
    expect((screen.getByRole('button', { name: 'Save company documents' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/Stage this draft as an organization-wide named design/)).toBeTruthy();
    expect(apiRequest.mock.calls.some(([method]) => method !== 'GET')).toBe(false);
    expect((screen.getByLabelText('Company legal name') as HTMLInputElement).value).toBe('Unreviewed company identity');
  });

  it('allows automatic-use preferences to change directly without sending approval-derived fields', async () => {
    stored.brandingApprovalRequired = true; await openSettings();
    fireEvent.click(screen.getByLabelText('Use company presentation for report exports')); reason();
    fireEvent.click(screen.getByRole('button', { name: 'Save company documents' }));
    await screen.findByText('Company identity and letterhead saved · revision 4.');
    const write = apiRequest.mock.calls.find(([method]) => method === 'PUT');
    expect(write?.[2]).toMatchObject({ expectedRevision: 3, applyToReports: false, companyName: 'Current organization default' });
    expect(write?.[2]).not.toHaveProperty('brandingApprovalRequired');
    expect(write?.[2]).not.toHaveProperty('approvedDefaultDesignId');
  });

  it('requires an activated approved default before enabling the policy', async () => {
    stored.approvedDefaultDesignId = null; await openSettings();
    fireEvent.click(screen.getByText('Company-document responsibilities', { exact: true }));
    const checkbox = screen.getByLabelText('Require independent review of the organization default') as HTMLInputElement;
    expect(checkbox.disabled).toBe(true);
    expect(screen.getByText(/Before enabling this policy, stage an organization-wide named design/)).toBeTruthy();
    expect(apiRequest.mock.calls.some(([method]) => method !== 'GET')).toBe(false);
  });

  it('enables policy with the current revision and preserves an unsaved designer draft', async () => {
    fireEvent.change(await openSettings(), { target: { value: 'Pending independent review draft' } });
    fireEvent.click(screen.getByText('Company-document responsibilities', { exact: true }));
    fireEvent.click(screen.getByLabelText('Require independent review of the organization default'));
    fireEvent.change(screen.getByLabelText('Reason for default branding review policy'), { target: { value: 'Require independent review of future default identity changes' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save default branding review policy' }));
    expect(await screen.findByText('Default branding review policy enabled · revision 4.')).toBeTruthy();
    expect(apiRequest).toHaveBeenCalledWith('PUT', `${PATH}/branding-policy`, { expectedRevision: 3, requireIndependentReview: true, reason: 'Require independent review of future default identity changes' });
    expect((screen.getByLabelText('Company legal name') as HTMLInputElement).value).toBe('Pending independent review draft');
    expect(stored.companyName).toBe('Current organization default');
    expect((screen.getByRole('button', { name: 'Save company documents' }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('Explicit approved default activation', () => {
  async function prepareActivation() {
    fireEvent.change(await openSettings(), { target: { value: 'Keep this unsaved designer draft' } });
    fireEvent.click(screen.getByText('Named designs, independent review and publication', { exact: true }));
    fireEvent.click(await screen.findByRole('button', { name: 'Inspect Reviewed organization design' }));
    const field = await screen.findByLabelText('Reason for organization default activation');
    fireEvent.change(field, { target: { value: 'Activate independently reviewed organization stationery' } });
  }
  it('activates with exact identity/hash and explicit output choices while retaining a dirty draft', async () => {
    await prepareActivation();
    fireEvent.click(screen.getByLabelText('Use the activated default for report exports'));
    fireEvent.click(screen.getByLabelText('Use the activated default for submission correspondence'));
    fireEvent.click(screen.getByRole('button', { name: 'Activate this design as organization default' }));
    expect(await screen.findByText('Organization default activated · revision 4. Your unsaved designer draft is retained.')).toBeTruthy();
    expect(apiRequest).toHaveBeenCalledWith('POST', `${PATH}/designs/${ID}/activate-default`, { expectedRevision: 3, expectedHash: HASH, reason: 'Activate independently reviewed organization stationery', applyToReports: false, applyToSubmissionCorrespondence: true });
    expect(stored.companyName).toBe('Approved organization default');
    expect(stored.brandingApprovalRequired).toBe(false);
    expect((screen.getByLabelText('Company legal name') as HTMLInputElement).value).toBe('Keep this unsaved designer draft');
    await waitFor(() => expect(screen.getByText('Revision 4')).toBeTruthy());
  });

  it('retains activation choices and the unsaved draft when the server no longer permits activation', async () => {
    activationRefused = true; await prepareActivation();
    fireEvent.click(screen.getByLabelText('Use the activated default for submission correspondence'));
    fireEvent.click(screen.getByRole('button', { name: 'Activate this design as organization default' }));
    expect(await screen.findByText('This design is no longer eligible for default activation.')).toBeTruthy();
    expect(screen.queryByText(/Organization default activated/)).toBeNull();
    expect((screen.getByLabelText('Reason for organization default activation') as HTMLTextAreaElement).value).toContain('Activate independently');
    expect((screen.getByLabelText('Use the activated default for submission correspondence') as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText('Company legal name') as HTMLInputElement).value).toBe('Keep this unsaved designer draft');
    expect(stored.revision).toBe(3);
  });
});
