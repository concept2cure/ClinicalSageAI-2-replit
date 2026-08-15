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
import { cleanup, render, screen, waitFor } from '@testing-library/react';

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
   importable by the surface. It mirrors GET /api/review/board's render contract. */
const BOARD = {
  queue: [
    {
      id: '101',
      doc: 'Clinical Overview §2.5',
      prog: 'NDA 200100',
      pid: '55',
      secKey: '2.5',
      reviewer: 'Dana Chen',
      role: 'Clinical',
      due: 'Today',
      tone: 'err',
      state: 'in-review',
      comments: 1,
      esig: 'pending',
      conf: null,
      prov: 'v3 · last changed by Dana Chen',
      passage: 'The pivotal study met its primary endpoint.',
    },
  ],
  workflows: {
    '101': {
      templateId: 'wft_ctd_section',
      template: 'CTD section sign-off',
      steps: [
        { id: 1, order: 1, name: 'Author self-review', approverType: 'user', approver: 'Dana Chen', requiredActions: ['review'], status: 'approved', at: 'yesterday' },
        { id: 2, order: 2, name: 'Regulatory sign-off', approverType: 'role', approver: 'Reg lead', requiredActions: ['review', 'approve', 'sign'], status: 'current', at: null },
      ],
    },
  },
  thread: [
    { id: '9', author: 'Dana Chen', role: 'Clinical', when: '2h ago', state: 'open', body: 'Please tighten the efficacy claim.', ai: false },
  ],
  meta: { scope: 'all', total: 1, threadItemId: '101', threadDocumentId: 55, generatedAt: '2026-07-30T00:00:00Z' },
};

const EMPTY_BOARD = {
  queue: [],
  workflows: {},
  thread: [],
  meta: { scope: 'all', total: 0, threadItemId: null, threadDocumentId: null, generatedAt: '2026-07-30T00:00:00Z' },
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
    expect(String(apiRequest.mock.calls[0][1])).toBe('/api/review/board');
  });

  it('renders the real queue, workflow and thread — never a "Sample data" pill', async () => {
    apiRequest.mockImplementation(async () => ok(BOARD));
    render(<Review {...props()} />);

    // real row + reviewer — the doc title renders in several panels (list row,
    // detail header, doc section), so assert ≥1 rather than exactly one.
    expect((await screen.findAllByText('Clinical Overview §2.5')).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Dana Chen/).length).toBeGreaterThanOrEqual(1);
    // real workflow template + step
    expect(screen.getByText('CTD section sign-off')).toBeTruthy();
    expect(screen.getByText('Regulatory sign-off')).toBeTruthy();
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
