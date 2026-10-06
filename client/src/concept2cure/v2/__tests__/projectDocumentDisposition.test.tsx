// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { DocumentDispositionChoice } from '@shared/document-data-disposition';
const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async original => ({ ...(await original<Record<string, unknown>>()), apiRequest }));
import { ProjectHome } from '../surfaces/ProjectHome';
import { Vault } from '../surfaces/Vault';
import { PID, DOC_ID, ok, props, uploadDoc, cabinetTree, vaultPayload, mockVaultApi } from './_vault-surface-fixtures';

const source = (over: Record<string, unknown> = {}) => ({ id: 1, title: 'Protocol.pdf', checksum: 'a'.repeat(64), ingestionStatus: 'ingested',
  extractionStatus: 'extracted', createdAt: '2026-10-06', mimeType: 'application/pdf', fileSize: 1400, artifactId: null,
  origin: 'chat_upload', extractionMethod: 'pdf-text', isCurrent: true, dataEligible: true, originalFileAvailable: true, ...over });
const preview = () => ({ target: { type: 'captured_source', id: '1', title: 'Protocol.pdf', sha256: 'a'.repeat(64) },
  linkedIds: { capturedSourceIds: [1], vaultDocumentIds: [], artifactIds: [], uploadIds: ['upload-1'] },
  counts: { extractedTexts: 1, chunks: 2, atoms: 3, catalogValues: 4, citations: 5, downstreamReferences: 6 },
  retention: { legalHolds: 0, retentionUntil: null, physicalErasure: false }, approvals: { active: 0 }, blockers: [],
  replacement: null, allowedChoices: ['keep_data', 'remove_data', 'supersede'], previewToken: 'review-token',
  expiresAt: new Date(Date.now() + 600_000).toISOString(), currentDisposition: null });
beforeEach(() => { apiRequest.mockReset(); window.C2C_PROJECT = { id: PID, title: 'Program', code: 'PRG', ws: '', status: 'active' }; });
afterEach(() => { cleanup(); delete window.C2C_PROJECT; delete window.C2C_SOURCE_PINS; });

describe('reachable project document lifecycle controls', () => {
  it.each(['keep_data', 'remove_data'] as const)('DataRoom refresh applies %s eligibility to both local and handed-off pins', async choice => {
    let disposition: DocumentDispositionChoice | null = null;
    apiRequest.mockImplementation(async (method: string, url: string) => {
      if (url === `/api/c2c/projects/${PID}/sources`) return ok({ sources: [source({ disposition, dataEligible: disposition !== 'remove_data', originalFileAvailable: disposition === null })] });
      if (url === `/api/c2c/projects/${PID}`) return ok({ id: PID, name: 'Program', code: 'PRG' });
      if (url.includes('/document-dispositions/preview')) return ok({ preview: preview() });
      if (method === 'POST' && url.endsWith('/document-dispositions')) {
        disposition = choice;
        return ok({ disposition: { id: 'decision-1', target: preview().target, choice, auditReceipt: { id: 'receipt-1', sha256Chain: 'b'.repeat(64) } } });
      }
      return ok({});
    });
    const onAsk = vi.fn(); render(<ProjectHome {...props()} onAsk={onAsk} />);
    const pin = await screen.findByRole('checkbox', { name: 'Use Protocol.pdf as context' });
    fireEvent.click(pin); fireEvent.click(screen.getByRole('button', { name: /Draft with 1 pinned source/ }));
    expect(window.C2C_SOURCE_PINS).toEqual(['1']);
    fireEvent.click(screen.getByRole('button', { name: 'Review removal of Protocol.pdf' }));
    await screen.findByText('a'.repeat(64));
    fireEvent.click(screen.getByRole('radio', { name: choice === 'keep_data' ? /Remove file; retain extracted data/ : /Remove file and withdraw extracted data/ }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Reason for this decision' }), { target: { value: 'The sponsor approved this source lifecycle change.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm this decision' }));
    await screen.findByText(choice === 'keep_data' ? 'Data retained · original unavailable' : 'Data withdrawn');
    await waitFor(() => expect((screen.getByRole('checkbox', { name: 'Use Protocol.pdf as context' }) as HTMLInputElement).disabled).toBe(choice === 'remove_data'));
    expect(window.C2C_SOURCE_PINS).toEqual(choice === 'keep_data' ? ['1'] : []);
    expect(Boolean(screen.queryByRole('button', { name: /Draft with 1 pinned source/ }))).toBe(choice === 'keep_data');
    expect(Boolean(screen.queryByRole('button', { name: 'Review removal of Protocol.pdf' }))).toBe(choice === 'keep_data');
  });

  it('superseded data remains visible as history and cannot be pinned', async () => {
    apiRequest.mockImplementation(async (_method: string, url: string) => url.endsWith('/sources')
      ? ok({ sources: [source({ disposition: 'supersede', dataEligible: false, originalFileAvailable: false })] }) : ok({}));
    render(<ProjectHome {...props()} />);
    expect((await screen.findByRole('checkbox', { name: 'Use Protocol.pdf as context' }) as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByText('Replaced by newer data')).toBeTruthy();
  });

  it('selected Vault upload exposes the preview decision control', async () => {
    mockVaultApi(apiRequest, () => ok(vaultPayload()));
    render(<Vault {...props()} />);
    expect(await screen.findByRole('button', { name: 'Review removal of stability-summary-24m' })).toBeTruthy();
  });

  it('retained Vault data has no download promise for unavailable original bytes', async () => {
    mockVaultApi(apiRequest, () => ok(vaultPayload({ tree: cabinetTree([uploadDoc({ docId: DOC_ID, originalFileAvailable: false, disposition: 'keep_data' })]) })));
    render(<Vault {...props()} />);
    expect((await screen.findByRole('button', { name: 'Download' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/Original file unavailable\. Retained extracted data/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Review removal of stability-summary-24m' }).textContent).toBe('Manage retained data');
  });

  it('retained search-only Vault selection preserves its unavailable original and lifecycle state', async () => {
    apiRequest.mockImplementation(async (_method: string, url: string) => {
      if (url.includes('/search?')) return ok({ success: true, data: { query: 'retained', total: 1, limit: 100, offset: 0, results: [{
        id: '33333333-3333-4333-8333-333333333333', title: 'Retained search record', fileName: 'retained.pdf', documentType: 'REPORT',
        size: '1.0 MB', folderId: null, ctdSection: null, placementStatus: 'unfiled', snippet: 'Stored retained extraction',
        originalFileAvailable: false, disposition: 'keep_data',
      }] } });
      if (url === `/api/c2c/project-vault/${PID}`) return ok(vaultPayload());
      if (url.endsWith('/history')) return ok({ success: true, data: { entries: [], chain: { store: 'audit_logs', ok: true, rowsChecked: 0, legacyRows: 0, sequencedRows: 0 } } });
      if (url.endsWith('/versions')) return ok({ success: true, data: { versions: [] } });
      if (url.endsWith('/relationships')) return ok({ success: true, data: { relationships: [] } });
      if (url.endsWith('/annotations')) return ok({ success: true, data: { annotations: [], openByVersion: [] } });
      return ok({});
    });
    render(<Vault {...props()} />);
    fireEvent.change(await screen.findByLabelText('Search this vault'), { target: { value: 'retained' } });
    await screen.findByRole('button', { name: 'Review removal of Retained search record' });
    expect((screen.getByRole('button', { name: 'Download' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'Review removal of Retained search record' }).textContent).toBe('Manage retained data');
  });
});
