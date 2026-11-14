/**
 * Another store's blocking work reads as blocking on the task board (D2,
 * 2026-10-29; docs/evidence/D2-ONE-ANA/2026-10-29/fold-device-tasks/).
 *
 * The device task workbench (`device-tasks`) folds into Tasks. Its header said
 * "· N blocking": the cross-store view's `summary.blocking`. That count includes
 * a review or correspondence item that carries a `blocker_type`, and a schedule
 * task flagged critical-to-quality, while neither is in the `blocked` status.
 * The board's card for that work set only `blocked: status === 'blocked'`, so
 * the fold would have lost them. The card now carries `blocking`, copied from
 * the view's own `item.blocking`, so the board counts what the summary counts
 * and invents nothing the store did not record.
 */
import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ items: [] as unknown[] }));
vi.mock('../../db/requestDb', () => {
  const chain: Record<string, unknown> = {};
  for (const k of ['select', 'from', 'where']) chain[k] = () => chain;
  chain.orderBy = async () => [];
  return { requestDb: () => chain, requestPgClient: () => ({ query: async () => ({ rows: [] }) }) };
});
vi.mock('../../utils/tenantContext', () => ({ getSecureOrgId: () => 7 }));
vi.mock('../../services/unified-work/unified-work-view', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/unified-work/unified-work-view')>()),
  loadUnifiedWork: async () => ({
    items: state.items,
    sources: {
      project_tasks: { ran: true }, c2c_project_work_items: { ran: true },
      estar_submissions: { ran: true }, unified_tasks: { ran: true },
    },
  }),
}));

import createTaskBoardRoutes from '../taskBoard.routes';
import {
  summarizeUnifiedWork,
  taskToUnified,
  workItemToUnified,
  filingToUnified,
  type UnifiedWorkItem,
} from '../../services/unified-work/unified-work-view';

/* Built by the view's own adapters from the columns each store records, so the
   test reads the same fields `summary.blocking` reads (unified-work-view.ts
   taskToUnified and workItemToUnified). */
const ITEMS: UnifiedWorkItem[] = [
  workItemToUnified({ id: 1, workItemId: 'WI-1', projectId: null, sourceType: 'review', title: 'Reviewer hold on 2.7.4', status: 'open', blockerType: 'approval_blocker' }),
  workItemToUnified({ id: 2, workItemId: 'WI-2', projectId: null, sourceType: 'correspondence', title: 'Answer the FDA information request', status: 'in_progress', blockerType: 'agency_request' }),
  workItemToUnified({ id: 3, workItemId: 'WI-3', projectId: null, sourceType: 'review', title: 'Tidy the 2.5 references', status: 'open', blockerType: null }),
  workItemToUnified({ id: 4, workItemId: 'WI-4', projectId: null, sourceType: 'review', title: 'Hold cleared last week', status: 'resolved', blockerType: 'approval_blocker' }),
  taskToUnified({ id: 41, projectId: null, name: 'Release specification', status: 'todo', criticalToQuality: true }),
  taskToUnified({ id: 42, projectId: null, name: 'Book the kickoff room', status: 'todo', criticalToQuality: false }),
  taskToUnified({ id: 43, projectId: null, name: 'Stability protocol', status: 'done', criticalToQuality: true }),
];

const app = () => { const a = express(); a.use('/api/task-management', createTaskBoardRoutes()); return a; };
const board = async () => {
  const r = await request(app()).get('/api/task-management/board');
  expect(r.status).toBe(200);
  return r.body.data as Array<{ taskId: string; blocking?: boolean; blocked: boolean; readOnly?: boolean; assignee?: string }>;
};
const byId = (cards: Awaited<ReturnType<typeof board>>, id: string) => cards.find((c) => c.taskId === id)!;

beforeEach(() => { state.items = ITEMS; });

