// @vitest-environment jsdom
/**
 * DocumentAttributionBar — what it says when it does not know (ledger L179).
 *
 * The figure this renders is about a regulated document, so the failure modes
 * matter more than the happy path. Each of these is a distinct sentence in the
 * UI, and the whole point is that none of them can be mistaken for another:
 *
 *   not read yet      ≠  assessed and 0%
 *   still reading     ≠  assessed and 0%
 *   read FAILED       ≠  assessed and 0%
 *   not supported     ≠  assessed and 0%
 *   no text yet       ≠  assessed and 0%
 *
 * A surface that renders any of the first five as "0% attributed" tells the
 * author their document has no provenance when the truth is that nobody looked,
 * and 0% is the reading they will act on.
 *
 * Also pinned: "attributed" is never called "sourced", and the bar itself is
 * decorative — every figure is in the text, which is what a screen reader and a
 * reader without colour vision actually get.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

const { fetchDocumentAttribution } = vi.hoisted(() => ({
  fetchDocumentAttribution: vi.fn(),
}));

vi.mock('../dataOriginsApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../dataOriginsApi')>();
  return { ...actual, fetchDocumentAttribution };
});

import { DocumentAttributionBar } from '../DocumentAttributionBar';
import { AttributionUnsupportedError } from '../dataOriginsApi';

const DOC = { documentTable: 'concept2cure_artifacts', documentId: '501' };

function summary(over: Partial<any> = {}) {
  return {
    documentTable: DOC.documentTable,
    documentId: DOC.documentId,
    contentLength: 100,
    attributedChars: 70,
    unattributedChars: 30,
    byKind: {
      fromSources: 40,
      authorAsserted: 30,
      machineDrafted: 0,
      machineDraftedUnaccepted: 0,
    },
    staleChars: 0,
    generatedAt: '2026-09-19T00:00:00.000Z',
    ...over,
  };
}

/* Reset, then give the mock a BENIGN DEFAULT. Left implementation-less by
   mockReset alone, any call a test did not script returns undefined and the
   component then reads fields off it — surfacing as an unhandled rejection
   attributed to whichever test happened to be running, even though that test's
   own assertions passed. A default makes an unscripted call harmless and
   visible instead of mysterious. */
beforeEach(() => {
  fetchDocumentAttribution.mockReset();
  fetchDocumentAttribution.mockResolvedValue(summary());
});

