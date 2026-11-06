/**
 * A review-route task says where it is acted on (J5 human test, J2's D4,
 * 2026-11-06). A Vault review task opened from Tasks offered only Advance, and
 * the server rightly refuses Advance on a route task (409,
 * ROUTE_TASK_OWNED_BY_ROUTE), so a reviewer starting from Tasks was stuck. The
 * board read now carries the version the route is on, resolved the way a
 * task notice is (notification-record-target.ts canonicalDocumentTarget), and
 * the place a QMS route is acted on. A task outside a route carries nothing.
 */
import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const VAULT = '0b7e1a52-3c55-4a0e-9a8e-111111111111';
const PROGRAM = '46e5c864-08bf-4860-aa6f-36e015485015';
const state = vi.hoisted(() => ({ rows: [] as unknown[], queries: [] as Array<{ text: string; values: unknown[] }>, fail: false }));
vi.mock('../../db/requestDb', () => {
  const chain: Record<string, unknown> = {};
  for (const k of ['select', 'from']) chain[k] = () => chain;
  // The board's own read ends in orderBy; its dependency read awaits where.
  chain.where = () => ({ orderBy: async () => state.rows, then: (done: (v: unknown[]) => void) => done([]) });
  return {
    requestDb: () => chain,
    requestPgClient: () => ({
      query: async (text: string, values: unknown[]) => {
        state.queries.push({ text, values });
        if (/canonical_documents/.test(text)) {
          if (state.fail) throw new Error('relation does not exist');
          return { rows: [{ canonical_id: 'CAN-ADSL', vault_id: VAULT, program_id: PROGRAM }] };
        }
        return { rows: [] };
      },
    }),
  };
});
vi.mock('../../utils/tenantContext', () => ({ getSecureOrgId: () => 7 }));
vi.mock('../../services/unified-work/unified-work-view', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/unified-work/unified-work-view')>()),
  loadUnifiedWork: async () => ({ items: [], sources: { unified_tasks: { ran: true } } }),
}));

import createTaskBoardRoutes from '../taskBoard.routes';

const row = (over: Record<string, unknown>) => ({
  taskId: 'T', title: 't', projectId: 1, moduleType: 'regulatory', taskType: 'review', status: 'pending',
  priority: 'medium', assigneeId: 2, assignedBy: 1, description: null, progress: 0, impactScore: null,
  criticalPath: false, regulatoryImpact: false, approvalRequired: false, approvalStatus: 'not_started',
  approvalHistory: [], comments: [], attachments: [], sourceEntityType: null, sourceEntityId: null,
  dueDate: null, lifecyclePhase: null, estimatedHours: null, blockedBy: null, reviewRouteId: null, ...over,
});
const app = () => { const a = express(); a.use('/api/task-management', createTaskBoardRoutes()); return a; };
const board = async () => {
  const r = await request(app()).get('/api/task-management/board');
  expect(r.status).toBe(200);
  return r.body.data as Array<{ taskId: string; reviewRoute?: unknown }>;
};
const card = (cards: Awaited<ReturnType<typeof board>>, id: string) => cards.find(c => c.taskId === id)!;

beforeEach(() => {
  state.queries = []; state.fail = false;
  state.rows = [
    row({ taskId: 'ROUTE-aaaa-2', title: 'Review: ADSL', sourceEntityType: 'canonical_document', sourceEntityId: 'CAN-ADSL', reviewRouteId: 'aaaaaaaa-0000-4000-8000-000000000001' }),
    row({ taskId: 'ROUTE-bbbb-2', title: 'Approve: SOP-001', sourceEntityType: 'qms_document', sourceEntityId: '12', reviewRouteId: 'bbbbbbbb-0000-4000-8000-000000000001' }),
    row({ taskId: 'PLAIN-1', title: 'Book the kickoff room' }),
  ];
});

describe('task board: a review-route task says where it is acted on', () => {
  it('names the Vault version of a Vault review task, from one org-scoped lookup', async () => {
    const cards = await board();
    expect(card(cards, 'ROUTE-aaaa-2').reviewRoute).toEqual({ kind: 'vault', documentId: VAULT, programId: PROGRAM });
    const lookups = state.queries.filter(q => /canonical_documents/.test(q.text));
    expect(lookups).toHaveLength(1);
    expect(lookups[0].values).toEqual([7, ['CAN-ADSL']]);
  });

  it('names the controlled document of a QMS review task', async () => {
    expect(card(await board(), 'ROUTE-bbbb-2').reviewRoute).toEqual({ kind: 'quality', qmsDocumentId: '12' });
  });

  it('marks nothing on a task outside a route', async () => {
    expect(card(await board(), 'PLAIN-1').reviewRoute).toBeUndefined();
  });

  it('still marks a route task when its version cannot be read, without failing the board', async () => {
    state.fail = true;
    expect(card(await board(), 'ROUTE-aaaa-2').reviewRoute).toEqual({ kind: 'unresolved' });
  });
});
