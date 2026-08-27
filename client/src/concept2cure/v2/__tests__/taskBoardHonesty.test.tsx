// @vitest-environment jsdom
/**
 * The task board may not report a critical path it has never been given, nor a
 * workload it has never measured.
 *
 * ── The findings ─────────────────────────────────────────────────────────────
 * Three sentences in the board's AnswerLead were the else-branches of
 * conditionals whose only input was the LENGTH of a list the surface itself had
 * filtered:
 *
 *   1. headline: "The critical path is clear — nothing open is blocking the
 *      milestone right now." Reached by `critBlocked ? … : critOpen.length ? …`,
 *      where `critOpen` is `critChain` minus completed work and `critChain` is
 *      built only from `list.filter(t => t.criticalPath)`. So a board whose
 *      critical path had been reviewed and found unblocked, and a board on which
 *      nobody had ever flagged a single task `criticalPath`, produced the same
 *      sentence. The second is the ordinary case — the flag starts false in the
 *      create form and is only ever set by a manual toggle nothing requires.
 *
 *   2. reassure: "You are on track. I will flag the moment anything threatens
 *      the milestone." Same pair of inputs, plus a promise to monitor a path
 *      that in the ambiguous case does not exist to be monitored.
 *
 *   3. body: "Workload is balanced across the team." The else of
 *      `heaviest && heaviest.open >= 3`, so it also fired whenever `heaviest`
 *      was undefined — which is every case where the project / module / "My
 *      tasks" filters leave no assigned open work in view at all. An absent
 *      distribution is not a level one.
 *
 * The one upstream gate, `liveTasks.empty`, only establishes that the
 * UNFILTERED board has rows. It says nothing about whether any of them is on a
 * path, and nothing about the filters narrowing the list to zero.
 *
 * ── The evidence the claims are now gated on ─────────────────────────────────
 * A DENOMINATOR in both cases, per assessmentState.ts: `critChain.length > 0`
 * (a path was actually marked out, so "every task on it is complete" is a claim
 * about something), and at least one open task assigned to a named person
 * before any statement about how load sits. Neither is derived from the
 * emptiness that was the ambiguity.
 *
 * Everything below is behavioural: the real surface, the real read path
 * (dataConnect → apiRequest), the real filter controls. Only the transport and
 * the signed-in identity are mocked.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

// useAuth throws outside an AuthProvider. The board uses the identity for one
// thing only — the "My tasks" filter compares `user.id` against a row's real
// assignee FK — which is exactly what the filter-narrowing test drives.
vi.mock('@/services/portal/authService', () => ({
  useAuth: () => ({ user: { id: 7, displayName: 'Test Director' } }),
}));

import { TaskBoard } from '../surfaces/TaskBoard';

/* ── Test payloads (this file only; the surface can never import them) ── */

const FUTURE = new Date(Date.now() + 30 * 86_400_000).toISOString();

/**
 * A complete board row, matching the documented wire shape of
 * GET /api/task-management/board. Complete rather than minimal because the
 * board renders every row as a card — a partial fixture would make the
 * component throw and the assertions would be measuring the fixture rather
 * than the lead.
 *
 * Defaults: `criticalPath: false`, which is the create form's own default and
 * the state finding 1 named; a future due date, so nothing is overdue; no
 * approval gate, so the approvals clause stays out of the copy.
 */
function task(over: Record<string, unknown> = {}) {
  return {
    taskId: 'TASK-1',
    title: 'Draft 2.5 Clinical Overview',
    project: '1',
    moduleType: 'Clinical',
    taskType: 'deliverable',
    status: 'in-progress',
    priority: 'high',
    assignee: '8',
    assignedBy: '7',
    progress: 40,
    impactScore: 6,
    criticalPath: false,
    regulatoryImpact: true,
    approvalRequired: false,
    approvalStatus: 'not_required',
    approvalHistory: [],
    dependsOn: [],
    blocks: [],
    comments: 0,
    attachments: 0,
    source: 'unified',
    due: 'in 30 days',
    dueDateIso: FUTURE,
    phase: 'clinical',
    ...over,
  };
}

