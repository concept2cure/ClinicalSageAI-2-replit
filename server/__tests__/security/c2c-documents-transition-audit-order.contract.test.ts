/**
 * Part 11 contract test — c2c/documents section transition audits in-transaction.
 *
 * PATCH /:id/sections/:key changed a section's status inside a DB transaction,
 * COMMITted, and THEN fired a non-awaited writeMutation with a swallowed error —
 * a crash (or audit failure) left the transition unaudited (§11.10(e)). The
 * audit now runs via recordGovernedAction INSIDE the same transaction, before
 * COMMIT, so the section change and the audit commit or roll back together.
 *
 * Mocks the data layer + governed-action writer, so it runs without a DB.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.hoisted(() => {
  process.env.NODE_ENV = process.env.NODE_ENV || 'test';
});

import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import request from 'supertest';

const { order, poolQuery, clientQuery, recordGovernedActionMock, state } = vi.hoisted(() => ({
  order: [] as string[],
  poolQuery: vi.fn(),
  clientQuery: vi.fn(),
  recordGovernedActionMock: vi.fn(),
  state: { auditShouldThrow: false },
}));

vi.mock('../../db', () => ({
  pool: {
    query: poolQuery,
    connect: vi.fn(async () => ({ query: clientQuery, release: vi.fn() })),
  },
}));
vi.mock('../../routes/c2c/actions', () => ({
  writeMutation: vi.fn(),
  recordGovernedAction: recordGovernedActionMock,
}));

let app: express.Express;

beforeEach(async () => {
  vi.clearAllMocks();
  order.length = 0;
  state.auditShouldThrow = false;

  // Non-transaction doc-membership check.
  poolQuery.mockImplementation(async () => ({ rows: [{ ok: 1 }] }));

  clientQuery.mockImplementation(async (sql: string) => {
    if (/^\s*BEGIN/i.test(sql) || /SET\s+LOCAL/i.test(sql)) return { rows: [] };
    if (/SELECT\s+id\s+FROM\s+c2c_document_sections/i.test(sql)) return { rows: [{ id: 5 }] }; // exists → UPDATE
    if (/UPDATE\s+c2c_document_sections/i.test(sql)) {
      order.push('update');
      return { rows: [{ id: 5, section_key: 'm2', status: 'review' }] };
    }
    if (/^\s*COMMIT/i.test(sql)) { order.push('commit'); return { rows: [] }; }
    if (/^\s*ROLLBACK/i.test(sql)) { order.push('rollback'); return { rows: [] }; }
    return { rows: [] };
  });

  recordGovernedActionMock.mockImplementation(async () => {
    order.push('audit');
    if (state.auditShouldThrow) throw new Error('governed write failed');
    return { actionId: 'a1', auditId: 'aud1', sha256Chain: '' };
  });

  const router = (await import('../../routes/c2c/documents')).default;
  app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    (req as any).user = { id: 1, organizationId: 7 };
    next();
  });
  app.use('/api/c2c/documents', router);
});

const patch = () =>
  request(app)
    .patch('/api/c2c/documents/10/sections/m2')
    .send({ status: 'review', reason: 'moving to review' });

describe('Part 11 — c2c section transition audit ordering', () => {
  it('audits in-transaction, after the update and before COMMIT', async () => {
    const res = await patch();
    expect(res.status).toBe(200);
    expect(order).toEqual(['update', 'audit', 'commit']);
  });

  it('fails closed — an audit failure rolls back the transition (no COMMIT)', async () => {
    state.auditShouldThrow = true;
    const res = await patch();
    expect(res.status).toBe(500);
    expect(order).toEqual(['update', 'audit', 'rollback']);
    expect(order).not.toContain('commit');
  });
});
