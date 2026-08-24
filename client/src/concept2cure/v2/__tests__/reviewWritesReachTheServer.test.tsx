// @vitest-environment jsdom
/**
 * Four governed acts on the review surface reached no server at all.
 *
 * ── The defect ───────────────────────────────────────────────────────────────
 * Review.tsx:134   const recordDecision = () => { onSigned ? onSigned() : onClose(); };
 *                  A reviewer recorded an APPROVAL, the queue row flipped to
 *                  "Review decision recorded", and the decision existed in that
 *                  browser tab until refresh. The approval step stayed pending
 *                  forever; the next reviewer was never unblocked.
 * Review.tsx:523   doDelegate — pushed one line into local thread state and
 *                  toasted "Approval delegated to <name>". Nobody was delegated
 *                  to and the step stayed assigned to the delegator.
 * Review.tsx:613   postReply — setThread and nothing else. The comment was
 *                  never saved and never seen by anyone else.
 * Review.tsx:597   resolveCmt — flipped a local flag. The comment was open
 *                  again for everyone, including the same reviewer, on reload.
 * Review.tsx:420   "Open the queue" — onClick: () => {}. The most prominent
 *                  button on the screen, doing nothing at all.
 *
 * ── What this asserts ────────────────────────────────────────────────────────
 * The chain, not the render: each act reaches its endpoint with the body the
 * route requires, the board is RE-READ afterwards so the surface shows the
 * record rather than a memory of the click, and a refused write leaves the
 * screen matching the record.
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

const BOARD = {
  queue: [{
    id: '101', doc: 'Clinical Overview §2.5', prog: 'NDA 200100', pid: '55', secKey: '2.5',
    reviewer: 'Dana Chen', role: 'Clinical', due: 'Today', tone: 'err', state: 'in-review',
    comments: 1, esig: 'pending', conf: null, prov: 'v3', passage: 'The pivotal study met its primary endpoint.',
  }],
  workflows: {
    '101': {
      templateId: 'wft_ctd_section', template: 'CTD section sign-off',
      steps: [
        { id: 1, order: 1, name: 'Author self-review', approverType: 'user', approver: 'Dana Chen', requiredActions: ['review'], status: 'approved', at: 'yesterday' },
        { id: 2, order: 2, name: 'Regulatory sign-off', approverType: 'role', approver: 'Reg lead', requiredActions: ['review', 'approve', 'sign'], status: 'current', at: null },
      ],
    },
  },
  thread: [{ id: '9', author: 'Dana Chen', role: 'Clinical', when: '2h ago', state: 'open', body: 'Please tighten the efficacy claim.', ai: false }],
  meta: { scope: 'all', total: 1, threadItemId: '101', threadDocumentId: 55, generatedAt: '2026-07-30T00:00:00Z' },
};

/* The surface makes two READS on mount: the board itself and the threads pane's
   own queue. Neither is a write, so both are excluded here — otherwise this
   file would be asserting on request counts rather than on the acts. */
const READS = ['/api/review/board', '/api/concept2cure/reviews/my-queue'];
const writes = () => apiRequest.mock.calls.filter((c) => !READS.includes(String(c[1])));
const boardReads = () => apiRequest.mock.calls.filter((c) => String(c[1]) === '/api/review/board');

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
  writeAnswer = { ok: true, status: 200, body: { success: true, data: {} } };
  apiRequest.mockImplementation(async (_m: string, path: string) => {
    if (path === '/api/review/board') {
      return { ok: true, status: 200, json: async () => ({ success: true, data: BOARD }) } as Response;
    }
    return { ok: writeAnswer.ok, status: writeAnswer.status, json: async () => writeAnswer.body } as Response;
  });
});

