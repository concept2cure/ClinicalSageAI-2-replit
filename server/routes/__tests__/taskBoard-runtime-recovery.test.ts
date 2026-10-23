/** Actual Drizzle wrapping must not defeat the board's missing-store recovery. */
import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { requestDb, type RequestDb } from '../../db/requestDb';

const state = vi.hoisted(() => ({ loadUnifiedWork: vi.fn() }));
vi.mock('../../services/unified-work/unified-work-view', () => ({ loadUnifiedWork: state.loadUnifiedWork }));
vi.mock('../../utils/tenantContext', () => ({ getSecureOrgId: () => 7 }));
import createTaskBoardRoutes from '../taskBoard.routes';

const schedule = {
  id: 'schedule:41', nativeId: '41', source: 'schedule', projectId: null,
  title: 'Retain readable schedule work', status: 'open', dueAt: null, priority: null, detail: null,
};
let database: RequestDb;
let driverFailure: unknown;
let observedFailure: { code?: string; cause?: { code?: string } } | undefined;
const query = vi.fn();

function app() {
  const a = express();
  a.use((req, _res, next) => {
    req.dbClient = { query } as unknown as typeof req.dbClient;
    database = requestDb(req);
    next();
  });
  a.use('/api/task-management', createTaskBoardRoutes());
  return a;
}

beforeEach(() => {
  driverFailure = undefined;
  observedFailure = undefined;
  query.mockReset().mockImplementation(async () => {
    if (driverFailure) throw driverFailure;
    return { rows: [] };
  });
  state.loadUnifiedWork.mockReset().mockResolvedValue({
    items: [schedule], sources: { project_tasks: { ran: true }, unified_tasks: { ran: true } },
  });
});

describe('task board runtime recovery', () => {
  it('recognizes the real Drizzle-wrapped missing-table error and retains readable work as partial', async () => {
    driverFailure = Object.assign(new Error('synthetic missing relation'), { code: '42P01' });
    // Record the actual driver boundary, rather than manufacturing a wrapper.
    const result = await request(app()).get('/api/task-management/board');
    await database.select().from((await import('../../../shared/schema')).unifiedTasks).catch(error => { observedFailure = error; });
    expect(observedFailure?.code).toBeUndefined();
    expect(observedFailure?.cause?.code).toBe('42P01');
    expect(result.status).toBe(200);
    expect(result.body.meta).toEqual({ partial: true, unreadSources: ['unified_tasks'] });
    expect(result.body.data).toEqual([expect.objectContaining({ taskId: 'schedule:41', title: schedule.title, readOnly: true })]);
    expect(state.loadUnifiedWork.mock.calls[0]?.[0]).toEqual({ organizationId: 7, includeCompleted: true });
    expect(state.loadUnifiedWork.mock.calls[0]?.[1] === database).toBe(true);
  });

  it.each(['42501', '57014', '42703', 'ECONNREFUSED'])('does not turn %s into missing-store recovery', async code => {
    driverFailure = Object.assign(new Error('synthetic non-missing-store failure'), { code });
    const result = await request(app()).get('/api/task-management/board');
    expect(result.status).toBe(500);
    expect(result.body).toEqual({ success: false, error: 'Failed to build task board' });
    expect(state.loadUnifiedWork).not.toHaveBeenCalled();
  });

  it('passes the same request database to the cross-store reader on a successful read', async () => {
    const result = await request(app()).get('/api/task-management/board');
    expect(result.status).toBe(200);
    expect(result.body.meta).toEqual({ partial: false, unreadSources: [] });
    expect(state.loadUnifiedWork.mock.calls[0]?.[0]).toEqual({ organizationId: 7, includeCompleted: true });
    expect(state.loadUnifiedWork.mock.calls[0]?.[1] === database).toBe(true);
  });
});
