// @vitest-environment jsdom
/**
 * B7 (CSR demo walk, 2026-11-05; 40-live-esign.png): E-sign on the CSR took the approver's reason and password,
 * and only then did the server refuse with 409 CSR_SCIENTIFIC_REVIEW_REQUIRED. A CSR is frozen, or signed as
 * author or approver, only over a current scientific-review receipt; the review signature is not gated. The bar
 * reads the document's reviews (the Review panel's read), whose context carries the server's CSR rule, and says
 * why before a password is asked. The real shared EsignModal runs, as in authoringFilingBar.test.tsx.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { AuthoringFilingBar } from '../surfaces/AuthoringFilingBar';

function ok(payload: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => payload } as Response;
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
beforeEach(() => { apiRequest.mockReset(); });

function renderBar() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <AuthoringFilingBar docId="D1" docTitle="CDISCPILOT01 Clinical Study Report" docStatus="draft" onChanged={vi.fn()} fireToast={vi.fn()} />
    </QueryClientProvider>,
  );
}

/** The dialog's own server checks (/api/esignature/verify-*), for a signer with no code. */
function stubSignerChecks() {
  const verify = vi.fn(async (_url: string, _init?: unknown) => ({ ok: true, status: 200, json: async () => ({ valid: true }) }));
  vi.stubGlobal('fetch', verify);
  return verify;
}

const REASON = 'I approve this document for filing.';

describe('a CSR without its scientific review says so before a password is asked (B7)', () => {
  const REVIEWS = '/api/authoring/documents/D1/reviews';
  const reviewsRead = (reviews: Array<{ review_status: string; standing: string }>, csrScientificReviewRequired = true) => ({
    success: true,
    reviews: reviews.map((r, i) => ({ id: `0000000${i}-0000-4000-8000-000000000000`, doc_id: 'D1', reviewer_id: '9', ...r })),
    reviewContext: { csrScientificReviewRequired },
  });
  const answer = (read: unknown) => apiRequest.mockImplementation(async (method: string, url: string) =>
    (method === 'GET' && url === REVIEWS ? ok(read) : ok({})));
  const signPosts = () => apiRequest.mock.calls.filter(([method]) => method === 'POST');

  it('says why beside E-sign, and refuses Approval in the dialog before any password is sent', async () => {
    const verify = stubSignerChecks();
    answer(reviewsRead([{ review_status: 'pending', standing: 'pending' }]));
    renderBar();
    // The bar's note is one line; the control's title carries the full sentence, with the step to take.
    expect(await screen.findByText('Needs its scientific review first')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Freeze/ }).getAttribute('title')).toMatch(/only after its scientific review.*Send it for review/);
    fireEvent.click(screen.getByRole('button', { name: /E-sign/ }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('radio', { name: /Approval/ }));
    expect(within(dialog).getByText(/only after its scientific review/)).toBeTruthy();
    fireEvent.change(within(dialog).getByLabelText(/Reason for this action/), { target: { value: REASON } });
    fireEvent.change(within(dialog).getByLabelText(/Password/), { target: { value: 'correct horse' } });
    expect(within(dialog).getByRole('button', { name: /Sign and commit/ })).toHaveProperty('disabled', true);
    expect(verify.mock.calls.filter(([url]) => String(url).endsWith('/verify-password'))).toHaveLength(0);
    expect(signPosts()).toEqual([]);
  });

  it('leaves the review signature open: it is not what the gate refuses', async () => {
    stubSignerChecks();
    answer(reviewsRead([]));
    renderBar();
    await screen.findByText('Needs its scientific review first');
    fireEvent.click(screen.getByRole('button', { name: /E-sign/ }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('radio', { name: /Review/ }));
    fireEvent.change(within(dialog).getByLabelText(/Reason for this action/), { target: { value: REASON } });
    fireEvent.change(within(dialog).getByLabelText(/Password/), { target: { value: 'correct horse' } });
    expect(within(dialog).getByRole('button', { name: /Sign and commit/ })).toHaveProperty('disabled', false);
  });

  it('refuses Freeze before its dialog opens, with the same sentence', async () => {
    answer(reviewsRead([{ review_status: 'approved', standing: 'stale' }]));
    renderBar();
    await waitFor(() => expect(screen.getByRole('button', { name: /Freeze/ })).toHaveProperty('disabled', true));
    expect(screen.getByTestId('freeze-refusal').textContent).toBe('Needs its scientific review first');
    expect(screen.getByRole('button', { name: /Freeze/ }).getAttribute('title')).toMatch(/only after its scientific review/);
  });

  it('with a current approval, or a document that is not a CSR, or a read that failed, the server decides (as before)', async () => {
    for (const read of [reviewsRead([{ review_status: 'approved', standing: 'current' }]), reviewsRead([], false), null]) {
      apiRequest.mockReset();
      if (read) answer(read); else apiRequest.mockImplementation(async () => ok({ error: 'unavailable' }, 503));
      renderBar();
      await waitFor(() => expect(apiRequest.mock.calls.some(([, url]) => url === REVIEWS)).toBe(true));
      await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
      expect(screen.queryByText(/only after its scientific review|Needs its scientific review first/)).toBeNull();
      expect(screen.getByRole('button', { name: /Freeze/ })).toHaveProperty('disabled', false);
      expect(screen.getByRole('button', { name: /E-sign/ })).toHaveProperty('disabled', false);
      cleanup();
    }
  });
});
