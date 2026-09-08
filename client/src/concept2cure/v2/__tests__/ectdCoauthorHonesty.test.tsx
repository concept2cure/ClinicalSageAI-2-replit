// @vitest-environment jsdom
/**
 * The eCTD backbone footer may not measure a dossier nobody has read.
 *
 * ── The finding ──────────────────────────────────────────────────────────────
 * `<div className="ec-tree-foot">` was a SIBLING of the tree body's own
 * `loading ? … : error ? … : docs.length === 0 ? …` ternary, not a branch of it,
 * so it rendered on every pass:
 *
 *   Documents          0
 *   Approved           0
 *   eCTD readiness     0%
 *
 * `docs` is still its `useState<CoauthorDoc[]>([])` initial value for the whole
 * of `loading === true` and for the entire error branch — the documents fetch
 * handler returns after `setError` without ever calling `setDocs` — so `total`,
 * `approvedCount` and the `total ? … : 0` readiness fallback were all 0 in
 * exactly the two states where the true figures are unknown. The strip printed
 * a computed, specific readiness percentage for a backbone that had not been
 * read, while the pane immediately above it said "Loading eCTD documents…" or
 * "Couldn't load eCTD documents." A regulatory director glancing at the KPI
 * column reads a measurement.
 *
 * ── Why `total > 0` is the real evidence, not a restatement of emptiness ─────
 * `readiness` is `(approved + review * 0.5) / total`. It is a measurement only
 * when it divides by something: `total > 0` is the non-zero denominator, and it
 * is the one condition under which the figure was computed against anything at
 * all. With no documents the surface is not "0% ready" — nothing has been
 * assessed. Findings are the documents not yet approved, so a backbone whose
 * documents are ALL approved is `assessed-clear` and still reads 100%; that is
 * the over-correction guard at the bottom of this file.
 *
 * Every assertion below is behavioural: the component is rendered, the mocked
 * `/api/coauthor/documents` response is the only input, and the assertions read
 * the DOM the user sees.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, act, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { EctdCoauthor } from '../surfaces/EctdCoauthor';

const props = () =>
  ({ surface: { id: 'ectd-coauthor', label: 'eCTD' } as any, onAsk: vi.fn(), onNav: vi.fn(), segment: 'biopharma' });

const ok = (obj: unknown) => ({ ok: true, status: 200, json: async () => obj } as Response);
const fail = (status: number) => ({ ok: false, status, json: async () => ({ error: 'nope' }) } as Response);

/* Three real rows: one approved, one in review, one draft.
   readiness = (1 + 0.5) / 3 = 50% — a figure that is only meaningful because
   the denominator is 3. */
const MIXED_DOCS = {
  documents: [
    { id: 8001, title: 'Clinical Overview — QX-4', content: '<p>Overview.</p>', status: 'review', moduleNumber: '2.5' },
    { id: 8002, title: 'Drug Product — QX-4', content: '', status: 'draft', moduleNumber: '3.2.P' },
    { id: 8003, title: 'Integrated Summary of Safety', content: '<p>ISS.</p>', status: 'approved', moduleNumber: '5.3' },
  ],
  total: 3,
};

/* The earned-clearance case: every document approved or finalized.
   statusToken() maps 'finalized' onto 'approved', so approvedCount === total,
   no document is outstanding, and readiness is exactly 100. */
const ALL_APPROVED_DOCS = {
  documents: [
    { id: 8101, title: 'Clinical Overview — QX-4', content: '<p>Overview.</p>', status: 'approved', moduleNumber: '2.5' },
    { id: 8102, title: 'Integrated Summary of Safety', content: '<p>ISS.</p>', status: 'finalized', moduleNumber: '5.3' },
  ],
  total: 2,
};

const NO_DOCS = { documents: [], total: 0 };

/** The value cell of the tree-footer row whose label matches, '' if absent. */
function footRow(label: string): string {
  const row = Array.from(document.querySelectorAll('.ec-tree-foot-row')).find(
    (el) => (el.querySelector('span')?.textContent || '').trim() === label,
  );
  return row?.querySelector('b')?.textContent?.trim() || '';
}

