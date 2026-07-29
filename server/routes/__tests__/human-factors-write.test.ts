/**
 * POST /api/human-factors/scenarios — HFE/UE use-scenario write contract.
 *
 * The v2 HumanFactors surface's "Add use scenario" form POSTs here once its
 * read has adopted the store (LIVE). Locks: 403 without org, 409 NO_FILE when
 * the org has no file to attach to, 400 on a missing task, a persisted create
 * that resolves + attaches the org's file id and returns the display shape, and
 * 42P01 → 503 PENDING_STORE fail-closed.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

const query = vi.fn();
vi.mock('../../db', () => ({ pool: { query: (...a: unknown[]) => query(...a) } }));
vi.mock('../../middleware/auth', () => ({
  requireRole: () => (_req: Request, _res: Response, next: NextFunction) => next(),
}));

import hfRouter from '../human-factors';

function appWith(org: number | null) {
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (org !== null) (req as unknown as { user: unknown }).user = { organizationId: org };
    next();
  });
  app.use('/api/human-factors', hfRouter);
  return app;
}

beforeEach(() => query.mockReset());

describe('POST /api/human-factors/scenarios', () => {
  it('403 without org context', async () => {
    const res = await request(appWith(null))
      .post('/api/human-factors/scenarios')
      .send({ task: 'Result interpretation' });
    expect(res.status).toBe(403);
    expect(query).not.toHaveBeenCalled();
  });

  it('409 NO_FILE when the org has no HFE/UE file', async () => {
    query.mockResolvedValueOnce({ rows: [] }); // file lookup: none
    const res = await request(appWith(7))
      .post('/api/human-factors/scenarios')
      .send({ task: 'Result interpretation' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('NO_FILE');
    // Only the file lookup ran — no INSERT attempted.
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('400 when task is missing', async () => {
    const res = await request(appWith(7))
      .post('/api/human-factors/scenarios')
      .send({ useError: 'Misread', potentialHarmSeverity: 'critical' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_BODY');
    // Validation fails before any DB access.
    expect(query).not.toHaveBeenCalled();
  });

  it('inserts org-scoped against the resolved file id and returns the created shape', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 'hf-bx204' }] }); // file lookup
    query.mockResolvedValueOnce({
      rows: [{ task: 'Result interpretation', useError: 'Misread borderline', potentialHarmSeverity: 'critical', mitigated: false }],
    }); // insert RETURNING
    const res = await request(appWith(7))
      .post('/api/human-factors/scenarios')
      .send({ task: 'Result interpretation', useError: 'Misread borderline', potentialHarmSeverity: 'critical', mitigated: false });

    expect(res.status).toBe(201);
    expect(res.body.meta.created).toBe(true);
    expect(res.body.data).toEqual({
      task: 'Result interpretation',
      useError: 'Misread borderline',
      potentialHarmSeverity: 'critical',
      mitigated: false,
    });

    // File lookup was org-scoped.
    expect(query.mock.calls[0][1]).toEqual([7]);
    // INSERT params: [id, orgId, fileId, task, useError, severity, mitigated]
    const insertParams = query.mock.calls[1][1] as unknown[];
    expect(insertParams[1]).toBe(7); // org scoping
    expect(insertParams[2]).toBe('hf-bx204'); // resolved file id
    expect(insertParams[3]).toBe('Result interpretation');
    expect(String(insertParams[0])).toMatch(/^hfs-/); // generated id
    // The INSERT itself is org-scoped in its column list.
    expect(String(query.mock.calls[1][0])).toContain('c2c_hf_scenarios');
  });

  it('defaults severity to minor and mitigated to false', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 'hf-1' }] });
    query.mockResolvedValueOnce({
      rows: [{ task: 'Sample loading', useError: '', potentialHarmSeverity: 'minor', mitigated: false }],
    });
    const res = await request(appWith(7))
      .post('/api/human-factors/scenarios')
      .send({ task: 'Sample loading', potentialHarmSeverity: 'not-a-real-severity' });
    expect(res.status).toBe(201);
    const insertParams = query.mock.calls[1][1] as unknown[];
    expect(insertParams[5]).toBe('minor'); // invalid severity coerced to default
    expect(insertParams[6]).toBe(false); // mitigated default
  });

  it('42P01 → 503 PENDING_STORE', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 'hf-1' }] }); // file lookup ok
    query.mockRejectedValueOnce(Object.assign(new Error('relation missing'), { code: '42P01' }));
    const res = await request(appWith(7))
      .post('/api/human-factors/scenarios')
      .send({ task: 'Result interpretation' });
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('PENDING_STORE');
  });
});
