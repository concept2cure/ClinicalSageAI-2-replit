// @vitest-environment jsdom
/**
 * SopRegister — an empty register makes no vacuous compliance claim
 * (launch sweep finding 112, the clause left after the HS-1 fix, 12e12240c).
 *
 * HS-1 made a failed read a failure and "no training-controlled documents" a
 * dash, and is pinned by its own tests (quality/__tests__/). Over a register
 * that was read and holds nothing, two tiles still spoke as if something had
 * been assessed: "Under review 0 — None in review" and "Review overdue 0 —
 * All current". A QA lead on a new tenant read a compliant register.
 */
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { SopRegister } from '../../quality/SopRegister';

type Route = { status: number; body: unknown };

/** Answer each QMS read from `routes` (keyed by path without the query). */
function stubReads(routes: Record<string, Route>) {
  const fn = vi.fn(async (input: string | URL | Request) => {
    const path = String(input).split('?')[0];
    const r = routes[path] ?? { status: 404, body: { error: 'not found' } };
    return {
      ok: r.status < 400,
      status: r.status,
      json: async () => r.body,
      text: async () => JSON.stringify(r.body),
    } as unknown as Response;
  });
  vi.stubGlobal('fetch', fn as unknown as typeof fetch);
  return fn;
}

const DOCS = '/api/mdx/qms/documents';
const TEMPLATES = '/api/mdx/qms/templates';
const REVIEW = '/api/mdx/qms/documents/review-due';
const TRAINING = '/api/mdx/qms/training/compliance';

const EMPTY: Record<string, Route> = {
  [DOCS]: { status: 200, body: { data: [], meta: { count: 0 } } },
  [TEMPLATES]: { status: 200, body: { data: [], meta: { count: 0 } } },
  [REVIEW]: { status: 200, body: { data: [], meta: { count: 0, withinDays: 120 } } },
  [TRAINING]: { status: 200, body: { data: [], meta: { count: 0 } } },
};
function mount() {
  return render(<SopRegister onAsk={() => {}} filter="all" onFilterChange={() => {}} />);
}

/** The KPI tile whose label is `label`. */
function tile(label: string): HTMLElement {
  const lbl = screen.getByText(label, { selector: '.qms-kpi .lbl' });
  return lbl.closest('.qms-kpi') as HTMLElement;
}
const tileVal = (label: string) => tile(label).querySelector('.val')?.textContent?.trim() ?? '';
const tileSub = (label: string) => tile(label).querySelector('.sub')?.textContent?.trim() ?? '';

/** Wait until the four reads have settled (no tile still says Loading). */
async function settled() {
  await waitFor(() => {
    for (const l of ['Effective documents', 'Review overdue', 'Training compliance']) {
      expect(tileSub(l)).not.toBe('Loading…');
    }
  });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('SopRegister — a register read and empty', () => {
  it('does not call it "All current", and states no overdue count', async () => {
    stubReads(EMPTY);
    mount();
    await settled();
    expect(tileVal('Review overdue')).toBe('—');
    expect(tileSub('Review overdue')).toBe('Nothing in the register to review');
    expect(screen.queryByText('All current')).toBeNull();
  });

  it('says the register is empty rather than "None in review"', async () => {
    stubReads(EMPTY);
    mount();
    await settled();
    expect(tileSub('Under review')).toBe('Nothing in the register yet');
    expect(screen.queryByText('None in review')).toBeNull();
  });
});

describe('SopRegister — a register with documents keeps its real figures', () => {
  const DOC = { id: 1, docNumber: 'SOP-001', title: 'Document control', docType: 'sop', status: 'effective', version: '1.0', nextReviewDate: '2099-01-01' };
  it('says "All current" and "None in review" when documents exist and none is due or in review', async () => {
    stubReads({ ...EMPTY, [DOCS]: { status: 200, body: { data: [DOC], meta: { count: 1 } } } });
    mount();
    await settled();
    await waitFor(() => expect(tileVal('Effective documents')).toBe('1'));
    expect(tileVal('Review overdue')).toBe('0');
    expect(tileSub('Review overdue')).toBe('All current');
    expect(tileSub('Under review')).toBe('None in review');
  });
});
