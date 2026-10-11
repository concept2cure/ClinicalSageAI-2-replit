// @vitest-environment jsdom
/**
 * AuthoringFilingBar — proves the freeze and e-sign filing actions are wired
 * to the real authoring store and honest on failure. C2CForm (tested
 * separately) is stubbed for the not-settled question. The freeze and the
 * e-signature both run the REAL shared EsignModal: it is the product's one
 * signing dialog, and what it sends (the password, the code when one is
 * enrolled, the meaning) is the point.
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

/** Open Freeze, fill the shared signing dialog and commit it. */
async function signFreeze(opts: { password?: string; meaning?: RegExp } = {}) {
  fireEvent.click(screen.getByRole('button', { name: /Freeze/ }));
  const dialog = await screen.findByRole('dialog');
  if (opts.meaning) fireEvent.click(within(dialog).getByRole('radio', { name: opts.meaning }));
  fireEvent.change(within(dialog).getByLabelText(/Reason for this action/), { target: { value: REASON } });
  fireEvent.change(within(dialog).getByLabelText(/Password/), { target: { value: opts.password ?? 'correct horse' } });
  fireEvent.click(within(dialog).getByRole('button', { name: /Sign and commit/ }));
  return dialog;
}

const freezeCalls = () => apiRequest.mock.calls.filter((c) => c[1] === '/api/authoring/docs/D1/freeze');

