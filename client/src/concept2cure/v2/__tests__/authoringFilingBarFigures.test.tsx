// @vitest-environment jsdom
/**
 * P-89 (the founder, 2026-11-01; docs/LAUNCH_DEFINITION_OF_DONE.md): an
 * approval or a seal is refused while the text states a figure its section's
 * cited sources do not hold (409 FIGURES_UNVERIFIED, authoring.router.ts
 * figuresRefused), unless the signer acknowledges each one.
 *
 * The bar asks figure by figure, each starting at "Go back and correct it",
 * and re-signs with every key only when every one is kept. The real shared
 * EsignModal runs; C2CForm is stubbed as authoringFilingBar.test.tsx stubs it,
 * exposing each field's label and starting value and taking each answer.
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

const answers = vi.hoisted(() => ({ figures: {} as Record<string, string> }));
vi.mock('../C2CForm', () => ({
  C2CForm: ({ config, onSubmit, onCancel }: any) => (
    <div>
      <div data-testid="form-title">{config.title}</div>
      <div data-testid="form-sub">{config.sub}</div>
      <div data-testid="form-fields">{config.fields.map((f: any) => f.key).join(',')}</div>
      <div data-testid="form-labels">{config.fields.map((f: any) => f.label).join('|')}</div>
      {/* A segmented control starts at its first option (C2CForm initialValues). */}
      <div data-testid="form-starts">{config.fields.map((f: any) => f.options?.[0]?.value ?? '').join(',')}</div>
      <button data-testid="form-submit" onClick={() => onSubmit({ ...answers.figures })}>{config.submitLabel}</button>
      <button data-testid="form-cancel" onClick={onCancel}>cancel</button>
    </div>
  ),
}));

import { AuthoringFilingBar } from '../surfaces/AuthoringFilingBar';

function ok(payload: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => payload } as Response;
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
beforeEach(() => { apiRequest.mockReset(); answers.figures = {}; });

function renderBar() {
  const onChanged = vi.fn();
  const fireToast = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <AuthoringFilingBar docId="D1" docTitle="BX-301 Clinical Overview" docStatus="draft" onChanged={onChanged} fireToast={fireToast} />
    </QueryClientProvider>,
  );
  return { onChanged, fireToast };
}

/** The dialog's own server checks (/api/esignature/verify-*), for a signer with no code. */
function stubSignerChecks() {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ valid: true }) })));
}

const REASON = 'I approve this document for filing.';
const freezeCalls = () => apiRequest.mock.calls.filter((c) => c[1] === '/api/authoring/docs/D1/freeze');

async function signFreeze() {
  fireEvent.click(screen.getByRole('button', { name: /Freeze/ }));
  const dialog = await screen.findByRole('dialog');
  fireEvent.change(within(dialog).getByLabelText(/Reason for this action/), { target: { value: REASON } });
  fireEvent.change(within(dialog).getByLabelText(/Password/), { target: { value: 'correct horse' } });
  fireEvent.click(within(dialog).getByRole('button', { name: /Sign and commit/ }));
}

/* P-89 (2026-11-01): an approval or a seal is refused while the text states a
   figure its cited sources do not hold. The bar asks figure by figure, each
   starting at "Go back and correct it", and re-signs with every key only
   when every one is kept. */
const ITEMS = [
  { key: 'S1#1:HR 0.71', sectionId: 'S1', sectionCode: '2.5.4', sectionTitle: 'Overview of efficacy', text: 'HR 0.71', kind: 'hr', reason: 'not_in_cited_source' },
  { key: 'S2#1:52%', sectionId: 'S2', sectionCode: '2.5.5', sectionTitle: 'Overview of safety', text: '52%', kind: 'percent', reason: 'source_unavailable' },
];
const unverified = (message: string) => {
  const err: any = new Error(message);
  err.name = 'ApiRequestError';
  err.status = 409;
  err.code = 'FIGURES_UNVERIFIED';
  err.payload = { unverifiedFigures: { digest: 'd'.repeat(64), items: ITEMS } };
  return err;
};
const esignCalls = () => apiRequest.mock.calls.filter((c) => c[1] === '/api/authoring/docs/D1/e-sign');
async function approve() {
  fireEvent.click(screen.getByRole('button', { name: /E-sign/ }));
  const dialog = await screen.findByRole('dialog');
  fireEvent.click(within(dialog).getByRole('radio', { name: /Approval/ }));
  fireEvent.change(within(dialog).getByLabelText(/Reason for this action/), { target: { value: REASON } });
  fireEvent.change(within(dialog).getByLabelText(/Password/), { target: { value: 'correct horse' } });
  fireEvent.click(within(dialog).getByRole('button', { name: /Sign and commit/ }));
}
async function signAgain() {
  const dialog = await screen.findByRole('dialog');
  expect(dialog.textContent).toMatch(/You kept 2 figures not found in their cited sources\. Your signature records each one\./);
  fireEvent.change(within(dialog).getByLabelText(/Reason for this action/), { target: { value: REASON } });
  fireEvent.change(within(dialog).getByLabelText(/Password/), { target: { value: 'correct horse' } });
  fireEvent.click(within(dialog).getByRole('button', { name: /Sign and commit/ }));
}

