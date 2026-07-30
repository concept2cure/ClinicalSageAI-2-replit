/**
 * GET /api/mdx/engineering/:programId — client contract lock.
 *
 * This route and its consumer (client/src/concept2cure/mdx/hooks/
 * useEngineering.ts) previously disagreed completely: the route returned
 * `{ dhfCompletion, openEcrs, bomLines, riskLastUpdated, deliverables }`
 * while the hook read `{ dhf, trace, risks, ecrs, issues }`. Every field
 * came back undefined, so the surface fell through to design-kit
 * fixtures and showed a stranger's example risk file as though it were
 * the tenant's own. The endpoint was live the whole time.
 *
 * These tests lock the payload keys the hook destructures. If someone
 * renames a key here without updating the hook, this fails rather than
 * the UI silently reverting to fixtures.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

const query = vi.fn();
vi.mock('../../db', () => ({ pool: { query: (...a: unknown[]) => query(...a) } }));

import engineeringRouter from '../mdx-engineering';

const PROGRAM = '11111111-2222-3333-4444-555555555555';

function appWith(org: number | null) {
  const app = express();
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (org !== null) (req as unknown as { user: unknown }).user = { organizationId: org };
    next();
  });
  app.use('/api/mdx', engineeringRouter);
  return app;
}

/** Tenancy check passes, then every panel query returns no rows. */
function mockEmptyPanels() {
  query.mockResolvedValueOnce({ rows: [{ id: PROGRAM }] }); // tenancy
  query.mockResolvedValue({ rows: [] }); // every panel thereafter
}

beforeEach(() => query.mockReset());

