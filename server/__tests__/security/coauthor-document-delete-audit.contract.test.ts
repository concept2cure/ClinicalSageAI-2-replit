/**
 * Part 11 contract test — co-author document delete is a soft-delete, audited
 * in-transaction (server/routes/coauthor.ts).
 *
 * DELETE /documents/:id previously HARD-deleted a regulated eCTD document
 * (coauthor_documents) with no audit (§11.10(e) gap). It now SOFT-deletes
 * (UPDATE deleted_at) and writes an audit_events row in the SAME transaction
 * (atomic, fail-closed). Mocks the data layer; runs without a DB.
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
  db: {},
  query: queryMock,
  transaction: async (cb: (c: any) => Promise<any>) => cb({ query: clientQuery }),
}));
vi.mock('../../auth', () => ({
  authMiddleware: (_req: Request, _res: Response, next: NextFunction) => next(),
}));

let app: express.Express;

beforeEach(async () => {
  vi.clearAllMocks();
  order.length = 0;
  state.auditShouldThrow = false;

  queryMock.mockImplementation(async (sql: string) => {
    if (/SELECT id, status, organization_id FROM coauthor_documents/i.test(sql)) {
      return { rows: [{ id: 55, status: 'draft', organization_id: 7 }] };
    }
    return { rows: [] };
  });

  clientQuery.mockImplementation(async (sql: string) => {
    if (/UPDATE\s+coauthor_documents\s+SET\s+deleted_at/i.test(sql)) {
      order.push('soft-delete');
      return { rows: [{ id: 55 }] };
    }
    if (/INSERT\s+INTO\s+audit_events/i.test(sql)) {
      order.push('audit');
      if (state.auditShouldThrow) throw new Error('audit_events insert failed');
      return { rows: [] };
    }
    return { rows: [] };
  });

  const router = (await import('../../routes/coauthor')).default;
  app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    (req as any).user = { id: 1, organizationId: 7, name: 'Author', role: 'regulatory-author' };
    next();
  });
  app.use('/api/coauthor', router);
});

const del = () => request(app).delete('/api/coauthor/documents/55');

describe('Part 11 — co-author document delete audit', () => {
  it('soft-deletes and audits in one transaction (never a hard DELETE)', async () => {
    const res = await del();
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, deletedId: 55 });
    expect(order).toEqual(['soft-delete', 'audit']);
  });

  it('fails closed — an audit-events failure rolls the soft-delete back (500)', async () => {
    state.auditShouldThrow = true;
    const res = await del();
    expect(res.status).toBe(500);
    expect(order).toEqual(['soft-delete', 'audit']);
    expect(res.body?.success).not.toBe(true);
  });

  it('404 when the document is absent or already deleted (no transaction, no audit)', async () => {
    queryMock.mockImplementation(async () => ({ rows: [] }));
    const res = await del();
    expect(res.status).toBe(404);
    expect(order).toEqual([]);
  });
});
