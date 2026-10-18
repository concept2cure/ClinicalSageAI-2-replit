// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { CompanyDesignDetail } from '@shared/company-document-designs';
import type { CompanyDocumentProfile } from '@shared/company-documents';
import { normalizeTemplateSpec } from '@shared/templates/template-spec';
import type { CompanyDocumentSettingsModel } from '../surfaces/useCompanyDocumentSettings';
const apiRequest = vi.hoisted(() => vi.fn());
const downloadBlob = vi.hoisted(() => vi.fn(() => true));
vi.mock('@/lib/queryClient', async original => ({ ...(await original<typeof import('@/lib/queryClient')>()), apiRequest }));
vi.mock('../download', async original => ({ ...(await original<typeof import('../download')>()), downloadBlob }));
import { CompanyGovernedDesigns } from '../surfaces/company-documents/CompanyGovernedDesigns';
import { companyDesignCandidate } from '../surfaces/company-documents/CompanyDesignEditor';
const PATH = '/api/client-branding/company-documents';
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const profile = (): CompanyDocumentProfile => ({ version: 1, revision: 7, brandingAdopted: true, companyName: 'Organization default', address: '', contact: '', registrationDetails: '', letterhead: normalizeTemplateSpec({}), importedFrom: null, applyToReports: true, applyToSubmissionCorrespondence: false, legalDocuments: [] });
const model = (manageBrand = true) => ({ saved: profile(), draft: { ...profile(), companyName: 'Current designer draft' }, capabilities: { manageBrand, manageLegal: false, managePermissions: false }, busy: false, conflict: false }) as CompanyDocumentSettingsModel;
const detail = (state: 'draft' | 'reviewed' | 'published' = 'draft'): CompanyDesignDetail => ({ design: { id: 'design-1', name: 'Japan letterhead', templateId: 'template-1', scope: { programId: null, market: 'JP', language: 'ja', subsidiary: null }, state, sha256: 'a'.repeat(64), createdBy: 1, createdAt: '2026-10-18', reviewedBy: state === 'draft' ? null : 2, reviewedAt: null, publishedBy: null, publishedAt: null, publishedRevision: null, publishedProfileHash: null }, candidate: companyDesignCandidate(profile()), changedFields: ['companyName'], canReview: false, canPublish: state === 'reviewed', canActivateDefault: false, activationBlocker: 'A scoped variant cannot become the organization default.', reviewBlocker: 'The creator cannot independently review this design.', publishBlocker: state === 'draft' ? 'Independent review is required before publication.' : null });
beforeEach(() => { localStorage.clear(); sessionStorage.clear(); apiRequest.mockReset(); downloadBlob.mockClear(); });
afterEach(cleanup);
async function openDesigns() { fireEvent.click(screen.getByText('Named designs, independent review and publication')); return screen.findByRole('button', { name: 'Inspect Japan letterhead' }); }

