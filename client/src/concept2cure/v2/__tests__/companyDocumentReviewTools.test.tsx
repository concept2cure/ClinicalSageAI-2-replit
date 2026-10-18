// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { CompanyDocumentProfile, CompanyLegalDocument } from '@shared/company-documents';
import { normalizeTemplateSpec } from '@shared/templates/template-spec';
import { CompanyLetterheadPreview, stationeryContrast } from '../surfaces/company-documents/CompanyLetterheadPreview';
import { CompanyLegalInventory } from '../surfaces/company-documents/CompanyLegalInventory';
import { CompanyVaultPicker } from '../surfaces/company-documents/CompanyVaultPicker';
const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async original => ({ ...(await original<typeof import('@/lib/queryClient')>()), apiRequest }));
const profile = (): CompanyDocumentProfile => ({ version: 1, revision: 1, companyName: 'Readable Company', address: 'A long office address', contact: 'regulatory@example.invalid', registrationDetails: 'Reg-42', letterhead: normalizeTemplateSpec({ header: { text: 'Review every header line' }, footer: { text: 'Review every footer line' } }), importedFrom: null, applyToReports: false, applyToSubmissionCorrespondence: false, legalDocuments: [] });
const document = (index: number, patch: Partial<CompanyLegalDocument> = {}): CompanyLegalDocument => ({ id: `legal-${index}`, title: `Document ${String(index).padStart(2, '0')}`, kind: 'authorization', programId: 'project', vaultDocumentId: `vault-${index}`, contentHash: 'hash', version: '1', agencies: ['FDA'], countries: ['US'], submissionTypes: ['ind'], language: 'en', effectiveOn: null, expiresOn: null, active: true, registeredAt: '2026-01-01', registeredBy: 'Owner', transmitRefusal: null, ...patch });
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
beforeEach(() => { apiRequest.mockReset(); localStorage.clear(); sessionStorage.clear(); });
afterEach(cleanup);

describe('Accessible company letterhead review', () => {
  it('supports keyboard-addressable scroll, zoom and a readable text view without editing the design', () => {
    const saved = profile(); render(<CompanyLetterheadPreview profile={saved} />);
    expect(screen.getByRole('region', { name: 'Scrollable letterhead visual preview' }).tabIndex).toBe(0);
    fireEvent.change(screen.getByLabelText('Preview zoom'), { target: { value: '200' } });
    expect(screen.getByLabelText('Letterhead preview').style.width).toBe('200%');
    fireEvent.click(screen.getByRole('button', { name: 'Readable text' }));
    const text = screen.getByRole('region', { name: 'Readable letterhead text' });
    expect(text.textContent).toContain('Review every header line'); expect(text.textContent).toContain('Reg-42');
    expect(text.textContent).toContain('Review every footer line');
    expect(saved.letterhead.page.size).toBe('letter');
  });

  it('uses known contrast extremes and warns when normal text is unreadable on white', () => {
    expect(stationeryContrast('000000')).toBe(21); expect(stationeryContrast('FFFFFF')).toBe(1);
    const saved = profile(); saved.letterhead.colors.text = 'FFFFFF';
    render(<CompanyLetterheadPreview profile={saved} />);
    expect(screen.getByText('Body text: 1.00:1 · Below the normal-text contrast guideline')).toBeTruthy();
    expect(screen.getByText(/do not evaluate image content or establish accessibility/)).toBeTruthy();
  });
});

