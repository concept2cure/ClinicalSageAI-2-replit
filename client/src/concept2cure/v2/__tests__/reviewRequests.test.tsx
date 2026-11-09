// @vitest-environment jsdom
/**
 * P-95, the reviewer's side: an artifact review you were named for is on the Review screen, with the text
 * of the version under review, and you decide there.
 *
 * Found by walking the running app (2026-11-09): the author named a reviewer from the artifact's card in
 * their conversation, `GET /api/concept2cure/reviews/pending` returned the assignment for the reviewer, and
 * no screen read it — the reviewer's queue (`/reviews/my-queue`) and Home listed nothing, and the card the
 * decision controls were on is in someone else's conversation.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
const me = vi.hoisted(() => ({ user: { id: '45', organizationId: '11', displayName: 'Reviewer User' } }));
vi.mock('@/services/portal/authService', () => ({ useAuth: () => me, useAuthUser: () => me.user }));
vi.mock('@/utils/authToken', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/utils/authToken')>()),
  getAuthToken: () => 't',
  getAuthHeaders: () => ({ Authorization: 'Bearer t', 'x-organization-id': '11' }),
}));

import { ReviewRequests } from '../surfaces/ReviewRequests';
import { ReviewThreadsPane } from '../surfaces/ReviewThreads';
import { OpenWorkGroups } from '../OpenWork';

const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => data }) as Response;
const PENDING = '/api/concept2cure/reviews/pending';
const BASE = '/api/concept2cure/projects/24/artifacts/art_p95_walk_v1';
const REQUEST = { assignmentId: 'asgn_1', artifactId: 'art_p95_walk_v1', artifactTitle: 'P-95 walk — 510(k) Summary',
  artifactStatus: 'review', artifactVersion: 1, projectId: 24, reviewRound: 1, status: 'pending', dueDate: null,
  notes: 'Check the predicate device comparison.' };
const TEXT = 'SYNTHETIC WALK DATA. A 510(k) summary draft for the P-95 review walk.';

let decided: null | { decision: string; comment: string | null };
let pendingRead: () => Response;
const calls: Array<{ method: string; url: string; body?: unknown }> = [];

beforeEach(() => {
  decided = null;
  calls.length = 0;
  pendingRead = () => ok({ success: true, data: { totalPending: 1, assignments: [REQUEST] } });
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (method: string, url: string, body?: unknown) => {
    const u = String(url);
    calls.push({ method, url: u, body });
    if (method === 'GET' && u === PENDING) return pendingRead();
    if (method === 'GET' && u.startsWith('/api/concept2cure/reviews/my-queue')) {
      return ok({ threads: [], tasks: [], totalThreads: 0, totalTasks: 0, permissions: { canComment: true, canRequestChanges: true, canResolve: true } });
    }
    if (method === 'GET' && u === `${BASE}/versions`) {
      return ok({ success: true, data: { versions: [{ version: 1, content: TEXT }, { version: 2, content: 'A LATER VERSION' }] } });
    }
    if (method === 'GET' && u === `${BASE}/reviews/status`) {
      return ok({ success: true, data: { hasReviewers: true, currentRound: 1, readyForApproval: decided?.decision === 'approve',
        reviewers: [{ assignmentId: 'asgn_1', reviewerId: 45, reviewerName: 'Reviewer User', status: decided ? 'completed' : 'pending', decision: decided }] } });
    }
    if (method === 'POST' && u === `${BASE}/reviews/submit`) {
      const b = body as { decision: string; comment?: string };
      decided = { decision: b.decision, comment: b.comment ?? null };
      return ok({ success: true, data: {} });
    }
    return ok({});
  });
});
afterEach(() => cleanup());

const mount = () => render(<ReviewRequests onNotice={() => undefined} />);

describe('ReviewRequests — the artifact reviews you were named for (P-95)', () => {
  it('is on the Review screen, above the threads, where a reviewer already looks for work', async () => {
    render(<ReviewThreadsPane onNotice={() => undefined} />);
    expect(await screen.findByText('P-95 walk — 510(k) Summary')).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Reviews you were named for' })).toBeTruthy();
    expect(await screen.findByText('No review threads are waiting on you')).toBeTruthy();
  });

  it('lists the request from /reviews/pending, with its round and the note it was sent with', async () => {
    mount();
    expect(await screen.findByText('P-95 walk — 510(k) Summary')).toBeTruthy();
    expect(screen.getByText('round 1')).toBeTruthy();
    expect(screen.getByText('Check the predicate device comparison.')).toBeTruthy();
    expect(calls.some(c => c.method === 'GET' && c.url === PENDING)).toBe(true);
  });

  it('opening it shows the text of the version under review, and the decision, but no naming of reviewers', async () => {
    mount();
    fireEvent.click(await screen.findByText('P-95 walk — 510(k) Summary'));
    expect(await screen.findByText(TEXT)).toBeTruthy();
    expect(screen.queryByText('A LATER VERSION')).toBeNull();
    expect(await screen.findByRole('button', { name: 'Approve' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Name reviewers/ })).toBeNull();
  });

  it('the named reviewer decides through the review submit route, and the decision is shown', async () => {
    mount();
    fireEvent.click(await screen.findByText('P-95 walk — 510(k) Summary'));
    fireEvent.change(await screen.findByLabelText(/You are a named reviewer/), { target: { value: 'Predicate table matches.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(calls.some(c => c.method === 'POST' && c.url === `${BASE}/reviews/submit`)).toBe(true));
    expect(calls.find(c => c.method === 'POST')!.body).toEqual({ decision: 'approve', comment: 'Predicate table matches.' });
    expect(await screen.findByText('Approved — “Predicate table matches.”')).toBeTruthy();
    expect(screen.getByText('Round 1: every named reviewer approved.')).toBeTruthy();
  });

  it('a list that cannot be read says so, and is never shown as no requests', async () => {
    pendingRead = () => { throw Object.assign(new Error('Failed to list pending reviews'), { name: 'ApiRequestError', status: 500, payload: { error: 'Failed to list pending reviews' } }); };
    mount();
    expect(await screen.findByText("Couldn't read your review requests")).toBeTruthy();
  });

  it('with nothing waiting, it adds nothing to the screen', async () => {
    pendingRead = () => ok({ success: true, data: { totalPending: 0, assignments: [] } });
    const { container } = mount();
    await waitFor(() => expect(calls.some(c => c.url === PENDING)).toBe(true));
    await waitFor(() => expect(container.textContent).toBe(''));
  });

  it('Your open work lists it, and opens the Review screen, where the decision is', async () => {
    const go = vi.fn();
    render(<OpenWorkGroups workLoading={false} assigned={[]} queue={null} approvalRows={[]} go={go} openTask={() => undefined} />);
    expect(await screen.findByText('Reviews you were named for')).toBeTruthy();
    fireEvent.click(await screen.findByText('P-95 walk — 510(k) Summary'));
    expect(go).toHaveBeenCalledWith('review');
    expect(screen.getByText('Round 1 · your decision')).toBeTruthy();
  });

  it('Your open work says when the list could not be read, rather than showing nothing', async () => {
    pendingRead = () => { throw Object.assign(new Error('Failed to list pending reviews'), { name: 'ApiRequestError', status: 500, payload: { error: 'Failed to list pending reviews' } }); };
    render(<OpenWorkGroups workLoading={false} assigned={[]} queue={null} approvalRows={[]} go={() => undefined} openTask={() => undefined} />);
    expect(await screen.findByText(/Couldn.t load the reviews you were named for/)).toBeTruthy();
  });
});
