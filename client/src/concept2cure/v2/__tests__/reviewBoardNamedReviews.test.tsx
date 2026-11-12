// @vitest-environment jsdom
/**
 * GA-UI-05 (docs/evidence/GA-READINESS/2026-11-10; walk
 * docs/evidence/SPINE/S4/2026-11-09-p95-review-walk, shot 07): the Review board
 * said "Nothing is in review" above the reviews you were named for, because its
 * claim covers documents from the editor only. With named reviews listed below,
 * or with that list unread, the claim narrows to the editor's queue; AnA's
 * "open the queue" says the same.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
const signedIn = vi.hoisted(() => ({ id: 7, organizationId: 7, displayName: 'Rhea Reviewer', email: 'r@test.co', roles: ['reviewer'] }));
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
vi.mock('@/services/portal/authService', () => ({
  useAuth: () => ({ user: signedIn }),
  useAuthUser: () => signedIn,
}));
vi.mock('@/utils/authToken', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/utils/authToken')>()),
  getAuthToken: () => 'test-token',
}));

import { Review } from '../surfaces/Review';
import { applySurfaceAction, __resetSurfaceActionBus } from '../surfaceActions';

const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => ({ success: true, data }) }) as Response;
const fail = (status: number) => ({ ok: false, status, json: async () => ({ success: false, error: 'boom' }) }) as Response;
const meta = { scope: 'all', programId: null, total: 0, threadItemId: null, threadDocumentId: null, generatedAt: '2026-11-10T00:00:00Z' };
const NAMED = {
  assignmentId: 'a-1', artifactId: 'art-1', artifactTitle: 'Lane L7-shell 510(k) Summary', artifactVersion: 1,
  projectId: 3, reviewRound: 1, notes: null, dueDate: null,
};
let pending: () => Response;

beforeEach(() => {
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (_m: string, url: string) => {
    const u = String(url);
    if (u.startsWith('/api/review/board')) return ok({ queue: [], workflows: {}, thread: [], meta, vaultReviews: [] });
    if (u === '/api/concept2cure/reviews/pending') return pending();
    if (u.includes('/reviews/my-queue')) return ok({ threads: [], tasks: [], totalThreads: 0, totalTasks: 0, permissions: { canComment: true, canRequestChanges: true, canResolve: true } });
    return ok([]);
  });
});
afterEach(() => { cleanup(); __resetSurfaceActionBus(); });

const props = () => ({ surface: { id: 'review', label: 'Review & approval' } as never, onAsk: vi.fn(), onNav: vi.fn(), segment: 'biotech' });

describe('the board does not say nothing is in review above named reviews (GA-UI-05)', () => {
  it('with a review you were named for listed, the claim narrows to the editor queue', async () => {
    pending = () => ok({ totalPending: 1, assignments: [NAMED] });
    render(<Review {...props()} />);
    expect(await screen.findByText('Lane L7-shell 510(k) Summary')).toBeTruthy();
    await waitFor(() => expect(screen.getByText('No document from the editor is in this queue')).toBeTruthy());
    expect(screen.queryByText('Nothing is in review')).toBeNull();
  });

  it('with that list unread, it does not claim nothing is in review', async () => {
    pending = () => fail(500);
    render(<Review {...props()} />);
    expect(await screen.findByText("Couldn't read your review requests")).toBeTruthy();
    await waitFor(() => expect(screen.getByText('No document from the editor is in this queue')).toBeTruthy());
    expect(screen.queryByText('Nothing is in review')).toBeNull();
  });

  it('with nothing named and nothing on the board, it still says nothing is in review', async () => {
    pending = () => ok({ totalPending: 0, assignments: [] });
    render(<Review {...props()} />);
    expect(await screen.findByText('Nothing is in review')).toBeTruthy();
  });
});

/* V-L7-4: AnA's refusals on an empty editor queue say the same as the board.
   Without this, putting back 'Nothing is in review.' in either refusal survived. */
const EDITOR_QUEUE_EMPTY = 'No document from the editor is in review. Vault versions and reviews you were named for are listed on this screen.';
const ask = (actionId: 'review.select-document' | 'review.open-queue') => applySurfaceAction(
  { actionType: 'surface_action', surfaceId: 'review', actionId, label: actionId, params: actionId === 'review.select-document' ? { document: 'Lane L7-shell 510(k) Summary' } : {} } as never,
  vi.fn(),
);

describe("AnA's refusals on an empty editor queue (GA-UI-05, V-L7-4)", () => {
  for (const actionId of ['review.select-document', 'review.open-queue'] as const) {
    it(`${actionId} narrows to the editor queue when a named review is listed`, async () => {
      pending = () => ok({ totalPending: 1, assignments: [NAMED] });
      render(<Review {...props()} />);
      expect(await screen.findByText('Lane L7-shell 510(k) Summary')).toBeTruthy();
      await waitFor(() => expect(screen.getByText('No document from the editor is in this queue')).toBeTruthy());
      await waitFor(() => expect(ask(actionId)).toEqual({ status: 'failed', reason: EDITOR_QUEUE_EMPTY }));
    });

    it(`${actionId} still says nothing is in review when nothing is listed`, async () => {
      pending = () => ok({ totalPending: 0, assignments: [] });
      render(<Review {...props()} />);
      expect(await screen.findByText('Nothing is in review')).toBeTruthy();
      await waitFor(() => expect(ask(actionId)).toEqual({ status: 'failed', reason: 'Nothing is in review.' }));
    });
  }
});