describe('Company legal inventory tools', () => {
  const inventory = (data: CompanyLegalDocument[], total: number, offset = 0) => json({ data, page: { total, availableTotal: 14, limit: 10, offset, hasMore: offset + 10 < total, nextOffset: offset + 10 < total ? offset + 10 : null }, facets: { agencies: ['FDA'], languages: ['en', 'fr'] } });
  it('uses server pages and scoped counts, resetting the page when narrowing by language and search', async () => {
    const documents = Array.from({ length: 14 }, (_, index) => document(index, { language: index < 12 ? 'en' : 'fr' }));
    apiRequest.mockImplementation(async (_method, url) => {
      const query = new URL(String(url), 'https://example.invalid').searchParams;
      if (query.has('q')) return inventory([], 0);
      if (query.get('language') === 'fr') return inventory(documents.slice(12), 2);
      const offset = Number(query.get('offset'));
      return inventory(documents.slice(offset, offset + 10), 14, offset);
    });
    render(<CompanyLegalInventory revision={1} includeArchived={false} renderDocument={item => <h4>{item.title}</h4>} />);
    await screen.findByRole('heading', { name: 'Document 00' });
    expect(screen.queryByRole('heading', { name: 'Document 10' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Next legal page' }));
    expect(await screen.findByRole('heading', { name: 'Document 10' })).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Filter by language'), { target: { value: 'fr' } });
    expect(await screen.findByRole('heading', { name: 'Document 12' })).toBeTruthy();
    expect(screen.getByText(/Page 1 of 1/)).toBeTruthy();
    expect(apiRequest.mock.calls.some(([, url]) => String(url).includes('offset=0') && String(url).includes('language=fr'))).toBe(true);
    fireEvent.change(screen.getByLabelText('Search legal inventory'), { target: { value: 'does not exist' } });
    expect(await screen.findByText(/No legal documents match these filters/)).toBeTruthy();
    expect(screen.getByText(/0 matching legal entries · 14 accessible inventory entries/)).toBeTruthy();
  });

  it('does not render stale entries or claim an empty inventory when a filtered read fails, and retries the same filter', async () => {
    let failed = false;
    apiRequest.mockImplementation(async () => failed ? json({ message: 'Current legal inventory access could not be verified.' }, 503) : inventory([document(1)], 1));
    render(<CompanyLegalInventory revision={1} includeArchived={false} renderDocument={item => <h4>{item.title}</h4>} />);
    await screen.findByRole('heading', { name: 'Document 01' }); failed = true;
    fireEvent.change(screen.getByLabelText('Filter by validity'), { target: { value: 'approved' } });
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Current legal inventory access could not be verified. Retry legal inventory');
    expect(screen.queryByRole('heading', { name: 'Document 01' })).toBeNull();
    expect(screen.queryByText(/No legal documents are available/)).toBeNull();
    failed = false; fireEvent.click(screen.getByRole('button', { name: 'Retry legal inventory' }));
    expect(await screen.findByRole('heading', { name: 'Document 01' })).toBeTruthy();
    expect(apiRequest.mock.calls.filter(([, url]) => String(url).includes('validity=approved'))).toHaveLength(2);
  });
});

describe('Company Vault picker recovery and paging', () => {
  it('retries the same failed query and reads later results without discarding the selection contract', async () => {
    const choose = vi.fn(); let failed = true;
    apiRequest.mockImplementation(async (_method, url) => {
      if (failed) return json({ message: 'The Vault search is temporarily unavailable.' }, 500);
      const later = String(url).includes('offset=25');
      return json({ data: { scope: 'verified-accessible-programs', query: 'original', total: 26, limit: 25, results: [{ id: later ? 'last-version' : 'first-version', title: later ? 'Later original' : 'First original', current: true, version: '2', program: { id: 'admitted-project', name: 'Project' } }] } });
    });
    render(<CompanyVaultPicker disabled={false} onChoose={choose} />);
    fireEvent.change(screen.getByLabelText('Search your accessible Vaults'), { target: { value: 'original' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search Vault' }));
    await screen.findByRole('button', { name: 'Retry Vault search' });
    expect(screen.queryByText(/No matching documents on this page/)).toBeNull();
    failed = false; fireEvent.click(screen.getByRole('button', { name: 'Retry Vault search' }));
    await screen.findByText('First original');
    fireEvent.click(screen.getByRole('button', { name: 'Next Vault results' }));
    await screen.findByText('Later original');
    fireEvent.click(screen.getByRole('button', { name: 'Select document' }));
    expect(choose).toHaveBeenCalledWith(expect.objectContaining({ id: 'last-version', program: { id: 'admitted-project', name: 'Project' } }));
    await waitFor(() => expect(apiRequest.mock.calls.some(([, url]) => String(url).includes('offset=25'))).toBe(true));
  });
});
