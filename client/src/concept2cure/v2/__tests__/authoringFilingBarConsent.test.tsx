// @vitest-environment jsdom
/**
 * P-102, slice 2 (2026-11-12): an informed-consent form with no
 * ClinicalTrials.gov statement is refused (409 CONSENT_TRIAL_STATUS_REQUIRED,
 * authoring.router.ts consentRefused) until the approver says whether the
 * study is an applicable clinical trial. The bar asks, starting at "go back",
 * and re-signs with the statement only when the approver says it is not one.
 * A missing 50.25(a) element (CONSENT_INCOMPLETE) is not a question: the
 * server's sentence is shown and nothing is offered to lift it.
 *
 * The real shared EsignModal runs; C2CForm is stubbed as the figure test stubs it.
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

const answers = vi.hoisted(() => ({ form: {} as Record<string, string> }));
vi.mock('../C2CForm', () => ({
  C2CForm: ({ config, onSubmit, onCancel }: any) => (
    <div>
      <div data-testid="form-title">{config.title}</div>
      <div data-testid="form-sub">{config.sub}</div>
      <div data-testid="form-fields">{config.fields.map((f: any) => f.key).join(',')}</div>
      <div data-testid="form-labels">{config.fields.map((f: any) => f.label).join('|')}</div>
      {/* A segmented control starts at its first option (C2CForm initialValues). */}
      <div data-testid="form-starts">{config.fields.map((f: any) => f.options?.[0]?.value ?? '').join(',')}</div>
      <button data-testid="form-submit" onClick={() => onSubmit({ ...answers.form })}>{config.submitLabel}</button>
      <button data-testid="form-cancel" onClick={onCancel}>cancel</button>
    </div>
  ),
}));

import { AuthoringFilingBar } from '../surfaces/AuthoringFilingBar';

function ok(payload: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => payload } as Response;
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
beforeEach(() => { apiRequest.mockReset(); answers.form = {}; });

function renderBar() {
  const onChanged = vi.fn();
  const fireToast = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <AuthoringFilingBar docId="D1" docTitle="LUM-201 informed consent form" docStatus="draft" onChanged={onChanged} fireToast={fireToast} />
    </QueryClientProvider>,
  );
  return { onChanged, fireToast };
}

/** The dialog's own server checks (/api/esignature/verify-*), for a signer with no code. */
function stubSignerChecks() {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ valid: true }) })));
}

const REASON = 'I approve this consent form for use.';
const esignCalls = () => apiRequest.mock.calls.filter((c) => c[1] === '/api/authoring/docs/D1/e-sign');

const refusal = (code: string, message: string) => {
  const err: any = new Error(message);
  err.name = 'ApiRequestError';
  err.status = 409;
  err.code = code;
  err.payload = { success: false, error: { code, message } };
  return err;
};
const TRIAL = 'Not approved — this informed consent form has no ClinicalTrials.gov statement, which 21 CFR 50.25(c) requires for an applicable clinical trial. Add it, or, if this study is not an applicable clinical trial, say so and approve again: that statement is recorded with your approval. Nothing was signed.';

async function sign(approval = true) {
  const dialog = await screen.findByRole('dialog');
  if (approval) fireEvent.click(within(dialog).getByRole('radio', { name: /Approval/ }));
  fireEvent.change(within(dialog).getByLabelText(/Reason for this action/), { target: { value: REASON } });
  fireEvent.change(within(dialog).getByLabelText(/Password/), { target: { value: 'correct horse' } });
  fireEvent.click(within(dialog).getByRole('button', { name: /Sign and commit/ }));
}

describe('a consent form without the ClinicalTrials.gov statement', () => {
  it('asks whether the study is an applicable clinical trial, starting at "go back", and states nothing first', async () => {
    stubSignerChecks();
    const { fireToast } = renderBar();
    apiRequest.mockRejectedValueOnce(refusal('CONSENT_TRIAL_STATUS_REQUIRED', TRIAL));
    fireEvent.click(screen.getByRole('button', { name: /E-sign/ }));
    await sign();
    await waitFor(() => expect(screen.getByTestId('form-title').textContent).toBe('Is this study an applicable clinical trial?'));
    expect(screen.getByTestId('form-starts').textContent).toBe('add');
    expect(screen.getByTestId('form-sub').textContent).toMatch(/^“LUM-201 informed consent form”: this informed consent form has no ClinicalTrials\.gov statement/);
    expect(screen.getByTestId('form-sub').textContent).not.toMatch(/Nothing was signed/);
    expect((esignCalls()[0][2] as any).notApplicableClinicalTrial).toBeUndefined();
    expect(fireToast).not.toHaveBeenCalled();
  });

  it('"not an applicable clinical trial" re-signs as an approval with the statement, and says it is recorded', async () => {
    stubSignerChecks();
    const { onChanged } = renderBar();
    apiRequest.mockRejectedValueOnce(refusal('CONSENT_TRIAL_STATUS_REQUIRED', TRIAL));
    fireEvent.click(screen.getByRole('button', { name: /E-sign/ }));
    await sign();
    await waitFor(() => expect(screen.getByTestId('form-title')).toBeTruthy());
    answers.form = { trialStatus: 'not_applicable' };
    apiRequest.mockResolvedValue(ok({ success: true, signatureId: 's5', documentHash: 'h', signedAt: '2026-11-12T00:00:00Z' }));
    fireEvent.click(screen.getByTestId('form-submit'));
    const dialog = await screen.findByRole('dialog');
    expect(dialog.textContent).toMatch(/You said this study is not an applicable clinical trial[\s\S]*recorded with your approval/);
    await sign(false);
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(esignCalls()[1][2]).toMatchObject({ meaning: 'APPROVER', notApplicableClinicalTrial: true });
  });

  it('"it is one" goes back and signs nothing', async () => {
    stubSignerChecks();
    renderBar();
    apiRequest.mockRejectedValueOnce(refusal('CONSENT_TRIAL_STATUS_REQUIRED', TRIAL));
    fireEvent.click(screen.getByRole('button', { name: /E-sign/ }));
    await sign();
    await waitFor(() => expect(screen.getByTestId('form-title')).toBeTruthy());
    answers.form = { trialStatus: 'add' };
    fireEvent.click(screen.getByTestId('form-submit'));
    await waitFor(() => expect(screen.queryByTestId('form-title')).toBeNull());
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(esignCalls()).toHaveLength(1);
  });
});

describe('a consent form missing a 50.25(a) element', () => {
  it('shows the server\'s sentence in the signature dialog, asks no question, and offers no way past it', async () => {
    stubSignerChecks();
    renderBar();
    apiRequest.mockRejectedValueOnce(refusal('CONSENT_INCOMPLETE',
      'Not approved — this informed consent form does not yet meet 1 required element of informed consent (21 CFR 50.25(a)): Reasonably foreseeable risks or discomforts. The editor’s Check says what each one lacks. Nothing was signed.'));
    fireEvent.click(screen.getByRole('button', { name: /E-sign/ }));
    await sign();
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(dialog.textContent).toMatch(/Reasonably foreseeable risks or discomforts/));
    expect(screen.queryByTestId('form-title')).toBeNull();
    expect(esignCalls()).toHaveLength(1);
  });
});
