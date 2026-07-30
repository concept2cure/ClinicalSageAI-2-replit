/**
 * Part 11 contract test — c2c/documents evidence delete audits ATOMICALLY.
 *
 * The DELETE /:id/sections/:key/evidence/:evId handler once deleted the regulated
 * evidence and THEN fired a non-awaited writeMutation with a swallowed error, then
 * later audited-first-but-in-a-separate-transaction. It now runs the governed
 * audit and the DELETE in ONE transaction (writeMutation with the caller's
 * client), so a failure of either rolls back both — the ledger never records a
 * deletion that didn't happen, and evidence is never deleted without its audit
 * (§11.10(e)).
 *
 * Mocks the data layer + the governed-action writer, so it runs without a DB.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.hoisted(() => {
  process.env.NODE_ENV = process.env.NODE_ENV || 'test';
});

import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import request from 'supertest';

const { order, poolQuery, clientQuery, writeMutationMock, state } = vi.hoisted(() => ({
  order: [] as string[],
  poolQuery: vi.fn(),
  clientQuery: vi.fn(),
  writeMutationMock: vi.fn(),
  state: { writeShouldThrow: false, evidenceFound: true },
}));

vi.mock('../../db', () => ({
  pool: {
    query: poolQuery,
    connect: vi.fn(async () => ({ query: clientQuery, release: vi.fn() })),
  },
}));
vi.mock('../../routes/c2c/actions', () => ({ writeMutation: writeMutationMock }));

let app: express.Express;

beforeEach(async () => {
  vi.clearAllMocks();
  order.length = 0;
  state.writeShouldThrow = false;
  state.evidenceFound = true;

  // Ownership check runs on the pool (no transaction needed for a read).
  poolQuery.mockImplementation(async (sql: string) => {
    if (/SELECT\s+ev\.id/i.test(sql)) {
      return { rows: state.evidenceFound ? [{ id: 'ev1' }] : [] };
    }
    return { rows: [] };
  });

  // The transaction (BEGIN/COMMIT/ROLLBACK) and the DELETE run on the client.
  clientQuery.mockImplementation(async (sql: string) => {
    if (/^\s*BEGIN/i.test(sql)) { order.push('begin'); return { rows: [] }; }
    if (/^\s*COMMIT/i.test(sql)) { order.push('commit'); return { rows: [] }; }
    if (/^\s*ROLLBACK/i.test(sql)) { order.push('rollback'); return { rows: [] }; }
    if (/DELETE\s+FROM\s+c2c_document_section_evidence/i.test(sql)) {
      order.push('delete');
      return { rows: [], rowCount: 1 };
    }
    return { rows: [] };
  });

  writeMutationMock.mockImplementation(async () => {
    order.push('audit');
    if (state.writeShouldThrow) throw new Error('governed write failed');
    return { actionId: 'a1', auditId: 'aud1', sha256Chain: '', state: 'resolved' };
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

const del = () =>
  request(app).delete('/api/c2c/documents/10/sections/m2/evidence/ev1');

describe('Part 11 — c2c evidence delete audit ordering', () => {
  it('audits and deletes atomically in one transaction (audit before delete, then commit)', async () => {
    const res = await del();
    expect(res.status).toBe(204);
    // One transaction: audit written, then the delete, then commit.
    expect(order).toEqual(['begin', 'audit', 'delete', 'commit']);
  });

  it('fails closed — an audit-write failure rolls back the transaction; nothing is deleted', async () => {
    state.writeShouldThrow = true;
    const res = await del();
    expect(res.status).toBe(500);
    // audit attempted, transaction rolled back, delete never reached, no commit.
    expect(order).toEqual(['begin', 'audit', 'rollback']);
    expect(order).not.toContain('delete');
    expect(order).not.toContain('commit');
  });

  it('404 on unowned evidence opens no transaction and performs neither audit nor delete', async () => {
    state.evidenceFound = false;
    const res = await del();
    expect(res.status).toBe(404);
    expect(order).toEqual([]);
  });
});