describe('when the server refuses over figures not in their cited sources', () => {
  it('asks about each figure by name, each starting at "go back", and sends no acknowledgement first', async () => {
    stubSignerChecks();
    const { fireToast } = renderBar();
    apiRequest.mockRejectedValueOnce(unverified('Not approved — 2 figures in this document are not in the sources their sections cite.'));
    await approve();
    await waitFor(() => expect(screen.getByTestId('form-title').textContent).toBe('Figures are not in their cited sources'));
    expect(screen.getByTestId('form-fields').textContent).toBe('figure-0,figure-1');
    expect(screen.getByTestId('form-labels').textContent).toBe('HR 0.71 · 2.5.4 Overview of efficacy|52% · 2.5.5 Overview of safety');
    expect(screen.getByTestId('form-starts').textContent).toBe('correct,correct');
    expect(screen.getByTestId('form-sub').textContent).toMatch(/states 2 figures .* An approval seals the text for filing/);
    expect((esignCalls()[0][2] as any).acknowledgedFigures).toBeUndefined();
    expect(fireToast).not.toHaveBeenCalled();
  });

  it('re-signs with every key only when every figure is kept', async () => {
    stubSignerChecks();
    const { onChanged } = renderBar();
    apiRequest.mockRejectedValueOnce(unverified('Not approved.'));
    await approve();
    await waitFor(() => expect(screen.getByTestId('form-fields').textContent).toBe('figure-0,figure-1'));
    answers.figures = { 'figure-0': 'keep', 'figure-1': 'keep' };
    apiRequest.mockResolvedValue(ok({ success: true, signatureId: 's4', documentHash: 'h', signedAt: '2026-11-01T00:00:00Z' }));
    fireEvent.click(screen.getByTestId('form-submit'));
    await signAgain();
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(esignCalls()).toHaveLength(2);
    expect(esignCalls()[1][2]).toMatchObject({ meaning: 'APPROVER', acknowledgedFigures: ['S1#1:HR 0.71', 'S2#1:52%'] });
    // The signed confirmation stays on screen. Found in the running app (2026-11-02): clearing the
    // question on success flipped the dialog's default meaning, and its reset wiped the confirmation.
    const done = await screen.findByRole('heading', { name: 'Signature applied' });
    expect(within(screen.getByRole('dialog')).getByText(/Approval signature recorded/)).toBeTruthy();
    await new Promise((r) => setTimeout(r, 50));
    expect(done.isConnected).toBe(true);
    // Done closes it, and the next E-sign starts clean: no figure is carried into another signature.
    fireEvent.click(screen.getByRole('button', { name: /^Done$/ }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    fireEvent.click(screen.getByRole('button', { name: /E-sign/ }));
    const fresh = await screen.findByRole('dialog');
    expect(fresh.textContent).not.toMatch(/You kept/);
  });

  it('keeping one figure and correcting another sends nothing and goes back', async () => {
    stubSignerChecks();
    renderBar();
    apiRequest.mockRejectedValueOnce(unverified('Not approved.'));
    await approve();
    await waitFor(() => expect(screen.getByTestId('form-fields').textContent).toBe('figure-0,figure-1'));
    const callsBefore = apiRequest.mock.calls.length;
    answers.figures = { 'figure-0': 'keep', 'figure-1': 'correct' };
    fireEvent.click(screen.getByTestId('form-submit'));
    expect(apiRequest.mock.calls.length).toBe(callsBefore);
    expect(screen.queryByTestId('form-submit')).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('a freeze asks the same, and re-seals with every key once every figure is kept', async () => {
    stubSignerChecks();
    const { onChanged } = renderBar();
    apiRequest.mockRejectedValueOnce(unverified('Not frozen.'));
    await signFreeze();
    await waitFor(() => expect(screen.getByTestId('form-fields').textContent).toBe('figure-0,figure-1'));
    expect(screen.getByTestId('form-sub').textContent).toMatch(/Freezing seals the text for filing/);
    expect((freezeCalls()[0][2] as any).acknowledgedFigures).toBeUndefined();
    answers.figures = { 'figure-0': 'keep', 'figure-1': 'keep' };
    apiRequest.mockResolvedValue(ok({ success: true, contentHash: 'sealedhash02' }));
    fireEvent.click(screen.getByTestId('form-submit'));
    await signAgain();
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(freezeCalls()[1][2]).toMatchObject({ meaning: 'AUTHOR', acknowledgedFigures: ['S1#1:HR 0.71', 'S2#1:52%'] });
  });
});

/* Found in the running app, 2026-11-02 (docs/evidence/D5-SIGNATURE-FIGURE-GATE/2026-11-01/live/). */
describe('the signed confirmation stays on screen after a question was answered', () => {
  it('the older "not settled" approval keeps its signed confirmation on screen too (same cause)', async () => {
    stubSignerChecks();
    const notSettled: any = new Error('Not approved — this document still has 1 unresolved comment.');
    notSettled.name = 'ApiRequestError';
    notSettled.status = 409;
    notSettled.code = 'DOCUMENT_NOT_SETTLED';
    notSettled.payload = { unresolved: { openComments: 1, pendingEdits: 0 } };
    renderBar();
    apiRequest.mockRejectedValueOnce(notSettled);
    await approve();
    await waitFor(() => expect(screen.getByTestId('form-title').textContent).toMatch(/not settled/i));
    answers.figures = { acknowledge: 'approve' };
    apiRequest.mockResolvedValue(ok({ success: true, signatureId: 's5', documentHash: 'h', signedAt: '2026-11-02T00:00:00Z' }));
    fireEvent.click(screen.getByTestId('form-submit'));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText(/Reason for this action/), { target: { value: REASON } });
    fireEvent.change(within(dialog).getByLabelText(/Password/), { target: { value: 'correct horse' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /Sign and commit/ }));
    const done = await screen.findByRole('heading', { name: 'Signature applied' });
    await new Promise((r) => setTimeout(r, 50));
    expect(done.isConnected).toBe(true);
  });
});
