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
 *
 * D7-B (2026-11-06) replaced the four tiles with one sentence above the
 * register's rows; the same honesty holds there.
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

/** The register's figures: one sentence above its rows (D7-B; D5 §WA rule 7, "a count is the section's .sec-sub"). */
const figures = () => screen.queryByTestId('qms-register-figures')?.textContent?.trim() ?? null;
const register = () => screen.getByRole('region', { name: 'Controlled documents' });

/** Wait until the register's read has settled. */
async function settled() {
  await waitFor(() => expect(screen.queryByText('Loading the register…')).toBeNull());
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('SopRegister — a register read and empty', () => {
  it('does not call it all current, and states no overdue count', async () => {
    stubReads(EMPTY);
    mount();
    await settled();
    // An empty register is one quiet line (D5 §WA): no figures, so nothing vacuous.
    expect(figures()).toBeNull();
    expect(register().textContent).toMatch('No controlled documents in the register yet.');
    expect(register().textContent).not.toMatch(/overdue|all current/i);
  });

  it('says the register is empty rather than "none in review"', async () => {
    stubReads(EMPTY);
    mount();
    await settled();
    expect(register().textContent).not.toMatch(/in review/i);
  });
});

describe('SopRegister — a register with documents keeps its real figures', () => {
  const DOC = { id: 1, docNumber: 'SOP-001', title: 'Document control', docType: 'sop', status: 'effective', version: '1.0', nextReviewDate: '2099-01-01' };
  it('counts the documents by status and says none is overdue for review when documents exist and none is due', async () => {
    stubReads({ ...EMPTY, [DOCS]: { status: 200, body: { data: [DOC], meta: { count: 1 } } } });
    mount();
    await waitFor(() => expect(figures()).toBe('1 controlled document: 1 in force; none overdue for review.'));
  });
});
