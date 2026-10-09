// @vitest-environment jsdom
/**
 * AnA's output card.
 *
 * Pinned: the miniature page is the draft's REAL text (never filler), a draft
 * with no text carried shows its title alone, the saved line claims a save
 * only when one was reported, and the card is a button only when its host has
 * somewhere to open it.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { AnaOutputCards, pageExcerpt } from '../AnaOutputs';

afterEach(cleanup);

const draft = (over: Record<string, unknown> = {}) => ({
  generatedDraft: { title: 'Clinical Overview 2.5', content: '# Clinical Overview 2.5\n\n**Benefit–risk.** The pivotal study met its primary endpoint.', documentType: 'clinical_overview', ...over },
  streaming: false,
});

describe('AnaOutputCards', () => {
  it('renders the draft\'s own opening text on the page, markup removed and the title not repeated', () => {
    const { container } = render(<AnaOutputCards message={draft()} />);
    const page = container.querySelector('.ana-out-page-b')?.textContent ?? '';
    expect(page).toBe('Benefit–risk. The pivotal study met its primary endpoint.');
    // The page is decoration for sighted readers; the caption carries the name.
    expect(container.querySelector('.ana-out-thumb')?.getAttribute('aria-hidden')).toBe('true');
    expect(screen.getByText('Clinical Overview 2.5', { selector: '.ana-out-title' })).toBeTruthy();
    expect(screen.getByText('Clinical overview · Not reported as saved')).toBeTruthy();
  });

  it('shows the title alone when the turn carried no text — never a placeholder page', () => {
    const { container } = render(<AnaOutputCards message={draft({ content: '' })} />);
    expect(container.querySelector('.ana-out-page-b')).toBeNull();
    expect(container.querySelector('.ana-out-page-t')?.textContent).toBe('Clinical Overview 2.5');
  });

  it('claims a save only when one was reported', () => {
    const { rerender } = render(<AnaOutputCards message={draft({ artifactId: 'a1', version: 3 })} />);
    expect(screen.getByText(/Saved · version 3/)).toBeTruthy();
    rerender(<AnaOutputCards message={draft({ authoringDocId: 'doc_1' })} />);
    expect(screen.getByText(/Saved as an authoring document/)).toBeTruthy();
    rerender(<AnaOutputCards message={{ ...draft(), streaming: true }} />);
    expect(screen.getByText(/Save not yet reported/)).toBeTruthy();
  });

  it('is a button only when the host has somewhere to open it', () => {
    const { rerender } = render(<AnaOutputCards message={draft()} />);
    expect(screen.queryByRole('button')).toBeNull();
    const onOpen = vi.fn();
    rerender(<AnaOutputCards message={draft()} onOpen={onOpen} openLabel="Open in conversation" />);
    fireEvent.click(screen.getByRole('button', { name: /Clinical Overview 2\.5.*Open in conversation/ }));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('renders nothing for a turn with no draft', () => {
    const { container } = render(<AnaOutputCards message={{ streaming: false }} />);
    expect(container.firstChild).toBeNull();
  });

  it('clips a long draft and marks the cut', () => {
    const out = pageExcerpt('word '.repeat(400), 'Title');
    expect(out.endsWith('…')).toBe(true);
    expect(out.length).toBeLessThanOrEqual(521);
  });
});
