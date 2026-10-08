// @vitest-environment jsdom
/**
 * The Review tab shows this filing's reviews (FILING_SPINE.md F7, §6 row 3).
 *
 * The Review tab listed the program's tasks from the unified work view and
 * offered one door, "Open task board", to the scrapped `task-board` alias.
 * Nothing on it named a document, so a person whose document came back with
 * changes requested had to leave the project, find the review board, and find
 * the document again.
 *
 * Now the tab reads the review board scoped to this program
 * (GET /api/review/board?scope=all&programId=<uuid>), groups the documents by
 * what they need from the person (waiting on you, in review, changes
 * requested, declined, reviewers approved and awaiting sign-off, approved),
 * and each row opens THAT document in the editor
 * through the editor target. "Open the review board" opens the full Review
 * surface, and only when that surface is in this release.
 *
 * Pinned here:
 *   - the read is by the program's UUID, scope all;
 *   - rows are grouped, with their status in words;
 *   - "Approved" only when the document's own status is APPROVED: a reviewer
 *     verdict on a document still IN_REVIEW is "awaiting sign-off", never
 *     an approved record; a decline is "Declined", not "Changes requested";
 *   - "Open document" sets the editor target to that document and program;
 *   - a failed read is an error with a retry and the read's own reason, never an empty list;
 *   - an empty board says so in words;
 *   - the tab never sends the person to `task-board` and never says "aren't wired";
 *   - "Open the review board" is offered only when the Review surface is available.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

/* Surfaces locked out of this release for one test. Empty: everything open. */
const locked = vi.hoisted(() => new Set<string>());
vi.mock('../navEntitlements', async (importOriginal) => {
  const real = await importOriginal<typeof import('../navEntitlements')>();
  return {
    ...real,
    useNavEntitlements: () => ({
      verdictFor: (id: string) =>
        locked.has(id) ? { id, label: id, entitled: false, source: 'launch-scope', requiredTier: null } : null,
      resolved: true,
      masterAdmin: false,
      platformAdmin: false,
      tier: null,
    }),
  };
});

import { ProjectHome } from '../surfaces/ProjectHome';

const PID = '5b1d6c2e-1111-4222-8333-444455556666';
const BOARD_PREFIX = `/api/review/board?scope=all&programId=${PID}`;

const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => data }) as unknown as Response;
/* apiRequest THROWS for a non-OK status (ApiRequestError, carrying the
   server's own wording and the status); liveGetOrNull turns that into
   { error: message, status }. */
const fail = (s: number): Response => {
  throw Object.assign(new Error('Failed to build review board'), { status: s });
};

function row(over: Record<string, unknown>) {
  return {
    id: 'doc',
    doc: 'Untitled',
    prog: 'BX-310',
    programId: PID,
    pid: 'doc',
    module: 'M2',
    docStatus: 'IN_REVIEW',
    state: 'in-review',
    reviews: [],
    myReviewId: null,
    myReviewStatus: null,
    awaitingMyReview: false,
    requestedByMe: false,
    atMySignOff: false,
    mine: false,
    reviewer: '',
    role: '',
    due: '',
    tone: '',
    comments: 0,
    esig: 'none',
    conf: null,
    prov: null,
    passage: '',
    firstSectionId: null,
    requestedAt: null,
    ...over,
  };
}

const QUEUE = [
  row({ id: 'doc-mine', doc: 'Clinical overview (2.5)', awaitingMyReview: true, mine: true, reviewer: 'You', role: 'Reviewer' }),
  row({ id: 'doc-out', doc: 'Nonclinical overview (2.4)', reviewer: 'Raj Patel', role: 'Reviewer' }),
  row({ id: 'doc-back', doc: 'Quality overall summary (2.3)', state: 'changes-requested', comments: 2 }),
  // Every reviewer approved; the document is still IN_REVIEW, its sign-off pending.
  row({ id: 'doc-ok', doc: 'Cover letter', module: 'M1', state: 'approved', reviewer: 'qa@bx.test', role: 'QA sign-off', esig: 'pending' }),
  // The signature chain cleared: the record itself is APPROVED.
  row({ id: 'doc-signed', doc: 'Form FDA 1571', module: 'M1', docStatus: 'APPROVED', state: 'approved', esig: 'signed' }),
  row({ id: 'doc-no', doc: 'Investigator brochure', module: 'M1', state: 'rejected' }),
];
const board = (queue: unknown[]) => ({
  success: true,
  data: { queue, workflows: {}, thread: [], meta: { scope: 'all', programId: PID, total: queue.length, threadItemId: null, threadDocumentId: null, generatedAt: '2026-10-08T09:00:00Z' } },
});

