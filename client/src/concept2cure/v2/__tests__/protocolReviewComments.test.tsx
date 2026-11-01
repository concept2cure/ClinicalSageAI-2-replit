// @vitest-environment jsdom
/**
 * The protocol's review comments are the protocol's, shown once each.
 *
 * `protocol_review_comments` is keyed by document. The view assembler used to
 * copy every comment onto every review assignment, and the pane flattened the
 * assignments: with two reviewers each comment showed twice, and with none
 * requested yet the comments did not show at all. The assembler now returns
 * them once, as `reviewComments` (pdev-view-assembler.pglite.integration.test.ts),
 * and the pane reads that.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

vi.mock('@/services/portal/authService', () => ({
  useAuthUser: () => ({ id: 1 }),
}));

import { ReviewsTab } from '../surfaces/ProtocolDevReviews';

const REVIEWER = (id: string, name: string) => ({
  id, reviewer: name, role: 'scientific', status: 'pending', reviewerUserId: null,
  disposition: '', dueDate: '', signature: { state: 'none' },
});
const COMMENTS = [
  { id: '11', sec: '9', sev: 'blocking', text: 'Clarify the SAP', resolved: false },
  { id: '12', sec: '5.2', sev: 'minor', text: 'Name the comparator', resolved: true },
];

afterEach(cleanup);

describe('review comments on the protocol', () => {
  it('shows each comment once, however many reviewers there are', () => {
    render(<ReviewsTab doc={{ reviews: [REVIEWER('1', 'Dana Chen'), REVIEWER('2', 'Avery Lee')], reviewComments: COMMENTS }} />);
    expect(screen.getAllByText('Clarify the SAP')).toHaveLength(1);
    expect(screen.getAllByText('Name the comparator')).toHaveLength(1);
    expect(screen.getByText('2 reviewers · 1 blocking open')).toBeTruthy();
  });

  it('shows the comments before any review is requested', () => {
    render(<ReviewsTab doc={{ reviews: [], reviewComments: COMMENTS }} />);
    expect(screen.getByText('Clarify the SAP')).toBeTruthy();
    expect(screen.queryByText('No review comments have been left on this protocol.')).toBeNull();
  });

  it('says there are none only when there are none', () => {
    render(<ReviewsTab doc={{ reviews: [REVIEWER('1', 'Dana Chen')], reviewComments: [] }} />);
    expect(screen.getByText('No review comments have been left on this protocol.')).toBeTruthy();
  });
});
