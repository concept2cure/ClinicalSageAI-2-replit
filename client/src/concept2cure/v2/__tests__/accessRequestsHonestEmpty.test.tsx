// @vitest-environment jsdom
/**
 * Access requests — what the empty queue may claim, and the page it sits on.
 *
 * TWO DEFECTS, both seen on a brand-new workspace (launch row D2).
 *
 *   1. A HISTORY NOBODY READ. The Waiting filter reads `?status=open` and
 *      nothing else. On an empty answer it said "Everything asked for so far has
 *      been answered" and offered "Show answered requests" — on a workspace
 *      where nobody had ever asked. The open read cannot tell "all answered"
 *      from "never asked", so the copy asserted the one it had no evidence for,
 *      and told AnA the same. The claim is now made only when the answered set
 *      has been read and holds rows; a workspace with none says nobody has
 *      asked; a failed check claims neither.
 *   2. NO PAGE. The standalone route rendered the queue bare — no title, the
 *      banner flush against the nav rail, the count against the right edge —
 *      because the component was built as a tab body for Master Licensing and
 *      then also registered as a surface. The organization scope now supplies
 *      the page frame every sibling admin surface has; the Master Licensing tab
 *      keeps none, because that console already draws its own.
 *
 * `apiRequest` THROWS for every non-OK status except 401, so the mock below
 * throws too (see accessRequests.test.tsx for why a resolving mock would leave
 * the error paths unreached).
 */
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';

const api = vi.hoisted(() => ({
  fn: vi.fn(async (_m: string, _u: string, _b?: unknown) => new Response('{}')),
}));

class FakeApiError extends Error {
  name = 'ApiRequestError';
  constructor(
    public status: number,
    public payload: unknown,
  ) {
    super('request failed');
  }
}

vi.mock('@/lib/queryClient', () => ({
  apiRequest: (m: string, u: string, b?: unknown) => api.fn(m, u, b),
  redactInternals: (s: string) => s,
  serverMessage: (body: any) => (typeof body?.error === 'string' ? body.error : null),
}));
vi.mock('@/utils/authToken', () => ({ getAuthToken: () => 'token' }));

import { AccessRequests, AccessRequestQueue } from '../surfaces/AccessRequests';
import { useActiveSurfaceContext } from '../surfaceContext';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const EMPTY = { scope: 'organization', requests: [], openCount: 0, truncated: false };

const ANSWERED = {
  id: 7,
  organizationId: 1,
  organizationName: 'Northwind Bio',
  moduleId: 'pv-cockpit',
  moduleName: 'PV cockpit',
  requestedBy: 43,
  requesterEmail: 'member@example.test',
  requesterName: 'A Member',
  note: null,
  status: 'approved' as const,
  decidedByEmail: 'admin@example.test',
  decidedAt: '2026-03-04T10:00:00.000Z',
  decisionReason: 'Named on the filing plan.',
  createdAt: '2026-03-01T09:30:00.000Z',
  updatedAt: '2026-03-04T10:00:00.000Z',
};

/** Routes the two reads the Waiting view can make. */
function serve(history: 'none' | 'answered' | 'fails') {
  api.fn.mockImplementation(async (_method: string, url: string) => {
    if (url.endsWith('?status=open')) return json(EMPTY);
    if (url.endsWith('?status=all')) {
      if (history === 'fails') throw new FakeApiError(503, { error: 'Service unavailable.' });
      return json(history === 'answered' ? { ...EMPTY, requests: [ANSWERED] } : EMPTY);
    }
    throw new Error(`unexpected request ${url}`);
  });
}

/** What the queue told AnA — read through the shell's own reader. */
let published: ReturnType<typeof useActiveSurfaceContext> = null;
function ContextProbe() {
  published = useActiveSurfaceContext('access-requests');
  return null;
}

const ANSWERED_CLAIM = /everything asked for so far has been answered/i;
const NEVER_ASKED = /nobody has asked for an app yet/i;

beforeEach(() => {
  cleanup();
  api.fn.mockReset();
  published = null;
});

describe('Access requests — the empty Waiting queue claims only what it read', () => {
  it('on a workspace where nobody has asked, says so and claims no answered history', async () => {
    serve('none');
    render(
      <>
        <AccessRequestQueue scope="organization" />
        <ContextProbe />
      </>,
    );

    expect(await screen.findByText(NEVER_ASKED)).toBeTruthy();
    expect(screen.getByText(/no requests waiting/i)).toBeTruthy();
    expect(screen.queryByText(ANSWERED_CLAIM)).toBeNull();
    // Nothing was answered, so there is nothing to offer showing.
    expect(screen.queryByRole('button', { name: /show answered requests/i })).toBeNull();
    // The claim rests on a read of the answered set, not on the open read alone.
    expect(api.fn.mock.calls.map((c) => c[1])).toContain('/api/module-access-requests?status=all');

    await waitFor(() => expect(published?.summary).toBeTruthy());
    expect(published!.summary).not.toMatch(ANSWERED_CLAIM);
    expect(published!.summary).toMatch(/nobody has asked/i);
  });

  it('when answered requests exist, says everything was answered and offers them', async () => {
    serve('answered');
    render(
      <>
        <AccessRequestQueue scope="organization" />
        <ContextProbe />
      </>,
    );

    expect(await screen.findByText(ANSWERED_CLAIM)).toBeTruthy();
    expect(screen.getByRole('button', { name: /show answered requests/i })).toBeTruthy();
    expect(screen.queryByText(NEVER_ASKED)).toBeNull();

    await waitFor(() => expect(published?.summary).toMatch(ANSWERED_CLAIM));
  });

  it('when the answered set cannot be read, claims neither history', async () => {
    serve('fails');
    render(
      <>
        <AccessRequestQueue scope="organization" />
        <ContextProbe />
      </>,
    );

    // The open read succeeded, so nobody waiting is a fact and is stated.
    expect(await screen.findByText(/could not be checked/i)).toBeTruthy();
    expect(screen.getByText(/no requests waiting/i)).toBeTruthy();
    expect(screen.queryByText(ANSWERED_CLAIM)).toBeNull();
    expect(screen.queryByText(NEVER_ASKED)).toBeNull();

    await waitFor(() => expect(published?.summary).toMatch(/could not be checked/i));
    expect(published!.summary).not.toMatch(/^No requests waiting; everything/);
  });

  it('never makes the extra read while somebody is waiting', async () => {
    api.fn.mockImplementation(async () =>
      json({ ...EMPTY, requests: [{ ...ANSWERED, id: 8, status: 'open', decidedAt: null }], openCount: 1 }),
    );
    render(<AccessRequestQueue scope="organization" />);

    expect(await screen.findByText('A Member')).toBeTruthy();
    expect(api.fn.mock.calls.map((c) => c[1])).toEqual(
      expect.not.arrayContaining(['/api/module-access-requests?status=all']),
    );
  });
});

describe('Access requests — the standalone route is a page', () => {
  it('has a page frame and a title of its own', async () => {
    serve('none');
    const { container } = render(<AccessRequests />);

    expect(screen.getByRole('heading', { level: 1, name: 'Access requests' })).toBeTruthy();
    expect(container.firstElementChild?.classList.contains('page-inner')).toBe(true);
    await screen.findByText(NEVER_ASKED);
  });

  it('adds no second page or title inside the Master Licensing tab', async () => {
    api.fn.mockImplementation(async () => json({ ...EMPTY, scope: 'all' }));
    const { container } = render(<AccessRequestQueue scope="all" />);

    await screen.findByText(/no requests waiting/i);
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
    expect(container.querySelector('.page-inner')).toBeNull();
  });
});
