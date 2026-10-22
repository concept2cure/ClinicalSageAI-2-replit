/**
 * Another store's card names its project's PROGRAM, so Tasks → "Open in …"
 * opens the screen on the program UUID (DOCUMENT_STORE_CONSOLIDATION.md step 7).
 *
 * Program intake creates a numeric `projects` anchor per program
 * (requireProgramProjectAnchor), and the review, schedule and filing stores key
 * their work by that number. The card's `home` carried only the number, the
 * board published it as the open project, and eCTD compile then received a
 * numeric `:projectIdent` and read the legacy section store. `home.programId`
 * is the anchor's `projects.regulatory_program_id`, read through the one anchor
 * reader (listProgramAnchorCandidates), org-scoped.
 */
import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const PROGRAM = '2b6d4a80-6a35-4b1e-9f6e-3a9d2c1e5f70';

const state = vi.hoisted(() => ({
  anchors: [] as Array<{ programId: string; anchor: { id: number; clientWorkspaceId: number | null } | null }>,
  anchorError: null as unknown,
  anchorCalls: [] as unknown[],
}));

vi.mock('../../db/requestDb', () => {
  const chain: Record<string, unknown> = {};
  for (const k of ['select', 'from', 'innerJoin', 'where']) chain[k] = () => chain;
  chain.orderBy = async () => [];
  return { requestDb: () => chain };
});
vi.mock('../../utils/tenantContext', () => ({ getSecureOrgId: () => 7 }));
vi.mock('../../services/unified-work/unified-work-view', () => ({
  loadUnifiedWork: vi.fn(async () => ({
    items: [
      { id: 'review:5', source: 'review', nativeId: '5', projectId: 41, title: 'Reviewer comments on 2.7.3', status: 'open', priority: null, dueAt: null, ownerName: null, blocking: false, detail: null },
      { id: 'filing:9', source: 'filing', nativeId: '9', projectId: 99, title: 'Legacy filing', status: 'open', priority: null, dueAt: null, ownerName: null, blocking: false, detail: null },
      { id: 'schedule:3', source: 'schedule', nativeId: '3', projectId: null, title: 'Unscoped schedule item', status: 'open', priority: null, dueAt: null, ownerName: null, blocking: false, detail: null },
    ],
    sources: {},
  })),
}));
vi.mock('../../services/c2c/program-project-anchor', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/c2c/program-project-anchor')>()),
  listProgramAnchorCandidates: vi.fn(async (_db: unknown, params: unknown) => {
    state.anchorCalls.push(params);
    if (state.anchorError) throw state.anchorError;
    return state.anchors;
  }),
}));

import createTaskBoardRoutes, { otherStoreCard } from '../taskBoard.routes';

function app() {
  const a = express();
  a.use('/api/task-management', createTaskBoardRoutes());
  return a;
}

const homes = async () => {
  const res = await request(app()).get('/api/task-management/board');
  return { res, byId: Object.fromEntries((res.body.data ?? []).map((c: { taskId: string; home: unknown }) => [c.taskId, c.home])) };
};

beforeEach(() => {
  state.anchors = [{ programId: PROGRAM.toUpperCase(), anchor: { id: 41, clientWorkspaceId: null } }];
  state.anchorError = null;
  state.anchorCalls = [];
});

describe("GET /board — another store's card names its program", () => {
  it('carries the anchored program UUID beside the numeric project, read org-scoped', async () => {
    const { res, byId } = await homes();
    expect(res.status).toBe(200);
    expect(byId['review:5']).toEqual({ surface: 'project-home', projectId: 41, programId: PROGRAM });
    expect(state.anchorCalls).toEqual([{ orgId: 7, eligibility: 'non-deleted' }]);
  });

  it('a project that anchors no program, and work with no project, name no program', async () => {
    const { byId } = await homes();
    expect(byId['filing:9']).toEqual({ surface: 'submission-center', projectId: 99, programId: null });
    expect(byId['schedule:3']).toEqual({ surface: 'project-home', projectId: null, programId: null });
  });

  it('a database without the anchor column has no anchors; any other failed read is a failed board', async () => {
    state.anchorError = Object.assign(new Error('column does not exist'), { code: '42703' });
    const absent = await homes();
    expect(absent.res.status).toBe(200);
    expect(absent.byId['review:5']).toEqual({ surface: 'project-home', projectId: 41, programId: null });

    state.anchorError = new Error('connection reset');
    expect((await homes()).res.status).toBe(500);
  });

  it('otherStoreCard without a program map names no program', () => {
    const card = otherStoreCard({ id: 'review:5', source: 'review', nativeId: '5', projectId: 41, title: 't', status: 'open', priority: null, dueAt: null, ownerName: null, blocking: false, detail: null });
    expect(card?.home).toEqual({ surface: 'project-home', projectId: 41, programId: null });
  });
});