describe('Governed named company designs', () => {
  it('stages the current draft with explicit scope without saving the default or granting creator review', async () => {
    const controls = model();
    apiRequest.mockImplementation(async (method, url) => {
      if (String(url).startsWith('/api/c2c/projects')) return json({ data: [{ id: 'project-1', title: 'Admitted project', code: 'P1' }], meta: { hasMore: false } });
      if (method === 'GET' && String(url).includes('/designs?')) return json({ data: [detail().design], nextBefore: null });
      return json({ data: detail() });
    });
    render(<CompanyGovernedDesigns model={controls} />); expect(apiRequest).not.toHaveBeenCalled();
    await openDesigns(); fireEvent.click(screen.getByText('Stage the current designer draft'));
    fireEvent.change(await screen.findByLabelText('Named design title'), { target: { value: 'Japan letterhead' } });
    await screen.findByRole('option', { name: 'Admitted project · P1' });
    fireEvent.change(screen.getByLabelText('Design project scope'), { target: { value: 'project-1' } });
    fireEvent.change(screen.getByLabelText('Design market scope'), { target: { value: 'JP' } });
    fireEvent.change(screen.getByLabelText('Design language scope'), { target: { value: 'ja' } });
    fireEvent.change(screen.getByLabelText('Reason to stage this named design'), { target: { value: 'Prepare Japan stationery for independent review' } });
    fireEvent.click(screen.getByRole('button', { name: 'Stage current draft as a named design' }));
    expect(await screen.findByText(/Named design snapshot staged/)).toBeTruthy();
    expect(apiRequest).toHaveBeenCalledWith('POST', `${PATH}/designs`, expect.objectContaining({ expectedRevision: 7, scope: { programId: 'project-1', market: 'JP', language: 'ja', subsidiary: null }, candidate: expect.objectContaining({ companyName: 'Current designer draft' }) }));
    expect(await screen.findByText(/Review: The creator cannot independently review/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Record independent design review' })).toBeNull();
    expect(apiRequest.mock.calls.some(([method]) => method === 'PUT')).toBe(false);
    expect(controls.saved?.revision).toBe(7);
  });

  it('publishes only when the server permits it and sends the exact hash and current default revision', async () => {
    let current = detail('reviewed');
    apiRequest.mockImplementation(async (method, url) => {
      if (String(url).includes('/designs?')) return json({ data: [current.design], nextBefore: null });
      if (method === 'POST') current = detail('published');
      return json({ data: current });
    });
    const controls = model(); render(<CompanyGovernedDesigns model={controls} />);
    fireEvent.click(await openDesigns());
    fireEvent.change(await screen.findByLabelText('Reason for named design review or publication'), { target: { value: 'Publish independently reviewed stationery' } });
    fireEvent.click(screen.getByRole('button', { name: 'Publish this named variant' }));
    expect(await screen.findByText('Named variant published. The organization default remains unchanged.')).toBeTruthy();
    expect(apiRequest).toHaveBeenCalledWith('POST', `${PATH}/designs/design-1/publish`, { expectedRevision: 7, expectedHash: 'a'.repeat(64), reason: 'Publish independently reviewed stationery' });
    expect(controls.saved?.companyName).toBe('Organization default');
    expect(controls.draft?.companyName).toBe('Current designer draft');
  });

  it('lets scoped readers request a proof and shows a refusal without downloading or exposing write controls', async () => {
    apiRequest.mockImplementation(async (method, url) => method === 'POST' ? json({ message: 'This design scope is no longer accessible.' }, 403) : String(url).includes('/designs?') ? json({ data: [detail('published').design], nextBefore: null }) : json({ data: detail('published') }));
    render(<CompanyGovernedDesigns model={model(false)} />); fireEvent.click(await openDesigns());
    fireEvent.click(await screen.findByRole('button', { name: 'Download named design proof' }));
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'This design scope is no longer accessible.');
    expect(downloadBlob).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Publish this named variant' })).toBeNull();
    expect(screen.queryByText('Stage the current designer draft')).toBeNull();
  });

  it('does not download a proof returned after the browser authentication session changes', async () => {
    let deliver: (response: Response) => void = () => undefined;
    const pending = new Promise<Response>(resolve => { deliver = resolve; });
    apiRequest.mockImplementation(async (method, url) => method === 'POST' ? pending : String(url).includes('/designs?') ? json({ data: [detail('published').design], nextBefore: null }) : json({ data: detail('published') }));
    render(<CompanyGovernedDesigns model={model(false)} />); fireEvent.click(await openDesigns());
    fireEvent.click(await screen.findByRole('button', { name: 'Download named design proof' }));
    localStorage.setItem('trialsage_access_token', 'different-browser-session');
    await act(async () => { deliver(new Response('previous session proof')); });
    expect(downloadBlob).not.toHaveBeenCalled();
    expect(screen.queryByText(/Named design proof downloaded/)).toBeNull();
  });
});
