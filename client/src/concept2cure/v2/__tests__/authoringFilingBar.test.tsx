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
vi.mock('../C2CForm', () => ({
  C2CForm: ({ config, onSubmit }: any) => (
    <button data-testid="form-submit" onClick={() => onSubmit({ reason: 'QA lock', version: '', pin: '1234', meaning: 'APPROVER', intent: 'reviewed' })}>
      {config.submitLabel}
    </button>
  ),
}));

import { AuthoringFilingBar } from '../surfaces/AuthoringFilingBar';

function ok(payload: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => payload } as Response;
}

afterEach(() => cleanup());
beforeEach(() => apiRequest.mockReset());

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

    await waitFor(() => expect(fireToast).toHaveBeenCalledWith(expect.stringMatching(/PIN was not verified/)));
    expect(onChanged).not.toHaveBeenCalled();
  });

  it('disables Freeze once the document is already frozen', () => {
    renderBar('FROZEN');
    expect((screen.getByRole('button', { name: /Frozen/ }) as HTMLButtonElement).disabled).toBe(true);
  });
});
