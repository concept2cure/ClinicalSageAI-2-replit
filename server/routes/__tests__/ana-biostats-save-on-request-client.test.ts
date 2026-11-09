/**
 * The workbench's save to authoring runs on the request's pinned, tenant-scoped
 * connection, not the shared pool (ci:requestdb-coverage, 2026-11-09).
 *
 * Until then POST /api/ana-biostats/document with action save_to_authoring
 * handed the writer `pool` from ../db, a fresh shared-pool connection scoped
 * only by ambient async context. It now hands it requestConnectable(req), as
 * mdx-qms's authoring context does: every query, and the client the writer
 * connects for its transaction, is the request's own. With no request client
 * it refuses, and never falls back to the shared pool.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';
import { MissingRequestDbContextError } from '../../db/requestDb';

const h = vi.hoisted(() => ({
  dbClient: null as null | { query: (...a: unknown[]) => Promise<{ rows: unknown[] }> },
  seen: [] as unknown[],
  writerError: null as unknown,
}));

vi.mock('../../middleware/auth', () => ({
  authenticateToken: (req: Request, _res: Response, next: NextFunction) => {
    (req as any).user = { id: 1, organizationId: 1, email: 'a@example.test', role: 'member' };
    if (h.dbClient) (req as any).dbClient = h.dbClient;
    next();
  },
}));

vi.mock('../../services/ana-biostats/statistical-document-save', () => ({
  saveStatisticalDocumentToAuthoring: vi.fn(async (ctx: { pool: { query: Function; connect: Function } }) => {
    try {
      await ctx.pool.query('SELECT 1');
      const client = await ctx.pool.connect();
      await client.query('SELECT 2');
      client.release();
    } catch (error) {
      h.writerError = error;
      throw error;
    }
    return { kind: 'refused', status: 409, error: 'stopped by the test', code: 'TEST_STOP' };
  }),
}));

import router from '../ana-biostats';

const INPUT = {
  clientTrack: 'biotech_pharma', studyType: 'superiority', objectiveType: 'efficacy', endpointType: 'continuous',
  alpha: 0.05, powerTarget: 0.8, effectSize: 0.5, attritionRate: 0.1, allocationRatio: 1, numberOfGroups: 2,
};

function app() {
  const a = express();
  a.use(express.json({ limit: '4mb' }));
  a.use('/api/ana-biostats', router);
  return a;
}
const save = () => request(app()).post('/api/ana-biostats/document')
  .send({ documentType: 'sample_size_rationale', input: INPUT, action: 'save_to_authoring' });

beforeEach(() => { h.seen = []; h.writerError = null; h.dbClient = null; });

describe('the workbench save to authoring', () => {
  it('runs every query, and its transaction client, on the request own connection', async () => {
    h.dbClient = { query: vi.fn(async (sql: unknown) => { h.seen.push(sql); return { rows: [] }; }) };
    const res = await save();
    expect(res.status).toBe(409);
    expect(h.writerError).toBeNull();
    expect(h.seen).toEqual(['SELECT 1', 'SELECT 2']);
  });

  it('refuses with no request connection, and never reaches for the shared pool', async () => {
    await save();
    expect(h.writerError).toBeInstanceOf(MissingRequestDbContextError);
    expect(h.seen).toEqual([]);
  });
});
