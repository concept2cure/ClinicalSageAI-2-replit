// @vitest-environment jsdom
/**
 * A signed disposition is shown as signed, not offered again (periodic review
 * 2026-09-28, editor family, P11-C-4, Record-disposition half).
 *
 * The button was disabled only when the review belonged to another user, so a
 * signed review kept offering "Record disposition": the drawer, then the
 * e-signature, then the password and the authenticator code, all spent on a
 * request the server refuses ("A disposition is already signed for this
 * review"). The pane now uses the server's own two-part condition
 * (protocol-reviews-service.ts setDispositionTx): a completed review, or one
 * with a disposition, is signed.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

vi.mock('@/services/portal/authService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/portal/authService')>()),
  useAuthUser: () => ({ id: '9', email: 'me@c2c.test', organizationId: '42' }),
}));

import { ReviewsTab } from '../surfaces/ProtocolDevReviews';

afterEach(cleanup);

const review = (over: Record<string, unknown>) => ({
  id: '5', reviewer: 'Dr Iyer', role: 'scientific', status: 'assigned', disposition: '',
  dueDate: '', reviewerUserId: null, comments: [], signature: { state: 'none' }, ...over,
});

function pane(r: Record<string, unknown>) {
  const onEdit = vi.fn();
  render(<ReviewsTab doc={{ reviews: [r] }} onEdit={onEdit} />);
  return onEdit;
}

describe('the disposition control on a review row', () => {
  it.each([
    ['a disposition recorded', { status: 'completed', disposition: 'approve' }],
    ['a completed review, disposition column empty', { status: 'completed', disposition: '' }],
    ['a disposition recorded, status not yet moved', { status: 'in_progress', disposition: 'reject' }],
  ])('%s: shows the signed state and opens nothing', (_label, over) => {
    const onEdit = pane(review(over));
    const btn = screen.getByRole('button', { name: /Disposition signed for Dr Iyer/ }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(btn.textContent).toContain('Disposition signed');
    expect(btn.title).toBe('A disposition is already signed for this review.');
    fireEvent.click(btn);
    expect(onEdit).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /Record disposition/ })).toBeNull();
  });

  it('an open review still offers the signature, to anyone who may record it', () => {
    const onEdit = pane(review({}));
    const btn = screen.getByRole('button', { name: /Record disposition for Dr Iyer/ }) as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
    fireEvent.click(btn);
    expect(onEdit).toHaveBeenCalledWith('review-disposition', expect.objectContaining({ id: 5, label: 'Dr Iyer', reviewerUserId: null }));
  });

  it('an open review assigned to someone else stays disabled, with that reason', () => {
    pane(review({ reviewerUserId: 21, reviewer: 'Dr Amara Okafor' }));
    const btn = screen.getByRole('button', { name: /Record disposition for Dr Amara Okafor/ }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    // The reason is visible text the button is described by (GA-7, 780a0639),
    // not a title a disabled button never exposes.
    const why = document.getElementById(btn.getAttribute('aria-describedby') ?? '');
    expect(why?.textContent).toMatch(/Assigned to another user/);
  });
});
