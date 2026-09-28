// @vitest-environment jsdom
/**
 * Who signed, shown from the signature record on the protocol workspace
 * (periodic review 2026-09-28, editor family, P11-C-2).
 *
 * A signed disposition read "<assigned reviewer> · Approve" and nothing else:
 * no signer, no time, no meaning, and a decision recorded on behalf of a
 * reviewer with no account read like that reviewer's own. The read model now
 * carries each signed act's facet from electronic_signatures (the printed name
 * recorded at signing, the time, the meaning, the on-behalf-of name), and the
 * pane prints it. `SignatureLine` is the same line the protocol header shows for
 * the finalization signature.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';

vi.mock('@/services/portal/authService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/portal/authService')>()),
  useAuthUser: () => ({ id: '9', email: 'me@c2c.test', organizationId: '42' }),
}));

import { ReviewsTab, SignatureLine } from '../surfaces/ProtocolDevReviews';

afterEach(cleanup);

const SIGNED_AT = '2026-09-28T04:40:12.000Z';

const signed = (over: Record<string, unknown> = {}) => ({
  state: 'signed',
  signature: {
    signerName: 'Dana Approver', signedAt: SIGNED_AT, meaning: 'responsibility',
    reason: 'Recording the emailed approval', recordedOnBehalfOf: null, ...over,
  },
});

const review = (over: Record<string, unknown>) => ({
  id: '5', reviewer: 'Dr Iyer', role: 'scientific', status: 'completed', disposition: 'approve',
  dueDate: '', reviewerUserId: null, comments: [], ...over,
});

function row(r: Record<string, unknown>): HTMLElement {
  const { container } = render(<ReviewsTab doc={{ reviews: [r] }} onEdit={vi.fn()} />);
  return container.querySelector('.pde-review-row') as HTMLElement;
}

describe('a review row shows the signature on record', () => {
  it('who signed, as what, and when, from the signature row', () => {
    const el = row(review({ reviewerUserId: 9, reviewer: 'Dr Rui Reviewer', signature: signed({ signerName: 'Dr Rui Reviewer', meaning: 'review' }) }));
    expect(within(el).getByText(/Signed by/).textContent).toMatch(/Signed by Dr Rui Reviewer as Review/);
    expect(within(el).getByText(/2026-09-28 04:40:12 UTC/)).toBeTruthy();
  });

  it('a decision recorded for a reviewer with no account names the signer, and whom it was recorded for', () => {
    const el = row(review({ signature: signed({ recordedOnBehalfOf: 'Dr Iyer' }) }));
    const line = within(el).getByText(/Signed by/);
    expect(line.textContent).toMatch(/Signed by Dana Approver as Responsibility/);
    expect(line.textContent).toMatch(/recorded on behalf of Dr Iyer/);
  });

  it('a revoked signature says it is revoked', () => {
    const el = row(review({ signature: { ...signed(), state: 'revoked' } }));
    expect(within(el).getByText(/Signature revoked/).textContent).toMatch(/Dana Approver/);
  });

  it('a recorded disposition with no signature on record says so', () => {
    const el = row(review({ signature: { state: 'none' } }));
    expect(within(el).getByText(/No electronic signature is on record/)).toBeTruthy();
  });

  it('a signature record that could not be read is said, not left blank', () => {
    const el = row(review({ signature: { state: 'unavailable' } }));
    expect(within(el).getByText(/signature record could not be read/)).toBeTruthy();
  });

  it('an open review, with nothing signed, says nothing about a signature', () => {
    const el = row(review({ status: 'assigned', disposition: '', signature: { state: 'none' } }));
    expect(within(el).queryByText(/signature/i)).toBeNull();
  });
});

describe('SignatureLine, as the protocol header uses it for the finalization', () => {
  it('a finalized protocol with no live signature says so, never nothing', () => {
    render(<SignatureLine facet={{ state: 'none' }} expected />);
    expect(screen.getByText(/No electronic signature is on record/)).toBeTruthy();
  });

  it('a protocol that is not finalized, with no signature, renders nothing', () => {
    const { container } = render(<SignatureLine facet={{ state: 'none' }} expected={false} />);
    expect(container.textContent).toBe('');
  });

  it('a read model without the facet is treated as unreadable, not as unsigned', () => {
    render(<SignatureLine facet={undefined} expected />);
    expect(screen.getByText(/signature record could not be read/)).toBeTruthy();
  });

  it('the meaning is printed in words', () => {
    render(<SignatureLine facet={signed({ meaning: 'approval' })} expected />);
    expect(screen.getByText(/Signed by/).textContent).toMatch(/as Approval/);
  });
});
