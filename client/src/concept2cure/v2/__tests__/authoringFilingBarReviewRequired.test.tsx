// @vitest-environment jsdom
/**
 * P-95 (the founder, 2026-11-02, clarified 2026-11-09; docs/LAUNCH_DEFINITION_OF_DONE.md):
 * a regulated document is approved only after its review. The server refuses an
 * APPROVER signature with 409 REVIEW_REQUIRED, before the password, unless the
 * document's review route is complete over the text being approved
 * (authoring.router.ts reviewRefused).
 *
 * That refusal must not leave the approver at a dead end. The bar shows the
 * server's sentence as a question with its remedy, "Send for review", which
 * opens the editor's existing Send for review (the host's `onSendForReview`).
 * Nothing is signed and nothing is retried. The real shared EsignModal runs, and
 * C2CForm is stubbed as the figures suite stubs it.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

vi.mock('../C2CForm', () => ({
  C2CForm: ({ config, onSubmit, onCancel }: any) => (
    <div>
      <div data-testid="form-eyebrow">{config.eyebrow}</div>
      <div data-testid="form-title">{config.title}</div>
      <div data-testid="form-sub">{config.sub}</div>
      <div data-testid="form-fields">{config.fields.map((f: any) => f.key).join(',')}</div>
      <button data-testid="form-submit" onClick={() => onSubmit({})}>{config.submitLabel}</button>
      <button data-testid="form-cancel" onClick={onCancel}>cancel</button>
    </div>
  ),
}));

import { AuthoringFilingBar } from '../surfaces/AuthoringFilingBar';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
beforeEach(() => { apiRequest.mockReset(); });

function renderBar(onSendForReview?: () => void) {
  const onChanged = vi.fn();
  const fireToast = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <AuthoringFilingBar docId="D1" docTitle="BX-301 Clinical Overview" docStatus="draft" onChanged={onChanged}
        fireToast={fireToast} onSendForReview={onSendForReview} />
    </QueryClientProvider>,
  );
  return { onChanged, fireToast };
}

/** The dialog's own server checks (/api/esignature/verify-*), for a signer with no code. */
function stubSignerChecks() {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ valid: true }) })));
}

const SENTENCE = 'This document has not been reviewed. Send it for review; once every reviewer has signed this version, it can be approved. Nothing was signed.';
function reviewRequired(message = SENTENCE) {
  const err: any = new Error(message);
  err.name = 'ApiRequestError';
  err.status = 409;
  err.code = 'REVIEW_REQUIRED';
  err.payload = { success: false, error: { code: 'REVIEW_REQUIRED', message } };
  return err;
}
const esignCalls = () => apiRequest.mock.calls.filter((c) => c[1] === '/api/authoring/docs/D1/e-sign');

async function approve() {
  fireEvent.click(screen.getByRole('button', { name: /E-sign/ }));
  const dialog = await screen.findByRole('dialog');
  fireEvent.click(within(dialog).getByRole('radio', { name: /Approval/ }));
  fireEvent.change(within(dialog).getByLabelText(/Reason for this action/), { target: { value: 'I approve this document for filing.' } });
  fireEvent.change(within(dialog).getByLabelText(/Password/), { target: { value: 'correct horse' } });
  fireEvent.click(within(dialog).getByRole('button', { name: /Sign and commit/ }));
}

describe('P-95: an approval the server refuses because review is not complete', () => {
  it('says why, in the server\'s words, and offers Send for review, with nothing to answer and nothing signed', async () => {
    stubSignerChecks();
    const onSendForReview = vi.fn();
    const { onChanged } = renderBar(onSendForReview);
    apiRequest.mockRejectedValueOnce(reviewRequired());
    await approve();

    await waitFor(() => expect(screen.getByTestId('form-title').textContent).toBe('Review comes before approval'));
    expect(screen.getByTestId('form-eyebrow').textContent).toBe('Part 11 · approval');
    expect(screen.getByTestId('form-sub').textContent).toBe(SENTENCE);
    expect(screen.getByTestId('form-fields').textContent).toBe('');
    expect(screen.getByTestId('form-submit').textContent).toBe('Send for review');
    expect(esignCalls()).toHaveLength(1);
    expect(onChanged).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('form-submit'));
    expect(onSendForReview).toHaveBeenCalledTimes(1);
    // The question closes; the signature is not sent again.
    expect(screen.queryByTestId('form-title')).toBeNull();
    expect(esignCalls()).toHaveLength(1);
  });

  it('closes without sending anything when the approver closes it', async () => {
    stubSignerChecks();
    const onSendForReview = vi.fn();
    renderBar(onSendForReview);
    apiRequest.mockRejectedValueOnce(reviewRequired());
    await approve();
    await waitFor(() => expect(screen.getByTestId('form-title').textContent).toBe('Review comes before approval'));
    fireEvent.click(screen.getByTestId('form-cancel'));
    expect(screen.queryByTestId('form-title')).toBeNull();
    expect(onSendForReview).not.toHaveBeenCalled();
    expect(esignCalls()).toHaveLength(1);
  });

  it('shows the server\'s other reasons as they are, such as a review still open', async () => {
    stubSignerChecks();
    renderBar(vi.fn());
    const open = 'Its review is not finished: 1 of 2 reviewers have signed. Once every reviewer has signed this version, it can be approved. Nothing was signed.';
    apiRequest.mockRejectedValueOnce(reviewRequired(open));
    await approve();
    await waitFor(() => expect(screen.getByTestId('form-sub').textContent).toBe(open));
  });

  it('without a way to send for review, the question still says why and only closes', async () => {
    stubSignerChecks();
    renderBar(undefined);
    apiRequest.mockRejectedValueOnce(reviewRequired());
    await approve();
    await waitFor(() => expect(screen.getByTestId('form-sub').textContent).toBe(SENTENCE));
    expect(screen.getByTestId('form-submit').textContent).toBe('Close');
    fireEvent.click(screen.getByTestId('form-submit'));
    expect(screen.queryByTestId('form-title')).toBeNull();
  });
});
