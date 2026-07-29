/**
 * Part 11 contract test — c2c/documents evidence delete audits before deleting.
 *
 * The DELETE /:id/sections/:key/evidence/:evId handler previously deleted the
 * regulated evidence and THEN fired a non-awaited writeMutation with a swallowed
 * error — a crash in between, or an audit failure, left a deletion with no audit
 * trail (§11.10(e)). The handler now audits first and awaits it (fail-closed).
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

const { order, poolQuery, writeMutationMock, state } = vi.hoisted(() => ({
  order: [] as string[],
  poolQuery: vi.fn(),
  writeMutationMock: vi.fn(),
  state: { writeShouldThrow: false, evidenceFound: true },
}));

vi.mock('../../db', () => ({ pool: { query: poolQuery } }));
vi.mock('../../routes/c2c/actions', () => ({ writeMutation: writeMutationMock }));

let app: express.Express;

beforeEach(async () => {
  vi.clearAllMocks();
  order.length = 0;
  state.writeShouldThrow = false;
  state.evidenceFound = true;

  poolQuery.mockImplementation(async (sql: string) => {
    if (/DELETE\s+FROM\s+c2c_document_section_evidence/i.test(sql)) {
      order.push('delete');
      return { rows: [], rowCount: 1 };
    }
    if (/SELECT\s+ev\.id/i.test(sql)) {
      return { rows: state.evidenceFound ? [{ id: 'ev1' }] : [] };
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
  it('audits BEFORE deleting the regulated evidence', async () => {
    const res = await del();
    expect(res.status).toBe(204);
    expect(order).toEqual(['audit', 'delete']);
  });

  it('fails closed — an audit-write failure blocks the delete', async () => {
    state.writeShouldThrow = true;
    const res = await del();
    expect(res.status).toBe(500);
    expect(order).toEqual(['audit']); // audit attempted, delete never reached
    expect(order).not.toContain('delete');
  });

  it('404 on unowned evidence performs neither audit nor delete', async () => {
    state.evidenceFound = false;
    const res = await del();
    expect(res.status).toBe(404);
    expect(order).toEqual([]);
  });
});