const footText = () => document.querySelector('.ec-tree-foot')?.textContent || '';

function serve(documentsResponse: () => Promise<Response>) {
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (method === 'GET' && String(url).split('?')[0] === '/api/coauthor/documents') return documentsResponse();
    return ok({});
  });
}

afterEach(cleanup);
beforeEach(() => apiRequest.mockReset());

describe('EctdCoauthor — the backbone footer while the documents read is in flight', () => {
  it('states nothing has been read yet, and prints no count and no percentage', async () => {
    // Hold the read open so the component is observed in `loading === true`,
    // the state the footer used to report "eCTD readiness 0%" from.
    let release!: () => void;
    serve(() => new Promise<Response>((res) => { release = () => res(ok(MIXED_DOCS)); }));

    render(<EctdCoauthor {...props()} />);

    // The tree body is saying it is still loading …
    expect(screen.getAllByText(/Loading eCTD documents/).length).toBeGreaterThan(0);

    // … and the footer no longer contradicts it two panes away. The untrue
    // claims first, so a regression names the defect rather than the new copy.
    expect(footRow('Status roll-up'), 'no readiness may be scored mid-read').toBe('');
    expect(footRow('Documents'), 'the document count is unknown, not zero').toBe('');
    expect(footRow('Approved'), 'the approved count is unknown, not zero').toBe('');
    expect(/\d/.test(footText()), 'no figure may be asserted before the read settles').toBe(false);
    expect(document.body.textContent, 'the exact sentence that was false').not.toMatch(/0\s*%/);
    // And it must still say something — a blank strip would be its own defect.
    expect(footRow('eCTD backbone')).toBe('Reading…');

    // The gate withholds; it must not delete. Once the read settles the real
    // figures appear — see the measured-backbone case below for the values.
    await act(async () => { release(); });
    await waitFor(() => expect(footRow('Documents')).toBe('3'));
  });
});

describe('EctdCoauthor — the backbone footer after a failed documents read', () => {
  it('reports the backbone as not read rather than as an empty, 0%-ready dossier', async () => {
    serve(async () => fail(403));

    render(<EctdCoauthor {...props()} />);
    expect(await screen.findByText("Couldn't load eCTD documents")).toBeTruthy();

    // A failed read establishes no count. Zero is not the answer to "how many".
    expect(footRow('Status roll-up'), 'a failed read is not a 0% readiness').toBe('');
    expect(footRow('Documents'), 'a failed read is not a zero-document dossier').toBe('');
    expect(footRow('Approved'), 'a failed read is not zero approved documents').toBe('');
    expect(/\d/.test(footText()), 'a failed read may not be rendered as a measurement').toBe(false);
    expect(document.body.textContent, 'the exact sentence that was false').not.toMatch(/0\s*%/);
    // The failure is named, not swallowed.
    expect(footRow('eCTD backbone')).toBe('Not read');
  });
});

describe('EctdCoauthor — the backbone footer when the read succeeds with no documents', () => {
  it('keeps the counts it genuinely established and declines to score readiness', async () => {
    serve(async () => ok(NO_DOCS));

    render(<EctdCoauthor {...props()} />);
    expect(await screen.findByText('No eCTD documents yet')).toBeTruthy();

    // These two ARE established by a settled read: the org has no co-author
    // documents. Withholding them here would be its own dishonesty.
    expect(footRow('Documents')).toBe('0');
    expect(footRow('Approved')).toBe('0');
    // Readiness is not. It was measured against nothing — `readiness`'s `: 0`
    // fallback is a placeholder, not a finding of "0% ready to file".
    expect(footRow('Status roll-up')).toBe('Not assessed');
    expect(document.body.textContent).not.toMatch(/0\s*%/);
  });
});

