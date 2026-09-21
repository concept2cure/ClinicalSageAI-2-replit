// @vitest-environment jsdom
/**
 * Review & approval surface — the fixture-free contract, pinned.
 *
 * This surface renders review verdicts, approval workflows and governance
 * comments — data a regulatory user acts on. It must therefore show only REAL,
 * org-scoped rows from GET /api/review/board, or an honest empty/error state.
 * It must NEVER fall back to a fabricated queue behind a "Sample data" pill.
 *
 * The tests below pin exactly that:
 *   · a real board renders real rows (title, reviewer, workflow, thread) and no
 *     "Sample data" affordance, and none of the retired demo content;
 *   · an empty board renders the honest "Nothing is in review" state — not a
 *     fabricated queue;
 *   · a failed load renders the honest error state — not a fabricated queue;
 *   · the view-model module ships no fixture data constants at all.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

// useAuth throws outside an AuthProvider; the surface only needs the signed-in
// identity for in-session comment attribution, so a stub user is enough.
vi.mock('@/services/portal/authService', () => ({
  useAuth: () => ({ user: { displayName: 'Test Reviewer', email: 'rev@test.co', roles: ['Reg lead'] } }),
}));

import { Review } from '../surfaces/Review';
import * as reviewData from '../fixtures/review-data';

function ok(data: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => ({ success: true, data }) } as Response;
}
function fail(status = 500) {
  return { ok: false, status, json: async () => ({ success: false, error: 'boom' }) } as Response;
}

/* Real-shaped board — this is TEST data, defined only in this file and never
   importable by the surface. It mirrors GET /api/review/board's render contract,
   which is built from the AUTHORING review store (authoring_reviews /
   authoring_workflow_steps / authoring_comments — VSR-001 F-6). */
const DOC = '3f2c1a10-0000-4000-8000-000000000055';
const SECTION = '3f2c1a10-0000-4000-8000-000000000101';
const BOARD = {
  queue: [
    {
      id: DOC,
      doc: 'Clinical Overview §2.5',
      prog: 'NDA 200100',
      programId: 'p-1',
      pid: DOC,
      module: 'M2',
      docStatus: 'IN_REVIEW',
      state: 'in-review',
      reviews: [
        { id: 'r-1', reviewerId: '2', reviewer: 'Dana Chen', reviewerEmail: 'dana@x.example', status: 'pending', comments: null, requestedBy: 'author@x.example', requestedAt: '2026-09-20T10:00:00Z', reviewedAt: null },
      ],
      myReviewId: 'r-1',
      myReviewStatus: 'pending',
      awaitingMyReview: true,
      requestedByMe: false,
      atMySignOff: false,
      mine: true,
      reviewer: 'Dana Chen',
      role: 'Reviewer',
      due: '',
      tone: '',
      comments: 1,
      esig: 'pending',
      conf: null,
      prov: 'v3 · requested by author@x.example',
      passage: 'The pivotal study met its primary endpoint.',
      firstSectionId: SECTION,
      requestedAt: '2026-09-20T10:00:00Z',
    },
  ],
  workflows: {
    [DOC]: {
      templateId: 'wf-1',
      template: 'Authoring approval workflow',
      steps: [
        { id: 's-1', order: 1, name: 'QA', approverType: 'user', approver: 'qa@x.example', requiredActions: ['sign'], status: 'current', at: null },
        { id: 's-2', order: 2, name: 'RA_CMC', approverType: 'user', approver: 'ra@x.example', requiredActions: ['sign'], status: 'pending', at: null },
      ],
    },
  },
  thread: [
    { id: '9', author: 'Dana Chen', role: '§2.5', when: '2h ago', state: 'open', body: 'Please tighten the efficacy claim.', ai: false, sectionId: SECTION, parentId: null },
  ],
  meta: { scope: 'all', programId: null, total: 1, threadItemId: DOC, threadDocumentId: DOC, generatedAt: '2026-07-30T00:00:00Z' },
};

const EMPTY_BOARD = {
  queue: [],
  workflows: {},
  thread: [],
  meta: { scope: 'all', programId: null, total: 0, threadItemId: null, threadDocumentId: null, generatedAt: '2026-07-30T00:00:00Z' },
};

/** A string from the RETIRED inline fixture (deleted REVIEW_QUEUE). If it ever
 *  reappears, a fabricated fallback has been reintroduced. */
