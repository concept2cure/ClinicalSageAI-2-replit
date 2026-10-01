/**
 * GET /api/workspace/summary states nothing about the caller's workspace that
 * no query established.
 *
 * It returned a compliance score of 98 / 95 / 89 / 72 chosen by how many
 * reviews were pending — a regulatory claim nothing evaluated — and, when the
 * org row was missing, the org "Concept2Cure" / industry "biotech": this
 * platform's own name, presented as the caller's organization.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

const dbQuery = vi.fn();
vi.mock('../../db', () => ({ query: (...a: unknown[]) => dbQuery(...a) }));

import router from '../workspace-summary';

function app() {
  const a = express();
  a.use((req: Request, _res: Response, next: NextFunction) => {
    (req as unknown as Record<string, unknown>).organizationId = '7';
    (req as unknown as Record<string, unknown>).userId = '12';
    next();
  });
  a.use('/api', router);
  return a;
}

beforeEach(() => dbQuery.mockReset());

describe('GET /api/workspace/summary', () => {
  it('404s when the caller’s org row is missing — it never answers as "Concept2Cure"', async () => {
    dbQuery.mockResolvedValue({ rows: [] });
    const res = await request(app()).get('/api/workspace/summary');
    expect(res.status).toBe(404);
    expect(JSON.stringify(res.body)).not.toMatch(/Concept2Cure|biotech/);
  });

  it('states no compliance score, whatever the review counts', async () => {
    dbQuery.mockImplementation(async (sql: string) =>
      /FROM organizations/.test(sql)
        ? { rows: [{ id: 7, name: 'Real Org', slug: 'real', industry_mode: 'device' }] }
        : { rows: [] },
    );
    const res = await request(app()).get('/api/workspace/summary');
    expect(res.status).toBe(200);
    expect(res.body.data.org.name).toBe('Real Org');
    expect(res.body.data.counts.complianceScore).toBeNull();
    expect(JSON.stringify(res.body)).not.toMatch(/AI trained on/);
  });
});