describe('GET /api/mdx/engineering/:programId', () => {
  it('403 without org context', async () => {
    const res = await request(appWith(null)).get(`/api/mdx/engineering/${PROGRAM}`);
    expect(res.status).toBe(403);
  });

  it('422 when programId is not a UUID', async () => {
    const res = await request(appWith(1)).get('/api/mdx/engineering/not-a-uuid');
    expect(res.status).toBe(422);
  });

  it('404 for a program outside the caller tenant', async () => {
    query.mockResolvedValueOnce({ rows: [] }); // tenancy check finds nothing
    const res = await request(appWith(1)).get(`/api/mdx/engineering/${PROGRAM}`);
    expect(res.status).toBe(404);
  });

  it('returns every key the useEngineering hook destructures', async () => {
    mockEmptyPanels();
    const res = await request(appWith(1)).get(`/api/mdx/engineering/${PROGRAM}`);

    expect(res.status).toBe(200);
    /* The exact set the hook reads. Losing any one of these silently
       re-enables the fixture fallback in the surface. */
    for (const key of ['summary', 'dhf', 'trace', 'risks', 'ecrs', 'issues', 'documents']) {
      expect(res.body.data).toHaveProperty(key);
    }
    expect(res.body.meta.scopes).toMatchObject({ risks: 'program' });
  });

  it('returns empty arrays, never fabricated rows, for an empty tenant', async () => {
    mockEmptyPanels();
    const res = await request(appWith(1)).get(`/api/mdx/engineering/${PROGRAM}`);

    expect(res.body.data.risks).toEqual([]);
    expect(res.body.data.dhf).toEqual([]);
    expect(res.body.data.documents).toEqual([]);
    /* An empty program is 0% complete — not a placeholder percentage. */
    expect(res.body.data.summary.dhfCompletion).toBe(0);
    expect(res.body.data.summary.openRisks).toBe(0);
  });

  it('maps ISO 14971 integer scales onto the surface heatmap keys', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: PROGRAM }] }); // tenancy
    query.mockResolvedValueOnce({
      rows: [
        {
          id: 7,
          ref_code: 'R-018',
          hazard: 'Adhesive failure',
          hazardous_situation: 'Sensor lifts during exercise',
          harm: 'Undetected hypoglycemia',
          severity: 3,
          probability: 4,
          residual_severity: 3,
          residual_probability: 2,
          control_strategy: 'design',
          status: 'verified',
          owner: 'ak',
          controls: ['Adhesive Rev D'],
          verification: ['VER-014'],
        },
      ],
    });
    query.mockResolvedValue({ rows: [] });

    const res = await request(appWith(1)).get(`/api/mdx/engineering/${PROGRAM}`);
    const risk = res.body.data.risks[0];

    expect(risk.id).toBe('R-018');
    expect(risk.severity).toBe('S3');
    expect(risk.probBefore).toBe('P4');
    expect(risk.residual).toBe('S3P2');
    expect(risk.state).toBe('verified');
    expect(risk.control).toBe('Adhesive Rev D');
  });

  it('falls back to initial severity when no control has moved residual risk', async () => {
    /* Pre-mitigation is a real ISO 14971 position, not missing data —
       the row must still land in the matrix at its initial coordinates. */
    query.mockResolvedValueOnce({ rows: [{ id: PROGRAM }] });
    query.mockResolvedValueOnce({
      rows: [
        {
          id: 8, ref_code: null, hazard: 'Battery depletion', hazardous_situation: null,
          harm: 'Loss of monitoring', severity: 4, probability: 3,
          residual_severity: null, residual_probability: null,
          control_strategy: null, status: 'open', owner: null,
          controls: [], verification: [],
        },
      ],
    });
    query.mockResolvedValue({ rows: [] });

    const res = await request(appWith(1)).get(`/api/mdx/engineering/${PROGRAM}`);
    const risk = res.body.data.risks[0];

    expect(risk.residual).toBe('S4P3');
    expect(risk.id).toBe('R-8'); // synthesised when ref_code is absent
    expect(risk.state).toBe('open');
  });

  it('clamps out-of-range scale values rather than dropping the hazard', async () => {
    /* An invisible hazard is more dangerous than a mis-binned one. */
    query.mockResolvedValueOnce({ rows: [{ id: PROGRAM }] });
    query.mockResolvedValueOnce({
      rows: [
        {
          id: 9, ref_code: 'R-099', hazard: 'Corrupt row', hazardous_situation: null,
          harm: 'Unknown', severity: 9, probability: 0,
          residual_severity: null, residual_probability: null,
          control_strategy: null, status: null, owner: null,
          controls: [], verification: [],
        },
      ],
    });
    query.mockResolvedValue({ rows: [] });

    const res = await request(appWith(1)).get(`/api/mdx/engineering/${PROGRAM}`);
    expect(res.body.data.risks).toHaveLength(1);
    expect(res.body.data.risks[0].residual).toBe('S5P1');
  });

  it('survives a missing optional table instead of blanking the surface', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: PROGRAM }] }); // tenancy
    const undefinedTable = Object.assign(new Error('relation does not exist'), {
      code: '42P01',
    });
    query.mockRejectedValueOnce(undefinedTable); // risks panel missing
    query.mockResolvedValue({ rows: [] }); // everything else fine

    const res = await request(appWith(1)).get(`/api/mdx/engineering/${PROGRAM}`);
    expect(res.status).toBe(200);
    expect(res.body.data.risks).toEqual([]);
    expect(res.body.data).toHaveProperty('dhf');
  });

  it('computes DHF completion only over required sections', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: PROGRAM }] }); // tenancy
    query.mockResolvedValueOnce({ rows: [] }); // risks
    query.mockResolvedValueOnce({ rows: [] }); // trace
    query.mockResolvedValueOnce({
      rows: [
        { id: 1, section_number: '01', section_title: 'Plan', status: 'approved',  is_required: true,  completion_percentage: 100, updated_at: null },
        { id: 2, section_number: '02', section_title: 'Inputs', status: 'draft',   is_required: true,  completion_percentage: 40,  updated_at: null },
        { id: 3, section_number: '03', section_title: 'Optional', status: 'draft', is_required: false, completion_percentage: 0,   updated_at: null },
      ],
    });
    query.mockResolvedValue({ rows: [] });

    const res = await request(appWith(1)).get(`/api/mdx/engineering/${PROGRAM}`);
    /* 1 of 2 required sections approved — the optional row is excluded
       from both numerator and denominator. */
    expect(res.body.data.summary.dhfCompletion).toBe(50);
  });
});
