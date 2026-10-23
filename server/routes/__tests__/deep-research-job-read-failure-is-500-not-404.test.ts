/**
 * GET /api/deep-research/jobs/:id answers 404 only for a job that is not
 * found, and a failed read as 500 with a static message.
 *
 * What it used to do (until 2026-10-22): every error, a lost database
 * connection included, was a 404 whose body was String(err): "Error: Job 4242
 * not found" for a missing job, and the driver's own text (host, relation
 * names) for an outage, which the caller read as "no such job". A malformed id
 * reached the statement as NaN and came back the same way.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';

const { query, pass } = vi.hoisted(() => ({
  query: vi.fn(),
  pass: (_q: unknown, _s: unknown, n: () => void) => n(),
}));

vi.mock('../../middleware/auth.js', () => ({ authenticateToken: pass }));
vi.mock('../../services/license-manager.js', () => ({ loadLicense: () => pass, requireTier: () => pass }));
vi.mock('../../db.js', () => ({ pool: { query: (...a: unknown[]) => query(...a) } }));

import router from '../deep-research';

function app() {
  const a = express();
  a.use(express.json());
  a.use((req: Request, _res: Response, next: NextFunction) => {
    (req as any).user = { organizationId: 7, id: 1 };
    next();
  });
  a.use('/api/deep-research', router);
  return a;
}

const DB_TEXT = /ECONNREFUSED|10\.0\.0\.12|deep_research_jobs|Error:/;

beforeEach(() => {
  query.mockReset();
});

describe('GET /api/deep-research/jobs/:id', () => {
  it('a failed read is 500 with a static message, not 404 carrying its text', async () => {
    // Only the job read fails; any other statement the modules run answers empty.
    query.mockImplementation(async (sql: string) => {
      if (/FROM deep_research_jobs WHERE id = \$1/.test(sql)) throw new Error('connect ECONNREFUSED 10.0.0.12:5432 (deep_research_jobs)');
      return { rows: [] };
    });
    const r = await request(app()).get('/api/deep-research/jobs/4242');
    expect(r.status, 'a database failure was answered as "job not found"').toBe(500);
    expect(JSON.stringify(r.body)).not.toMatch(DB_TEXT);
  });

  it('a job that is not found is 404, with a fixed message', async () => {
    query.mockResolvedValue({ rows: [] });
    const r = await request(app()).get('/api/deep-research/jobs/4242');
    expect(r.status).toBe(404);
    expect(JSON.stringify(r.body)).not.toMatch(/Error:/);
  });

  it('a malformed id is refused before any read', async () => {
    const r = await request(app()).get('/api/deep-research/jobs/abc');
    expect(r.status).toBe(400);
    expect(query).not.toHaveBeenCalled();
  });
});
