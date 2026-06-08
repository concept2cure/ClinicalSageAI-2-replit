/**
 * Part 11 contract test — eCTD document delete is a soft-delete, audited
 * in-transaction (server/routes/ectd-documents.ts).
 *
 * DELETE /:id previously HARD-deleted a regulated eCTD document
 * (coauthor_documents) with no audit (§11.10(e) gap). It now SOFT-deletes
 * (UPDATE deleted_at) and writes an audit_events row in the SAME transaction
 * (atomic, fail-closed) — an audit failure rolls the soft-delete back, so the
 * record is never removed unaudited. Mocks the data layer; runs without a DB.
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
  // Faithful to runtime.ts transaction(): runs the callback, ROLLBACK + rethrow on error.
  transaction: async (cb: (c: any) => Promise<any>) => cb({ query: clientQuery }),
}));
vi.mock('../../middleware/auth', () => ({
  requireRole: () => (_req: Request, _res: Response, next: NextFunction) => next(),
}));
vi.mock('../../middleware/rateLimiter', () => ({
  createRateLimiter: () => (_req: Request, _res: Response, next: NextFunction) => next(),
}));
vi.mock('../../services/ingestion/ingestion-service', () => ({
  classifyDocument: vi.fn(),
  extractStructure: vi.fn(),
  IngestionError: class extends Error {},
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

  const router = (await import('../../routes/ectd-documents')).default;
  app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    (req as any).user = { id: 1, organizationId: 7, name: 'Author', role: 'regulatory-author' };
    next();
  });
  app.use('/api/ectd-documents', router);
});

const del = () => request(app).delete('/api/ectd-documents/55');

describe('Part 11 — eCTD document delete audit', () => {
  it('soft-deletes and audits in one transaction (never a hard DELETE)', async () => {
    const res = await del();
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, deletedId: 55 });
    // The mutation is an UPDATE deleted_at, and the audit follows it in the txn.
    expect(order).toEqual(['soft-delete', 'audit']);
  });

  it('fails closed — an audit-events failure rolls the soft-delete back (500)', async () => {
    state.auditShouldThrow = true;
    const res = await del();
    expect(res.status).toBe(500);
    expect(order).toEqual(['soft-delete', 'audit']); // audit attempted; transaction rethrows → rollback
    expect(res.body?.success).not.toBe(true);
  });

  it('404 when the document is absent or already deleted (no transaction, no audit)', async () => {
    queryMock.mockImplementation(async () => ({ rows: [] }));
    const res = await del();
    expect(res.status).toBe(404);
    expect(order).toEqual([]);
  });
});
