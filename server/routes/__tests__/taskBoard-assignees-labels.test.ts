/**
 * GET /api/task-management/assignees names each member so a picker can tell
 * two people with one name apart (W1/D2, 2026-10-05;
 * docs/evidence/W1/2026-10-05-same-name-members/).
 *
 * The roster returned `{ id, name }` only. The demo organisation has two
 * accounts named "JM Smith", so the Task form, the task board's create form,
 * the RBM owner select and the assign-review dialog each offered "JM Smith"
 * twice, and nothing on screen said which account either one was. `label` is
 * the name, with the address beside it only where another member holds the
 * same name (shared/utils/member-labels.ts). `name` is unchanged, because the
 * task board's cards show it.
 */
import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ rows: [] as Array<{ id: number; name: string | null; email: string | null }> }));

vi.mock('../../db/requestDb', () => {
  const chain: Record<string, unknown> = {};
  for (const k of ['select', 'from', 'innerJoin', 'where']) chain[k] = () => chain;
  chain.orderBy = async () => state.rows;
  return { requestDb: () => chain };
});
vi.mock('../../utils/tenantContext', () => ({ getSecureOrgId: () => 7 }));
vi.mock('../../services/unified-work/unified-work-view', () => ({ loadUnifiedWork: vi.fn() }));

import createTaskBoardRoutes from '../taskBoard.routes';

function app() {
  const a = express();
  a.use('/api/task-management', createTaskBoardRoutes());
  return a;
}

beforeEach(() => {
  state.rows = [
    { id: 1, name: 'JM Smith', email: 'jm.smith@acme.test' },
    { id: 2, name: 'JM Smith', email: 'jm@other.test' },
    { id: 4, name: 'Rae Okafor', email: 'rae@acme.test' },
  ];
});

describe('GET /assignees', () => {
  it('two members with one name have two different labels; a unique name is left as it is', async () => {
    const res = await request(app()).get('/api/task-management/assignees');
    expect(res.status).toBe(200);
    const byId = Object.fromEntries((res.body.data as Array<{ id: string; label: string }>).map((r) => [r.id, r.label]));
    expect(byId['1']).toBe('JM Smith · jm.smith@acme.test');
    expect(byId['2']).toBe('JM Smith · jm@other.test');
    expect(byId['4']).toBe('Rae Okafor');
  });

  it('keeps name as it was, for the readers that show it', async () => {
    const res = await request(app()).get('/api/task-management/assignees');
    expect((res.body.data as Array<{ name: string }>).map((r) => r.name)).toEqual(['JM Smith', 'JM Smith', 'Rae Okafor']);
  });
});
