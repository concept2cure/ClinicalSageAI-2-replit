// @vitest-environment jsdom
/**
 * Approving a controlled document is an electronic signature, taken in the
 * register, never handed to AnA.
 *
 * Until 2026-09-24 the row button was "Ask AnA to approve". Its tooltip said
 * "you still capture the e-signature", and the AnA tool it reached made the SOP
 * effective with no password, no signing-authority check, no author ≠ approver
 * check and no signature row (new-code audit 2026-09-24, finding 1). The tool
 * now refuses, so this button is the one way the UI approves a document. It
 * opens the shared EsignModal and posts to the signed route.
 *
 * EsignModal's own re-authentication is covered by its own tests. Here it is
 * a stub that hands over what a signer typed, so what is under test is where
 * the register sends it and what it shows back.
 */
import * as React from 'react';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';

const H = vi.hoisted(() => ({
  docs: null as unknown[] | null,
  sample: false,
  apiRequest: vi.fn(),
  refresh: vi.fn(),
  signed: null as unknown,
  signError: null as string | null,
}));

const DRAFT = {
  id: 5, docNumber: 'SOP-014', title: 'Complaint handling', docType: 'sop', category: null,
  version: '2.0', status: 'in_review', effectiveDate: null, nextReviewDate: null, updatedAt: null,
};

vi.mock('../hooks', () => ({
  useSopRegister: () => ({ docs: H.docs, loading: false, error: null, refresh: H.refresh }),
  useSopTemplates: () => ({ templates: [], loading: false, error: null }),
  useReviewDue: () => ({ rows: [], loading: false, error: null }),
  useTrainingCompliance: () => ({ rows: [], loading: false, error: null }),
}));
vi.mock('../../mdx/lib/useSampleRows', () => ({
  useSampleRows: <T,>(live: T[] | null) => (live ?? []) as T[],
  useShowingSample: () => H.sample,
}));
vi.mock('@/services/portal/authService', () => ({ useAuth: () => ({ user: { name: 'R. Approver' } }) }));
vi.mock('@/lib/queryClient', () => ({
  apiRequest: (...a: unknown[]) => H.apiRequest(...a),
  serverMessage: (p: { error?: string } | null) => p?.error ?? null,
}));
vi.mock('../../_shared/components/EsignModal', () => ({
  esignSignerOf: (u: { name?: string } | null) => (u?.name ? { name: u.name } : undefined),
  EsignModal: (p: {
    action: string;
    meanings?: string[];
    onSign: (i: { meaning: string; reason: string; password: string; totp?: string }) => Promise<unknown>;
  }) => (
    <div role="dialog" aria-label={p.action} data-meanings={(p.meanings ?? []).join(',')}>
      <button
        onClick={() =>
          p
            .onSign({ meaning: 'approval', reason: 'Reviewed against ISO 13485 §8.2.2', password: 'pw', totp: '123456' })
            .then((m) => { H.signed = m; })
            .catch((e: Error) => { H.signError = e.message; })
        }
      >
        stub-sign
      </button>
    </div>
  ),
}));

import { SopRegister } from '../SopRegister';

const renderRegister = () =>
  render(<SopRegister onAsk={() => {}} filter="all" onFilterChange={() => {}} />);

beforeEach(() => {
  H.docs = [DRAFT];
  H.sample = false;
  H.apiRequest.mockReset();
  H.refresh.mockReset();
  H.signed = null;
  H.signError = null;
});
afterEach(cleanup);

describe('SopRegister — approval is a signature taken here', () => {
  it('no longer hands approval to AnA', () => {
    renderRegister();
    expect(screen.queryByText(/Ask AnA to approve/)).toBeNull();
  });

  it('opens the e-signature dialog, offering the approval meaning only', () => {
    renderRegister();
    fireEvent.click(screen.getByRole('button', { name: /Approve/ }));
    const dialog = screen.getByRole('dialog', { name: 'Approve controlled document' });
    expect(dialog.getAttribute('data-meanings')).toBe('approval');
  });

  it('posts the signature to the signed route and shows the server’s time', async () => {
    H.apiRequest.mockResolvedValue({
      status: 200,
      ok: true,
      json: async () => ({
        data: { id: 5, status: 'effective' },
        meta: { signature: { id: 41, signedAt: '2026-09-24T09:12:00.000Z', boundPayloadDigest: 'd'.repeat(64) } },
      }),
    });
    renderRegister();
    fireEvent.click(screen.getByRole('button', { name: /Approve/ }));
    fireEvent.click(screen.getByText('stub-sign'));

    await waitFor(() => expect(H.signed).toBeTruthy());
    expect(H.apiRequest).toHaveBeenCalledWith('POST', '/api/mdx/qms/documents/5/approve', {
      password: 'pw',
      mfaToken: '123456',
      meaning: 'APPROVED',
      reason: 'Reviewed against ISO 13485 §8.2.2',
    });
    expect(H.signed).toMatchObject({ meaning: 'approval', signedAt: '2026-09-24T09:12:00.000Z' });
    expect(H.refresh).toHaveBeenCalled();
  });

  it('shows a refused password as not signed', async () => {
    H.apiRequest.mockResolvedValue({ status: 401, ok: false, json: async () => ({ error: 'Password did not verify.' }) });
    renderRegister();
    fireEvent.click(screen.getByRole('button', { name: /Approve/ }));
    fireEvent.click(screen.getByText('stub-sign'));
    await waitFor(() => expect(H.signError).toBeTruthy());
    expect(H.signError).toMatch(/Nothing was signed/);
    expect(H.signed).toBeNull();
  });

  it('cannot approve a sample row', () => {
    H.sample = true;
    renderRegister();
    const btn = screen.getByRole('button', { name: /Approve/ }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });
});
