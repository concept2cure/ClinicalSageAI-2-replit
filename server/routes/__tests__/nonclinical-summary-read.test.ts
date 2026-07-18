/**
 * GET /api/nonclinical-summary — live M2.6 / Module 4 / SEND projection of the
 * governed nonclinical registry.
 *
 * Locks: 403 without org; the { data: { m26, m4, send, completeness, gaps,
 * provisioned } } envelope; a live projection over governed rows; the honest
 * all-missing skeleton when the org has no studies; and fail-closed to that
 * skeleton (never 500, never fabricated) when the store errors — with
 * meta.pendingStore on a missing table (42P01).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

const query = vi.fn();
const insert = vi.fn();
vi.mock('../../db', () => ({ pool: { query: (...a: unknown[]) => query(...a) } }));
// The POST route persists via requestDb(req) (request-scoped drizzle). Mock it to
// the same recorder so we assert the org-scoped insert without a real connection.
vi.mock('../../db/requestDb', () => ({ requestDb: () => ({ insert: (...a: unknown[]) => insert(...a) }) }));

import ncRouter from '../nonclinical-summary.routes';

function appWith(org: number | null) {
  const app = express();
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (org !== null) (req as unknown as { user: unknown }).user = { organizationId: org };
    next();
  });
  app.use('/api/nonclinical-summary', ncRouter);
  return app;
}

/** A governed row in the raw SQL shape `listStudiesForSummary` returns. */
function row(over: Record<string, unknown> = {}) {
  return {
    study_number: 'TX-701',
    study_type: 'repeat_dose_tox',
    species: 'Rat',
    glp_compliant: true,
    noael: '100 mg/kg/day',
    duration_label: '26-week',
    key_finding: 'Minimal hepatocellular hypertrophy (adaptive)',
    status: 'finalized',
    domains_present: ['TS', 'DM', 'EX', 'BW', 'CL', 'LB', 'OM', 'MA', 'MI', 'FW'],
    define_xml_present: true,
    nsdrc_present: true,
    validation_status: 'passed',
    validator_error_count: 0,
    ...over,
  };
}

beforeEach(() => {
  query.mockReset();
  insert.mockReset();
});

describe('GET /api/nonclinical-summary', () => {
  it('403 without org context', async () => {
    const res = await request(appWith(null)).get('/api/nonclinical-summary');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('ORG_REQUIRED');
  });

  it('projects the governed registry live (M2.6 / M4 / SEND)', async () => {
    query.mockResolvedValueOnce({
      rows: [row(), row({ study_number: 'PK-301', study_type: 'adme_pk', status: 'in_reporting', validation_status: null, domains_present: null })],
    });
    const res = await request(appWith(7)).get('/api/nonclinical-summary');
    expect(res.status).toBe(200);
    expect(query.mock.calls[0][1]).toEqual([7]);

    const { data } = res.body;
    expect(data.provisioned).toBe(true);
    // M2.6: tox + PK present → those subsections complete.
    expect(data.m26).toHaveLength(7);
    expect(data.m26.find((s: { n: string }) => s.n === '2.6.6').st).toBe('complete'); // tox
    expect(data.m26.find((s: { n: string }) => s.n === '2.6.4').st).toBe('complete'); // PK (adme_pk)
    // M4: 4.2.3 has the finalized repeat-dose tox → 100%.
    expect(data.m4.find((m: { code: string }) => m.code === '4.2.3').pct).toBe(100);
    // SEND: repeat-dose tox in scope + fully validated → validated >= 1.
    expect(data.send.inScope).toBeGreaterThanOrEqual(1);
    expect(data.send.validated).toBeGreaterThanOrEqual(1);
    expect(typeof data.completeness).toBe('number');
  });

  it('returns the honest all-missing skeleton when the org has no studies', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    const res = await request(appWith(7)).get('/api/nonclinical-summary');
    expect(res.status).toBe(200);
    expect(res.body.data.provisioned).toBe(false);
    expect(res.body.data.m26.find((s: { n: string }) => s.n === '2.6.6').st).toBe('missing');
    expect(res.body.data.m26.find((s: { n: string }) => s.n === '2.6.1').st).toBe('complete');
    expect(res.body.meta.provisioned).toBe(false);
  });

  it('fails closed to the skeleton when the store is missing (42P01)', async () => {
    query.mockRejectedValueOnce(Object.assign(new Error('relation missing'), { code: '42P01' }));
    const res = await request(appWith(7)).get('/api/nonclinical-summary');
    expect(res.status).toBe(200);
    expect(res.body.data.provisioned).toBe(false);
    expect(res.body.data.m26).toHaveLength(7);
    expect(res.body.meta.pendingStore).toBe(true);
  });

  it('fails closed to the skeleton on an unexpected store error (never 500)', async () => {
    query.mockRejectedValueOnce(new Error('connection reset'));
    const res = await request(appWith(7)).get('/api/nonclinical-summary');
    expect(res.status).toBe(200);
    expect(res.body.data.provisioned).toBe(false);
    expect(res.body.meta.pendingStore).toBe(false);
  });
});