describe('recording a review decision', () => {
  async function openModal() {
    await mount();
    fireEvent.click(screen.getByRole('button', { name: /Record review decision/ }));
    // The modal is up once its Decision field exists (the heading repeats the
    // button's own label, so the heading is not a usable handle).
    await screen.findByLabelText('Decision');
  }

  it('POSTs the decision, the meaning and the note to the governed route', async () => {
    writeAnswer = { ok: true, status: 200, body: { success: true, data: { approvalStatus: 'approved', workflowStatus: 'active' } } };
    await openModal();
    fireEvent.change(screen.getByLabelText('Note for the thread (optional)'), {
      target: { value: 'Efficacy claim reads correctly now' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Record approval/ }));
    await waitFor(() => expect(writes().length).toBe(1));
    const [method, path, body] = writes()[0];
    expect(method).toBe('POST');
    expect(path).toBe('/api/review/workflows/101/decision');
    expect(body).toMatchObject({ decision: 'approve', meaning: 'APPROVER', reason: 'Efficacy claim reads correctly now' });
  });

  it('re-reads the board after the decision, so the row comes from the record', async () => {
    writeAnswer = { ok: true, status: 200, body: { success: true, data: { approvalStatus: 'approved', workflowStatus: 'completed' } } };
    await openModal();
    const before = boardReads().length;
    fireEvent.click(screen.getByRole('button', { name: /Record approval/ }));
    await waitFor(() => expect(boardReads().length).toBeGreaterThan(before));
  });

  it('will not send a rejection without grounds', async () => {
    await openModal();
    fireEvent.change(screen.getByLabelText('Decision'), { target: { value: 'reject' } });
    const btn = await screen.findByRole('button', { name: /Record rejection/ });
    expect((btn as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(btn);
    expect(writes().length).toBe(0);
  });

  it('says the decision was NOT recorded when the server refuses, and stays open', async () => {
    writeAnswer = { ok: false, status: 403, body: { success: false, error: 'You are not an assigned reviewer on a pending step of this workflow' } };
    await openModal();
    fireEvent.click(screen.getByRole('button', { name: /Record approval/ }));
    // The threads pane raises its own alert when its unrelated read fails, so
    // scope this to the modal's banner rather than to "an alert on the page".
    await waitFor(() => {
      const banner = document.querySelector('.esign-err');
      expect(banner?.textContent).toMatch(/not an assigned reviewer/i);
      expect(banner?.getAttribute('role')).toBe('alert');
    });
    // The modal is still up — nothing was claimed to have happened.
    expect(screen.getByLabelText('Decision')).toBeTruthy();
  });
});

describe('delegating a step', () => {
  async function openDelegate() {
    await mount();
    fireEvent.click(screen.getByRole('button', { name: /Delegate\.\.\./ }));
    return screen.findByPlaceholderText(/Delegate this step to/);
  }

  it('POSTs the delegate and the reason, and re-reads the board', async () => {
    const to = await openDelegate();
    fireEvent.change(to, { target: { value: 'Priya Raman' } });
    fireEvent.change(screen.getByPlaceholderText(/Reason for delegation/), {
      target: { value: 'Out of office through Friday' },
    });
    const before = boardReads().length;
    fireEvent.click(screen.getByRole('button', { name: /Delegate approval/ }));
    await waitFor(() => expect(writes().length).toBe(1));
    const [method, path, body] = writes()[0];
    expect(method).toBe('POST');
    expect(path).toBe('/api/review/workflows/101/delegate');
    expect(body).toEqual({ to: 'Priya Raman', reason: 'Out of office through Friday' });
    await waitFor(() => expect(boardReads().length).toBeGreaterThan(before));
  });

  it('will not delegate without a reason — the record has to say why', async () => {
    const to = await openDelegate();
    fireEvent.change(to, { target: { value: 'Priya Raman' } });
    const btn = screen.getByRole('button', { name: /Delegate approval/ });
    expect((btn as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(btn);
    expect(writes().length).toBe(0);
  });
});

describe('review comments', () => {
  it('POSTs a comment and re-reads the board instead of appending it locally', async () => {
    await mount();
    const box = screen.getByPlaceholderText(/Add a comment/i);
    fireEvent.change(box, { target: { value: 'Aligned with the CSR §7.1 table.' } });
    const before = boardReads().length;
    fireEvent.click(screen.getByRole('button', { name: /Comment/ }));
    await waitFor(() => expect(writes().length).toBe(1));
    const [method, path, body] = writes()[0];
    expect(method).toBe('POST');
    expect(path).toBe('/api/review/workflows/101/comments');
    expect(body).toEqual({ content: 'Aligned with the CSR §7.1 table.' });
    await waitFor(() => expect(boardReads().length).toBeGreaterThan(before));
  });

  it('resolving a comment PATCHes it, and a refusal puts it back to open', async () => {
    writeAnswer = { ok: false, status: 404, body: { success: false, error: 'Comment not found' } };
    await mount();
    fireEvent.click(screen.getByRole('button', { name: 'Resolve' }));
    await waitFor(() => expect(writes().length).toBe(1));
    const [method, path, body] = writes()[0];
    expect(method).toBe('PATCH');
    expect(path).toBe('/api/review/comments/9/resolve');
    expect(body).toEqual({ resolved: true });
    // The write failed, so the comment must be open again — a Resolve button
    // only exists on an open comment.
    await waitFor(() => expect(screen.getByRole('button', { name: 'Resolve' })).toBeTruthy());
  });
});

describe('the hero call to action', () => {
  it('"Open the queue" selects a document still in review instead of doing nothing', async () => {
    // Nothing at the caller's sign-off step → the hero shows "Open the queue".
    const noSign = {
      ...BOARD,
      workflows: {
        '101': {
          ...BOARD.workflows['101'],
          steps: BOARD.workflows['101'].steps.map((s) => ({ ...s, requiredActions: ['review'] })),
        },
      },
    };
    apiRequest.mockImplementation(async (_m: string, path: string) =>
      ({ ok: true, status: 200, json: async () => ({ success: true, data: path === '/api/review/board' ? noSign : {} }) }) as Response);
    render(<Review {...props()} />);
    const cta = await screen.findByRole('button', { name: /Open the queue/ });
    fireEvent.click(cta);
    // The queue row for the in-review document is the selected one.
    await waitFor(() => {
      const row = document.querySelector('.lrow[data-on]');
      expect(row?.textContent).toContain('Clinical Overview §2.5');
    });
  });
});
