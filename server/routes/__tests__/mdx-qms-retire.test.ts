/**
 * POST /api/mdx/qms/documents/:id/retire — the gate and the reason.
 *
 * 2026-09-24 Part 11 lens, Q2: retire had no role gate and took the reason as
 * optional. Shown failing first: on the head before 6582e3a3 a viewer's request
 * reached the UPDATE, and an editor's request with no reason retired the
 * document with `reason: null` in its audit row.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

const query = vi.fn();
vi.mock('../../db', () => ({
  pool: { query: (...a: unknown[]) => query(...a) },
  getPool: () => ({ query: (...a: unknown[]) => query(...a) }),
}));
const recordAuditRow = vi.fn(async () => ({ persisted: true, chained: true }));
vi.mock('../../services/audit/audit-write-outcome', () => ({ recordAuditRow: (...a: unknown[]) => recordAuditRow(...a) }));

import mdxQmsRouter from '../mdx-qms';

function appAs(role: string) {
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    (req as unknown as { user: unknown }).user = { id: 42, organizationId: 7, role };
    (req as unknown as { userRole: string }).userRole = role;
    (req as unknown as { tenantId: number }).tenantId = 7;
    next();
  });
  app.use('/api/mdx', mdxQmsRouter);
  return app;
}
const retire = (role: string, body: Record<string, unknown>) =>
  request(appAs(role)).post('/api/mdx/qms/documents/5/retire').send(body);

beforeEach(() => { query.mockReset(); recordAuditRow.mockReset(); });

describe('POST /qms/documents/:id/retire', () => {
  it('refuses a viewer before touching the database (403)', async () => {
    const res = await retire('viewer', { reason: 'Superseded by SOP-901 rev 4.' });
    expect(res.status).toBe(403);
    expect(query).not.toHaveBeenCalled();
  });

  it('refuses an editor whose request carries no reason, before anything is written (422)', async () => {
    const res = await retire('member', {});
    expect(res.status).toBe(422);
    expect(JSON.stringify(res.body)).toMatch(/at least 8 characters/);
    expect(query).not.toHaveBeenCalled();
    expect(recordAuditRow).not.toHaveBeenCalled();
  });

  it('refuses a reason shorter than the floor the same way', async () => {
    const res = await retire('member', { reason: 'old' });
    expect(res.status).toBe(422);
    expect(query).not.toHaveBeenCalled();
  });

  it('retires for an editor with a reason, recording that reason and no other', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 5, doc_number: 'SOP-900', status: 'retired' }] });
    const res = await retire('member', { reason: 'Superseded by SOP-901 rev 4.' });
    expect(res.status).toBe(200);
    expect(query).toHaveBeenCalledTimes(1);
    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/SET status = 'retired'/);
    expect(params).toEqual([5, 7, 'Superseded by SOP-901 rev 4.', 42]);
    expect(recordAuditRow).toHaveBeenCalledWith(expect.objectContaining({
      action: 'mdx.qms.document.retire',
      details: { reason: 'Superseded by SOP-901 rev 4.' },
    }));
  });
});