describe('POST /api/nonclinical-summary/document — persist the composed M2.6 written summary', () => {
  /** Wire the drizzle insert().values().returning() chain to a captured recorder. */
  function stubInsert(returned: Array<{ id: number }>) {
    const values = vi.fn(() => ({ returning: vi.fn(async () => returned) }));
    insert.mockReturnValue({ values });
    return values;
  }

  it('403 without org context — never persists', async () => {
    const res = await request(appWith(null)).post('/api/nonclinical-summary/document');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('ORG_REQUIRED');
    expect(insert).not.toHaveBeenCalled();
  });

  it('422 NO_STUDIES when the org has no governed studies — refuses to write a placeholder', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    const res = await request(appWith(7)).post('/api/nonclinical-summary/document');
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('NO_STUDIES');
    expect(insert).not.toHaveBeenCalled();
  });

  it('201 persists an org-scoped module-2.6 draft composed from the governed studies', async () => {
    query.mockResolvedValueOnce({ rows: [row(), row({ study_number: 'SP-1', study_type: 'safety_pharmacology' })] });
    const values = stubInsert([{ id: 123 }]);

    const res = await request(appWith(7)).post('/api/nonclinical-summary/document');
    expect(res.status).toBe(201);
    expect(query.mock.calls[0][1]).toEqual([7]); // studies read org-scoped
    expect(res.body.data.documentId).toBe(123);
    expect(res.body.data.moduleNumber).toBe('2.6');
    expect(typeof res.body.data.completeness).toBe('number');

    // The persisted row is org-scoped, module 2.6, a draft, with real composed content.
    const persisted = values.mock.calls[0][0] as {
      organizationId: number;
      moduleNumber: string;
      status: string;
      title: string;
      content: string;
    };
    expect(persisted.organizationId).toBe(7);
    expect(persisted.moduleNumber).toBe('2.6');
    expect(persisted.status).toBe('draft');
    expect(persisted.title).toMatch(/2\.6|nonclinical/i);
    expect(persisted.content.length).toBeGreaterThan(0);
    expect(persisted.content).toContain('<h2>'); // rendered HTML, not empty/placeholder
  });

  it('503 STORE_NOT_PROVISIONED when the registry table is missing (42P01)', async () => {
    query.mockRejectedValueOnce(Object.assign(new Error('relation missing'), { code: '42P01' }));
    const res = await request(appWith(7)).post('/api/nonclinical-summary/document');
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('STORE_NOT_PROVISIONED');
    expect(insert).not.toHaveBeenCalled();
  });

  it('500 PERSIST_FAILED when the insert throws — surfaced, not swallowed', async () => {
    query.mockResolvedValueOnce({ rows: [row()] });
    insert.mockReturnValue({
      values: vi.fn(() => ({ returning: vi.fn(async () => { throw new Error('write conflict'); }) })),
    });
    const res = await request(appWith(7)).post('/api/nonclinical-summary/document');
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('PERSIST_FAILED');
  });
});
