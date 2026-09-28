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
 * Retirement is the other signature the register takes (P1-29 / DP-32,
 * security review 2026-09-24): the Retire chip opened a reason-only confirm
 * dialog that posted `{reason}`, and the route retired the document on that
 * alone. It now opens the same EsignModal and posts to the signed retire route.
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
  regError: null as string | null,
  reviewRows: [] as unknown[] | null,
  trainRows: [] as unknown[] | null,
  trainError: null as string | null,
  trainRefresh: vi.fn(),
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
const EFFECTIVE = {
  ...DRAFT, id: 6, docNumber: 'SOP-015', title: 'Supplier controls', version: '1.0', status: 'effective', effectiveDate: '2026-09-01',
};

vi.mock('../hooks', () => ({
  useSopRegister: () => ({ docs: H.docs, loading: H.docs == null && H.regError == null, error: H.regError, refresh: H.refresh }),
  useSopTemplates: () => ({ templates: [], loading: false, error: null }),
  useReviewDue: () => ({ rows: H.reviewRows, loading: false, error: null, refresh: vi.fn() }),
  useTrainingCompliance: () => ({ rows: H.trainRows, loading: false, error: H.trainError, refresh: H.trainRefresh }),
}));
vi.mock('../../mdx/lib/useSampleRows', () => ({
  useSampleRows: <T,>(live: T[] | null) => (live ?? []) as T[],
  useShowingSample: () => H.sample,
}));
vi.mock('@/services/portal/authService', () => ({ useAuthUser: () => ({ name: 'R. Approver' }) }));
vi.mock('@/lib/queryClient', () => ({
  apiRequest: (...a: unknown[]) => H.apiRequest(...a),
  serverMessage: (p: { error?: string } | null) => p?.error ?? null,
  redactInternals: (m: string) => m,
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
  H.regError = null;
  H.reviewRows = [];
  H.trainRows = [];
  H.trainError = null;
  H.trainRefresh.mockReset();
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

describe('SopRegister — retirement is a signature taken here (P1-29 / DP-32)', () => {
  beforeEach(() => { H.docs = [EFFECTIVE]; });

  it('opens the e-signature dialog for Retire, offering the approval meaning only', () => {
    renderRegister();
    fireEvent.click(screen.getByRole('button', { name: /Retire/ }));
    const dialog = screen.getByRole('dialog', { name: 'Retire controlled document' });
    expect(dialog.getAttribute('data-meanings')).toBe('approval');
  });

  it('posts the signature to the signed retire route and shows the server’s time', async () => {
    H.apiRequest.mockResolvedValue({
      status: 200,
      ok: true,
      json: async () => ({
        data: { id: 6, status: 'retired' },
        meta: { signature: { id: 42, signedAt: '2026-09-26T12:00:00.000Z', boundPayloadDigest: 'e'.repeat(64) } },
      }),
    });
    renderRegister();
    fireEvent.click(screen.getByRole('button', { name: /Retire/ }));
    fireEvent.click(screen.getByText('stub-sign'));

    await waitFor(() => expect(H.signed).toBeTruthy());
    expect(H.apiRequest).toHaveBeenCalledTimes(1);
    expect(H.apiRequest).toHaveBeenCalledWith('POST', '/api/mdx/qms/documents/6/retire', {
      password: 'pw',
      mfaToken: '123456',
      meaning: 'APPROVED',
      reason: 'Reviewed against ISO 13485 §8.2.2',
    });
    expect(H.signed).toMatchObject({ meaning: 'approval', signedAt: '2026-09-26T12:00:00.000Z', hash: 'e'.repeat(64) });
    expect(H.refresh).toHaveBeenCalled();
  });

  it('shows a refused password as not retired', async () => {
    H.apiRequest.mockResolvedValue({ status: 401, ok: false, json: async () => ({ error: 'Password did not verify.' }) });
    renderRegister();
    fireEvent.click(screen.getByRole('button', { name: /Retire/ }));
    fireEvent.click(screen.getByText('stub-sign'));
    await waitFor(() => expect(H.signError).toBeTruthy());
    expect(H.signError).toMatch(/Nothing was signed/);
    expect(H.signed).toBeNull();
  });
});

/* HS-1 (docs/evidence/reviews/2026-09-24/lenses.md): the hooks computed an
   error and the register never read it, so an outage rendered as a clean
   register — "Effective documents 0", "Review overdue 0 — All current" in the
   ok tone, "No documents due for review." */
describe('SopRegister — a failed read is not an empty register', () => {
  const kpi = (label: string) => screen.getByText(label).closest('.qms-kpi') as HTMLElement;

  it('renders a failed register read as a failure, with no count and no all-clear', () => {
    H.docs = null;
    H.reviewRows = null;
    H.regError = 'Request failed (500)';
    renderRegister();
    expect(screen.getByTestId('sop-register-failed').textContent).toMatch(
      /controlled-document register could not be read/,
    );
    expect(screen.getByTestId('sop-review-failed')).toBeTruthy();
    expect(screen.queryByText('All current')).toBeNull();
    expect(screen.queryByText('No documents due for review.')).toBeNull();
    expect(screen.queryByText(/No controlled documents in the register/)).toBeNull();
    expect(kpi('Effective documents').querySelector('.val')?.textContent).toBe('—');
    expect(kpi('Review overdue').getAttribute('data-tone')).toBe('');
    fireEvent.click(screen.getAllByRole('button', { name: 'Try again' })[0]);
    expect(H.refresh).toHaveBeenCalled();
  });

  it('claims nothing while the register is still loading', () => {
    H.docs = null;
    H.reviewRows = null;
    renderRegister();
    expect(screen.getByText('Loading the register…')).toBeTruthy();
    expect(screen.queryByText('All current')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows a register that answered empty as empty, not as a failure', () => {
    H.docs = [];
    renderRegister();
    expect(screen.getByText('No controlled documents in the register yet.')).toBeTruthy();
    expect(screen.getByText('All current')).toBeTruthy();
    expect(screen.queryByTestId('sop-register-failed')).toBeNull();
  });

  it('renders a failed training read as a failure, not "no training-controlled documents"', () => {
    H.trainRows = null;
    H.trainError = 'Request failed (503)';
    renderRegister();
    expect(screen.getByTestId('sop-training-failed').textContent).toMatch(/Training records could not be read/);
    expect(screen.queryByText('No training-controlled documents yet.')).toBeNull();
    expect(kpi('Training compliance').querySelector('.val')?.textContent).toBe('—');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(H.trainRefresh).toHaveBeenCalled();
  });

  it('shows no training compliance figure when nothing is training-controlled, instead of a red 0%', () => {
    renderRegister();
    const k = kpi('Training compliance');
    expect(k.querySelector('.val')?.textContent).toBe('—');
    expect(k.getAttribute('data-tone')).toBe('');
    expect(k.textContent).toMatch(/No training-controlled documents yet/);
  });
});
