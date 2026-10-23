// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { normalizeTemplateSpec } from '@shared/templates/template-spec';
import type { CompanyDocumentProfile } from '@shared/company-documents';
const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async original => ({ ...(await original<typeof import('@/lib/queryClient')>()), apiRequest }));
import { authService } from '@/services/portal/authService';
import { CompanyDocumentSettings } from '../surfaces/CompanyDocumentSettings';
import { endCompanySession, rotateCompanyBearer, seedCompanySession } from './_company-session-fixture';

const PATH = '/api/client-branding/company-documents';
const READ = `${PATH}?includeLegal=false`;
const profile = (): CompanyDocumentProfile => ({ version: 1, revision: 3, companyName: 'Saved Sponsor', address: 'Registered office',
  contact: '', registrationDetails: '', letterhead: normalizeTemplateSpec({}), importedFrom: null,
  applyToReports: false, applyToSubmissionCorrespondence: true, legalDocuments: [] });
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
beforeEach(() => {
  localStorage.clear(); sessionStorage.clear(); seedCompanySession(); apiRequest.mockReset();
  apiRequest.mockImplementation(async (_method, path) => path === READ ? json({ data: profile(), canManage: true, legalDocumentsIncluded: false }) : json({ data: [] }));
});
afterEach(() => { cleanup(); endCompanySession(); vi.unstubAllGlobals(); });
async function edit() {
  fireEvent.change(await screen.findByLabelText('Company legal name'), { target: { value: 'Unsaved Sponsor' } });
  fireEvent.change(screen.getByLabelText('Reason for company document change'), { target: { value: 'Retain the reviewed company design.' } });
}
describe('company settings retain their canonical account/session owner', () => {
  it('preserves an unsaved company name and reason across real ordinary bearer refresh', async () => {
    const view = render(<CompanyDocumentSettings />); await edit();
    const reads = apiRequest.mock.calls.filter(([method, path]) => method === 'GET' && path === READ).length;
    const owner = authService.captureSessionReadGuard();
    await act(async () => { await rotateCompanyBearer(); });
    expect(owner.sameRevision()).toBe(true);
    view.rerender(<CompanyDocumentSettings />);
    await waitFor(() => expect(screen.getByLabelText('Company legal name')).toHaveProperty('value', 'Unsaved Sponsor'));
    expect(screen.getByLabelText('Reason for company document change')).toHaveProperty('value', 'Retain the reviewed company design.');
    expect(apiRequest.mock.calls.filter(([method, path]) => method === 'GET' && path === READ)).toHaveLength(reads);
  });
  it('blocks the retained save before React can rerender a replaced account', async () => {
    render(<CompanyDocumentSettings />); await edit();
    const save = screen.getByRole('button', { name: 'Save company documents' });
    act(() => { authService.setToken('replacement-session', { id: '43', organizationId: '2', email: 'next@example.test', roles: ['owner'] }); fireEvent.click(save); });
    expect(apiRequest.mock.calls.filter(([method]) => method === 'PUT')).toHaveLength(0);
  });
  it('rereads and remounts legal forms after a same-bearer account snapshot replacement', async () => {
    apiRequest.mockImplementation(async (method, path) => {
      if (path === READ || method === 'POST') return json({ data: profile(), canManage: true, legalDocumentsIncluded: false });
      if (String(path).includes('/legal-documents?')) return json({ data: [], page: { total: 0, offset: 0, limit: 25, hasMore: false } });
      return json({ data: [] });
    });
    render(<CompanyDocumentSettings />); await screen.findByLabelText('Company legal name');
    fireEvent.click(screen.getByRole('button', { name: 'Legal document library' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add customer legal requirement' }));
    fireEvent.change(screen.getByLabelText('Requirement title'), { target: { value: 'Retired private requirement' } });
    const previousReads = apiRequest.mock.calls.filter(([, path]) => path === READ).length;
    const owner = authService.captureSessionReadGuard();
    vi.stubGlobal('fetch', vi.fn(async () => json({ authenticated: true, user: { ...authService.getUser(), roles: ['owner', 'reviewer'] } })));
    await act(async () => { expect((await authService.refreshUser()).success).toBe(true); });
    expect(owner.sameRevision()).toBe(true);
    await screen.findByLabelText('Company legal name');
    expect(apiRequest.mock.calls.filter(([, path]) => path === READ)).toHaveLength(previousReads + 1);
    fireEvent.click(screen.getByRole('button', { name: 'Legal document library' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add customer legal requirement' }));
    expect(screen.getByLabelText('Requirement title')).toHaveProperty('value', '');
    fireEvent.change(screen.getByLabelText('Requirement title'), { target: { value: 'Current reviewed requirement' } });
    fireEvent.change(screen.getByLabelText('Review rationale and reason for change'), { target: { value: 'Reviewed under the current account permissions.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Record requirement review' }));
    await waitFor(() => expect(apiRequest.mock.calls.filter(([method, path]) => method === 'POST' && String(path).endsWith('/requirements'))).toHaveLength(1));
  });
});
