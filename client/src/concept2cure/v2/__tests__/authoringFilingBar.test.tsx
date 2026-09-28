// @vitest-environment jsdom
/**
 * AuthoringFilingBar — proves the freeze and e-sign filing actions are wired
 * to the real authoring store and honest on failure. C2CForm (tested
 * separately) is stubbed for the freeze dialog. The e-signature runs the REAL
 * shared EsignModal: it is the product's one signing dialog, and what it sends
 * (the password, the code when one is enrolled, the meaning) is the point.
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

// Stub C2CForm: render a submit button that fires onSubmit with canned values
// covering every field the freeze dialog reads.
//
// The freeze dialog has TWO shapes — the ordinary one and the one the server's
// "not settled" refusal re-asks with — so the stub also exposes the config's
// title, sub and field keys, and lets a test choose the `acknowledge` answer.
// Without that, a test could only prove a request was sent and not that the
// user was told what they were agreeing to.
const ackChoice = vi.hoisted(() => ({ value: undefined as string | undefined }));
vi.mock('../C2CForm', () => ({
  C2CForm: ({ config, onSubmit, onCancel }: any) => (
    <div>
      <div data-testid="form-title">{config.title}</div>
      <div data-testid="form-sub">{config.sub}</div>
      <div data-testid="form-fields">{config.fields.map((f: any) => f.key).join(',')}</div>
      <button data-testid="form-submit" onClick={() => onSubmit({
        reason: 'QA lock', version: '',
        ...(ackChoice.value ? { acknowledge: ackChoice.value } : {}),
      })}>
        {config.submitLabel}
      </button>
      <button data-testid="form-cancel" onClick={onCancel}>cancel</button>
    </div>
  ),
}));

import { AuthoringFilingBar } from '../surfaces/AuthoringFilingBar';

function ok(payload: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => payload } as Response;
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
beforeEach(() => { apiRequest.mockReset(); ackChoice.value = undefined; });

function renderBar(status = 'draft') {
  const onChanged = vi.fn();
  const fireToast = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <AuthoringFilingBar docId="D1" docTitle="M2.3 QOS" docStatus={status} onChanged={onChanged} fireToast={fireToast} />
    </QueryClientProvider>,
  );
  return { onChanged, fireToast };
}

/** The dialog's own server checks (/api/esignature/verify-*), answered as for a signer with or without a code. */
function stubSignerChecks(opts: { mfaRequired?: boolean } = {}) {
  const verify = vi.fn(async (url: string) => ({
    ok: true,
    status: 200,
    json: async () =>
      url.endsWith('/verify-password') ? { valid: true, ...(opts.mfaRequired ? { mfaRequired: true } : {}) } : { valid: true },
  }));
  vi.stubGlobal('fetch', verify);
  return verify;
}

const REASON = 'I approve this document for filing.';

