/**
 * GET /api/evidence-objects — PDEV Evidence Picker search-list contract.
 *
 * The picker (client/src/concept2cure/pdev/surfaces/EvidencePicker.tsx) parses
 * `{ data: EvidenceObjectRow[] }` and renders each row's { id, title, type,
 * category, source }. This locks the envelope + display keys, the org scoping,
 * the ILIKE search path, and the 42P01 fail-closed-to-empty behaviour (so the
 * picker degrades to its empty-state, never a crash).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

const query = vi.fn();
vi.mock('../../db', () => ({ pool: { query: (...a: unknown[]) => query(...a) } }));

import evidenceObjectsRouter from '../evidence-objects.routes';

function appWith(org: number | null) {
  const app = express();
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (org !== null) (req as unknown as { organizationId: number }).organizationId = org;
    next();
  });
  app.use('/api/evidence-objects', evidenceObjectsRouter);
  return app;
}

beforeEach(() => query.mockReset());

const KEYS = ['id', 'title', 'type', 'category', 'source'];

describe('GET /api/evidence-objects', () => {
  it('403 without org context', async () => {
    const res = await request(appWith(null)).get('/api/evidence-objects');
    expect(res.status).toBe(403);
  });

  it('returns { data } rows shaped to the picker display contract, org-scoped', async () => {
    const row = Object.fromEntries(KEYS.map((k) => [k, 'x']));
    query.mockResolvedValueOnce({ rows: [row] });
    const res = await request(appWith(7)).get('/api/evidence-objects?programId=abc');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    for (const k of KEYS) expect(res.body.data[0]).toHaveProperty(k);
    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('c2c_evidence_objects');
    expect(sql).toContain('organization_id = $1');
    // programId is accepted but never a row filter — only the org param binds.
    expect(params).toEqual([7]);
  });

  it('narrows via ILIKE on q while staying org-scoped', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    const res = await request(appWith(7)).get('/api/evidence-objects?programId=abc&q=tox');
    expect(res.status).toBe(200);
    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('ILIKE');
    expect(params).toEqual([7, '%tox%']);
  });

  it('fails closed to an empty envelope when the store is not provisioned', async () => {
    query.mockRejectedValueOnce(Object.assign(new Error('relation missing'), { code: '42P01' }));
    const res = await request(appWith(7)).get('/api/evidence-objects');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(0);
  });
});
