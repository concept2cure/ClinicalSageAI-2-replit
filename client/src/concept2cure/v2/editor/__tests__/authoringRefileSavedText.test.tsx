// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async original => ({ ...(await original<typeof import('@/lib/queryClient')>()), apiRequest }));
import { ApiRequestError } from '@/lib/queryClient';
import { useAuthoringRefileSavedText } from '../AuthoringRefileSavedText';
import { readRefileReceipt, type RefileSavedSource } from '../authoringRefileSavedTextState';

const source: RefileSavedSource = { documentId: '11000000-0000-4000-8000-000000000001',
  sectionId: '22000000-0000-4000-8000-000000000001', programId: '33000000-0000-4000-8000-000000000001',
  filingDocumentId: 'doc_native_contract', updatedAt: '2026-10-23T10:00:00Z', sectionCode: '3.2.S.1',
  sectionTitle: 'General information', documentTitle: 'Substance overview', filingTitle: 'Current IND filing' };
function receipt() { return { success: true, refiled: true, revision_created: false,
  source: { documentId: source.documentId, sectionId: source.sectionId, programId: source.programId,
    filingDocumentId: source.filingDocumentId, updatedAt: source.updatedAt },
  filing: { committed: true, documentId: source.filingDocumentId, sectionKey: source.sectionCode } }; }
