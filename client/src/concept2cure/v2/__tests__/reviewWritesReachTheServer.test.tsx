// @vitest-environment jsdom
/**
 * Every governed act on the Review board is the AUTHORING workflow's own
 * transition — there is one review store and one state machine (VSR-001 F-6).
 *
 * ── The defect this replaces ─────────────────────────────────────────────────
 * The board used to write decisions, delegations and comments to
 * document_workflows / workflow_approvals / document_comments through its own
 * routes (/api/review/workflows/:id/decision …). Authoring writes
 * authoring_reviews / authoring_workflow_steps / authoring_comments. A review
 * requested in Authoring was invisible here, and a decision recorded here was
 * invisible in Authoring.
 *
 * ── What this asserts ────────────────────────────────────────────────────────
 * The chain, not the render: each act reaches the authoring router with the
 * body IT requires, the board is RE-READ afterwards so the surface shows the
 * record rather than a memory of the click, and a refused write leaves the
 * screen matching the record. And two absences: there is no delegate (the
 * authoring workflow has no such transition — a reviewer is added with
 * POST /documents/:id/request-review), and nothing here signs.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { Review } from '../surfaces/Review';

const DOC = '3f2c1a10-0000-4000-8000-000000000055';
const SECTION = '3f2c1a10-0000-4000-8000-000000000101';

const BOARD = {
  queue: [{
    id: DOC, doc: 'Clinical Overview §2.5', prog: 'NDA 200100', programId: 'p-1', pid: DOC, module: 'M2',
    docStatus: 'IN_REVIEW', state: 'in-review',
    reviews: [{ id: 'r-1', reviewerId: '2', reviewer: 'Dana Chen', reviewerEmail: 'dana@x.example', status: 'pending', comments: null, requestedBy: 'author@x.example', requestedAt: '2026-09-20T10:00:00Z', reviewedAt: null }],
    myReviewId: 'r-1', myReviewStatus: 'pending', awaitingMyReview: true, requestedByMe: false, atMySignOff: false, mine: true,
    reviewer: 'Dana Chen', role: 'Reviewer', due: '', tone: '', comments: 1, esig: 'pending', conf: null, prov: 'v3',
    passage: 'The pivotal study met its primary endpoint.', firstSectionId: SECTION, requestedAt: '2026-09-20T10:00:00Z',
  }],
  workflows: {
    [DOC]: {
      templateId: 'wf-1', template: 'Authoring approval workflow',
      steps: [{ id: 's-1', order: 1, name: 'QA', approverType: 'user', approver: 'qa@x.example', requiredActions: ['sign'], status: 'current', at: null }],
    },
  },
  thread: [{ id: '9', author: 'Dana Chen', role: '§2.5', when: '2h ago', state: 'open', body: 'Please tighten the efficacy claim.', ai: false, sectionId: SECTION, parentId: null }],
  meta: { scope: 'all', programId: null, total: 1, threadItemId: DOC, threadDocumentId: DOC, generatedAt: '2026-09-20T00:00:00Z' },
};

const isRead = (path: string) => path.startsWith('/api/review/board') || path === '/api/concept2cure/reviews/my-queue';
const writes = () => apiRequest.mock.calls.filter((c) => !isRead(String(c[1])));
const boardReads = () => apiRequest.mock.calls.filter((c) => String(c[1]).startsWith('/api/review/board'));

let writeAnswer: { ok: boolean; status: number; body: unknown };

function props() {
  return { surface: { id: 'review', label: 'Review & approval' } as never, onAsk: vi.fn(), onNav: vi.fn(), segment: 'biotech' };
}

async function mount() {
  render(<Review {...props()} />);
  await screen.findAllByText('Clinical Overview §2.5');
}

afterEach(() => cleanup());
beforeEach(() => {
  apiRequest.mockReset();
  writeAnswer = { ok: true, status: 200, body: { success: true, review: { review_status: 'approved' } } };
  apiRequest.mockImplementation(async (_m: string, path: string) => {
    if (path.startsWith('/api/review/board')) {
      return { ok: true, status: 200, json: async () => ({ success: true, data: BOARD }) } as Response;
    }
    return { ok: writeAnswer.ok, status: writeAnswer.status, json: async () => writeAnswer.body } as Response;
  });
});

describe('recording a review decision', () => {
  async function openModal() {
    await mount();
    fireEvent.click(screen.getByRole('button', { name: /Record review decision/ }));
    await screen.findByLabelText('Decision');
  }

  it('POSTs the verdict and the note to the authoring review transition', async () => {
    await openModal();
    fireEvent.change(screen.getByLabelText('Note for the thread (optional)'), {
      target: { value: 'Efficacy claim reads correctly now' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Record approval/ }));
    await waitFor(() => expect(writes().length).toBe(1));
    const [method, path, body] = writes()[0];
    expect(method).toBe('POST');
    expect(path).toBe(`/api/authoring/documents/${DOC}/review`);
    expect(body).toEqual({ review_status: 'approved', review_comments: 'Efficacy claim reads correctly now' });
  });

  it('a decline is the authoring "rejected" verdict, and needs grounds', async () => {
    await openModal();
    fireEvent.change(screen.getByLabelText('Decision'), { target: { value: 'rejected' } });
    const btn = await screen.findByRole('button', { name: /Record rejection/ });
    expect((btn as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(btn);
    expect(writes().length).toBe(0);
    fireEvent.change(screen.getByLabelText('Reason (required)'), { target: { value: 'The dose rationale contradicts §2.7.' } });
    fireEvent.click(screen.getByRole('button', { name: /Record rejection/ }));
    await waitFor(() => expect(writes().length).toBe(1));
    expect(writes()[0][2]).toEqual({ review_status: 'rejected', review_comments: 'The dose rationale contradicts §2.7.' });
  });

  it('re-reads the board after the decision, so the row comes from the record', async () => {
    await openModal();
    const before = boardReads().length;
    fireEvent.click(screen.getByRole('button', { name: /Record approval/ }));
    await waitFor(() => expect(boardReads().length).toBeGreaterThan(before));
  });

  it('says the decision was NOT recorded when the server refuses, and stays open', async () => {
    writeAnswer = { ok: false, status: 403, body: { success: false, error: 'Access denied: you are not a reviewer on this document' } };
    await openModal();
    fireEvent.click(screen.getByRole('button', { name: /Record approval/ }));
    await waitFor(() => {
      const banner = document.querySelector('.esign-err');
      expect(banner?.textContent).toMatch(/not a reviewer/i);
      expect(banner?.getAttribute('role')).toBe('alert');
    });
    expect(screen.getByLabelText('Decision')).toBeTruthy();
  });

  it('offers no signature meaning — the board does not sign', async () => {
    await openModal();
    expect(screen.queryByLabelText(/Meaning of signature/)).toBeNull();
    expect(document.body.textContent).toMatch(/not a 21 CFR §11\.50 signature/);
  });
});

describe('requesting changes', () => {
  it('is the authoring "changes_requested" verdict with the reason, and re-reads the board', async () => {
    await mount();
    fireEvent.click(screen.getByRole('button', { name: /Request changes\.\.\./ }));
    fireEvent.change(await screen.findByLabelText('Reason for requesting changes'), {
      target: { value: 'State the software version in §2.5.1.' },
    });
    const before = boardReads().length;
    fireEvent.click(screen.getByRole('button', { name: /^Request changes$/ }));
    await waitFor(() => expect(writes().length).toBe(1));
    const [method, path, body] = writes()[0];
    expect(method).toBe('POST');
    expect(path).toBe(`/api/authoring/documents/${DOC}/review`);
    expect(body).toEqual({ review_status: 'changes_requested', review_comments: 'State the software version in §2.5.1.' });
    await waitFor(() => expect(boardReads().length).toBeGreaterThan(before));
  });
});

describe('there is no delegate on the board', () => {
  it('the authoring workflow has no delegate transition, so the board offers none', async () => {
    await mount();
    expect(screen.queryByRole('button', { name: /Delegate/ })).toBeNull();
  });
});

describe('review comments', () => {
  it('POSTs a comment to the document’s section through the authoring router and re-reads the board', async () => {
    await mount();
    const box = screen.getByPlaceholderText(/Add a comment/i);
    fireEvent.change(box, { target: { value: 'Aligned with the CSR §7.1 table.' } });
    const before = boardReads().length;
    fireEvent.click(screen.getByRole('button', { name: /Comment/ }));
    await waitFor(() => expect(writes().length).toBe(1));
    const [method, path, body] = writes()[0];
    expect(method).toBe('POST');
    expect(path).toBe(`/api/authoring/sections/${SECTION}/comment`);
    expect(body).toEqual({ body: 'Aligned with the CSR §7.1 table.', doc_id: DOC });
    await waitFor(() => expect(boardReads().length).toBeGreaterThan(before));
  });

  it('resolving a comment PATCHes it through the authoring router, and a refusal puts it back to open', async () => {
    writeAnswer = { ok: false, status: 404, body: { success: false, error: 'Comment not found' } };
    await mount();
    fireEvent.click(screen.getByRole('button', { name: 'Resolve' }));
    await waitFor(() => expect(writes().length).toBe(1));
    const [method, path, body] = writes()[0];
    expect(method).toBe('PATCH');
    expect(path).toBe('/api/authoring/comments/9');
    expect(body).toEqual({ status: 'resolved' });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Resolve' })).toBeTruthy());
  });
});

describe('the hero call to action', () => {
  it('"Open the queue" selects a document still in review instead of doing nothing', async () => {
    // Nothing waiting on the caller → the hero shows "Open the queue".
    const notMine = { ...BOARD, queue: [{ ...BOARD.queue[0], awaitingMyReview: false, atMySignOff: false, mine: false }] };
    apiRequest.mockImplementation(async (_m: string, path: string) =>
      ({ ok: true, status: 200, json: async () => ({ success: true, data: path.startsWith('/api/review/board') ? notMine : {} }) }) as Response);
    render(<Review {...props()} />);
    const cta = await screen.findByRole('button', { name: /Open the queue/ });
    fireEvent.click(cta);
    await waitFor(() => {
      const row = document.querySelector('.lrow[data-on]');
      expect(row?.textContent).toContain('Clinical Overview §2.5');
    });
  });
});
