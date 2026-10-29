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
  return r.body.data as Array<{ taskId: string; blocking?: boolean; blocked: boolean; readOnly?: boolean }>;
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
