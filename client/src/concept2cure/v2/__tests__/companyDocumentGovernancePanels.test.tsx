// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { normalizeTemplateSpec } from '@shared/templates/template-spec';
import type { CompanyDocumentProfile } from '@shared/company-documents';
import type { CompanyDocumentSettingsModel } from '../surfaces/useCompanyDocumentSettings';
import { CompanyPermissionsPanel } from '../surfaces/company-documents/CompanyPermissionsPanel';
import { CompanyPresentationHistory } from '../surfaces/company-documents/CompanyPresentationHistory';
const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async original => ({ ...(await original<typeof import('@/lib/queryClient')>()), apiRequest }));
const PATH = '/api/client-branding/company-documents';
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const profile = (): CompanyDocumentProfile => ({ version: 1, revision: 3, companyName: 'Current Company', address: 'Current office', contact: '', registrationDetails: '', letterhead: normalizeTemplateSpec({}), importedFrom: null, applyToReports: true, applyToSubmissionCorrespondence: false, legalDocuments: [] });
beforeEach(() => { apiRequest.mockReset(); localStorage.clear(); sessionStorage.clear(); });
afterEach(cleanup);

describe('Delegated company-document responsibilities', () => {
  it('loads only on request and changes explicit rights with a reason, preserving inherited owner rights', async () => {
    const member = { user_id: 2, name: 'Legal Custodian', email: 'legal@example.invalid', role: 'member', manage_brand: false, manage_legal: false };
    apiRequest.mockImplementation(async (method, url, body) => {
      if (method === 'GET') return json({ data: [{ user_id: 1, name: 'Owner', email: 'owner@example.invalid', role: 'owner', manage_brand: false, manage_legal: false }, member] });
      Object.assign(member, { manage_brand: body.manageBrand, manage_legal: body.manageLegal });
      return json({ success: true, userId: 2, manageBrand: body.manageBrand, manageLegal: body.manageLegal });
    });
    render(<CompanyPermissionsPanel />);
    expect(apiRequest).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Company-document responsibilities'));
    await screen.findByRole('option', { name: 'Legal Custodian · member' });
    expect(screen.queryByRole('option', { name: /Owner/ })).toBeNull();
    fireEvent.change(screen.getByLabelText('Member receiving company-document responsibilities'), { target: { value: '2' } });
    fireEvent.click(screen.getByLabelText('Manage the company legal library and workflow records'));
    fireEvent.change(screen.getByLabelText('Reason for company permission change'), { target: { value: 'Assign legal inventory stewardship' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save company responsibilities' }));
    await screen.findByText(/Company-document permissions saved/);
    expect(apiRequest).toHaveBeenCalledWith('PUT', `${PATH}/permissions/2`, { manageBrand: false, manageLegal: true, reason: 'Assign legal inventory stewardship' });
    await waitFor(() => expect(apiRequest.mock.calls.filter(([method]) => method === 'GET')).toHaveLength(2));
  });

  it('keeps refused permission choices and does not claim they were saved', async () => {
    apiRequest.mockImplementation(async method => method === 'GET' ? json({ data: [{ user_id: 2, name: 'Member', email: 'member@example.invalid', role: 'member', manage_brand: false, manage_legal: false }] }) : json({ message: 'Your permission to manage grants has changed.' }, 403));
    render(<CompanyPermissionsPanel />); fireEvent.click(screen.getByText('Company-document responsibilities'));
    await screen.findByRole('option', { name: 'Member · member' });
    fireEvent.change(screen.getByLabelText('Member receiving company-document responsibilities'), { target: { value: '2' } });
    fireEvent.click(screen.getByLabelText('Manage company identity and presentation'));
    fireEvent.change(screen.getByLabelText('Reason for company permission change'), { target: { value: 'Delegate presentation responsibilities' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save company responsibilities' }));
    expect(await screen.findByText('Your permission to manage grants has changed.')).toBeTruthy();
    expect((screen.getByLabelText('Manage company identity and presentation') as HTMLInputElement).checked).toBe(true);
    expect(screen.queryByText(/Company-document permissions saved/)).toBeNull();
  });
});

describe('Presentation history and restore', () => {
  const model = (manageBrand = true) => ({ capabilities: { manageBrand, manageLegal: false, managePermissions: false }, mutation: vi.fn(), busy: false, conflict: false }) as unknown as CompanyDocumentSettingsModel;
  function serveRevisions(failDetail = false) {
    apiRequest.mockImplementation(async (_method, url) => {
      if (String(url).includes('/revisions?')) return json({ data: [{ revision: 2, sha256: 'a'.repeat(64), created_by: '7', created_at: '2026-01-01', reason: 'Prior company stationery' }], nextBefore: null });
      if (failDetail) return json({ message: 'The retained revision could not be read.' }, 503);
      return json({ data: { ...profile(), revision: 2, companyName: 'Previous Company' } });
    });
  }
  it('compares retained presentation and requires an explicit reasoned restore against the current revision', async () => {
    const controls = model(); serveRevisions();
    render(<CompanyPresentationHistory model={controls} profile={profile()} />);
    expect(apiRequest).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Presentation history, comparison and restore'));
    fireEvent.click(await screen.findByRole('button', { name: 'Compare revision 2' }));
    expect(await screen.findByRole('cell', { name: 'Previous Company' })).toBeTruthy();
    expect(screen.getByRole('cell', { name: 'Current Company' })).toBeTruthy();
    expect(screen.getByText(/current legal inventory and report\/correspondence preferences are retained/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Reason for presentation restore'), { target: { value: 'Restore reviewed earlier stationery' } });
    fireEvent.click(screen.getByRole('button', { name: 'Restore this presentation revision' }));
    expect(controls.mutation).toHaveBeenCalledWith('POST', `${PATH}/revisions/2/restore`, { expectedRevision: 3, reason: 'Restore reviewed earlier stationery' }, 'design');
  });

  it('lets readers inspect history without restore controls and shows an unread revision as a failure', async () => {
    serveRevisions(true);
    render(<CompanyPresentationHistory model={model(false)} profile={profile()} />);
    fireEvent.click(screen.getByText('Presentation history, comparison and restore'));
    fireEvent.click(await screen.findByRole('button', { name: 'Compare revision 2' }));
    expect(await screen.findByText('The retained revision could not be read.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Restore this presentation revision' })).toBeNull();
  });

  it('requires the independent-review path when a historical identity differs from the approved default', async () => {
    const controls = model(); serveRevisions();
    render(<CompanyPresentationHistory model={controls} profile={{ ...profile(), brandingApprovalRequired: true }} />);
    fireEvent.click(screen.getByText('Presentation history, comparison and restore'));
    fireEvent.click(await screen.findByRole('button', { name: 'Compare revision 2' }));
    await screen.findByText(/independent-review policy blocks direct restoration/);
    fireEvent.change(screen.getByLabelText('Reason for presentation restore'), { target: { value: 'Try restoring an unapproved historical identity' } });
    expect((screen.getByRole('button', { name: 'Restore this presentation revision' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'Load retained presentation into designer' })).toBeTruthy();
    expect(controls.mutation).not.toHaveBeenCalled();
  });
});
