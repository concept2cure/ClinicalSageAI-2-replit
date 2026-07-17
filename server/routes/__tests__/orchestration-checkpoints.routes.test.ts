/**
 * /api/orchestration/checkpoints — persisted approval-checkpoint read contract.
 *
 * The v2 Orchestration surface maps these rows onto its approvals panel
 * ({ id, stepName, gateType, status } gate the client-side adoption), so this
 * locks the `{ data, meta }` envelope + key set, the org scoping through the
 * owning workflow_runs row, and the 42P01 fail-closed empty envelope.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

const query = vi.fn();
vi.mock('../../db.js', () => ({ pool: { query: (...a: unknown[]) => query(...a) } }));

import checkpointsRouter from '../orchestration-checkpoints';

function appWith(org: number | null) {
  const app = express();
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (org !== null) (req as unknown as { organizationId: number }).organizationId = org;
    next();
  });
  app.use('/api/orchestration', checkpointsRouter);
  return app;
}

beforeEach(() => query.mockReset());

const KEYS = [
  'id', 'stepName', 'gateType', 'status', 'workflowRunId', 'runName', 'runStatus',
  'requiredApproverRoles', 'requiredApproverCount', 'approvals', 'protectedAction',
  'proposedAt', 'resolvedAt',
];

describe('GET /api/orchestration/checkpoints', () => {
  it('403 without org context', async () => {
    const res = await request(appWith(null)).get('/api/orchestration/checkpoints');
    expect(res.status).toBe(403);
    expect(query).not.toHaveBeenCalled();
  });

  it('returns { data, meta } rows shaped to the surface adoption contract, org-scoped', async () => {
    const row = Object.fromEntries(
      KEYS.map((k) => [
        k,
        k === 'requiredApproverRoles' ? ['regulatory_lead']
        : k === 'requiredApproverCount' ? 1
        : k === 'approvals' ? []
        : k === 'resolvedAt' ? null
        : 'x',
      ]),
    );
    query.mockResolvedValueOnce({ rows: [row] });
    const res = await request(appWith(7)).get('/api/orchestration/checkpoints');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.meta.count).toBe(1);
    for (const k of KEYS) expect(res.body.data[0]).toHaveProperty(k);
    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('approval_checkpoints');
    expect(sql).toContain('workflow_runs');
    expect(sql).toContain('organization_id');
    expect(params).toEqual([7, 50]);
  });

  it('clamps ?limit and passes it through', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    await request(appWith(7)).get('/api/orchestration/checkpoints?limit=9999');
    const [, params] = query.mock.calls[0] as [string, unknown[]];
    expect(params).toEqual([7, 200]);
  });

  it('fails closed to an empty envelope when the store is not provisioned (42P01)', async () => {
    query.mockRejectedValueOnce(Object.assign(new Error('relation missing'), { code: '42P01' }));
    const res = await request(appWith(7)).get('/api/orchestration/checkpoints');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(0);
    expect(res.body.meta.pendingStore).toBe(true);
  });

  it('500s (not 200-with-junk) on other db errors', async () => {
    query.mockRejectedValueOnce(new Error('boom'));
    const res = await request(appWith(7)).get('/api/orchestration/checkpoints');
    expect(res.status).toBe(500);
  });
});