const PROJECTS = [{ id: 1, name: 'C2C-101 first-in-human' }];
const ROSTER = [
  { id: '8', name: 'Dana Chen' },
  { id: '9', name: 'Sam Ortiz' },
];

function ok(payload: unknown) {
  return { ok: true, status: 200, json: async () => ({ success: true, data: payload }) };
}

function mount(rows: unknown[]) {
  apiRequest.mockImplementation(async (_m: string, url: string) => {
    const u = String(url);
    if (u.includes('/api/task-management/board')) return ok(rows);
    if (u.includes('/api/task-management/assignees')) return ok(ROSTER);
    if (u.includes('/api/projects')) return ok(PROJECTS);
    // Only read by the analytics tab, which these tests never open.
    if (u.includes('/api/project-rules')) {
      return { ok: true, status: 200, json: async () => ({ rules: [], total: 0 }) };
    }
    return ok([]);
  });
  render(<TaskBoard {...({ surface: { id: 'task-board' }, onAsk: vi.fn(), onNav: vi.fn() } as any)} />);
}

/** The board is loaded once a card has painted — the lead renders with it. */
async function boardReady(title = /Draft 2.5 Clinical Overview/i) {
  await waitFor(() => expect(screen.getAllByText(title).length).toBeGreaterThan(0));
}

const text = () => document.body.textContent ?? '';

beforeEach(() => {
  apiRequest.mockReset();
  delete (window as unknown as Record<string, unknown>).C2C_TASK_FILTER;
});
afterEach(() => cleanup());

describe('TaskBoard — a path nobody marked out is not a path found clear', () => {
  it('does not report a clear critical path when no task carries the flag', async () => {
    mount([
      task({ taskId: 'T-1', title: 'Draft 2.5 Clinical Overview', assignee: '8' }),
      task({ taskId: 'T-2', title: 'Reconcile CSR-201 dataset', assignee: '8', status: 'pending' }),
      task({ taskId: 'T-3', title: 'QC the stability tables', assignee: '9', status: 'pending' }),
    ]);
    await boardReady();

    const body = text();
    // The three sentences the findings named. None of them was established by
    // anything: not one of these rows has ever been designated critical-path.
    expect(/The critical path is clear/i.test(body), 'must not claim a clear path').toBe(false);
    expect(/nothing open is blocking the milestone/i.test(body), 'must not claim nothing blocks').toBe(false);
    expect(/You are on track/i.test(body), 'must not reassure').toBe(false);
    expect(/I will flag the moment/i.test(body), 'must not promise to watch an unmapped path').toBe(false);

    // And it must say which state IS true, rather than going silent.
    expect(/No task in view is flagged as being on the critical path/i.test(body)).toBe(true);
    expect(/absence of a designated path/i.test(body)).toBe(true);
  });

  it('does not describe a critical path or a workload when the filters leave nothing in view', async () => {
    // Every row belongs to assignee '8'; the signed-in user is id 7. "My tasks"
    // therefore narrows `list` to zero while the board itself is non-empty —
    // precisely the case `liveTasks.empty` cannot see.
    mount([
      task({ taskId: 'T-1', title: 'Draft 2.5 Clinical Overview', assignee: '8' }),
      task({ taskId: 'T-2', title: 'Reconcile CSR-201 dataset', assignee: '8', status: 'pending' }),
    ]);
    await boardReady();

    fireEvent.click(screen.getByRole('button', { name: /My tasks/i }));
    await waitFor(() => expect(/No tasks are in view/i.test(text())).toBe(true));

    const body = text();
    expect(/The critical path is clear/i.test(body), 'must not claim a clear path').toBe(false);
    expect(/Workload is balanced across the team/i.test(body), 'must not claim balance').toBe(false);
    expect(/is carrying more than/i.test(body), 'must not measure an absent distribution').toBe(false);
    expect(/You are on track/i.test(body), 'must not reassure').toBe(false);
    // The honest replacement names what actually happened.
    expect(/none in the current project, module or assignee filter/i.test(body)).toBe(true);
  });

  /**
   * The over-correction guard.
   *
   * A fix that simply deleted the reassuring branch would pass both tests above
   * and destroy the surface. Here a critical path genuinely EXISTS — two tasks
   * carry the flag — and has been worked to completion, which is the
   * `assessed-clear` state and the only one entitled to reassure. It must still
   * be reachable, and the board must still say so.
   */
  it('still reports a clear path — and still reassures — when the path was designated and finished', async () => {
    mount([
      task({ taskId: 'T-1', title: 'Lock the CMC content plan', criticalPath: true, status: 'completed', progress: 100, assignee: '8' }),
      task({ taskId: 'T-2', title: 'Approve the integrated summary', criticalPath: true, status: 'completed', progress: 100, assignee: '9', dependsOn: ['T-1'] }),
      task({ taskId: 'T-3', title: 'Draft 2.5 Clinical Overview', assignee: '8' }),
    ]);
    await boardReady();

    const body = text();
    expect(/The critical path is clear/i.test(body), 'clearance must stay reachable').toBe(true);
    // The claim is now quantified against the denominator that earns it.
    expect(/all 2 tasks on it are complete/i.test(body)).toBe(true);
    expect(/You are on track/i.test(body), 'reassurance must stay reachable').toBe(true);
    // The monitoring promise is still dropped: due dates reach the reader
    // through the hourly sweep this surface documents, not instantaneously.
    expect(/I will flag the moment/i.test(body), 'must not promise instantaneous flagging').toBe(false);
    // The lead switches to the 'good' tone AnswerLead provides for this state.
    expect(document.querySelector('.al-lead.al-good')).not.toBeNull();
  });
});

