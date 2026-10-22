// @vitest-environment jsdom
/**
 * A periodic review is recorded in the register as an electronic signature on
 * the version in force (gap 5.2; docs/design/QMS_PERIODIC_REVIEW_SIGNED_2026-10-22.md).
 *
 * The Periodic review panel listed due documents and could only open them:
 * the next review date is part of what the approval signed, so its copy said
 * the date "changes through a revision". Here:
 *   - an effective due document offers Record review; one under revision or
 *     in review does not;
 *   - the reviewer chooses "remains current" with a date after today, or
 *     "revision required", then signs with meaning `review`;
 *   - the signed route receives the decision and the signature components,
 *     and the time shown is the server's;
 *   - each row says when its version in force was last reviewed, by whom, and
 *     what was decided.
 *
 * EsignModal's own re-authentication is covered by its own tests. Here it is
 * a stub that hands over what a signer typed.
 */
import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const H = vi.hoisted(() => ({
  reviewRows: [] as unknown[],
  apiRequest: vi.fn(),
  refresh: vi.fn(),
  reviewRefresh: vi.fn(),
  signed: null as unknown,
  signError: null as string | null,
}));

const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
const DUE = { id: 6, docNumber: 'SOP-015', title: 'Supplier controls', nextReviewDate: day(5), overdue: false, status: 'effective', version: '1.0', underRevision: false, lastReview: null };
const REVISING = { ...DUE, id: 7, docNumber: 'SOP-016', title: 'Training records', status: 'draft', version: '2.0', underRevision: true,
  lastReview: { outcome: 'current', reviewedAt: '2026-01-05T10:00:00Z', reviewerName: 'R. Reviewer', nextReviewDate: day(5), version: '1.0' } };
const IN_REVIEW = { ...DUE, id: 8, docNumber: 'SOP-017', title: 'Change control', status: 'in_review', version: '1.0' };

vi.mock('../hooks', () => ({
  useSopRegister: () => ({ docs: [], loading: false, error: null, refresh: H.refresh }),
  useSopTemplates: () => ({ templates: [], loading: false, error: null }),
  useReviewDue: () => ({ rows: H.reviewRows, loading: false, error: null, refresh: H.reviewRefresh }),
  useTrainingCompliance: () => ({ rows: [], loading: false, error: null, refresh: vi.fn() }),
}));
vi.mock('@/services/portal/authService', () => ({ useAuthUser: () => ({ name: 'R. Reviewer' }) }));
vi.mock('@/lib/queryClient', () => ({
  apiRequest: (...a: unknown[]) => H.apiRequest(...a),
  serverMessage: (p: { error?: { message?: string } } | null) => p?.error?.message ?? null,
  redactInternals: (m: string) => m,
}));
vi.mock('../../_shared/components/EsignModal', () => ({
  esignSignerOf: (u: { name?: string } | null) => (u?.name ? { name: u.name } : undefined),
  EsignModal: (p: {
    action: string; target: string; targetMeta?: string; meanings?: string[]; defaultMeaning?: string;
    onSign: (i: { meaning: string; reason: string; password: string; totp?: string }) => Promise<unknown>;
  }) => (
    <div role="dialog" aria-label={p.action} data-meanings={(p.meanings ?? []).join(',')} data-default={p.defaultMeaning}>
      <p>{p.target}</p><p>{p.targetMeta}</p>
      <button onClick={() => p.onSign({ meaning: 'review', reason: 'Annual review against current practice', password: 'pw', totp: '123456' })
        .then((m) => { H.signed = m; }).catch((e: Error) => { H.signError = e.message; })}>stub-sign</button>
    </div>
  ),
}));

import { SopRegister } from '../SopRegister';

const renderRegister = () => render(<SopRegister onAsk={() => {}} filter="all" onFilterChange={() => {}} />);
const signedAnswer = (status = 201) => ({ status, ok: status < 300,
  json: async () => (status === 201
    ? { data: { kind: 'qms-periodic-review', outcome: 'current' }, signatureId: 91, signedAt: '2026-10-22T09:12:00.000Z', meaning: 'review' }
    : { error: { code: 'AUTH_FAILED', message: 'Your password was not verified.' } }) });

beforeEach(() => {
  H.reviewRows = [DUE, REVISING, IN_REVIEW];
  H.apiRequest.mockReset(); H.refresh.mockReset(); H.reviewRefresh.mockReset();
  H.signed = null; H.signError = null;
});
afterEach(cleanup);

function openDecision() {
  renderRegister();
  fireEvent.click(screen.getByRole('button', { name: 'Record review: SOP-015 Supplier controls' }));
  return screen.getByRole('dialog', { name: 'Record periodic review' });
}

