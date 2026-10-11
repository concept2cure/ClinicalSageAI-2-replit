// @vitest-environment jsdom
/**
 * Catalog record in the Vault detail pane (S4, D5): AnA's description is shown
 * as her suggestion, with its model; a person confirms the revision they were
 * shown, or corrects it with a reason; a reader is told their role cannot
 * decide; a failed read is said, never shown as "no description".
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { VaultCatalogRecord } from '../surfaces/VaultCatalogRecord';

const PROJECT = '11111111-1111-4111-8111-111111111111';
const DOC = '22222222-2222-4222-8222-222222222222';
const REASON = 'A CoA is filed with its batch record in this program.';
const reply = (status: number, data: unknown) => ({ ok: status < 400, status, json: async () => data }) as Response;
const RECORD = {
  contentHash: 'a'.repeat(64), revision: '2026-10-08 17:00:00.123456+00', canWrite: true, state: 'suggested',
  documentKind: 'cert', purpose: 'Release evidence for batch 23-104.', summary: 'Assay 99.2 % of label claim.',
  keyData: { batch: '23-104', assay_pct: 99.2 }, proposedBy: 'agent:ana', proposedModel: 'claude-test-model',
  proposedAt: '2026-10-08T17:00:00.000Z', confirmedBy: null, confirmedAt: null, correctionReason: null,
  extractionStatus: 'cataloged',
};

function renderPane(record: Record<string, unknown> = RECORD) {
  apiRequest.mockResolvedValueOnce(reply(200, { success: true, data: record }));
  const onSaved = vi.fn();
  render(<VaultCatalogRecord projectId={PROJECT} documentId={DOC} onSaved={onSaved} />);
  return { onSaved };
}

beforeEach(() => apiRequest.mockReset());
afterEach(cleanup);

describe('Catalog record', () => {
  it("shows AnA's suggestion with its model, and every key data value", async () => {
    renderPane();
    const line = await screen.findByTestId('vault-catalog-provenance');
    expect(line.textContent).toContain('Suggested by AnA (claude-test-model) on 2026-10-08 17:00 UTC');
    expect(line.textContent).toContain('Not yet confirmed by a person');
    const pane = screen.getByTestId('vault-catalog-record');
    expect(pane.textContent).toContain('23-104');
    expect(pane.textContent).toContain('99.2');
  });

  it('confirms the revision it was shown, and claims it only once the server says so', async () => {
    const { onSaved } = renderPane();
    const confirm = await screen.findByTestId('vault-catalog-confirm');
    apiRequest.mockResolvedValueOnce(reply(200, { success: true, state: 'confirmed', changes: [] }));
    apiRequest.mockResolvedValueOnce(reply(200, { success: true, data: { ...RECORD, state: 'confirmed' } }));
    fireEvent.click(confirm);
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    const [method, url, body] = apiRequest.mock.calls[1];
    expect(method).toBe('POST');
    expect(url).toBe(`/api/c2c/project-vault/${PROJECT}/documents/${DOC}/catalog/confirm`);
    expect(body).toEqual({ contentHash: RECORD.contentHash, revision: RECORD.revision });
  });

  it('will not save a correction without a reason of the required length', async () => {
    renderPane();
    fireEvent.click(await screen.findByTestId('vault-catalog-correct'));
    const save = screen.getByTestId('vault-catalog-correct-save') as HTMLButtonElement;
    fireEvent.change(screen.getByTestId('vault-catalog-kind'), { target: { value: 'batch_record' } });
    expect(save.disabled).toBe(true);
    fireEvent.change(screen.getByTestId('vault-catalog-reason'), { target: { value: REASON } });
    expect(save.disabled).toBe(false);
  });

  it("a reader is told their role cannot decide, and gets no button", async () => {
    renderPane({ ...RECORD, canWrite: false });
    expect((await screen.findByTestId('vault-catalog-readonly')).textContent).toMatch(/can read this record but not confirm/);
    expect(screen.queryByTestId('vault-catalog-confirm')).toBeNull();
    expect(screen.queryByTestId('vault-catalog-correct')).toBeNull();
  });

  it('a failed read is said, not shown as no description', async () => {
    apiRequest.mockResolvedValueOnce(reply(500, { success: false, message: 'Database unavailable.' }));
    render(<VaultCatalogRecord projectId={PROJECT} documentId={DOC} onSaved={vi.fn()} />);
    expect((await screen.findByTestId('vault-catalog-error')).textContent).toMatch(/could not be read/);
    expect(screen.queryByTestId('vault-catalog-empty')).toBeNull();
  });

  it('a version with no description says so', async () => {
    renderPane({ ...RECORD, state: null, documentKind: null, purpose: null, summary: null, keyData: null });
    expect((await screen.findByTestId('vault-catalog-empty')).textContent).toMatch(/No description is recorded/);
  });
});