describe('DocumentAttributionBar', () => {
  it('reports the attributed share in characters, and never calls it "sourced"', async () => {
    fetchDocumentAttribution.mockResolvedValue(summary());
    render(<DocumentAttributionBar {...DOC} />);

    await screen.findByText(/70% of this document has a recorded origin/i);
    expect(screen.getByText(/70 of 100 characters/i)).toBeTruthy();

    // The distinction the whole feature rests on: most of this document is the
    // author's, and the headline must not imply a citation backs it.
    expect(document.body.textContent).not.toMatch(/traces to a source/i);
    expect(screen.getByText(/From sources — 40%/i)).toBeTruthy();
    expect(screen.getByText(/Author-asserted — 30%/i)).toBeTruthy();
    expect(screen.getByText(/No recorded origin — 30%/i)).toBeTruthy();
  });

  it('says it has not read yet rather than showing a zero', async () => {
    // Resolution is deferred one tick, so the pre-answer state is observable.
    // (Not a promise that never settles: that leaves work pending at cleanup.)
    fetchDocumentAttribution.mockImplementation(
      () => new Promise((resolve) => { setTimeout(() => resolve(summary()), 0); }),
    );
    render(<DocumentAttributionBar {...DOC} />);

    // Synchronous: read() sets 'loading' before it awaits.
    expect(screen.getByText(/Reading attribution/i)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/0% of this document/i);
    expect(document.body.textContent).not.toMatch(/No recorded origin/i);

    // Let it land, so nothing is in flight when the test ends.
    await screen.findByText(/70% of this document has a recorded origin/i);
  });

  it('says the read FAILED, and does not render an empty bar as a clean one', async () => {
    fetchDocumentAttribution.mockImplementation(async () => { throw new Error('upstream exploded'); });
    render(<DocumentAttributionBar {...DOC} />);

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/could not be read, so none is shown/i);
    expect(alert.textContent).toMatch(/upstream exploded/i);
    // The failure must not be dressed as an assessed document.
    expect(document.body.textContent).not.toMatch(/has a recorded origin/i);
    expect(screen.getByRole('button', { name: /try again/i })).toBeTruthy();
  });

  it('renders a refusal as "not available", not as an error and not as 0%', async () => {
    fetchDocumentAttribution.mockImplementation(async () => {
      throw new AttributionUnsupportedError('Attribution coverage is not available for "x".');
    });
    render(<DocumentAttributionBar {...DOC} />);

    await screen.findByText(/not available for this document type/i);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(document.body.textContent).not.toMatch(/0% of this document/i);
  });

  it('distinguishes an empty document from an unattributed one', async () => {
    fetchDocumentAttribution.mockResolvedValue(
      summary({
        contentLength: 0,
        attributedChars: 0,
        unattributedChars: 0,
        byKind: { fromSources: 0, authorAsserted: 0, machineDrafted: 0, machineDraftedUnaccepted: 0 },
      }),
    );
    render(<DocumentAttributionBar {...DOC} />);

    await screen.findByText(/no text yet/i);
    expect(document.body.textContent).not.toMatch(/0% of this document has a recorded origin/i);
  });

  it('reports a genuinely unattributed document as 0%, which is the one case that SHOULD say zero', async () => {
    fetchDocumentAttribution.mockResolvedValue(
      summary({
        attributedChars: 0,
        unattributedChars: 100,
        byKind: { fromSources: 0, authorAsserted: 0, machineDrafted: 0, machineDraftedUnaccepted: 0 },
      }),
    );
    render(<DocumentAttributionBar {...DOC} />);

    await screen.findByText(/0% of this document has a recorded origin/i);
    expect(screen.getByText(/No recorded origin — 100%/i)).toBeTruthy();
  });

  it('surfaces unaccepted AI text as its own category rather than folding it into attributed', async () => {
    fetchDocumentAttribution.mockResolvedValue(
      summary({
        attributedChars: 100,
        unattributedChars: 0,
        byKind: {
          fromSources: 0,
          authorAsserted: 40,
          machineDrafted: 0,
          machineDraftedUnaccepted: 60,
        },
      }),
    );
    render(<DocumentAttributionBar {...DOC} />);

    await screen.findByText(/AI draft, not accepted — 60%/i);
    expect(screen.getByText(/nobody has accepted it/i)).toBeTruthy();
  });

  it('reports stale citations as still attributed, in words', async () => {
    fetchDocumentAttribution.mockResolvedValue(summary({ staleChars: 12 }));
    render(<DocumentAttributionBar {...DOC} />);

    await screen.findByText(/12 attributed characters cite a source that has changed/i);
    // Still counted as attributed — the bar must not shrink.
    expect(screen.getByText(/70% of this document has a recorded origin/i)).toBeTruthy();
  });

  it('puts every figure in text, so the bar can be decorative', async () => {
    fetchDocumentAttribution.mockResolvedValue(summary());
    const { container } = render(<DocumentAttributionBar {...DOC} />);
    await screen.findByText(/70% of this document has a recorded origin/i);

    // Colour is never the only signal: the swatches and the bar are hidden from
    // assistive tech precisely because the legend repeats every number.
    const hidden = container.querySelectorAll('[aria-hidden="true"]');
    expect(hidden.length).toBeGreaterThan(0);
    const legend = container.querySelector('ul');
    expect(legend?.textContent).toMatch(/From sources — 40% \(40 characters\)/);
  });

  it('re-reads when the refresh token changes, not on every render', async () => {
    fetchDocumentAttribution.mockResolvedValue(summary());
    const { rerender } = render(<DocumentAttributionBar {...DOC} refreshToken={1} />);
    await waitFor(() => expect(fetchDocumentAttribution).toHaveBeenCalledTimes(1));

    rerender(<DocumentAttributionBar {...DOC} refreshToken={1} />);
    expect(fetchDocumentAttribution).toHaveBeenCalledTimes(1);

    rerender(<DocumentAttributionBar {...DOC} refreshToken={2} />);
    await waitFor(() => expect(fetchDocumentAttribution).toHaveBeenCalledTimes(2));
  });
});