describe('TaskBoard — workload copy is a measurement, not a default', () => {
  it('reports the distribution it measured instead of asserting balance', async () => {
    mount([
      task({ taskId: 'T-1', title: 'Draft 2.5 Clinical Overview', assignee: '8' }),
      task({ taskId: 'T-2', title: 'Reconcile CSR-201 dataset', assignee: '8', status: 'pending' }),
      task({ taskId: 'T-3', title: 'QC the stability tables', assignee: '9', status: 'pending' }),
    ]);
    await boardReady();

    const body = text();
    expect(/Workload is balanced across the team/i.test(body), 'the unmeasured claim is gone').toBe(false);
    // Dana holds 2 open, Sam 1 — measured, under the busiest threshold.
    expect(/No one in view is carrying more than 2 open tasks/i.test(body)).toBe(true);
  });

  it('still names the busiest person when someone is genuinely carrying the load', async () => {
    mount([
      task({ taskId: 'T-1', title: 'Draft 2.5 Clinical Overview', assignee: '8' }),
      task({ taskId: 'T-2', title: 'Reconcile CSR-201 dataset', assignee: '8', status: 'pending' }),
      task({ taskId: 'T-3', title: 'QC the stability tables', assignee: '8', status: 'pending' }),
      task({ taskId: 'T-4', title: 'Update the risk file', assignee: '9', status: 'pending' }),
    ]);
    await boardReady();

    expect(/Dana Chen is the busiest at 3 open tasks/i.test(text())).toBe(true);
  });

  /**
   * `stats.byAsg` keys unassigned work under '', and `nameOf('')` is ''. Ranked
   * with real people that bucket produced " is the busiest at N open tasks" —
   * an owner with no name — and let a pile of unowned work stand in for one
   * person's load, which is the same ambiguity finding 3 names.
   */
  it('does not present unassigned work as somebody’s workload', async () => {
    mount([
      task({ taskId: 'T-1', title: 'Draft 2.5 Clinical Overview', assignee: '', status: 'pending' }),
      task({ taskId: 'T-2', title: 'Reconcile CSR-201 dataset', assignee: '', status: 'pending' }),
      task({ taskId: 'T-3', title: 'QC the stability tables', assignee: '', status: 'pending' }),
    ]);
    await boardReady();

    const body = text();
    expect(/is the busiest at/i.test(body), 'must not name a nameless owner').toBe(false);
    expect(/Workload is balanced across the team/i.test(body), 'nor claim balance').toBe(false);
    expect(/None of the 3 open tasks in view is assigned to anyone/i.test(body)).toBe(true);
  });
});
