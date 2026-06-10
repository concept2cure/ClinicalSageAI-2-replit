/**
 * Part 11 contract test — IND application delete is audited in-transaction.
 *
 * DELETE /applications/:id hard-deleted a regulated IND/FDA submission record
 * (ind_applications) with no audit at all (§11.10(e) gap). It now deletes and
 * writes an audit_events row in the SAME transaction (atomic, fail-closed) — an
 * audit failure rolls the delete back, so the record is never removed
 * unaudited. Mocks the data layer; runs without a DB.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.hoisted(() => {
  process.env.NODE_ENV = process.env.NODE_ENV || 'test';
});

import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import request from 'supertest';

const { order, queryMock, clientQuery, state } = vi.hoisted(() => ({
  order: [] as string[],
  queryMock: vi.fn(),
  clientQuery: vi.fn(),
  state: { auditShouldThrow: false },
}));

vi.mock('../../db', () => ({
  query: queryMock,
  // Faithful to runtime.ts transaction(): runs the callback, rethrows on error
  // (the real one ROLLBACKs + rethrows).
  transaction: async (cb: (c: any) => Promise<any>) => cb({ query: clientQuery }),
}));
vi.mock('../../services/indCopilot.js', () => ({ default: {} }));

let app: express.Express;

beforeEach(async () => {
  vi.clearAllMocks();
  order.length = 0;
  state.auditShouldThrow = false;

  queryMock.mockImplementation(async (sql: string) => {
    if (/SELECT id, status, organization_id FROM ind_applications/i.test(sql)) {
      return { rows: [{ id: 42, status: 'draft', organization_id: 7 }] };
    }
    return { rows: [] };
  });

  clientQuery.mockImplementation(async (sql: string) => {
    if (/DELETE\s+FROM\s+ind_applications/i.test(sql)) {
      order.push('delete');
      return { rows: [{ id: 42 }] };
    }
    if (/INSERT\s+INTO\s+audit_events/i.test(sql)) {
      order.push('audit');
      if (state.auditShouldThrow) throw new Error('audit_events insert failed');
      return { rows: [] };
    }
    return { rows: [] };
  });

  const router = (await import('../../routes/ind')).default;
  app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    (req as any).user = { id: 1, name: 'Author', role: 'regulatory-author' };
    next();
  });
  app.use('/api/ind', router);
});

const del = () => request(app).delete('/api/ind/applications/42');

describe('Part 11 — IND application delete audit', () => {
  it('deletes and audits in one transaction', async () => {
    const res = await del();
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, deleted: 42 });
    expect(order).toEqual(['delete', 'audit']);
  });

  it('fails closed — an audit-events failure rolls the delete back (500)', async () => {
    state.auditShouldThrow = true;
    const res = await del();
    expect(res.status).toBe(500);
    expect(order).toEqual(['delete', 'audit']); // audit attempted; transaction rethrows → rollback
    expect(res.body?.success).not.toBe(true);
  });

  it('refuses to delete a non-draft application (no transaction, no audit)', async () => {
    queryMock.mockImplementation(async () => ({
      rows: [{ id: 42, status: 'submitted', organization_id: 7 }],
    }));
    const res = await del();
    expect(res.status).toBe(409);
    expect(order).toEqual([]);
  });
});