describe('AuthoringFilingBar — real filing actions', () => {
  it('freezes the document via the real endpoint and reports the server content hash', async () => {
    apiRequest.mockResolvedValue(ok({ success: true, contentHash: 'abc123def456', version: 'v1.0.frozen' }));
    const { onChanged, fireToast } = renderBar('draft');

    fireEvent.click(screen.getByRole('button', { name: /Freeze/ }));
    fireEvent.click(screen.getByTestId('form-submit'));

    await waitFor(() => {
      const call = apiRequest.mock.calls.find((c) => c[1] === '/api/authoring/docs/D1/freeze');
      expect(call).toBeTruthy();
      expect((call![2] as any).reason).toBe('QA lock');
    });
    expect(fireToast).toHaveBeenCalledWith(expect.stringMatching(/frozen and sealed.*abc123def456/));
    expect(onChanged).toHaveBeenCalled();
  });

  it('a 401 on freeze is reported as not sealed — never as "frozen and sealed"', async () => {
    // apiRequest RETURNS a 401 rather than throwing it, so a handler that leans
    // on the throw alone falls through to its success branch. This is the case
    // that used to paint a seal claim over a refused freeze.
    apiRequest.mockResolvedValue(ok({ message: 'expired' }, 401));
    const { onChanged, fireToast } = renderBar('draft');

    fireEvent.click(screen.getByRole('button', { name: /Freeze/ }));
    fireEvent.click(screen.getByTestId('form-submit'));

    await waitFor(() => expect(fireToast).toHaveBeenCalled());
    expect(fireToast).toHaveBeenCalledWith(expect.stringMatching(/Not frozen/), 'error');
    expect(fireToast).not.toHaveBeenCalledWith(expect.stringMatching(/frozen and sealed/));
    expect(onChanged).not.toHaveBeenCalled();
  });

  describe('when the server refuses because the document is not settled', () => {
    /* The server now refuses to seal a document that still has open reviewer
       comments or undecided tracked changes. A 409 the UI does not understand
       would surface as a generic failure — and, since `apiRequest` throws and
       the server answers `{ code, message }`, the old handler would have
       rendered "[object Object]". The refusal is not a dead end: freezing a
       draft with open comments is a real thing to want, so the dialog says
       exactly what is outstanding and offers both ways forward. */
    const notSettled = () => {
      const err: any = new Error('Not frozen — this document still has 2 unresolved comments.');
      err.name = 'ApiRequestError';
      err.status = 409;
      err.code = 'DOCUMENT_NOT_SETTLED';
      err.payload = { unresolved: { openComments: 2, pendingEdits: 3 } };
      return err;
    };

    it('re-asks, naming what is outstanding, instead of reporting a failure', async () => {
      apiRequest.mockRejectedValue(notSettled());
      const { fireToast, onChanged } = renderBar('draft');

      fireEvent.click(screen.getByRole('button', { name: /Freeze/ }));
      fireEvent.click(screen.getByTestId('form-submit'));

      await waitFor(() => {
        expect(screen.getByTestId('form-title').textContent).toMatch(/not settled/i);
      });
      const sub = screen.getByTestId('form-sub').textContent ?? '';
      expect(sub).toMatch(/2 unresolved comments/);
      expect(sub).toMatch(/3 tracked changes/);
      // It offers the choice rather than only stating the problem.
      expect(screen.getByTestId('form-fields').textContent).toContain('acknowledge');
      // Not reported as an error, and nothing was sealed.
      expect(fireToast).not.toHaveBeenCalled();
      expect(onChanged).not.toHaveBeenCalled();
    });

    it('never renders the server payload as [object Object]', async () => {
      /* The concrete regression: `error` used to be a string and is now an
         object, so string-concatenating it produced that literal. */
      apiRequest.mockRejectedValue(notSettled());
      renderBar('draft');
      fireEvent.click(screen.getByRole('button', { name: /Freeze/ }));
      fireEvent.click(screen.getByTestId('form-submit'));
      await waitFor(() => expect(screen.getByTestId('form-title').textContent).toMatch(/not settled/i));
      expect(document.body.textContent).not.toContain('[object Object]');
    });

    it('sends the acknowledgement only when the user deliberately chooses to seal', async () => {
      apiRequest.mockRejectedValueOnce(notSettled());
      const { onChanged } = renderBar('draft');
      fireEvent.click(screen.getByRole('button', { name: /Freeze/ }));
      fireEvent.click(screen.getByTestId('form-submit'));
      await waitFor(() => expect(screen.getByTestId('form-fields').textContent).toContain('acknowledge'));

      // First attempt carried no acknowledgement — it must never be a default.
      const first = apiRequest.mock.calls.find((c) => c[1] === '/api/authoring/docs/D1/freeze');
      expect((first![2] as any).acknowledgeUnresolved).toBeUndefined();

      ackChoice.value = 'seal';
      apiRequest.mockResolvedValue(ok({ success: true, contentHash: 'sealedhash01' }));
      fireEvent.click(screen.getByTestId('form-submit'));

      await waitFor(() => expect(onChanged).toHaveBeenCalled());
      const second = apiRequest.mock.calls.filter((c) => c[1] === '/api/authoring/docs/D1/freeze').pop();
      expect((second![2] as any).acknowledgeUnresolved).toBe(true);
    });

    it('sends nothing at all when the user chooses to go back and resolve', async () => {
      /* Offering the choice and then ignoring half of it would be worse than
         not offering it. */
      apiRequest.mockRejectedValueOnce(notSettled());
      renderBar('draft');
      fireEvent.click(screen.getByRole('button', { name: /Freeze/ }));
      fireEvent.click(screen.getByTestId('form-submit'));
      await waitFor(() => expect(screen.getByTestId('form-fields').textContent).toContain('acknowledge'));
      const callsBefore = apiRequest.mock.calls.length;

      ackChoice.value = 'resolve';
      fireEvent.click(screen.getByTestId('form-submit'));

      expect(apiRequest.mock.calls.length, 'a freeze was sent anyway').toBe(callsBefore);
      expect(screen.queryByTestId('form-submit')).toBeNull(); // dialog closed
    });

    it('leaves a settled document with the ordinary dialog', async () => {
      /* The working path: a finished document must not have acquired a new
         question to answer. */
      apiRequest.mockResolvedValue(ok({ success: true, contentHash: 'abc123def456' }));
      renderBar('draft');
      fireEvent.click(screen.getByRole('button', { name: /Freeze/ }));
      expect(screen.getByTestId('form-title').textContent).toBe('Freeze document');
      expect(screen.getByTestId('form-fields').textContent).not.toContain('acknowledge');
    });
  });

  it('signs through the shared dialog: the password and meaning go to the real endpoint (approves + freezes)', async () => {
    const verify = stubSignerChecks();
    apiRequest.mockResolvedValue(ok({ success: true, signatureId: 's1', documentHash: 'sig9hash0000', signedAt: '2026-07-21T00:00:00Z' }, 200));
    const { onChanged, fireToast } = renderBar('draft');

    fireEvent.click(screen.getByRole('button', { name: /E-sign/ }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('radio', { name: /Approval/ }));
    fireEvent.change(within(dialog).getByLabelText(/Reason for this action/), { target: { value: REASON } });
    fireEvent.change(within(dialog).getByLabelText(/Password/), { target: { value: 'correct horse' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /Sign and commit/ }));

    await waitFor(() => {
      const call = apiRequest.mock.calls.find((c) => c[1] === '/api/authoring/docs/D1/e-sign');
      expect(call).toBeTruthy();
      expect(call![2]).toEqual({ password: 'correct horse', meaning: 'APPROVER', intent: REASON });
    });
    expect(verify).toHaveBeenCalledWith('/api/esignature/verify-password', expect.anything());
    expect(fireToast).toHaveBeenCalledWith(expect.stringMatching(/approved and frozen/));
    expect(onChanged).toHaveBeenCalled();
  });

  it('asks for the authenticator code when one is enrolled, and sends it with the signature', async () => {
    stubSignerChecks({ mfaRequired: true });
    apiRequest.mockResolvedValue(ok({ success: true, signatureId: 's2', documentHash: 'h', signedAt: '2026-07-21T00:00:00Z' }, 200));
    renderBar('draft');

    fireEvent.click(screen.getByRole('button', { name: /E-sign/ }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText(/Reason for this action/), { target: { value: REASON } });
    fireEvent.change(within(dialog).getByLabelText(/Password/), { target: { value: 'correct horse' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /Sign and commit/ }));

    const code = await within(dialog).findByLabelText(/code/i);
    expect(apiRequest.mock.calls.find((c) => c[1] === '/api/authoring/docs/D1/e-sign')).toBeUndefined();
    fireEvent.change(code, { target: { value: '135790' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /Sign and commit/ }));

    await waitFor(() => {
      const call = apiRequest.mock.calls.find((c) => c[1] === '/api/authoring/docs/D1/e-sign');
      expect(call![2]).toEqual({ password: 'correct horse', mfaToken: '135790', meaning: 'REVIEWER', intent: REASON });
    });
  });

  it('offers only the meanings the authoring store takes', async () => {
    renderBar('draft');
    fireEvent.click(screen.getByRole('button', { name: /E-sign/ }));
    const dialog = await screen.findByRole('dialog');
    const offered = within(dialog).getAllByRole('radio').map((r) => r.textContent ?? '');
    expect(offered.map((t) => t.replace(/You .*/, '').trim())).toEqual(['Authorship', 'Review', 'Approval']);
  });

  it('a refused credential is shown in the dialog, and nothing is signed or claimed', async () => {
    stubSignerChecks();
    apiRequest.mockResolvedValue(
      ok({ error: 'Signature rejected: password verification failed (§11.200).', code: 'PASSWORD_VERIFICATION_FAILED' }, 401),
    );
    const { onChanged, fireToast } = renderBar('draft');

    fireEvent.click(screen.getByRole('button', { name: /E-sign/ }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText(/Reason for this action/), { target: { value: REASON } });
    fireEvent.change(within(dialog).getByLabelText(/Password/), { target: { value: 'not it' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /Sign and commit/ }));

    const alert = await within(dialog).findByRole('alert');
    expect(alert.textContent).toMatch(/password verification failed.*Nothing was signed/);
    expect(fireToast).not.toHaveBeenCalled();
    expect(onChanged).not.toHaveBeenCalled();
  });

  it('disables Freeze once the document is already frozen', () => {
    renderBar('FROZEN');
    expect((screen.getByRole('button', { name: /Frozen/ }) as HTMLButtonElement).disabled).toBe(true);
  });
});
