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
  apiRequest: vi.fn(),
  refresh: vi.fn(),
  signed: null as unknown,
  signError: null as string | null,
  assigned: { listing: null as unknown, failed: false },
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
  useTrainingExpiring: () => ({ rows: [], failed: false, error: null, refresh: vi.fn() }),
  useTrainingAssignments: () => ({ ...H.assigned, error: H.assigned.failed ? 'unavailable' : null, refresh: vi.fn() }),
  useJobRoles: () => ({ listing: null, failed: false, error: null, refresh: vi.fn() }),
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
    renderMeaningDetails?: (meaning: string, committing: boolean) => React.ReactNode;
  }) => (
    <div role="dialog" aria-label={p.action} data-meanings={(p.meanings ?? []).join(',')}>
      {p.renderMeaningDetails?.(p.meanings?.[0] ?? '', false)}
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
  H.apiRequest.mockReset();
  H.refresh.mockReset();
  H.signed = null;
  H.signError = null;
  H.assigned = { listing: null, failed: false };
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
      // CAT2-19: the day it is effective from, today by default, signed with the approval.
      effectiveDate: new Date().toISOString().slice(0, 10),
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

});

/* QA walk 2026-10-08 (J8): a draft row offered Approve, whose dialog said
   "v1.2 becomes effective when you sign" — one signature made an unreviewed
   draft effective — and nothing anywhere routed a draft to review. The server
   now approves only a document under review; the register offers Approve there
   only, and a draft offers "Send for review", which is the existing PATCH
   route with status in_review (the server's verdict shown as it says it). */
describe('SopRegister — a draft is sent for review before it can be approved', () => {
  const DRAFT_ROW = { ...DRAFT, id: 7, docNumber: 'WI-014', title: 'Incoming inspection', status: 'draft' };

  it('offers Approve only on a document under review; a draft offers Send for review instead', () => {
    H.docs = [DRAFT_ROW, DRAFT];
    renderRegister();
    const rows = Array.from(document.querySelectorAll('.qms-row')) as HTMLElement[];
    const draftRow = rows.find((r) => r.textContent?.includes('WI-014'))!;
    const reviewRow = rows.find((r) => r.textContent?.includes('SOP-014'))!;
    expect(draftRow.textContent).not.toMatch(/Approve/);
    expect(draftRow.textContent).toMatch(/Send for review/);
    expect(reviewRow.textContent).toMatch(/Approve/);
    expect(reviewRow.textContent).not.toMatch(/Send for review/);
  });

  it('Send for review opens the review route form, which names the QMS approver before anything is sent (RR4)', async () => {
    H.docs = [DRAFT_ROW];
    H.apiRequest.mockResolvedValue({ status: 200, ok: true, json: async () => ({ ok: true, timeZone: 'UTC', documentId: 7, candidates: [] }) });
    renderRegister();
    fireEvent.click(screen.getByRole('button', { name: /Send for review/ }));
    const form = await screen.findByTestId('qms-route-form');
    expect(form.textContent).toMatch(/QMS approver/);
    expect((screen.getByTestId('qms-route-send') as HTMLButtonElement).disabled).toBe(true);
    // Only the candidates read: the send itself, its refusals and its route are in qmsReviewRoute.test.tsx.
    await waitFor(() => expect(H.apiRequest.mock.calls.some(([m, u]) => m === 'GET' && u === '/api/mdx/qms/documents/7/route-candidates')).toBe(true));
    expect(H.apiRequest.mock.calls.every(([m]) => m === 'GET')).toBe(true);
  });
});

describe('SopRegister — retirement is a signature taken here (P1-29 / DP-32)', () => {
  beforeEach(() => { H.docs = [EFFECTIVE]; });

  it('opens the e-signature dialog for Retire, offering the retirement meaning only (P-51)', () => {
    renderRegister();
    fireEvent.click(screen.getByRole('button', { name: /Retire/ }));
    const dialog = screen.getByRole('dialog', { name: 'Retire controlled document' });
    expect(dialog.getAttribute('data-meanings')).toBe('retirement');
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
      meaning: 'retirement',
      reason: 'Reviewed against ISO 13485 §8.2.2',
    });
    expect(H.signed).toMatchObject({ meaning: 'retirement', signedAt: '2026-09-26T12:00:00.000Z', hash: 'e'.repeat(64) });
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
    // Empty, and said as empty: not "All current", which an empty register is
    // only vacuously (finding 112; sopRegisterReadHonesty.test.tsx).
    expect(screen.getByText('Nothing in the register to review')).toBeTruthy();
    expect(screen.queryByTestId('sop-register-failed')).toBeNull();
  });

  it('renders a failed training read as a failure, not "no training-controlled documents"', () => {
    H.trainRows = null;
    H.trainError = 'Request failed (503)';
    renderRegister();
    expect(screen.getByTestId('sop-training-failed').textContent).toMatch(/Training records could not be read/);
    expect(screen.queryByText('No training-controlled documents yet.')).toBeNull();
    expect(kpi('Acknowledgement coverage').querySelector('.val')?.textContent).toBe('—');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(H.trainRefresh).toHaveBeenCalled();
  });

  it('shows no training compliance figure when nothing is training-controlled, instead of a red 0%', () => {
    renderRegister();
    const k = kpi('Acknowledgement coverage');
    expect(k.querySelector('.val')?.textContent).toBe('—');
    expect(k.getAttribute('data-tone')).toBe('');
    expect(k.textContent).toMatch(/No training-controlled documents yet/);
  });
});

