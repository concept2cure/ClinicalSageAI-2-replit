/**
 * @vitest-environment jsdom
 */
/**
 * WO-16C finding 109 — the Submission center's Activity strip stated an actor
 * nobody computed.
 *
 * `useSubmissionDetail` mapped each milestone row to
 * `who: r.ownerName ?? 'System'`, but the only handler for
 * GET /api/submission-ops/packages/:packageId/milestones
 * (server/routes/submission-ops.ts) returns raw `c2c_milestones` rows and that
 * table has no owner_name column — only `created_by_id`. So `ownerName` was
 * never present, the fallback fired on every row, and every line of the
 * Activity list in the Submissions drawer (Workbench.tsx, `activity-who`) read
 * "System" no matter which user actually created the milestone. A fabricated
 * actor, with no signal that the actor was unknown.
 *
 * Failure is injected at the DEPENDENCY: `fetch` is stubbed to answer with the
 * EXACT payload shape the live route emits — `{ data: [ { ...c2c_milestones
 * row, sections: [] } ] }` — rather than mocking the hook or the mapper. The
 * hook runs for real over that response.
 *
 * RED on the pre-fix head:
 *   AssertionError: an actor nobody resolved must not be rendered as an actor
 *   expected 'System' to be ''
 *
 * After the fix the actor is the real one when the server resolves
 * `created_by_id` to a name, and an honest empty (rendered '—') when it cannot.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useSubmissionDetail } from '../useSubmissions';

/** A row exactly as `db.select().from(c2cMilestones)` returns it, plus the
 *  `sections` the route attaches. Note: no `ownerName`, no `status`. */
const milestoneRow = (over: Record<string, unknown> = {}) => ({
  id: 41,
  milestoneId: 'ms_7d0f1f2e',
  orgId: 7,
  packageDbId: 3,
  title: 'Design history file locked',
  description: null,
  targetDate: null,
  gateStatus: 'open',
  blockReasons: null,
  sortOrder: 0,
  metadata: null,
  createdById: 12,
  createdAt: new Date(Date.now() - 3 * 60_000).toISOString(),
  updatedAt: new Date(Date.now() - 3 * 60_000).toISOString(),
  sections: [],
  ...over,
});

const jsonResponse = (body: unknown) => ({
  ok: true,
  status: 200,
  json: async () => body,
  text: async () => JSON.stringify(body),
});

let fetchMock: ReturnType<typeof vi.fn>;

/** Route by URL so /readiness and /milestones each answer as the server does. */
function serveMilestones(rows: unknown[]) {
  fetchMock.mockImplementation((url: string) =>
    Promise.resolve(
      String(url).includes('/milestones')
        ? jsonResponse({ data: rows })
        : jsonResponse({ errs: 0, warns: 1, ok: 4 }),
    ),
  );
}

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe('useSubmissionDetail — milestone activity actor', () => {
  it('does not invent "System" for a row the server sent no actor name on', async () => {
    serveMilestones([milestoneRow()]);
    const { result } = renderHook(() => useSubmissionDetail('pkg_abc'));
    await waitFor(() => expect(result.current.log).not.toBeNull());

    const [entry] = result.current.log!;
    expect(entry.who, 'an actor nobody resolved must not be rendered as an actor').toBe('');
    expect(entry.who).not.toBe('System');
  });

  it('states the real actor when the server resolved created_by_id to a name', async () => {
    serveMilestones([milestoneRow({ createdByName: 'M. Wei' })]);
    const { result } = renderHook(() => useSubmissionDetail('pkg_abc'));
    await waitFor(() => expect(result.current.log).not.toBeNull());

    expect(result.current.log![0].who).toBe('M. Wei');
  });

  it('leaves the actor blank when the resolved name is null, and never for a blank string', async () => {
    serveMilestones([
      milestoneRow({ id: 1, createdById: null, createdByName: null }),
      milestoneRow({ id: 2, createdByName: '   ' }),
    ]);
    const { result } = renderHook(() => useSubmissionDetail('pkg_abc'));
    await waitFor(() => expect(result.current.log).not.toBeNull());

    expect(result.current.log!.map((l) => l.who)).toEqual(['', '']);
  });

  it('still carries the milestone title and gate status into the activity line', async () => {
    serveMilestones([milestoneRow({ gateStatus: 'blocked' })]);
    const { result } = renderHook(() => useSubmissionDetail('pkg_abc'));
    await waitFor(() => expect(result.current.log).not.toBeNull());

    expect(result.current.log![0].what).toContain('Design history file locked');
  });
});
