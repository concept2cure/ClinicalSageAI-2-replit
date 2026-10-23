// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { CompanyLegalDocument } from '@shared/company-documents';
import { seedCompanySession } from './_company-session-fixture';
const apiRequest = vi.hoisted(() => vi.fn());
const downloadBlob = vi.hoisted(() => vi.fn(() => true));
vi.mock('@/lib/queryClient', async importOriginal => ({ ...(await importOriginal<typeof import('@/lib/queryClient')>()), apiRequest }));
vi.mock('../download', () => ({ downloadBlob }));
import { authService } from '@/services/portal/authService';
import { InsightsLegalPackage } from '../surfaces/InsightsLegalPackage';
const bundleId = '33333333-3333-4333-8333-333333333333';
const document: CompanyLegalDocument = { id: 'legal-one', title: 'Signed company authorization', kind: 'authorization',
  programId: '11111111-1111-4111-8111-111111111111', vaultDocumentId: '22222222-2222-4222-8222-222222222222',
  contentHash: 'a'.repeat(64), version: '3', agencies: ['FDA'], countries: ['US'], submissionTypes: ['ind'], language: 'en',
  effectiveOn: null, expiresOn: null, active: true, registeredAt: '2026-10-01T00:00:00Z', registeredBy: '7', transmitRefusal: null };
const library = (documents = [document]) => ({ ok: true, status: 200, json: async () => ({ data: documents,
  page: { total: documents.length, availableTotal: documents.length, offset: 0, limit: 25, hasMore: false, nextOffset: null } }) });
const blob = new Blob(['actual-server-zip'], { type: 'application/zip' });
const zipResponse = () => ({ ok: true, blob: async () => blob });
const posts = () => apiRequest.mock.calls.filter(([method]) => method === 'POST');
async function choose() {
  render(<InsightsLegalPackage bundleId={bundleId} disabled={false} />);
  fireEvent.click(screen.getByRole('button', { name: /Choose legal companions/ }));
  const checkbox = await screen.findByRole('checkbox'); fireEvent.click(checkbox);
}
beforeEach(() => {
  localStorage.clear(); sessionStorage.clear(); seedCompanySession();
  apiRequest.mockReset().mockImplementation(async method => method === 'GET' ? library() : zipResponse());
  downloadBlob.mockReset().mockReturnValue(true);
});
afterEach(() => { cleanup(); authService.endSession(null); vi.unstubAllGlobals(); });