describe('SopRegister — the signature block (§11.50; MR-12 Stage 5 step 4)', () => {
  const SIGNED = { state: 'valid', version: '1.0', signerName: 'Dana Whitfield', signedAt: '2026-09-01T14:02:09.000Z', meaning: 'APPROVED' };

  it('shows who approved the version in force, when in UTC, and with what meaning', () => {
    H.docs = [{ ...EFFECTIVE, approvalSignature: SIGNED }];
    renderRegister();
    const line = screen.getByTestId('qms-signature-line');
    expect(line.textContent).toContain('v1.0 · Approved by Dana Whitfield');
    expect(line.textContent).toContain('2026-09-01 14:02:09 UTC');
    expect(line.textContent).toContain('Meaning: Approval');
  });

  it('never shows a changed, withdrawn or unread approval as standing', () => {
    H.docs = [
      { ...EFFECTIVE, approvalSignature: { ...SIGNED, state: 'changed' } },
      { ...EFFECTIVE, id: 7, docNumber: 'SOP-016', approvalSignature: { ...SIGNED, state: 'withdrawn' } },
      { ...EFFECTIVE, id: 8, docNumber: 'SOP-017', approvalSignature: { state: 'unavailable', signerName: null, signedAt: null, meaning: null } },
    ];
    renderRegister();
    const lines = screen.getAllByTestId('qms-signature-line').map((l) => l.textContent ?? '');
    expect(lines[0]).toContain('Content changed after approval');
    expect(lines[1]).toContain('Approval withdrawn');
    expect(lines[2]).toBe('The approval signature could not be read.');
    expect(lines.some((l) => l.startsWith('v1.0 · Approved by'))).toBe(false);
  });

  it('shows who retired a retired document, and says when no retirement signature is on record', () => {
    H.docs = [
      { ...EFFECTIVE, status: 'retired', retirementSignature: { state: 'signed', signerName: 'Q. Lead', signedAt: '2026-10-29T09:00:00.000Z', meaning: 'retirement' } },
      { ...EFFECTIVE, id: 9, docNumber: 'SOP-018', status: 'retired', retirementSignature: { state: 'unsigned', signerName: null, signedAt: null, meaning: null } },
    ];
    renderRegister();
    const lines = screen.getAllByTestId('qms-signature-line').map((l) => l.textContent ?? '');
    expect(lines[0]).toContain('Retired by Q. Lead');
    expect(lines[0]).toContain('Meaning: Retirement');
    expect(lines[1]).toContain('no retirement signature is on record');
  });
});

/* The approval reaches the people assigned to train (P-49; docs/design/QMS_TRAINING_ASSIGNMENT_2026-10-29.md §3.12):
   the dialog says how many, and whether the day chosen leaves them a training period. */
describe('SopRegister — the approve dialog names who it reaches', () => {
  const listing = (peopleCount: number, assignments: unknown[] = [{ id: 1 }]) => ({
    assignments, trainable: { inForce: null, pending: null }, people: [], peopleCount, peopleScope: 'everyone', canAssign: true,
  });
  const open = () => { renderRegister(); fireEvent.click(screen.getByRole('button', { name: /Approve/ })); };
  const later = () => {
    const day = new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10);
    fireEvent.change(screen.getByLabelText(/Effective from/), { target: { value: day } });
    return day;
  };

  it('says effective today leaves the people assigned no training period', () => {
    H.assigned = { listing: listing(3), failed: false };
    open();
    expect(screen.getByText('3 people are assigned to train on this document. Effective today leaves them no training period: it is in force when you sign.')).toBeTruthy();
  });

  it('says a later day lets them read it ahead, until the day it takes effect', () => {
    H.assigned = { listing: listing(1), failed: false };
    open();
    const day = later();
    expect(screen.getByText(`1 person is assigned to train on this document. They can read and acknowledge it from approval until it takes effect on ${day}.`)).toBeTruthy();
  });

  it.each([
    ['nobody is assigned', listing(0, []), false, 'No one is assigned to train on this document.'],
    ['nobody assigned is an active member', listing(0), false, 'No one assigned to train on this document is an active member.'],
    ['the read failed', null, true, 'Who is assigned to train on this document could not be read.'],
  ])('says so when %s, with no count', (_case, value, failed, sentence) => {
    H.assigned = { listing: value, failed };
    open();
    expect(screen.getByText(sentence)).toBeTruthy();
    expect(screen.queryByText(/\d+ (people are|person is) assigned/)).toBeNull();
  });
});