function serve(boardResponse: () => Response) {
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (_m: string, raw: unknown) => {
    const url = String(raw ?? '');
    if (url.startsWith('/api/review/board')) return boardResponse();
    if (url === `/api/c2c/projects/${PID}`) return ok({ id: PID, name: 'BX-310', status: 'active' });
    if (url === `/api/concept2cure/projects/${PID}/unified-work`) return ok({ items: [], summary: { total: 0 } });
    return ok({});
  });
}

const props = () =>
  ({ surface: { id: 'project-home', label: 'Project' } as never, onAsk: vi.fn(), onNav: vi.fn(), segment: 'biotech' });
const target = () => (window as unknown as { C2C_EDITOR_TARGET?: Record<string, unknown> }).C2C_EDITOR_TARGET;
const boardCalls = () => apiRequest.mock.calls.map((c) => String(c[1])).filter((u) => u.startsWith('/api/review/board'));

function openReviewStage() {
  fireEvent.click(screen.getByTitle('Review, approve & e-sign'));
}

beforeEach(() => {
  locked.clear();
  (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT = { id: PID, title: 'BX-310' };
});
afterEach(() => {
  cleanup();
  for (const k of ['C2C_PROJECT', 'C2C_EDITOR_TARGET']) delete (window as unknown as Record<string, unknown>)[k];
});

describe('ProjectHome — the Review tab shows this filing’s reviews', () => {
  it('reads the review board scoped to this program, and groups the documents by what they need', async () => {
    serve(() => ok(board(QUEUE)));
    render(<ProjectHome {...props()} />);
    openReviewStage();

    expect(await screen.findByText('Quality overall summary (2.3)')).toBeTruthy();
    expect(boardCalls().some((u) => u === BOARD_PREFIX || u.startsWith(`${BOARD_PREFIX}&`)), boardCalls().join(', ')).toBe(true);

    const reviews = screen.getByRole('region', { name: 'Reviews' });
    const group = (name: string) => within(reviews).getByRole('list', { name });
    expect(within(group('Waiting on you')).getByText('Clinical overview (2.5)')).toBeTruthy();
    expect(within(group('In review')).getByText('Nonclinical overview (2.4)')).toBeTruthy();
    expect(within(group('Changes requested')).getByText('Quality overall summary (2.3)')).toBeTruthy();
    expect(within(group('Declined')).getByText('Investigator brochure')).toBeTruthy();
    expect(within(group('Reviewers approved, awaiting sign-off')).getByText('Cover letter')).toBeTruthy();
    expect(within(group('Approved')).getByText('Form FDA 1571')).toBeTruthy();

    // Status in words, never the raw code.
    expect(within(group('Changes requested')).getByText('Changes requested', { selector: '.cdl-pill' })).toBeTruthy();
    expect(reviews.textContent).not.toMatch(/changes-requested|in-review/);
    expect(within(group('Waiting on you')).getByText('Awaiting your review')).toBeTruthy();
    expect(within(group('Declined')).getByText('Declined', { selector: '.cdl-pill' })).toBeTruthy();
    expect(reviews.textContent).not.toMatch(/Rejected/);
  });

  it('a document every reviewer approved but nobody has signed is not shown as Approved', async () => {
    serve(() => ok(board(QUEUE)));
    render(<ProjectHome {...props()} />);
    openReviewStage();

    const title = await screen.findByText('Cover letter');
    const li = title.closest('li') as HTMLElement;
    const pill = li.querySelector('.cdl-pill') as HTMLElement;
    expect(pill.textContent).toBe('Reviewers approved, sign-off pending');
    expect(pill.getAttribute('data-status')).not.toBe('APPROVED');
    const reviews = screen.getByRole('region', { name: 'Reviews' });
    expect(within(within(reviews).getByRole('list', { name: 'Approved' })).queryByText('Cover letter')).toBeNull();

    // The record that IS approved says so, with the approved tone.
    const signed = (await screen.findByText('Form FDA 1571')).closest('li') as HTMLElement;
    const signedPill = signed.querySelector('.cdl-pill') as HTMLElement;
    expect(signedPill.textContent).toBe('Approved');
    expect(signedPill.getAttribute('data-status')).toBe('APPROVED');
  });

  it('"Open document" opens THAT document, by id, in this program', async () => {
    serve(() => ok(board(QUEUE)));
    const p = props();
    render(<ProjectHome {...p} />);
    openReviewStage();

    fireEvent.click(await screen.findByRole('button', { name: 'Open document: Quality overall summary (2.3)' }));
    expect(target()).toMatchObject({ docId: 'doc-back', programId: PID });
    expect(p.onNav).toHaveBeenCalledWith('document-authoring');
  });

  it('a failed read is an error with a retry, never an empty list, and the retry reads again', async () => {
    let failures = 1;
    serve(() => (failures-- > 0 ? fail(500) : ok(board(QUEUE))));
    render(<ProjectHome {...props()} />);
    openReviewStage();

    expect(await screen.findByText('Couldn’t read this project’s reviews')).toBeTruthy();
    // The read's own reason, not a cause the tab made up.
    expect(screen.queryByText(/did not answer/)).toBeNull();
    expect(screen.getByText(/Failed to build review board/)).toBeTruthy();
    expect(screen.queryByText(/Nothing in this project is out for review/)).toBeNull();
    const reviews = screen.getByRole('region', { name: 'Reviews' });
    fireEvent.click(within(reviews).getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Quality overall summary (2.3)')).toBeTruthy();
    expect(boardCalls().length).toBeGreaterThanOrEqual(2);
  });

  it('an empty board says so in words', async () => {
    serve(() => ok(board([])));
    render(<ProjectHome {...props()} />);
    openReviewStage();

    expect(await screen.findByText(/Nothing in this project is out for review/)).toBeTruthy();
    expect(screen.queryByText(/Couldn’t read this project’s reviews/)).toBeNull();
  });

  it('never says "aren\'t wired" and never sends the person to the task-board alias', async () => {
    serve(() => ok(board(QUEUE)));
    const p = props();
    render(<ProjectHome {...p} />);
    openReviewStage();

    await screen.findByText('Cover letter');
    expect(document.body.textContent).not.toMatch(/aren't wired|aren’t wired/);
    // Every door on the tab that is not a document row: none goes to task-board.
    const stageButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('.pj-stagebody button'))
      .filter((b) => !/^Open document:/.test(b.getAttribute('aria-label') ?? ''));
    expect(stageButtons.length).toBeGreaterThan(0);
    for (const b of stageButtons) fireEvent.click(b);
    expect(p.onNav).not.toHaveBeenCalledWith('task-board');
  });

  it('"Open the review board" opens the Review surface when it is available, and is not shown when it is not', async () => {
    serve(() => ok(board(QUEUE)));
    const p = props();
    render(<ProjectHome {...p} />);
    openReviewStage();

    fireEvent.click(await screen.findByRole('button', { name: /Open the review board/ }));
    expect(p.onNav).toHaveBeenCalledWith('review');

    cleanup();
    locked.add('review');
    serve(() => ok(board(QUEUE)));
    render(<ProjectHome {...props()} />);
    openReviewStage();
    await screen.findByText('Cover letter');
    expect(screen.queryByRole('button', { name: /Open the review board/ })).toBeNull();
  });
});
