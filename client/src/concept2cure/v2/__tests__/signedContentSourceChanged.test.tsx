// @vitest-environment jsdom
/**
 * A translation signed against a source that has since moved on (P-64,
 * 2026-10-29; docs/evidence/D5-SIGNED-CONTENT-LOCKED/2026-10-29/). The server's
 * read (signed-content-state.ts) answers `source-changed` when the translation
 * is as it was approved and the document it translates is not. The screen says
 * so in its own words: it is neither "unchanged" nor an edit of the
 * translation, and it is never read as a state this client cannot read.
 */
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { SignedContentLine, showsSignedContent, signedContentFacetOf, signedContentForAna, signedContentWords } from '../SignedContentState';

afterEach(() => cleanup());

const REASON = 'The source it translates changed after it was signed: it was signed against labeling-document:4 at version 2.1, which is now at version 2.2.';
const facet = signedContentFacetOf({
  state: 'source-changed', signatureId: 314, signerName: 'Sam Signer', signedAt: '2026-10-29T10:00:00.000Z', meaning: 'approval',
  bindingBasis: 'labeling-translation-content-sha256', reason: REASON,
});

describe('source-changed', () => {
  it('is a state this client reads, not "could not be read"', () => {
    expect(facet.state).toBe('source-changed');
  });

  it('has its own words', () => {
    expect(signedContentWords(facet)).toBe('Source changed since it was signed');
  });

  it('carries a signature: a line is drawn even for a translation back in review', () => {
    expect(showsSignedContent(facet, false)).toBe(true);
  });

  it("says the words beside its tone, who signed and when, and the server's reason", () => {
    const { container } = render(<SignedContentLine facet={facet} expected label="Approval signature" />);
    const chip = container.querySelector('.rd-chip') as HTMLElement;
    expect(chip.textContent).toBe('Source changed since it was signed');
    expect(chip.className).toContain('tone-err');
    expect(chip.querySelector('svg')).not.toBeNull();
    expect(container.textContent).toContain('Signed by Sam Signer');
    expect(container.textContent).toContain(REASON);
  });

  it('AnA is told the same, with the signer and the reason', () => {
    expect(signedContentForAna(facet)).toMatchObject({ state: 'source-changed', words: 'Source changed since it was signed', signedBy: 'Sam Signer', reason: REASON });
  });
});