describe('the Periodic review panel records a signed review of the version in force', () => {
  it('offers Record review on an effective document only, and says when each was last reviewed', () => {
    renderRegister();
    const rows = screen.getAllByTestId('qms-review-row');
    expect(within(rows[0]).getByRole('button', { name: /Record review/ })).toBeTruthy();
    expect(within(rows[1]).queryByRole('button', { name: /Record review/ })).toBeNull();
    expect(within(rows[2]).queryByRole('button', { name: /Record review/ })).toBeNull();
    expect(rows[1].textContent).toContain('v1.0 reviewed');
    expect(rows[1].textContent).toContain('by R. Reviewer: remains current');
    expect(rows[1].textContent).toContain('Revision open: its approval sets the next review.');
    // Each row still opens the document to read.
    expect(within(rows[0]).getByRole('button', { name: /Open SOP-015 Supplier controls for its periodic review/ })).toBeTruthy();
  });

  it('asks for a next review date after today before it can be signed', () => {
    const dialog = openDecision();
    const proceed = within(dialog).getByRole('button', { name: 'Continue to sign' }) as HTMLButtonElement;
    expect(proceed.disabled).toBe(true);
    fireEvent.change(within(dialog).getByLabelText('Next periodic review'), { target: { value: day(0) } });
    expect(proceed.disabled).toBe(true);
    fireEvent.change(within(dialog).getByLabelText('Next periodic review'), { target: { value: day(365) } });
    expect(proceed.disabled).toBe(false);
  });

  it('signs "remains current" with meaning review, posts the decision to the signed route, and shows the server’s time', async () => {
    H.apiRequest.mockResolvedValue(signedAnswer());
    const dialog = openDecision();
    const next = day(365);
    fireEvent.change(within(dialog).getByLabelText('Next periodic review'), { target: { value: next } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Continue to sign' }));
    const sign = screen.getByRole('dialog', { name: 'Record periodic review' });
    expect(sign.getAttribute('data-meanings')).toBe('review');
    expect(sign.getAttribute('data-default')).toBe('review');
    expect(sign.textContent).toContain('SOP-015 Supplier controls (v1.0)');
    expect(sign.textContent).toContain('You attest that v1.0 remains current.');
    expect(sign.textContent).toContain('The document and its approval are not changed.');
    fireEvent.click(within(sign).getByRole('button', { name: 'stub-sign' }));
    await waitFor(() => expect(H.signed).toEqual({ meaning: 'review', reason: 'Annual review against current practice', signedAt: '2026-10-22T09:12:00.000Z' }));
    expect(H.apiRequest).toHaveBeenCalledWith('POST', '/api/mdx/qms/documents/6/periodic-review', {
      outcome: 'current', nextReviewDate: next, password: 'pw', mfaToken: '123456', meaning: 'review', reason: 'Annual review against current practice',
    });
    expect(H.refresh).toHaveBeenCalled();
    expect(H.reviewRefresh).toHaveBeenCalled();
  });

  it('signs "revision required" with no date', async () => {
    H.apiRequest.mockResolvedValue(signedAnswer());
    const dialog = openDecision();
    fireEvent.click(within(dialog).getByLabelText('Revision required'));
    expect(within(dialog).queryByLabelText('Next periodic review')).toBeNull();
    expect(dialog.textContent).toContain('Open a revision with Revise in the register; its approval sets the next review.');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Continue to sign' }));
    const sign = screen.getByRole('dialog', { name: 'Record periodic review' });
    expect(sign.textContent).toContain('You attest that v1.0 needs a revision.');
    fireEvent.click(within(sign).getByRole('button', { name: 'stub-sign' }));
    await waitFor(() => expect(H.signed).toBeTruthy());
    const body = H.apiRequest.mock.calls[0][2] as Record<string, unknown>;
    expect(body).toMatchObject({ outcome: 'revision-required', meaning: 'review' });
    expect(body).not.toHaveProperty('nextReviewDate');
  });

  it('says a refused password signed nothing, and does not refresh as if it had', async () => {
    H.apiRequest.mockResolvedValue(signedAnswer(401));
    const dialog = openDecision();
    fireEvent.change(within(dialog).getByLabelText('Next periodic review'), { target: { value: day(90) } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Continue to sign' }));
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Record periodic review' })).getByRole('button', { name: 'stub-sign' }));
    await waitFor(() => expect(H.signError).toBe('Your password was not verified. Nothing was signed.'));
    expect(H.refresh).not.toHaveBeenCalled();
  });
});