describe('explicit legal companions for a report archive', () => {
  it('loads only on request and selects nothing automatically', async () => {
    render(<InsightsLegalPackage bundleId={bundleId} disabled={false} />);
    expect(apiRequest).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /Choose legal companions/ }));
    expect((await screen.findByRole('checkbox') as HTMLInputElement).checked).toBe(false);
    expect((screen.getByRole('button', { name: /Download reports and 0/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/Selection does not determine agency acceptance/)).toBeTruthy(); expect(posts()).toHaveLength(0);
  });
  it('posts explicit IDs once and saves the exact server ZIP separately from existing PDF exports', async () => {
    await choose();
    const button = screen.getByRole('button', { name: /Download reports and 1/ });
    fireEvent.click(button);
    await waitFor(() => expect(downloadBlob).toHaveBeenCalledTimes(1));
    expect(posts()).toEqual([['POST', `/api/report-os/bundles/${bundleId}/export.zip`, { legalDocumentIds: ['legal-one'] }]]);
    expect(downloadBlob).toHaveBeenCalledWith('report-package-33333333.zip', blob);
    expect(screen.getByText(/Keep this ZIP and its manifest/).textContent).toContain('Keep this ZIP and its manifest');
    expect(screen.getByText(/Keep this ZIP and its manifest/).getAttribute('role')).toBe('status');
  });
  it('shows expiry and approval refusals and disables those originals', async () => {
    apiRequest.mockResolvedValue(library([{ ...document, expiresOn: '2000-01-01' }, { ...document, id: 'unapproved', title: 'Draft legal document', transmitRefusal: 'Not approved' }]));
    render(<InsightsLegalPackage bundleId={bundleId} disabled={false} />);
    fireEvent.click(screen.getByRole('button', { name: /Choose legal companions/ }));
    const checkboxes = await screen.findAllByRole('checkbox'); expect(checkboxes.every(box => (box as HTMLInputElement).disabled)).toBe(true);
    expect(screen.getByText(/document has expired/)).toBeTruthy(); expect(screen.getByText(/Not approved/)).toBeTruthy();
  });
  it('refreshes current metadata and clears old selections', async () => {
    await choose(); fireEvent.click(screen.getByRole('button', { name: /Refresh legal companions/ }));
    await waitFor(() => expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(false));
    expect((screen.getByRole('button', { name: /Download reports and 0/ }) as HTMLButtonElement).disabled).toBe(true);
  });
  it('shows a library failure with refresh available and no selectable cached originals', async () => {
    apiRequest.mockResolvedValue({ ok: false, status: 503, json: async () => ({ message: 'Library unavailable' }) });
    render(<InsightsLegalPackage bundleId={bundleId} disabled={false} />);
    fireEvent.click(screen.getByRole('button', { name: /Choose legal companions/ }));
    expect(await screen.findByText('Library unavailable')).toBeTruthy(); expect(screen.queryByRole('checkbox')).toBeNull();
    expect((screen.getByRole('button', { name: /Refresh legal companions/ }) as HTMLButtonElement).disabled).toBe(false);
  });
  it('reports a library transport failure through the canonical generic alert and allows retry', async () => {
    apiRequest.mockRejectedValue(new TypeError('Private transport failure details'));
    render(<InsightsLegalPackage bundleId={bundleId} disabled={false} />);
    fireEvent.click(screen.getByRole('button', { name: /Choose legal companions/ }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/could not|didn't reach the server/i);
    expect(screen.queryByText(/Private transport failure details/)).toBeNull();
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect((screen.getByRole('button', { name: 'Retry legal version search' }) as HTMLButtonElement).disabled).toBe(false);
    expect(posts()).toHaveLength(0);
  });
  it('reports a current server approval refusal without claiming a saved ZIP', async () => {
    await choose(); apiRequest.mockResolvedValue({ ok: false, json: async () => ({ error: { message: 'Approval withdrawn' } }) });
    fireEvent.click(screen.getByRole('button', { name: /Download reports and 1/ }));
    expect(await screen.findByText(/No file saved — Approval withdrawn/)).toBeTruthy(); expect(downloadBlob).not.toHaveBeenCalled();
  });
  it('suppresses duplicate dispatch while the archive is pending', async () => {
    await choose(); let resolve!: (value: unknown) => void;
    apiRequest.mockReturnValue(new Promise(value => { resolve = value; }));
    const button = screen.getByRole('button', { name: /Download reports and 1/ });
    act(() => { fireEvent.click(button); fireEvent.click(button); }); expect(posts()).toHaveLength(1);
    await act(async () => { resolve(zipResponse()); });
    await waitFor(() => expect(downloadBlob).toHaveBeenCalledTimes(1));
  });
  it('discards delayed ZIP bytes after a session change and clears library selections', async () => {
    await choose(); let resolve!: (value: Blob) => void;
    apiRequest.mockResolvedValue({ ok: true, blob: () => new Promise<Blob>(value => { resolve = value; }) });
    fireEvent.click(screen.getByRole('button', { name: /Download reports and 1/ }));
    await waitFor(() => expect(resolve).toBeTypeOf('function'));
    act(() => authService.endSession(null));
    await act(async () => { resolve(blob); });
    expect(downloadBlob).not.toHaveBeenCalled(); expect(screen.queryByRole('checkbox')).toBeNull();
  });
});


it('lets the reader explicitly choose published organization-wide stationery without auto-selecting scoped designs', async () => {
  await choose();
  const variantId = '77777777-7777-4777-8777-777777777777';
  apiRequest.mockImplementation(async (method, url) => method === 'POST' ? zipResponse() : url.includes('/designs?')
    ? { ok: true, json: async () => ({ data: [
      { id: variantId, name: 'Published company design', state: 'published', publishedRevision: 17, scope: { programId: null, market: null, language: null, subsidiary: null } },
      { id: 'restricted', name: 'French language design', state: 'published', publishedRevision: 18, scope: { programId: null, market: null, language: 'fr', subsidiary: null } },
    ], nextBefore: null }) } : library());
  fireEvent.click(screen.getByRole('button', { name: /Choose published stationery/ }));
  await screen.findByRole('option', { name: /Published company design/ });
  expect((screen.getByRole('option', { name: /French language design/ }) as HTMLOptionElement).disabled).toBe(true);
  expect((screen.getByRole('combobox', { name: 'Report stationery' }) as HTMLSelectElement).value).toBe('');
  fireEvent.change(screen.getByRole('combobox', { name: 'Report stationery' }), { target: { value: variantId } });
  fireEvent.click(screen.getByRole('button', { name: /Download reports and 1/ }));
  await waitFor(() => expect(downloadBlob).toHaveBeenCalledTimes(1));
  expect(posts()[0][2]).toEqual({ legalDocumentIds: ['legal-one'], variantId });
});
