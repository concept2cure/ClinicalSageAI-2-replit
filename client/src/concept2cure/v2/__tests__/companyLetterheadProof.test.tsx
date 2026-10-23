// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { normalizeTemplateSpec } from '@shared/templates/template-spec';
import type { CompanyDocumentProfile } from '@shared/company-documents';
import { endCompanySession, seedCompanySession } from './_company-session-fixture';
const apiRequest = vi.hoisted(() => vi.fn());
const downloadBlob = vi.hoisted(() => vi.fn(() => true));
vi.mock('@/lib/queryClient', async original => ({ ...(await original<typeof import('@/lib/queryClient')>()), apiRequest }));
vi.mock('../download', async original => ({ ...(await original<typeof import('../download')>()), downloadBlob }));
import { CompanyDocumentSettings } from '../surfaces/CompanyDocumentSettings';
const PATH = '/api/client-branding/company-documents';
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const profile = (): CompanyDocumentProfile => ({ version: 1, revision: 3, brandingAdopted: true, companyName: 'Saved Company', address: 'Registered office', contact: '', registrationDetails: '', letterhead: normalizeTemplateSpec({}), importedFrom: null, applyToReports: false, applyToSubmissionCorrespondence: true, legalDocuments: [] });
beforeEach(() => { localStorage.clear(); sessionStorage.clear(); apiRequest.mockReset(); downloadBlob.mockClear(); seedCompanySession(); });
afterEach(() => { cleanup(); endCompanySession(); });

describe('Unsaved company letterhead proof', () => {
  function serve(status = 200) {
    apiRequest.mockImplementation(async method => method === 'GET' ? json({ data: profile(), canManage: true }) : status === 200 ? new Response('proof bytes') : json({ message: 'The draft logo could not be verified.' }, status));
  }
  async function editDraft() {
    render(<CompanyDocumentSettings />);
    fireEvent.change(await screen.findByLabelText('Company legal name'), { target: { value: 'Draft Company' } });
    fireEvent.click(screen.getByRole('button', { name: 'Download unsaved Word proof' }));
  }
  it('downloads a visibly named draft through the unsaved endpoint without writing a revision or output preferences', async () => {
    serve(); await editDraft();
    expect(await screen.findByText(/Unsaved Word proof downloaded for review/)).toBeTruthy();
    expect(downloadBlob).toHaveBeenCalledWith('Draft_Company-letterhead-unsaved-proof.docx', expect.objectContaining({ size: 11 }));
    const write = apiRequest.mock.calls.find(([method]) => method === 'POST');
    expect(write?.[1]).toBe(`${PATH}/letterhead/preview`);
    expect(write?.[2]).toMatchObject({ profile: { companyName: 'Draft Company', address: 'Registered office' } });
    expect(write?.[2].profile).not.toHaveProperty('revision');
    expect(write?.[2].profile).not.toHaveProperty('applyToReports');
    expect(apiRequest.mock.calls.some(([method]) => method === 'PUT')).toBe(false);
    expect(screen.getByText('Unsaved draft')).toBeTruthy();
    expect(screen.getByText('Revision 3')).toBeTruthy();
  });
  it('retains a refused proof draft and does not initiate a browser download or claim it was saved', async () => {
    serve(422); await editDraft();
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Letterhead download failed. The draft logo could not be verified.');
    expect(downloadBlob).not.toHaveBeenCalled();
    expect((screen.getByLabelText('Company legal name') as HTMLInputElement).value).toBe('Draft Company');
    expect(screen.queryByText(/proof downloaded/)).toBeNull();
  });

  it('drops a rendered proof if the canonical authentication session changes before delivery', async () => {
    let deliver: (response: Response) => void = () => undefined;
    const pending = new Promise<Response>(resolve => { deliver = resolve; });
    apiRequest.mockImplementation(async method => method === 'GET' ? json({ data: profile(), canManage: true }) : pending);
    await editDraft(); seedCompanySession({}, 'replacement');
    await act(async () => { deliver(new Response('old session proof')); });
    expect(downloadBlob).not.toHaveBeenCalled();
    expect(screen.queryByText(/Unsaved Word proof downloaded/)).toBeNull();
  });
});
