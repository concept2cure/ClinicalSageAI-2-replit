/**
 * The manufacturing review reads the tenant's plant, and only the tenant's.
 *
 * Until 2026-10-01 GET /ai/review filled validation, process, stability and
 * change controls from server/src/services/manufacturing/seed.json — an
 * invented plant ("BioPlant A", "FillFinish B", a mixer with no PQ) — for every
 * tenant, and reviewed the whole seed when the database read failed. POST
 * /ai/simulate-deficiency reviewed the seed when no snapshot was posted, and
 * the reviewer reported "PPQ completed 0 / target 3" for a snapshot that said
 * nothing about PPQ.
 */
import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import createManufacturingRoutes from '../manufacturing-routes';

const ORG = '3f2504e0-4f89-11d3-9a0c-0305e82c3301';
const query = vi.fn();
const pool = { query, connect: vi.fn() } as never;

function app() {
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => {
    (req as unknown as { user: unknown }).user = { organizationUuid: ORG };
    next();
  });
  a.use('/api/manufacturing', createManufacturingRoutes(pool));
  return a;
}

beforeEach(() => {
  query.mockReset();
});

describe('GET /ai/review', () => {
  it('reviews only the tenant’s records and names what it did not assess', async () => {
    query.mockImplementation(async (sql: string) =>
      /quality_test_results/.test(sql) ? { rows: [{ incomplete: '0' }] } : { rows: [] },
    );
    const res = await request(app()).get('/api/manufacturing/ai/review');
    expect(res.status).toBe(200);
    expect(res.body.findings).toEqual([]);
    expect(res.body.notAssessed).toEqual(['validation', 'process', 'stability', 'changeControls']);
    const sql = query.mock.calls.map((c) => String(c[0])).filter((s) => /SELECT/.test(s) && !/CREATE/.test(s));
    expect(sql.length).toBeGreaterThan(0);
    for (const s of sql) expect(s).toMatch(/org_id = \$1/);
    expect(JSON.stringify(res.body)).not.toMatch(/PPQ|mix-100|BioPlant/);
  });

  it('reports a failed read as an error, not a review of the seed plant', async () => {
    query.mockImplementation(async (sql: string) => {
      if (/equipment_registry/.test(sql) && /SELECT/.test(sql)) throw new Error('connection refused');
      return { rows: [] };
    });
    const res = await request(app()).get('/api/manufacturing/ai/review');
    expect(res.status).toBeGreaterThanOrEqual(500);
    expect(res.body.findings).toBeUndefined();
  });
});

describe('POST /ai/simulate-deficiency', () => {
  it('needs a snapshot — it has no plant of its own to review', async () => {
    query.mockResolvedValue({ rows: [] });
    const res = await request(app()).post('/api/manufacturing/ai/simulate-deficiency').send({});
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('MFG_SNAPSHOT_REQUIRED');
  });

  it('drafts no commitment the applicant did not make', async () => {
    query.mockResolvedValue({ rows: [] });
    const res = await request(app())
      .post('/api/manufacturing/ai/simulate-deficiency')
      .send({ snapshot: { validation: { ppq: { completedRuns: 1, targetRuns: 3 } } } });
    expect(res.status).toBe(200);
    expect(res.body.letter.length).toBe(1);
    const draft = res.body.responses[0].draftResponse as string;
    expect(draft).not.toMatch(/60–90 days|We performed an impact assessment/);
    expect(draft).toMatch(/\[state the committed completion date/);
  });
});
