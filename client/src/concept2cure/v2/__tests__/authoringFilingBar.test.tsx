// @vitest-environment jsdom
/**
 * AuthoringFilingBar — proves the freeze + PIN e-sign filing actions are wired
 * to the real authoring store and honest on failure. C2CForm (tested
 * separately) is stubbed so the test drives the backend wiring, not the form UI.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

// Stub C2CForm: render a submit button that fires onSubmit with canned values
// covering every field both dialogs read (reason/version/pin/meaning/intent).
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
        reason: 'QA lock', version: '', pin: '1234', meaning: 'APPROVER', intent: 'reviewed',
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

afterEach(() => cleanup());
beforeEach(() => { apiRequest.mockReset(); ackChoice.value = undefined; });

function renderBar(status = 'draft') {
  const onChanged = vi.fn();
  const fireToast = vi.fn();
  render(<AuthoringFilingBar docId="D1" docTitle="M2.3 QOS" docStatus={status} onChanged={onChanged} fireToast={fireToast} />);
  return { onChanged, fireToast };
}

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

  it('applies an APPROVER e-signature via the real endpoint (approves + freezes)', async () => {
    apiRequest.mockResolvedValue(ok({ success: true, signatureId: 's1', documentHash: 'sig9hash0000', signedAt: '2026-07-21T00:00:00Z' }, 200));
    const { onChanged, fireToast } = renderBar('draft');

    fireEvent.click(screen.getByRole('button', { name: /E-sign/ }));
    fireEvent.click(screen.getByTestId('form-submit'));

    await waitFor(() => {
      const call = apiRequest.mock.calls.find((c) => c[1] === '/api/authoring/docs/D1/e-sign');
      expect(call).toBeTruthy();
      expect(call![2] as any).toMatchObject({ pin: '1234', meaning: 'APPROVER', intent: 'reviewed' });
    });
    expect(fireToast).toHaveBeenCalledWith(expect.stringMatching(/approved and frozen/));
    expect(onChanged).toHaveBeenCalled();
  });

  it('rejects a bad PIN honestly and does not fabricate a signature', async () => {
    apiRequest.mockResolvedValue(ok({ error: 'Invalid PIN' }, 401));
    const { onChanged, fireToast } = renderBar('draft');

    fireEvent.click(screen.getByRole('button', { name: /E-sign/ }));
    fireEvent.click(screen.getByTestId('form-submit'));

    // BP-W0-6: the tone is asserted, not just the words. This call used to pass
    // no tone at all, so a rejected PIN rendered with the green success tick —
    // failure and success were visually identical on the §11.50 signature.
    await waitFor(() => expect(fireToast).toHaveBeenCalledWith(expect.stringMatching(/PIN was not verified/), 'error'));
    expect(onChanged).not.toHaveBeenCalled();
  });

  it('disables Freeze once the document is already frozen', () => {
    renderBar('FROZEN');
    expect((screen.getByRole('button', { name: /Frozen/ }) as HTMLButtonElement).disabled).toBe(true);
  });
});