const ok = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
const fireToast = vi.fn(); const onRefiled = vi.fn();
function Host({ selected = source, clean = true, refusal = null }: { selected?: RefileSavedSource; clean?: boolean; refusal?: string | null }) {
  return <main>{useAuthoringRefileSavedText({ source: selected, scope: 'current-account-session-project', refusal,
    isCurrent: () => true, isClean: () => clean, fireToast, onRefiled })}</main>;
}
async function confirm() {
  fireEvent.click(screen.getByRole('button', { name: 'Re-file saved text' }));
  const dialog = screen.getByRole('dialog', { name: 'Re-file saved text' });
  fireEvent.change(within(dialog).getByPlaceholderText('Captured verbatim in the audit log. Be specific.'), { target: { value: 'Restore the reviewed saved section.' } });
  fireEvent.change(within(dialog).getByPlaceholderText('refile'), { target: { value: 'refile' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm and log' }));
  await waitFor(() => expect(apiRequest).toHaveBeenCalledTimes(1));
}
afterEach(cleanup);
beforeEach(() => { apiRequest.mockReset().mockResolvedValue(ok(receipt())); fireToast.mockReset(); onRefiled.mockReset(); });

describe('saved-section receipt agrees with canonical filing identity', () => {
  it.each([
    ['unrelated ancestor', '99.9', '99.9'], ['bare module ancestor', '3', '3'],
    ['unrelated part-of marker', '3.2.S', '99.9'], ['unexpected exact target', '3.2.S.2', undefined],
  ] as Array<[string, string, string | undefined]>)('rejects %s', (_name, sectionKey, partOf) => {
    const result = receipt(); result.filing = { ...result.filing, sectionKey, ...(partOf ? { partOf } : {}) };
    expect(readRefileReceipt(result, source)).toBeNull();
  });
  it('accepts a proper assembled ancestor without inventing a content revision', () => {
    const result = { ...receipt(), filing: { committed: true, documentId: source.filingDocumentId, sectionKey: '3.2.S', partOf: '3.2.S' } };
    expect(readRefileReceipt(result, source)?.revision_created).toBe(false);
  });
  it.each(['documentId', 'sectionId', 'programId', 'filingDocumentId', 'updatedAt'] as const)('rejects a different %s source token', key => {
    const result = receipt(); result.source[key] = 'different-token';
    expect(readRefileReceipt(result, source)).toBeNull();
  });
});

describe('unchanged filing retains one attempt and its exact reviewed owner', () => {
  it('does not show an old success when A is revisited before its reply', async () => {
    let resolve!: (response: Response) => void;
    apiRequest.mockImplementation(() => new Promise<Response>(done => { resolve = done; }));
    const view = render(<Host />); await confirm();
    view.rerender(<Host selected={{ ...source, sectionId: '22000000-0000-4000-8000-000000000002', sectionCode: '3.2.S.2' }} />);
    view.rerender(<Host />);
    await act(async () => { resolve(ok(receipt())); });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Re-file saved text' })).toBeTruthy());
    expect(document.body.textContent).not.toContain('was re-filed');
    expect(fireToast).not.toHaveBeenCalled(); expect(onRefiled).not.toHaveBeenCalled();
  });
  it('rechecks the actual editor at confirmation even before a dirty render', async () => {
    let clean = true;
    function CurrentEditor() { return <>{useAuthoringRefileSavedText({ source, scope: 'actual-editor', refusal: null,
      isCurrent: () => true, isClean: () => clean, fireToast, onRefiled })}</>; }
    render(<CurrentEditor />);
    fireEvent.click(screen.getByRole('button', { name: 'Re-file saved text' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByPlaceholderText('Captured verbatim in the audit log. Be specific.'), { target: { value: 'Restore reviewed text.' } });
    fireEvent.change(within(dialog).getByPlaceholderText('refile'), { target: { value: 'refile' } });
    clean = false;
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm and log' }));
    await screen.findByText(/Save or discard the unsaved edits/);
    expect(apiRequest).not.toHaveBeenCalled();
  });
});

describe('uncertain or contradictory filing replies never permit blind replay', () => {
  const unknownReplies = [
    { name: 'bodyless success', response: () => new Response(null, { status: 200 }) },
    { name: 'malformed success', response: () => ok({ success: true }) },
    { name: 'contradictory outcome', response: () => ok({ ...receipt(), outcome: 'unknown' }) },
    { name: 'contradictory status', response: () => ok({ ...receipt(), status: 'unconfirmed' }) },
    { name: 'error alias', response: () => ok({ ...receipt(), errorCode: 'OUTCOME_UNKNOWN' }) },
    { name: 'reason alias', response: () => ok({ ...receipt(), reason: 'OUTCOME_UNKNOWN' }) },
    { name: 'wrong destination', response: () => ok({ ...receipt(), filing: { committed: true, documentId: 'other-filing', sectionKey: source.sectionCode } }) },
    { name: 'contradictory refusal', response: () => ok({ success: false, message: 'Check the filing.', filing: { committed: true } }, 409) },
    { name: 'nested result array', response: () => ok({ success: false, message: 'Check the filing.', results: [{ committed: true }] }, 409) },
    { name: 'unconfirmed refusal', response: () => ok({ success: false, errorCode: 'OUTCOME_UNKNOWN', message: 'Check the filing.' }, 409) },
    { name: 'server uncertainty', response: () => ok({ success: false, code: 'OUTCOME_UNKNOWN', retryAllowed: false, message: 'Check the filing.' }, 503) },
  ];
  it.each(unknownReplies)('holds $name across close/reopen and A → B → A', async ({ response }) => {
    apiRequest.mockImplementation(async () => response());
    const view = render(<Host />); await confirm();
    await screen.findAllByText(/filing result could not be confirmed/);
    fireEvent.click(within(screen.getByRole('dialog')).getAllByRole('button', { name: 'Cancel' })[0]);
    expect((screen.getByRole('button', { name: 'Re-file saved text' }) as HTMLButtonElement).disabled).toBe(true);
    view.rerender(<Host selected={{ ...source, sectionId: '22000000-0000-4000-8000-000000000002', sectionCode: '3.2.S.2' }} />);
    expect((screen.getByRole('button', { name: 'Re-file saved text' }) as HTMLButtonElement).disabled).toBe(false);
    view.rerender(<Host />);
    const refile = screen.getByRole('button', { name: 'Re-file saved text' }) as HTMLButtonElement;
    expect(refile.disabled).toBe(true); fireEvent.click(refile);
    expect(apiRequest).toHaveBeenCalledTimes(1); expect(fireToast).not.toHaveBeenCalled(); expect(onRefiled).not.toHaveBeenCalled();
  });
  it('holds a lost network reply instead of saying nothing was written', async () => {
    apiRequest.mockRejectedValue(new TypeError('Failed to fetch'));
    render(<Host />); await confirm(); await screen.findAllByText(/filing result could not be confirmed/);
    expect(document.body.textContent).not.toMatch(/nothing was (?:written|persisted)/i);
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Confirm and log' }));
    expect(apiRequest).toHaveBeenCalledTimes(1);
  });
});

describe('confirmed refusals and successful filing remain deliberate', () => {
  it('retains the server refusal and allows a fresh explicit confirmation', async () => {
    apiRequest.mockRejectedValue(new ApiRequestError('The filing is locked. Nothing was re-filed.', 409,
      { success: false, code: 'FILING_LOCKED', message: 'The filing is locked. Nothing was re-filed.' }));
    render(<Host />); await confirm();
    await screen.findAllByText('The filing is locked. Nothing was re-filed.');
    fireEvent.click(within(screen.getByRole('dialog')).getAllByRole('button', { name: 'Cancel' })[0]);
    expect((screen.getByRole('button', { name: 'Re-file saved text' }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Re-file saved text' }));
    expect((within(screen.getByRole('dialog')).getByPlaceholderText('refile') as HTMLInputElement).value).toBe('');
    expect(apiRequest).toHaveBeenCalledTimes(1); expect(onRefiled).not.toHaveBeenCalled();
  });
  it('sends only pinned intent and the dedicated reason, then confirms no content revision', async () => {
    render(<Host />); await confirm();
    await waitFor(() => expect(onRefiled).toHaveBeenCalledTimes(1));
    expect(apiRequest).toHaveBeenCalledWith('PATCH', `/api/authoring/sections/${source.sectionId}`, {
      filingOnly: true, expectedDocumentId: source.documentId, expectedProgramId: source.programId,
      expectedFilingDocumentId: source.filingDocumentId, expectedUpdatedAt: source.updatedAt,
      changeReason: 'Restore the reviewed saved section.',
    });
    expect(fireToast).toHaveBeenCalledWith(expect.stringMatching(/was re-filed.*No Authoring content revision was created/));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
