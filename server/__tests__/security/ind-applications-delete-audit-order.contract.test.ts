/**
 * Part 11 contract test — IND application delete audits before deleting.
 *
 * `ind_applications` is a regulated FDA submission record. The DELETE handler
 * previously hard-deleted it with NO audit trail (§11.10(e) gap). It now opens a
 * transaction, writes a hash-chained audit row WITH a full pre-image snapshot
 * (logRegulatedDeletion), and only then deletes — all atomically. An audit-write
 * failure rolls back the delete (fail-closed).
 *
 * Mocks the DB pool + the regulated-deletion writer, so it runs without a DB.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.hoisted(() => {
  process.env.NODE_ENV = process.env.NODE_ENV || 'test';
});

import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import request from 'supertest';

const { order, clientQuery, releaseMock, logDeletionMock, state } = vi.hoisted(() => ({
  order: [] as string[],
  clientQuery: vi.fn(),
  releaseMock: vi.fn(),
  logDeletionMock: vi.fn(),
  state: {
    auditShouldThrow: false,
    row: null as null | Record<string, unknown>,
  },
}));

const mockClient = { query: clientQuery, release: releaseMock };

vi.mock('../../db', () => ({
  getPool: () => ({ connect: async () => mockClient }),
  query: vi.fn(),
}));
vi.mock('../../services/audit/regulatedDeletion', () => ({
  logRegulatedDeletion: logDeletionMock,
}));
vi.mock('../../services/indCopilot.js', () => ({ default: {} }));

let app: express.Express;

beforeEach(async () => {
  vi.clearAllMocks();
  order.length = 0;
  state.auditShouldThrow = false;
  state.row = { id: 1, status: 'draft', organization_id: 7 };

  clientQuery.mockImplementation(async (sql: string) => {
    if (/^\s*BEGIN/i.test(sql)) return { rows: [] };
    if (/^\s*COMMIT/i.test(sql)) {
      order.push('commit');
      return { rows: [] };
    }
    if (/^\s*ROLLBACK/i.test(sql)) {
      order.push('rollback');
      return { rows: [] };
    }
    if (/SELECT\s+\*\s+FROM\s+ind_applications/i.test(sql)) {
      return { rows: state.row ? [state.row] : [] };
    }
    if (/DELETE\s+FROM\s+ind_applications/i.test(sql)) {
      order.push('delete');
      return { rows: [{ id: 1 }] };
    }
    return { rows: [] };
  });

  logDeletionMock.mockImplementation(async () => {
    order.push('audit');
    if (state.auditShouldThrow) throw new Error('governed audit write failed');
    return { auditId: 'aud1', sha256Chain: 'chain1' };
  });

  const router = (await import('../../routes/ind')).default;
  app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    (req as any).user = { id: 5, organizationId: 7 };
    next();
  });
  app.use('/api/ind', router);
});

const del = () => request(app).delete('/api/ind/applications/1');

describe('Part 11 — IND application delete audit ordering', () => {
  it('audits BEFORE deleting the regulated IND record (atomic, committed)', async () => {
    const res = await del();
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, deleted: 1 });
    expect(order.indexOf('audit')).toBeGreaterThanOrEqual(0);
    expect(order.indexOf('audit')).toBeLessThan(order.indexOf('delete'));
    expect(order[order.length - 1]).toBe('commit');
  });

  it('fails closed — an audit-write failure rolls back and blocks the delete', async () => {
    state.auditShouldThrow = true;
    const res = await del();
    expect(res.status).toBe(500);
    expect(order).toContain('audit');
    expect(order).not.toContain('delete');
    expect(order).not.toContain('commit');
    expect(order).toContain('rollback');
  });

  it('404 on a missing record performs neither audit nor delete', async () => {
    state.row = null;
    const res = await del();
    expect(res.status).toBe(404);
    expect(order).not.toContain('audit');
    expect(order).not.toContain('delete');
    expect(order).toContain('rollback');
  });

  it('409 on a non-draft record performs neither audit nor delete', async () => {
    state.row = { id: 1, status: 'submitted', organization_id: 7 };
    const res = await del();
    expect(res.status).toBe(409);
    expect(order).not.toContain('audit');
    expect(order).not.toContain('delete');
    expect(order).toContain('rollback');
  });
});
