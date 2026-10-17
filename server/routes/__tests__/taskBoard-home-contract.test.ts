import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('../../db/requestDb', () => {
  const chain: Record<string, unknown> = {};
  for (const k of ['select', 'from', 'where']) chain[k] = () => chain;
  chain.orderBy = async () => [];
  return { requestDb: () => chain, requestPgClient: () => ({ query: state.query }) };
});
vi.mock('../../utils/tenantContext', () => ({ getSecureOrgId: () => 7 }));
vi.mock('../../services/unified-work/unified-work-view', () => ({ loadUnifiedWork: async () => ({
  items: [{ id: 'schedule:41', nativeId: '41', source: 'schedule', projectId: 12, title: 'Owned task', status: 'open', dueAt: null, priority: 'high', detail: null }],
  sources: { project_tasks: { ran: true } },
}) }));
import createTaskBoardRoutes from '../taskBoard.routes';
const PROGRAM = '11111111-1111-4111-8111-111111111111';
const app = () => { const a = express(); a.use('/api/task-management', createTaskBoardRoutes()); return a; };
beforeEach(() => { state.query.mockReset(); state.query.mockImplementation(async (text: string) => ({ rows: text.includes('client_workspace_id')
  ? [{ id: 12, clientWorkspaceId: 1 }] : [{ project_id: 12, program_id: PROGRAM, name: 'Our program' }] })); });
describe('task board owning-program handoff', () => {
  it('carries both id spaces and the native record without coercing the integer to the program id', async () => {
    const r = await request(app()).get('/api/task-management/board');
    expect(r.status).toBe(200);
    expect(r.body.data[0].home).toEqual({ surface: 'project-home', projectId: 12, programId: PROGRAM, programTitle: 'Our program', source: 'schedule', nativeId: '41' });
    expect(state.query).toHaveBeenCalledWith(expect.stringContaining('rp.organization_id = $1 AND p.organization_id = $1'), [7, [12]]);
  });
  it('keeps an unlinked task visible with no fabricated program identity', async () => {
    state.query.mockResolvedValue({ rows: [] });
    const r = await request(app()).get('/api/task-management/board');
    expect(r.status).toBe(200);
    expect(r.body.data[0].home.programId).toBeNull();
    expect(r.body.data[0].home.projectId).toBe(12);
  });
  it('refuses a failed owner lookup instead of serving a guessed handoff', async () => {
    state.query.mockRejectedValue(new Error('Owner lookup unavailable'));
    const r = await request(app()).get('/api/task-management/board');
    expect(r.status).toBe(500);
    expect(r.body.success).toBe(false);
  });
});
