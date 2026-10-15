// @vitest-environment jsdom
/**
 * A comment AnA wrote for a person reads as AnA's, on their behalf (row D5,
 * 2026-10-01). Both AnA writers of review comments (the add_review_comment
 * command and the guidance executor) post under the person's id and name,
 * because AnA wrote for them; until this change the thread showed those words
 * as the person's own. They now carry author_role 'ana', set when posted.
 */
import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CommentByline } from '../surfaces/ReviewThreads';

describe('CommentByline', () => {
  it('shows a comment AnA wrote as AnA’s, on the person’s behalf', () => {
    render(<CommentByline authorName="Dana Reviewer" authorRole="ana" />);
    expect(screen.getByText('AnA')).toBeTruthy();
    expect(screen.getByText('on behalf of Dana Reviewer')).toBeTruthy();
    expect(screen.queryByText('Dana Reviewer')).toBeNull();
  });

  it('shows a person’s own comment under their name and role', () => {
    render(<CommentByline authorName="Dana Reviewer" authorRole="reviewer" />);
    expect(screen.getByText('Dana Reviewer')).toBeTruthy();
    expect(screen.getByText('reviewer')).toBeTruthy();
    expect(screen.queryByText('AnA')).toBeNull();
  });
});
