// @vitest-environment jsdom
/**
 * A periodic review is recorded in the register as an electronic signature on
 * the version in force (gap 5.2; docs/design/QMS_PERIODIC_REVIEW_SIGNED_2026-10-22.md).
 *
 * The Periodic review panel listed due documents and could only open them:
 * the next review date is part of what the approval signed, so its copy said
 * the date "changes through a revision". Here:
 *   - an effective document offers Record review, on the panel and on its
 *     register row; one under revision or in review does not;
 *   - the reviewer chooses "remains current" with a date after today, or
 *     "revision required", then signs with meaning `review`;
 *   - the signed route receives the decision and the signature components,
 *     and the signed confirmation names what was attested;
 *   - each panel row and register row says when its version in force was last
 *     reviewed, by whom, and what was decided;
 *   - a refusal, a dropped connection and focus are handled honestly
 *     (Part 11, accessibility and copy reviews, 2026-10-22).
 *
 * EsignModal's own re-authentication is covered by its own tests. Here it is
 * a stub that hands over what a signer typed.
 */
import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const H = vi.hoisted(() => ({
  reviewRows: [] as unknown[],
  docs: [] as unknown[],
  apiRequest: vi.fn(),
  refresh: vi.fn(),
  reviewRefresh: vi.fn(),
  signed: null as unknown,
  signError: null as string | null,
  signedRows: null as unknown,
}));

const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
const REVIEWED = { signatureId: 91, outcome: 'current', reviewedAt: '2026-01-05T10:00:00Z', reviewerName: 'R. Reviewer', reason: 'Annual review',
  nextReviewDate: day(5), version: '1.0' };
const DUE = { id: 6, docNumber: 'SOP-015', title: 'Supplier controls', nextReviewDate: day(5), overdue: false, status: 'effective', version: '1.0',
  underRevision: false, lastReview: null, signedReviewDate: day(5) };
const REVISING = { ...DUE, id: 7, docNumber: 'SOP-016', title: 'Training records', status: 'draft', version: '2.0', underRevision: true, lastReview: REVIEWED };
const IN_REVIEW = { ...DUE, id: 8, docNumber: 'SOP-017', title: 'Change control', status: 'in_review', version: '1.0' };
/** Reviewed with a date beyond the panel's 120 days: it is on the register only. */
const FAR = { id: 9, docNumber: 'SOP-018', title: 'Calibration', docType: 'sop', category: null, version: '1.0', status: 'effective',
  effectiveDate: '2026-01-01', nextReviewDate: day(400), updatedAt: null, signedReviewDate: day(30),
  lastReview: { ...REVIEWED, signatureId: 92, reviewedAt: '2026-10-22T09:12:00Z', nextReviewDate: day(400) } };

vi.mock('../hooks', () => ({
  useSopRegister: () => ({ docs: H.docs, loading: false, error: null, refresh: H.refresh }),
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
    signedRows?: Array<{ label: string; value: string }>; onClose: () => void;
    onSign: (i: { meaning: string; reason: string; password: string; totp?: string }) => Promise<unknown>;
  }) => {
    H.signedRows = p.signedRows;
    return (
      <div role="dialog" aria-label={p.action} data-meanings={(p.meanings ?? []).join(',')} data-default={p.defaultMeaning}>
        <p>{p.target}</p><p>{p.targetMeta}</p>
        <button onClick={() => p.onSign({ meaning: 'review', reason: 'Annual review against current practice', password: 'pw', totp: '123456' })
          .then((m) => { H.signed = m; }).catch((e: Error) => { H.signError = e.message; })}>stub-sign</button>
        <button onClick={p.onClose}>stub-close</button>
      </div>
    );
  },
}));

import { SopRegister } from '../SopRegister';

const renderRegister = () => render(<SopRegister onAsk={() => {}} filter="all" onFilterChange={() => {}} />);
const signedAnswer = (status = 201, message = 'Your password was not verified.') => ({ status, ok: status < 300,
  json: async () => (status === 201
    ? { data: { kind: 'qms-periodic-review', outcome: 'current' }, signatureId: 91, signedAt: '2026-10-22T09:12:00.000Z', meaning: 'review', sha256Chain: 'c'.repeat(64) }
    : { error: { code: 'AUTH_FAILED', message } }) });

