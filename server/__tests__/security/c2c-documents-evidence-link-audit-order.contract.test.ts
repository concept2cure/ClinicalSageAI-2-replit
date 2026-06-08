/**
 * Part 11 contract test — c2c/documents evidence link audits in-transaction.
 *
 * POST /:id/sections/:key/evidence INSERTed the evidence link and then fired a
 * non-awaited writeMutation with a swallowed error — a crash or audit failure
 * left the create unaudited (§11.10(e)). The insert and its audit
 * (recordGovernedAction) now run in one transaction, committing or rolling back
 * together. Mocks the data layer + governed-action writer; runs without a DB.
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

  // Section lookup (returns the section id).
  poolQuery.mockImplementation(async () => ({ rows: [{ section_id: 5 }] }));

  clientQuery.mockImplementation(async (sql: string) => {
    if (/^\s*BEGIN/i.test(sql)) return { rows: [] };
    if (/INSERT\s+INTO\s+c2c_document_section_evidence/i.test(sql)) {
      order.push('insert');
      return { rows: [{ id: 9, evidence_ref: 'ref1' }] };
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

const link = () =>
  request(app)
    .post('/api/c2c/documents/10/sections/m2/evidence')
    .send({ evidenceKind: 'artifact', evidenceRef: 'ref1', reason: 'evidence linked' });

describe('Part 11 — c2c evidence link audit ordering', () => {
  it('inserts and audits in one transaction, before COMMIT', async () => {
    const res = await link();
    expect(res.status).toBe(201);
    expect(order).toEqual(['insert', 'audit', 'commit']);
  });

  it('fails closed — an audit failure rolls back the insert (no COMMIT)', async () => {
    state.auditShouldThrow = true;
    const res = await link();
    expect(res.status).toBe(500);
    expect(order).toEqual(['insert', 'audit', 'rollback']);
    expect(order).not.toContain('commit');
  });
});