const RETIRED_FIXTURE_DOC = 'OR-801 SE discussion';

const props = () => ({
  surface: { id: 'review', label: 'Review & approval' } as never,
  onAsk: vi.fn(),
  onNav: vi.fn(),
  segment: 'biotech',
});

afterEach(() => cleanup());
beforeEach(() => {
  apiRequest.mockReset();
});

describe('Review board — real data', () => {
  it('reads the org-scoped GET /api/review/board endpoint', async () => {
    apiRequest.mockImplementation(async () => ok(BOARD));
    render(<Review {...props()} />);
    await waitFor(() => expect(apiRequest).toHaveBeenCalled());
    expect(String(apiRequest.mock.calls[0][0])).toBe('GET');
    // The board is read for the organisation's open review work by default;
    // the scope is explicit in the URL so the server never guesses it.
    expect(String(apiRequest.mock.calls[0][1])).toBe('/api/review/board?scope=all');
  });

  it('switches scope — awaiting my review / requested by me / all open — by re-reading the board', async () => {
    apiRequest.mockImplementation(async () => ok(BOARD));
    render(<Review {...props()} />);
    await screen.findAllByText('Clinical Overview §2.5');
    fireEvent.click(screen.getByRole('button', { name: /Awaiting my review/ }));
    await waitFor(() =>
      expect(apiRequest.mock.calls.some((c) => String(c[1]) === '/api/review/board?scope=mine')).toBe(true));
    fireEvent.click(screen.getByRole('button', { name: /Requested by me/ }));
    await waitFor(() =>
      expect(apiRequest.mock.calls.some((c) => String(c[1]) === '/api/review/board?scope=requested')).toBe(true));
  });

  it('renders the real queue, workflow and thread — never a "Sample data" pill', async () => {
    apiRequest.mockImplementation(async () => ok(BOARD));
    render(<Review {...props()} />);

    // real row + reviewer — the doc title renders in several panels (list row,
    // detail header, doc section), so assert ≥1 rather than exactly one.
    expect((await screen.findAllByText('Clinical Overview §2.5')).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Dana Chen/).length).toBeGreaterThanOrEqual(1);
    // real approval chain from authoring_workflow_steps
    expect(screen.getByText('Authoring approval workflow')).toBeTruthy();
    expect(screen.getByText('RA_CMC')).toBeTruthy();
    // the review request itself, with who asked
    expect(screen.getAllByText(/author@x\.example/).length).toBeGreaterThanOrEqual(1);
    // real thread comment
    expect(screen.getByText('Please tighten the efficacy claim.')).toBeTruthy();

    // no provenance pill, and none of the retired demo content
    expect(screen.queryByText('Sample data')).toBeNull();
    expect(screen.queryByText(new RegExp(RETIRED_FIXTURE_DOC))).toBeNull();
  });
});

describe('Review board — honest empty', () => {
  it('shows the empty state, not a fabricated queue, when the org has nothing in review', async () => {
    apiRequest.mockImplementation(async () => ok(EMPTY_BOARD));
    render(<Review {...props()} />);

    expect(await screen.findByText('Nothing is in review')).toBeTruthy();
    expect(screen.queryByText('Sample data')).toBeNull();
    expect(screen.queryByText(new RegExp(RETIRED_FIXTURE_DOC))).toBeNull();
  });
});

describe('Review board — honest error', () => {
  it('shows the error state, not a fabricated queue, when the load fails', async () => {
    apiRequest.mockImplementation(async () => fail(500));
    render(<Review {...props()} />);

    expect(await screen.findByText("Couldn't load the review board")).toBeTruthy();
    expect(screen.queryByText('Sample data')).toBeNull();
    expect(screen.queryByText(new RegExp(RETIRED_FIXTURE_DOC))).toBeNull();
  });
});

describe('Review view-model module — no fixtures', () => {
  it('exports render-contract types + config only, and no fabricated data constants', () => {
    // config/enums are allowed (deterministic, not fabricated org data)
    expect(reviewData.STATUS_TONE).toBeTruthy();
    expect(Array.isArray(reviewData.ESIGN_MEANINGS)).toBe(true);
    // the retired fabricated queues/threads must be gone
    expect('REVIEW_QUEUE' in reviewData).toBe(false);
    expect('REVIEW_WORKFLOWS' in reviewData).toBe(false);
    expect('REVIEW_THREAD' in reviewData).toBe(false);
  });
});