beforeEach(() => {
  H.reviewRows = [DUE, REVISING, IN_REVIEW];
  H.docs = [];
  H.apiRequest.mockReset(); H.refresh.mockReset(); H.reviewRefresh.mockReset();
  H.signed = null; H.signError = null; H.signedRows = null;
});
afterEach(cleanup);

function openDecision() {
  renderRegister();
  const trigger = screen.getByRole('button', { name: 'Record review: SOP-015 Supplier controls' });
  fireEvent.click(trigger);
  return { dialog: screen.getByRole('dialog', { name: 'Record periodic review' }), trigger };
}
function continueCurrent(dialog: HTMLElement, date = day(365)) {
  fireEvent.change(within(dialog).getByLabelText('Next periodic review'), { target: { value: date } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Continue to sign' }));
  return screen.getByRole('dialog', { name: 'Record periodic review' });
}

describe('the Periodic review panel records a signed review of the version in force', () => {
  it('offers Record review on an effective document only, and says when each was last reviewed, in UTC', () => {
    renderRegister();
    const rows = screen.getAllByTestId('qms-review-row');
    expect(within(rows[0]).getByRole('button', { name: /Record review/ })).toBeTruthy();
    expect(within(rows[1]).queryByRole('button', { name: /Record review/ })).toBeNull();
    expect(within(rows[2]).queryByRole('button', { name: /Record review/ })).toBeNull();
    expect(rows[1].textContent).toContain('v1.0 reviewed 2026-01-05 10:00 UTC by R. Reviewer: remains current.');
    expect(rows[1].textContent).toContain('Revision open. Approving the revision sets the next review date.');
    // The last review describes the row's controls, so it is heard with them.
    const open = within(rows[1]).getByRole('button', { name: /Open SOP-016 Training records for its periodic review/ });
    expect(document.getElementById(open.getAttribute('aria-describedby')!)?.textContent).toContain('remains current');
    expect(screen.getByRole('list', { name: 'Periodic review' })).toBeTruthy();
  });

  it('says what is wrong with the date, on the field, and keeps the dialog open', () => {
    const { dialog } = openDecision();
    const proceed = within(dialog).getByRole('button', { name: 'Continue to sign' }) as HTMLButtonElement;
    expect(proceed.disabled).toBe(false);
    fireEvent.click(proceed);
    expect(within(dialog).getByRole('alert').textContent).toBe('Enter the next review date.');
    const date = within(dialog).getByLabelText('Next periodic review');
    expect(date.getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe(date);
    fireEvent.change(date, { target: { value: day(0) } });
    fireEvent.click(proceed);
    expect(within(dialog).getByRole('alert').textContent).toMatch(/^Enter a next review date from \d{4}-\d{2}-\d{2} to \d{4}-\d{2}-\d{2}\.$/);
    expect(screen.getByRole('dialog', { name: 'Record periodic review' })).toBe(dialog);
  });

  it('signs "remains current" with meaning review, posts the decision, and names what was attested once signed', async () => {
    H.apiRequest.mockResolvedValue(signedAnswer());
    const { dialog } = openDecision();
    const next = day(365);
    const sign = continueCurrent(dialog, next);
    expect(sign.getAttribute('data-meanings')).toBe('review');
    expect(sign.getAttribute('data-default')).toBe('review');
    expect(sign.textContent).toContain('SOP-015 Supplier controls (v1.0)');
    expect(sign.textContent).toContain('You attest that v1.0 remains current.');
    expect(H.signedRows).toEqual([{ label: 'Version', value: 'v1.0' }, { label: 'Outcome', value: 'Remains current' },
      { label: 'Next periodic review', value: next }]);
    fireEvent.click(within(sign).getByRole('button', { name: 'stub-sign' }));
    await waitFor(() => expect(H.signed).toEqual({ meaning: 'review', reason: 'Annual review against current practice',
      signedAt: '2026-10-22T09:12:00.000Z', hash: 'c'.repeat(64) }));
    expect(H.apiRequest).toHaveBeenCalledWith('POST', '/api/mdx/qms/documents/6/periodic-review', {
      outcome: 'current', nextReviewDate: next, password: 'pw', mfaToken: '123456', meaning: 'review', reason: 'Annual review against current practice',
    });
    expect(H.refresh).toHaveBeenCalled();
    expect(H.reviewRefresh).toHaveBeenCalled();
  });

  it('signs "revision required" with no date, saying the document keeps the date its approval set', async () => {
    H.apiRequest.mockResolvedValue(signedAnswer());
    const { dialog } = openDecision();
    fireEvent.click(within(dialog).getByLabelText('Revision required'));
    expect(within(dialog).queryByLabelText('Next periodic review')).toBeNull();
    expect(dialog.textContent).toContain(`The document keeps the review date its approval set (${day(5)}).`);
    expect(dialog.textContent).toContain('Recording this does not open a revision');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Continue to sign' }));
    const sign = screen.getByRole('dialog', { name: 'Record periodic review' });
    expect(sign.textContent).toContain('You attest that v1.0 requires revision.');
    fireEvent.click(within(sign).getByRole('button', { name: 'stub-sign' }));
    await waitFor(() => expect(H.signed).toBeTruthy());
    const body = H.apiRequest.mock.calls[0][2] as Record<string, unknown>;
    expect(body).toMatchObject({ outcome: 'revision-required', meaning: 'review' });
    expect(body).not.toHaveProperty('nextReviewDate');
  });
});

describe('refusals and failures say what happened', () => {
  it('a refused password signed nothing, said once, and nothing is refreshed as if it had', async () => {
    H.apiRequest.mockResolvedValue(signedAnswer(401, 'The password was not accepted. Nothing was signed.'));
    const { dialog } = openDecision();
    fireEvent.click(within(continueCurrent(dialog, day(90))).getByRole('button', { name: 'stub-sign' }));
    await waitFor(() => expect(H.signError).toBe('The password was not accepted. Nothing was signed.'));
    expect(H.refresh).not.toHaveBeenCalled();
  });

  it('a review the server refuses as the document now stands reads the register again', async () => {
    H.apiRequest.mockRejectedValue(Object.assign(new Error('A revision of SOP-015 is open, so it cannot be reviewed. Nothing was signed.'), { status: 409 }));
    const { dialog } = openDecision();
    fireEvent.click(within(continueCurrent(dialog)).getByRole('button', { name: 'stub-sign' }));
    await waitFor(() => expect(H.signError).toContain('cannot be reviewed'));
    expect(H.reviewRefresh).toHaveBeenCalled();
  });

  it('a dropped connection is not "nothing was signed": it says to check before signing again', async () => {
    H.apiRequest.mockRejectedValue(new TypeError('Failed to fetch'));
    const { dialog } = openDecision();
    fireEvent.click(within(continueCurrent(dialog)).getByRole('button', { name: 'stub-sign' }));
    await waitFor(() => expect(H.signError).toBe('The server did not confirm the review. Reload the register and check the document’s last review before you sign again.'));
  });
});

describe('the register row shows and takes a review beyond the panel', () => {
  it('names the last review on the Next review cell and offers Record review there', () => {
    H.reviewRows = [];
    H.docs = [FAR];
    renderRegister();
    const last = screen.getByTestId('qms-register-last-review');
    expect(last.textContent).toBe('Reviewed 2026-10-22');
    expect(last.parentElement!.getAttribute('title')).toBe(
      `v1.0 reviewed 2026-10-22 09:12 UTC by R. Reviewer: remains current. The date its approval signed: ${day(30)}.`);
    fireEvent.click(screen.getByRole('button', { name: 'Record review: SOP-018 Calibration' }));
    expect(screen.getByRole('dialog', { name: 'Record periodic review' }).textContent).toContain('You are reviewing v1.0');
  });
});

describe('focus returns where the review started', () => {
  it('to the Record review control on Cancel, and to the panel heading once a review from the panel is recorded', async () => {
    H.apiRequest.mockResolvedValue(signedAnswer());
    const { dialog, trigger } = openDecision();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(document.activeElement).toBe(trigger));
    fireEvent.click(trigger);
    const sign = continueCurrent(screen.getByRole('dialog', { name: 'Record periodic review' }));
    fireEvent.click(within(sign).getByRole('button', { name: 'stub-sign' }));
    await waitFor(() => expect(H.signed).toBeTruthy());
    fireEvent.click(within(sign).getByRole('button', { name: 'stub-close' }));
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Periodic review' })));
  });
});