describe("task board: another store's blocking work", () => {
  it('marks a review or correspondence item with a blocker type as blocking, without calling it blocked', async () => {
    const cards = await board();
    expect(byId(cards, 'review:WI-1')).toMatchObject({ blocking: true, blocked: false, readOnly: true });
    expect(byId(cards, 'correspondence:WI-2')).toMatchObject({ blocking: true, blocked: false });
  });

  it('marks an unfinished critical-to-quality schedule task as blocking, without calling it blocked', async () => {
    expect(byId(await board(), 'schedule:41')).toMatchObject({ blocking: true, blocked: false });
  });

  it('invents no blocker: no blocker type, a finished hold and an ordinary or finished task are not blocking', async () => {
    const cards = await board();
    for (const id of ['review:WI-3', 'review:WI-4', 'schedule:42', 'schedule:43']) {
      expect(byId(cards, id).blocking, id).toBe(false);
    }
  });

  it('counts exactly what the cross-store summary counts as blocking', async () => {
    const cards = await board();
    expect(cards.filter((c) => c.blocking).length).toBe(summarizeUnifiedWork(ITEMS).blocking);
    expect(summarizeUnifiedWork(ITEMS).blocking).toBe(3);
  });
});

/**
 * P-131 items 3 and 6 on the board: another store's work carries the owner that store records (so "Mine" includes
 * it), the board comes in the order of need, and work with no owner is answered by the same read: an `unassigned`
 * option and a count in `meta`.
 */
describe('task board: owners, order of need and work with no owner (P-131)', () => {
  const DAY = 86_400_000;
  const at = (days: number) => new Date(Date.now() + days * DAY).toISOString();
  const OWNED: UnifiedWorkItem[] = [
    taskToUnified({ id: 51, projectId: null, name: 'Later, high, mine', status: 'todo', priority: 'high', dueDate: at(30), assigneeId: 31 }),
    workItemToUnified({ id: 52, workItemId: 'WI-52', projectId: null, sourceType: 'correspondence', title: 'Overdue letter, nobody', status: 'open', priority: 'medium', dueAt: at(-2), ownerId: null }),
    workItemToUnified({ id: 53, workItemId: 'WI-53', projectId: null, sourceType: 'correspondence', title: 'Overdue letter, critical', status: 'open', priority: 'critical', dueAt: at(-1), ownerId: 32 }),
    taskToUnified({ id: 54, projectId: null, name: 'This week, no owner', status: 'todo', priority: 'low', dueDate: at(3) }),
    taskToUnified({ id: 55, projectId: null, name: 'Finished, no owner', status: 'done', priority: 'low', dueDate: at(-5) }),
    filingToUnified({ id: 'f-56', projectId: null, title: 'Tracked filing', status: 'under_review', decisionDueAt: at(10) }),
  ];
  type Card = { taskId: string; assignee: string; readOnly?: boolean };
  const get = async (q = '') => request(app()).get(`/api/task-management/board${q}`);

  beforeEach(() => { state.items = OWNED; });

  it("carries the owner another store records as the card's assignee, and none it does not record", async () => {
    const r = await get();
    const cards = r.body.data as Card[];
    expect(byId(cards as never, 'schedule:51').assignee).toBe('31');
    expect(byId(cards as never, 'correspondence:WI-53').assignee).toBe('32');
    expect(byId(cards as never, 'correspondence:WI-52').assignee).toBe('');
    expect(byId(cards as never, 'filing:f-56').assignee).toBe('');
  });

  it('returns the board in the order of need: overdue, this week, later, no date; priority within each; finished work last', async () => {
    const r = await get();
    expect((r.body.data as Card[]).map((c) => c.taskId)).toEqual([
      'correspondence:WI-53', 'correspondence:WI-52', 'schedule:54', 'schedule:51', 'filing:f-56',
      // Finished work is not overdue, whatever its date said: it follows the open work.
      'schedule:55',
    ]);
  });

  it('answers the work with no owner from the same read: a count on every read, and an unassigned option', async () => {
    const all = await get();
    expect(all.body.meta.unassigned).toBe(2);
    const r = await get('?assignee=unassigned');
    expect(r.status).toBe(200);
    // Open work, in a store that records an owner, with none recorded. Finished work and a filing are not counted.
    expect((r.body.data as Card[]).map((c) => c.taskId)).toEqual(['correspondence:WI-52', 'schedule:54']);
    expect(r.body.total).toBe(2);
    expect(r.body.meta.unassigned).toBe(2);
  });

  it('refuses an assignee option it does not know, in words, rather than ignoring it', async () => {
    const r = await get('?assignee=someone');
    expect(r.status).toBe(400);
    expect(r.body.error).toBe('The board can be narrowed only to work that has no owner.');
  });
});