describe('EctdCoauthor — the backbone footer over a real backbone', () => {
  it('reports the measured figures derived from the rows', async () => {
    serve(async () => ok(MIXED_DOCS));

    render(<EctdCoauthor {...props()} />);
    await screen.findByText('Drug Product — QX-4');

    expect(footRow('Documents')).toBe('3');
    expect(footRow('Approved')).toBe('1');
    // (1 approved + 1 review × 0.5) / 3 = 50%.
    expect(footRow('Status roll-up')).toBe('50%');
    // One document approved out of three is not clearance.
    expect(footText()).not.toMatch(/All documents approved/);
  });

  /**
   * OVER-CORRECTION GUARD.
   *
   * A gate that can never read clear is the same defect wearing another face.
   * With every document approved or finalized the backbone is `assessed-clear`:
   * the percentage renders, reaches 100, and the one reassuring line this strip
   * carries is allowed through `mayReassure`.
   */
  it('still reaches 100% and says so when every document really is approved', async () => {
    serve(async () => ok(ALL_APPROVED_DOCS));

    render(<EctdCoauthor {...props()} />);
    await screen.findByText('Integrated Summary of Safety');

    expect(footRow('Documents')).toBe('2');
    expect(footRow('Approved')).toBe('2');
    expect(footRow('Status roll-up')).toBe('100%');
    expect(footRow('eCTD backbone')).toBe('All documents approved');
  });
});

describe('EctdCoauthor — what a partial page, a document switch and a refusal may claim', () => {
  it('a page shorter than the server total withholds the roll-up and says how much was read', async () => {
    serve(async () => ok({ documents: MIXED_DOCS.documents, total: 120 }));
    render(<EctdCoauthor {...props()} />);
    await screen.findByText('Drug Product — QX-4');
    expect(footRow('Documents')).toBe('3 of 120 read');
    expect(footRow('Status roll-up')).toBe('Partial read — not computed');
    expect(footText()).not.toMatch(/All documents approved/);
  });

  it('a validation verdict for document A never lands under document B', async () => {
    let releaseA: (r: Response) => void = () => {};
    apiRequest.mockImplementation(async (method: string, url: string) => {
      const u = String(url);
      if (method === 'GET' && u.split('?')[0] === '/api/coauthor/documents') return ok(MIXED_DOCS);
      if (method === 'POST' && u === '/api/coauthor/documents/8001/validate') {
        return new Promise<Response>((resolve) => { releaseA = resolve; });
      }
      return ok({});
    });
    render(<EctdCoauthor {...props()} />);
    await screen.findByText('Drug Product — QX-4');
    // Open A (the first document) and start its validation.
    fireEvent.click(screen.getAllByText('Clinical Overview — QX-4')[0]);
    fireEvent.click(screen.getAllByRole('button', { name: /Validate/ })[0]);
    // Switch to B while A's run is in flight, then let A's verdict land.
    fireEvent.click(screen.getAllByText('Drug Product — QX-4')[0]);
    releaseA(ok({ validation: { isValid: true, errorCount: 0, warningCount: 0, totalSections: 9, findings: [] } }));
    await new Promise((r) => setTimeout(r, 50));
    expect(document.querySelector('.ec-vbadge')).toBeNull();
    expect(document.body.textContent).not.toMatch(/Validating Clinical Overview/);
  });

  it('a refused validation says it was refused, with the reason, not merely "no result"', async () => {
    apiRequest.mockImplementation(async (method: string, url: string) => {
      const u = String(url);
      if (method === 'GET' && u.split('?')[0] === '/api/coauthor/documents') return ok(MIXED_DOCS);
      if (method === 'POST' && u.endsWith('/validate')) {
        throw Object.assign(new Error('You do not have permission for this action'), { name: 'ApiRequestError', status: 403 });
      }
      return ok({});
    });
    render(<EctdCoauthor {...props()} />);
    await screen.findByText('Drug Product — QX-4');
    fireEvent.click(screen.getAllByRole('button', { name: /Validate/ })[0]);
    await waitFor(() => expect(document.body.textContent).toMatch(/did not produce a result — You do not have permission for this action/));
    expect(document.body.textContent).not.toMatch(/Valid\b/);
  });
});
