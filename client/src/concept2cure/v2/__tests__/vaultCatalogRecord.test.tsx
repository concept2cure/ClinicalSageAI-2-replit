// @vitest-environment jsdom
/**
 * Catalog record in the Vault detail pane (S4, D5): AnA's description is shown
 * as her suggestion, with its model; a person confirms the revision they were
 * shown, or corrects it with a reason; a reader is told their role cannot
 * decide; a failed read is said, never shown as "no description".
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';

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

describe('Catalog check coverage and review receipts', () => {
  it('keeps legacy human attribution while disclosing the limits of key data checks', async () => {
    renderPane({
      ...RECORD, state: 'confirmed', confirmedBy: { id: 41, name: 'Dr. Mei Chen' },
      confirmedAt: '2026-10-09T12:00:00.000Z',
      checkScope: { kind: 'legacy_value_presence', context: 'not_recorded', scientificQualification: 'unassessed' },
    });
    const provenance = await screen.findByTestId('vault-catalog-provenance');
    expect(provenance.textContent).toContain('Confirmed as written by Dr. Mei Chen on 2026-10-09 12:00 UTC');
    const scope = screen.getByTestId('vault-catalog-check-scope');
    expect(scope.textContent).toMatch(/value presence/i);
    expect(scope.textContent).toMatch(/label and context verification is not recorded/i);
    expect(scope.textContent).toMatch(/scientific qualification is unassessed/i);
    expect(screen.getByTestId('vault-catalog-record').textContent).not.toMatch(/scientifically verified|facts accepted/i);
  });

  it('does not invent a past context check when an older record has no scope fields', async () => {
    renderPane();
    expect((await screen.findByTestId('vault-catalog-check-scope')).textContent)
      .toMatch(/label and context verification is not recorded/i);
  });

  it('binds confirmation to the exact extraction shown when its digest is available', async () => {
    const extractedTextSha256 = 'b'.repeat(64);
    const { onSaved } = renderPane({ ...RECORD, extractedTextSha256 });
    const confirm = await screen.findByTestId('vault-catalog-confirm');
    apiRequest.mockResolvedValueOnce(reply(200, { success: true, state: 'confirmed', changes: [] }));
    apiRequest.mockResolvedValueOnce(reply(200, { success: true, data: { ...RECORD, state: 'confirmed', extractedTextSha256 } }));
    fireEvent.click(confirm);
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(apiRequest.mock.calls[1][2]).toEqual({
      contentHash: RECORD.contentHash, revision: RECORD.revision, expectedExtractedTextSha256: extractedTextSha256,
    });
  });

  it('shows a changed-extraction refusal without claiming that confirmation was recorded', async () => {
    const { onSaved } = renderPane({ ...RECORD, extractedTextSha256: 'b'.repeat(64) });
    const confirm = await screen.findByTestId('vault-catalog-confirm');
    apiRequest.mockResolvedValueOnce(reply(409, { success: false, message: 'The extracted text has changed. Reload the catalog record before deciding.' }));
    fireEvent.click(confirm);
    const note = await screen.findByTestId('vault-catalog-note');
    expect(note.textContent).toMatch(/record was not confirmed/i);
    expect(note.textContent).toMatch(/extracted text has changed/i);
    expect(note.textContent).not.toMatch(/Your confirmation is recorded/);
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('treats a failure envelope as a refusal even if its HTTP status is successful', async () => {
    const { onSaved } = renderPane();
    const confirm = await screen.findByTestId('vault-catalog-confirm');
    apiRequest.mockResolvedValueOnce(reply(200, { success: false, message: 'The source is no longer eligible for catalog review.' }));
    fireEvent.click(confirm);
    expect((await screen.findByTestId('vault-catalog-note')).textContent).toMatch(/source is no longer eligible/i);
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('does not claim a decision when the server gives no matching recorded-state receipt', async () => {
    const { onSaved } = renderPane();
    const confirm = await screen.findByTestId('vault-catalog-confirm');
    apiRequest.mockResolvedValueOnce(reply(200, { success: true }));
    fireEvent.click(confirm);
    expect((await screen.findByTestId('vault-catalog-note')).textContent).toMatch(/not known whether the record was confirmed/i);
    expect(onSaved).not.toHaveBeenCalled();
  });
});

describe('Catalog current use and retained history', () => {
  it('keeps a corrected historical record visible while explaining withdrawal and withholding actions', async () => {
    renderPane({
      ...RECORD, state: 'corrected', canWrite: false, confirmedBy: { id: 42, name: 'Dr. Ana Ruiz' },
      confirmedAt: '2026-10-10T09:00:00.000Z', correctionReason: REASON,
      currentUse: { eligible: false, reasonCode: 'SOURCE_DATA_WITHDRAWN', originalFileAvailable: false },
    });
    expect((await screen.findByTestId('vault-catalog-provenance')).textContent).toContain('Corrected by Dr. Ana Ruiz');
    expect(screen.getByTestId('vault-catalog-current-use').textContent).toMatch(/withdrawn from data use/i);
    expect(screen.getByTestId('vault-catalog-record').textContent).toContain(REASON);
    expect(screen.queryByTestId('vault-catalog-confirm')).toBeNull();
    expect(screen.queryByTestId('vault-catalog-correct')).toBeNull();
    expect(screen.getByTestId('vault-catalog-readonly').textContent).not.toMatch(/Your role/);
  });

  it('does not invite cataloging an unavailable source with no historical description', async () => {
    renderPane({
      ...RECORD, state: null, canWrite: false,
      currentUse: { eligible: false, reasonCode: 'SOURCE_SUPERSEDED', originalFileAvailable: true },
    });
    expect((await screen.findByTestId('vault-catalog-current-use')).textContent).toMatch(/superseded/i);
    expect(screen.getByTestId('vault-catalog-empty').textContent).toMatch(/No description is recorded/);
    expect(screen.getByTestId('vault-catalog-empty').textContent).not.toMatch(/ask AnA to catalog/i);
  });

  it('binds corrections to the extraction shown and preserves the whole-record reason', async () => {
    const extractedTextSha256 = 'c'.repeat(64);
    const { onSaved } = renderPane({ ...RECORD, extractedTextSha256 });
    fireEvent.click(await screen.findByTestId('vault-catalog-correct'));
    fireEvent.change(screen.getByTestId('vault-catalog-kind'), { target: { value: 'batch_record' } });
    fireEvent.change(screen.getByTestId('vault-catalog-reason'), { target: { value: REASON } });
    apiRequest.mockResolvedValueOnce(reply(200, { success: true, state: 'corrected', changes: ['document_kind'] }));
    apiRequest.mockResolvedValueOnce(reply(200, { success: true, data: { ...RECORD, state: 'corrected', extractedTextSha256 } }));
    fireEvent.click(screen.getByTestId('vault-catalog-correct-save'));
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(apiRequest.mock.calls[1][2]).toEqual({
      contentHash: RECORD.contentHash, revision: RECORD.revision, expectedExtractedTextSha256: extractedTextSha256,
      documentKind: 'batch_record', reason: REASON,
    });
  });
});

it('requires a successful scoped readback before retrying an unconfirmed decision', async () => {
  renderPane();
  const confirm = await screen.findByTestId('vault-catalog-confirm') as HTMLButtonElement;
  apiRequest.mockRejectedValueOnce(new Error('connection closed after request'));
  fireEvent.click(confirm);
  expect((await screen.findByTestId('vault-catalog-note')).textContent).toMatch(/not known whether the record was confirmed/i);
  expect(confirm.disabled).toBe(true);
  apiRequest.mockResolvedValueOnce(reply(503, { success: false, message: 'Catalog read unavailable' }));
  fireEvent.click(screen.getByRole('button', { name: 'Reload catalog record' }));
  await screen.findByTestId('vault-catalog-error');
  expect(screen.queryByTestId('vault-catalog-confirm')).toBeNull();
  apiRequest.mockResolvedValueOnce(reply(200, { success: true, data: {} }));
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  await screen.findByTestId('vault-catalog-error');
  expect(screen.queryByTestId('vault-catalog-confirm')).toBeNull();
  apiRequest.mockResolvedValueOnce(reply(200, { success: true, data: { ...RECORD, state: 'confirmed' } }));
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect((await screen.findByTestId('vault-catalog-provenance')).textContent).toMatch(/Confirmed as written/);
  expect(screen.queryByTestId('vault-catalog-confirm')).toBeNull();
  expect(apiRequest.mock.calls.filter(([method]) => method === 'POST')).toHaveLength(1);
});

it('does not adopt a late catalog response from a different programme and document scope', async () => {
  let resolveOld!: (value: Response) => void;
  apiRequest.mockReturnValueOnce(new Promise<Response>(resolve => { resolveOld = resolve; }));
  apiRequest.mockResolvedValueOnce(reply(200, { success: true, data: { ...RECORD, purpose: 'Current programme record' } }));
  const onSaved = vi.fn();
  const view = render(<VaultCatalogRecord projectId={PROJECT} documentId={DOC} onSaved={onSaved} />);
  view.rerender(<VaultCatalogRecord projectId="33333333-3333-4333-8333-333333333333" documentId="44444444-4444-4444-8444-444444444444" onSaved={onSaved} />);
  await screen.findByText('Current programme record');
  await act(async () => resolveOld(reply(200, { success: true, data: { ...RECORD, purpose: 'Prior programme record' } })));
  expect(screen.queryByText('Prior programme record')).toBeNull();
  expect(screen.getByText('Current programme record')).toBeTruthy();
});
