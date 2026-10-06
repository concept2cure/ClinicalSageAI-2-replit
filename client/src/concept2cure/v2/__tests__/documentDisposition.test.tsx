// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { DocumentDispositionPreview } from '@shared/document-data-disposition';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async original => ({ ...(await original<Record<string, unknown>>()), apiRequest }));
import { DocumentDisposition } from '../surfaces/DocumentDisposition';

const PROJECT = '11111111-1111-4111-8111-111111111111';
const TARGET = '12';
const REASON = 'The sponsor approved this source lifecycle change.';
const url = `/api/c2c/projects/${PROJECT}/document-dispositions`;
const reply = (status: number, body: unknown) => ({ ok: status < 400, status, json: async () => body }) as Response;
function preview(overrides: Partial<DocumentDispositionPreview> = {}): DocumentDispositionPreview {
  return {
    target: { type: 'captured_source', id: TARGET, title: 'Protocol.pdf', sha256: 'a'.repeat(64) },
    linkedIds: { capturedSourceIds: [12], vaultDocumentIds: ['vault-1'], artifactIds: ['artifact-1'], uploadIds: ['upload-1'] },
    counts: { extractedTexts: 1, chunks: 18, atoms: 4, catalogValues: 6, citations: 3, downstreamReferences: 2 },
    retention: { legalHolds: 0, retentionUntil: null, physicalErasure: false }, approvals: { active: 0 }, blockers: [],
    replacement: null, allowedChoices: ['keep_data', 'remove_data', 'supersede'], previewToken: 'signed-preview',
    expiresAt: new Date(Date.now() + 600_000).toISOString(), currentDisposition: null, ...overrides,
  };
}
function pane() {
  const onChanged = vi.fn();
  render(<DocumentDisposition projectId={PROJECT} targetType="captured_source" targetId={TARGET} title="Protocol.pdf" onChanged={onChanged} />);
  fireEvent.click(screen.getByRole('button', { name: 'Review removal of Protocol.pdf' }));
  return onChanged;
}
const confirm = () => screen.getByRole('button', { name: 'Confirm this decision' }) as HTMLButtonElement;
const choose = (name: RegExp) => fireEvent.click(screen.getByRole('radio', { name }));
const reason = () => fireEvent.change(screen.getByRole('textbox', { name: 'Reason for this decision' }), { target: { value: REASON } });
const posts = () => apiRequest.mock.calls.filter(([m]) => m === 'POST');
beforeEach(() => { apiRequest.mockReset(); apiRequest.mockResolvedValue(reply(200, { preview: preview() })); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('project file decision', () => {
  it('loads real counts and hash, requires deliberate choice and a reason', async () => {
    pane();
    await screen.findByText('a'.repeat(64));
    expect(screen.getByText('18')).toBeTruthy();
    expect(screen.getByText('Downstream references')).toBeTruthy();
    expect(screen.getAllByRole('radio').every(r => !(r as HTMLInputElement).checked)).toBe(true);
    expect(confirm().disabled).toBe(true);
    choose(/Remove file; retain extracted data/);
    expect(confirm().disabled).toBe(true);
    reason(); expect(confirm().disabled).toBe(false);
    expect(posts()).toHaveLength(0);
  });

  it.each([
    ['keep_data', /Remove file; retain extracted data/],
    ['remove_data', /Remove file and withdraw extracted data/],
  ] as const)('records only the selected %s choice against its preview token', async (choice, label) => {
    apiRequest.mockImplementation(async (method: string) => method === 'GET' ? reply(200, { preview: preview() }) : reply(200, {
      disposition: { id: 'decision-1', target: preview().target, choice, auditReceipt: { id: 'receipt-1', sha256Chain: 'b'.repeat(64) } },
    }));
    const changed = pane(); await screen.findByText('a'.repeat(64)); choose(label); reason(); fireEvent.click(confirm());
    await waitFor(() => expect(changed).toHaveBeenCalledOnce());
    expect(posts()[0]).toEqual(['POST', url, { targetType: 'captured_source', targetId: TARGET, choice, reason: REASON, previewToken: 'signed-preview' }]);
    expect(screen.getByRole('status').textContent).toMatch(/recorded with your reason/);
  });

  it('supersedes only after the named replacement identity and hash were previewed', async () => {
    const replacement = { type: 'captured_source' as const, id: '13', title: 'Protocol v2.pdf', sha256: 'c'.repeat(64) };
    apiRequest.mockImplementation(async (method: string, requestUrl: string) => method === 'GET'
      ? reply(200, { preview: preview(requestUrl.includes('replacementId=13') ? { replacement, previewToken: 'replacement-preview' } : {}) })
      : reply(200, { disposition: { id: 'decision-2', target: preview().target, choice: 'supersede', auditReceipt: { id: 'receipt-2', sha256Chain: 'b'.repeat(64) } } }));
    const changed = pane(); await screen.findByText('a'.repeat(64)); choose(/Replace with a named newer document/); reason();
    fireEvent.change(screen.getByRole('textbox', { name: 'Exact replacement document ID' }), { target: { value: '13' } });
    expect(confirm().disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Review replacement and impact' }));
    await screen.findByText('Protocol v2.pdf'); expect(confirm().disabled).toBe(false); fireEvent.click(confirm());
    await waitFor(() => expect(changed).toHaveBeenCalledOnce());
    expect(posts()[0][2]).toMatchObject({ choice: 'supersede', replacementId: '13', previewToken: 'replacement-preview' });
  });

  it('cancel makes no mutation and ignores a preview arriving afterwards', async () => {
    let resolve!: (r: Response) => void;
    apiRequest.mockReturnValue(new Promise<Response>(r => { resolve = r; }));
    const changed = pane(); fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await act(async () => { resolve(reply(200, { preview: preview() })); });
    await waitFor(() => expect(screen.queryByText('a'.repeat(64))).toBeNull());
    expect(posts()).toHaveLength(0); expect(changed).not.toHaveBeenCalled();
  });

  it.each(['An active legal hold blocks this decision.', 'An active approval blocks this decision.'])('shows %s and refuses confirmation', async blocker => {
    apiRequest.mockResolvedValue(reply(200, { preview: preview({ blockers: [blocker], allowedChoices: [],
      retention: { legalHolds: 1, retentionUntil: '2099-01-01', physicalErasure: false }, approvals: { active: 1 } }) }));
    pane(); await screen.findByText(blocker); choose(/Remove file and withdraw extracted data/); reason();
    expect(confirm().disabled).toBe(true); expect(posts()).toHaveLength(0);
  });

  it.each([null, undefined, -1, 0.5, NaN])('an unknown or invalid impact count (%s) cannot become zero or authorize a decision', async value => {
    const p = preview(); (p.counts as Record<string, unknown>).chunks = value;
    apiRequest.mockResolvedValue(reply(200, { preview: p })); pane();
    await screen.findByText(/impact read was incomplete/); choose(/Remove file; retain extracted data/); reason();
    expect(confirm().disabled).toBe(true); expect(screen.queryByText('Retrieval passages')).toBeNull(); expect(posts()).toHaveLength(0);
  });

  it('an expired preview cannot authorize a decision', async () => {
    apiRequest.mockResolvedValue(reply(200, { preview: preview({ expiresAt: new Date(Date.now() - 1000).toISOString() }) }));
    pane(); await screen.findByText(/preview has expired/); choose(/Remove file; retain extracted data/); reason();
    expect(confirm().disabled).toBe(true); expect(posts()).toHaveLength(0);
  });

  it('retained data can later be withdrawn while the prior decision remains visible', async () => {
    const p = preview({ currentDisposition: { id: 'prior-retention-receipt', choice: 'keep_data', createdAt: '2026-10-06', replacementId: null }, allowedChoices: ['remove_data', 'supersede'] });
    apiRequest.mockImplementation(async method => method === 'GET' ? reply(200, { preview: p }) : reply(201, {
      disposition: { id: 'later-withdrawal', target: p.target, choice: 'remove_data', previousDispositionId: 'prior-retention-receipt', auditReceipt: { id: 'receipt-2', sha256Chain: 'b'.repeat(64) } },
    }));
    const changed = pane(); await screen.findByText(/earlier retention decision and its receipt remain recorded/);
    expect((screen.getByRole('radio', { name: /Remove file; retain extracted data/ }) as HTMLInputElement).disabled).toBe(true);
    choose(/Remove file and withdraw extracted data/); reason(); expect(confirm().disabled).toBe(false); fireEvent.click(confirm());
    await waitFor(() => expect(changed).toHaveBeenCalledOnce());
    expect(posts()[0][2]).toMatchObject({ choice: 'remove_data', previewToken: p.previewToken });
  });

  it('editing the replacement invalidates its preview and ignores the older read', async () => {
    const p = preview(); let resolve!: (r: Response) => void;
    apiRequest.mockResolvedValueOnce(reply(200, { preview: p })).mockReturnValueOnce(new Promise<Response>(r => { resolve = r; }));
    pane(); await screen.findByText('a'.repeat(64)); choose(/Replace with a named newer document/); reason();
    const input = screen.getByRole('textbox', { name: 'Exact replacement document ID' });
    fireEvent.change(input, { target: { value: '13' } }); fireEvent.click(screen.getByRole('button', { name: 'Review replacement and impact' }));
    fireEvent.change(input, { target: { value: '14' } });
    await act(async () => { resolve(reply(200, { preview: preview({ replacement: { type: 'captured_source', id: '13', title: 'Old response', sha256: 'c'.repeat(64) } }) })); });
    await waitFor(() => expect(confirm().disabled).toBe(true));
    expect(screen.queryByText('Old response')).toBeNull(); expect(posts()).toHaveLength(0);
  });

  it('a stale-token server refusal preserves the reason, refreshes no rows and requires another preview', async () => {
    apiRequest.mockImplementation(async method => method === 'GET' ? reply(200, { preview: preview() }) : reply(409, { message: 'The source changed. Reload the impact.' }));
    const changed = pane(); await screen.findByText('a'.repeat(64)); choose(/Remove file; retain extracted data/); reason(); fireEvent.click(confirm());
    await screen.findByText(/source changed/); expect(changed).not.toHaveBeenCalled();
    expect((screen.getByRole('textbox', { name: 'Reason for this decision' }) as HTMLTextAreaElement).value).toBe(REASON);
    expect(confirm().disabled).toBe(true); fireEvent.click(confirm()); expect(posts()).toHaveLength(1);
  });

  it('a success-shaped response missing its audit receipt cannot claim or refresh a saved change', async () => {
    apiRequest.mockImplementation(async method => method === 'GET' ? reply(200, { preview: preview() }) : reply(200, { success: true }));
    const changed = pane(); await screen.findByText('a'.repeat(64)); choose(/Remove file; retain extracted data/); reason(); fireEvent.click(confirm());
    await screen.findByText(/response did not confirm a recorded decision/); expect(changed).not.toHaveBeenCalled(); expect(confirm().disabled).toBe(true);
  });
});