describe('AuthoringFilingBar — real filing actions', () => {
  /* DP-35 (2026-10-01): a frozen document counts as finalized for eCTD leaf
     completeness and the IND checklist, so the freeze is a signature. It runs
     through the product's one signing dialog — meaning, reason, password and
     code — and the server re-verifies them in the freeze's own transaction.
     It used to be a reason-only form. */
  it('freezes through the shared signing dialog: meaning, reason and password go to the real endpoint', async () => {
    const verify = stubSignerChecks();
    apiRequest.mockResolvedValue(ok({ success: true, contentHash: 'abc123def456', version: 'v1.0.frozen', signatureId: 's0' }));
    const { onChanged, fireToast } = renderBar('draft');

    await signFreeze();

    await waitFor(() => {
      expect(freezeCalls()).toHaveLength(1);
      expect(freezeCalls()[0][2]).toEqual({ reason: REASON, meaning: 'AUTHOR', password: 'correct horse' });
    });
    expect(verify).toHaveBeenCalledWith('/api/esignature/verify-password', expect.anything());
    expect(fireToast).toHaveBeenCalledWith(expect.stringMatching(/frozen and sealed.*abc123def456/));
    expect(onChanged).toHaveBeenCalled();
  });

  it('offers only the meanings a freeze carries — approval is E-sign', async () => {
    renderBar('draft');
    fireEvent.click(screen.getByRole('button', { name: /Freeze/ }));
    const dialog = await screen.findByRole('dialog');
    const offered = within(dialog).getAllByRole('radio').map((r) => (r.textContent ?? '').replace(/You .*/, '').trim());
    expect(offered).toEqual(['Authorship', 'Review']);
  });

  it('sends the authenticator code with the freeze when one is enrolled, and a review meaning as REVIEWER', async () => {
    stubSignerChecks({ mfaRequired: true });
    apiRequest.mockResolvedValue(ok({ success: true, contentHash: 'h' }));
    renderBar('draft');

    const dialog = await signFreeze({ meaning: /Review/ });
    const code = await within(dialog).findByLabelText(/code/i);
    expect(freezeCalls()).toHaveLength(0);
    fireEvent.change(code, { target: { value: '135790' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /Sign and commit/ }));

    await waitFor(() =>
      expect(freezeCalls()[0]?.[2]).toEqual({ reason: REASON, meaning: 'REVIEWER', password: 'correct horse', mfaToken: '135790' }),
    );
  });

  it('a 401 on freeze is shown in the dialog as not sealed — never as "frozen and sealed"', async () => {
    // apiRequest RETURNS a 401 rather than throwing it, so a handler that leans
    // on the throw alone falls through to its success branch. This is the case
    // that used to paint a seal claim over a refused freeze.
    stubSignerChecks();
    apiRequest.mockResolvedValue(ok({ error: 'Password verification failed.', code: 'PASSWORD_VERIFICATION_FAILED' }, 401));
    const { onChanged, fireToast } = renderBar('draft');

    const dialog = await signFreeze({ password: 'not it' });

    const alert = await within(dialog).findByRole('alert');
    expect(alert.textContent).toMatch(/Not frozen.*Nothing was sealed/);
    expect(fireToast).not.toHaveBeenCalled();
    expect(onChanged).not.toHaveBeenCalled();
  });

  describe('when the server refuses because the document is not settled', () => {
    /* The server refuses to seal a document that still has open reviewer
       comments or undecided tracked changes. The refusal is not a dead end:
       freezing a draft with open comments is a real thing to want, so the bar
       says exactly what is outstanding and offers both ways forward. */
    const notSettled = () => {
      const err: any = new Error('Not frozen — this document still has 2 unresolved comments.');
      err.name = 'ApiRequestError';
      err.status = 409;
      err.code = 'DOCUMENT_NOT_SETTLED';
      err.payload = { unresolved: { openComments: 2, pendingEdits: 3 } };
      return err;
    };

    it('re-asks, naming what is outstanding, instead of reporting a failure', async () => {
      stubSignerChecks();
      apiRequest.mockRejectedValue(notSettled());
      const { fireToast, onChanged } = renderBar('draft');

      await signFreeze();

      await waitFor(() => {
        expect(screen.getByTestId('form-title').textContent).toMatch(/not settled/i);
      });
      const sub = screen.getByTestId('form-sub').textContent ?? '';
      expect(sub).toMatch(/2 unresolved comments/);
      expect(sub).toMatch(/3 tracked changes/);
      // It offers the choice rather than only stating the problem.
      expect(screen.getByTestId('form-fields').textContent).toBe('acknowledge');
      // Not reported as an error, and nothing was sealed.
      expect(fireToast).not.toHaveBeenCalled();
      expect(onChanged).not.toHaveBeenCalled();
      expect(document.body.textContent).not.toContain('[object Object]');
    });

    it('sends the acknowledgement only when the user deliberately chooses to seal, under a fresh signature', async () => {
      stubSignerChecks();
      apiRequest.mockRejectedValueOnce(notSettled());
      const { onChanged } = renderBar('draft');
      await signFreeze();
      await waitFor(() => expect(screen.getByTestId('form-fields').textContent).toBe('acknowledge'));

      // First attempt carried no acknowledgement — it must never be a default.
      expect((freezeCalls()[0][2] as any).acknowledgeUnresolved).toBeUndefined();

      ackChoice.value = 'seal';
      apiRequest.mockResolvedValue(ok({ success: true, contentHash: 'sealedhash01' }));
      fireEvent.click(screen.getByTestId('form-submit'));

      // The signature dialog opens again: the seal is re-signed, not re-sent.
      const dialog = await screen.findByRole('dialog');
      expect(dialog.textContent).toMatch(/as it stands/);
      fireEvent.change(within(dialog).getByLabelText(/Reason for this action/), { target: { value: REASON } });
      fireEvent.change(within(dialog).getByLabelText(/Password/), { target: { value: 'correct horse' } });
      fireEvent.click(within(dialog).getByRole('button', { name: /Sign and commit/ }));

      await waitFor(() => expect(onChanged).toHaveBeenCalled());
      expect(freezeCalls()).toHaveLength(2);
      expect(freezeCalls()[1][2]).toMatchObject({ acknowledgeUnresolved: true, meaning: 'AUTHOR', password: 'correct horse' });
    });

    it('sends nothing at all when the user chooses to go back and resolve', async () => {
      stubSignerChecks();
      apiRequest.mockRejectedValueOnce(notSettled());
      renderBar('draft');
      await signFreeze();
      await waitFor(() => expect(screen.getByTestId('form-fields').textContent).toBe('acknowledge'));
      const callsBefore = apiRequest.mock.calls.length;

      ackChoice.value = 'resolve';
      fireEvent.click(screen.getByTestId('form-submit'));

      expect(apiRequest.mock.calls.length, 'a freeze was sent anyway').toBe(callsBefore);
      expect(screen.queryByTestId('form-submit')).toBeNull(); // closed
      expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('a settled document goes straight to the signature, with nothing to acknowledge', async () => {
      renderBar('draft');
      fireEvent.click(screen.getByRole('button', { name: /Freeze/ }));
      const dialog = await screen.findByRole('dialog');
      expect(dialog.textContent).not.toMatch(/as it stands/);
      expect(screen.queryByTestId('form-title')).toBeNull();
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

/* 2026-09-28, coverage-gap sweep GE-P-3. Freeze and E-sign were offered to
   every member who could open the document; one without an Owner or Approver
   grant filled in the reason or the password and then met a 403. The host
   now passes the server's refusal; the bar disables the control and states
   the reason as text the control is described by. Unknown stays enabled. */
describe('AuthoringFilingBar — the server’s refusal, before the dialog', () => {
  const describedBy = (el: Element) =>
    (el.getAttribute('aria-describedby') ?? '')
      .split(/\s+/)
      .filter(Boolean)
      .map((id) => document.getElementById(id)?.textContent ?? '')
      .join(' ');
  const FREEZE_NO = 'Freezing needs an Owner or Approver grant on this document. Your grants on it: Reviewer.';
  const SIGN_NO = 'Applying an electronic signature needs a signing role in this organization (admin, approver, reviewer). Your role: member.';

  function renderWith(props: { freezeRefusal?: string | null; esignRefusal?: string | null; reviewOnly?: boolean }) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <AuthoringFilingBar docId="D1" docTitle="M2.3 QOS" docStatus="draft" onChanged={vi.fn()} fireToast={vi.fn()} {...props} />
      </QueryClientProvider>,
    );
  }

  it('disables Freeze and E-sign with the reason as visible, described text', () => {
    renderWith({ freezeRefusal: FREEZE_NO, esignRefusal: SIGN_NO });
    const freeze = screen.getByRole('button', { name: /Freeze/ }) as HTMLButtonElement;
    const sign = screen.getByRole('button', { name: /E-sign/ }) as HTMLButtonElement;
    expect(freeze.disabled, 'Freeze offered to a caller the server will refuse').toBe(true);
    expect(sign.disabled, 'E-sign offered to a caller the server will refuse').toBe(true);
    expect(describedBy(freeze)).toBe(FREEZE_NO);
    expect(describedBy(sign)).toBe(SIGN_NO);
    expect(screen.getByText(FREEZE_NO)).toBeTruthy();
    expect(screen.getByText(SIGN_NO)).toBeTruthy();
    fireEvent.click(freeze);
    expect(screen.queryByTestId('form-title')).toBeNull();
  });

  /* QA 2026-10-08 (j4): the reviewer a review was assigned to holds a Reviewer
     grant, which permits the review signature only. The bar offers exactly that. */
  it('a Reviewer grant signs the review: E-sign is offered with the Review meaning alone', async () => {
    renderWith({ freezeRefusal: FREEZE_NO, esignRefusal: null, reviewOnly: true });
    const sign = screen.getByRole('button', { name: /E-sign/ }) as HTMLButtonElement;
    expect(sign.disabled).toBe(false);
    fireEvent.click(sign);
    const dialog = await screen.findByRole('dialog');
    const offered = within(dialog).getAllByRole('radio').map((r) => (r.textContent ?? '').replace(/You .*/, '').trim());
    expect(offered).toEqual(['Review']);
    expect(dialog.textContent).toMatch(/permits the review signature/);
  });

  it('leaves both enabled when the permission is unknown', () => {
    renderWith({ freezeRefusal: null, esignRefusal: null });
    expect((screen.getByRole('button', { name: /Freeze/ }) as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByRole('button', { name: /E-sign/ }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByTestId('freeze-refusal')).toBeNull();
    expect(screen.queryByTestId('esign-refusal')).toBeNull();
  });
});
