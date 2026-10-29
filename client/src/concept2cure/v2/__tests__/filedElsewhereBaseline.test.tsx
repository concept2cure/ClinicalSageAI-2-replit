// @vitest-environment jsdom
/**
 * Sequences filed outside the platform, in the Submission Center (D7,
 * 2026-10-29). A US submission whose earlier sequences were filed elsewhere
 * declares them with a signature; the screen then numbers after them, and a
 * failed read is said rather than shown as "nothing declared".
 */
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const api = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async importOriginal => ({ ...(await importOriginal<typeof import('@/lib/queryClient')>()), apiRequest: api }));

import { FiledBaselineSlot, nextAfterFiled, numberingKnown, type FiledBaselineView } from '../surfaces/FiledElsewhereBaseline';
import { ApiRequestError } from '@/lib/queryClient';

const json = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body, headers: { get: () => null } }) as unknown as Response;
const EVIDENCE = '11111111-1111-4111-8111-111111111111';
const DECLARED: FiledBaselineView = {
  lastFiledSequence: '0041', originalSequence: '0000', nextSequence: '0042', declaredAt: '2026-10-29T10:00:00Z',
  declaredByName: 'Lee Lead', meaning: 'responsibility', reason: 'Filed with our previous publisher',
};

let declareAnswer: () => Promise<Response> = async () => json({}, 201);
beforeEach(() => {
  api.mockReset();
  api.mockImplementation(async (method: string, url: string) => (
    method === 'POST' && url === '/api/submissions/12/filed-baseline' ? declareAnswer() : json({ success: true })));
  // The dialog re-authenticates through /api/esignature/verify-password before it signs.
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ valid: true }) })));
});
/** The signature dialog reads the signer's second-factor state through react-query. */
const withClient = (ui: React.ReactElement) => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>{ui}</QueryClientProvider>);
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function fillAndSign(onDeclared = vi.fn()) {
  withClient(<FiledBaselineSlot read={{ state: 'ready', baseline: null }} submissionId={12} onDeclared={onDeclared} />);
  fireEvent.click(screen.getByRole('button', { name: 'Declare sequences filed before this platform' }));
  const sign = screen.getByRole('button', { name: 'Sign declaration' }) as HTMLButtonElement;
  expect(sign.disabled).toBe(true);
  fireEvent.change(screen.getByLabelText('Last sequence filed'), { target: { value: '0041' } });
  fireEvent.change(screen.getByLabelText('Agency acknowledgment (Vault document id)'), { target: { value: EVIDENCE } });
  expect(sign.disabled).toBe(false);
  fireEvent.click(sign);
  const dialog = await screen.findByRole('dialog');
  expect(dialog.textContent).toContain('Sequences 0000–0041 · Original Application 0000');
  fireEvent.change(within(dialog).getByLabelText(/Reason for this action/), { target: { value: 'Filed with our previous publisher' } });
  fireEvent.change(within(dialog).getByLabelText(/Password/), { target: { value: 'correct horse' } });
  fireEvent.click(within(dialog).getByRole('button', { name: /Sign and commit/ }));
  return { dialog, onDeclared };
}

describe('Sequences filed before this platform', () => {
  it('declares them with a signature over the stated sequences and evidence', async () => {
    declareAnswer = async () => json({ baseline: {}, signatureId: 9, signedAt: '2026-10-29T10:00:00.000Z', meaning: 'responsibility' }, 201);
    const { onDeclared } = await fillAndSign();
    await waitFor(() => expect(api).toHaveBeenCalledWith('POST', '/api/submissions/12/filed-baseline', {
      lastFiledSequence: '0041', originalSequence: '0000', evidenceDocumentId: EVIDENCE,
      meaning: 'responsibility', reason: 'Filed with our previous publisher', password: 'correct horse',
    }));
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(onDeclared).toHaveBeenCalledTimes(1));
  });

  it("shows the server's refusal in its own words, and declares nothing", async () => {
    declareAnswer = async () => { throw new ApiRequestError(
      'Sequence 0000 on the platform holds content and is numbered within the sequences filed elsewhere (0000–0041). Move its content to a sequence after them, and remove it, first. Nothing was signed.',
      409, null, 'PLATFORM_SEQUENCE_WITHIN_BASELINE'); };
    const { dialog, onDeclared } = await fillAndSign();
    expect(await within(dialog).findByText(/holds content and is numbered within the sequences filed elsewhere/)).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(onDeclared).not.toHaveBeenCalled();
  });

  it('refuses an Original Application after the last sequence before anything is signed', () => {
    withClient(<FiledBaselineSlot read={{ state: 'ready', baseline: null }} submissionId={12} onDeclared={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Declare sequences filed before this platform' }));
    fireEvent.change(screen.getByLabelText('Last sequence filed'), { target: { value: '0003' } });
    fireEvent.change(screen.getByLabelText('Sequence that opened the Original Application'), { target: { value: '0004' } });
    fireEvent.change(screen.getByLabelText('Agency acknowledgment (Vault document id)'), { target: { value: EVIDENCE } });
    expect((screen.getByRole('button', { name: 'Sign declaration' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/cannot be after the last one filed/)).toBeTruthy();
  });

  it('shows the declaration in force, with who declared it', () => {
    render(<FiledBaselineSlot read={{ state: 'ready', baseline: DECLARED }} submissionId={12} onDeclared={vi.fn()} />);
    expect(screen.getByTestId('filed-baseline-note').textContent).toBe(
      'Sequences 0000–0041 were filed outside the platform. Sequence 0000 opened the Original Application. Declared by Lee Lead on 2026-10-29 (responsibility). The next sequence is 0042.');
    expect(screen.queryByRole('button', { name: 'Declare sequences filed before this platform' })).toBeNull();
  });

  it('a failed read is said, and no sequence number is offered', () => {
    render(<FiledBaselineSlot read={{ state: 'error', baseline: null }} submissionId={12} onDeclared={vi.fn()} />);
    expect(screen.getByRole('alert').textContent).toMatch(/no sequence number is offered/);
    expect(numberingKnown({ state: 'error', baseline: null })).toBe(false);
    expect(numberingKnown({ state: 'loading', baseline: null })).toBe(false);
    expect(numberingKnown({ state: 'none', baseline: null })).toBe(true);
  });

  it('numbers after the sequences filed elsewhere, and after the platform\'s own', () => {
    expect(nextAfterFiled('0000', DECLARED)).toBe('0042');
    expect(nextAfterFiled('0045', DECLARED)).toBe('0045');
    expect(nextAfterFiled('0003', null)).toBe('0003');
  });
});
