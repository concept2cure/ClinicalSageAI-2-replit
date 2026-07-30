/**
 * GET /api/ivdr/{classifications,validations,clinical-evidence} — programme scoping.
 *
 * The IVD workbench names one diagnostic programme in its header, but three
 * of its four panels read the whole organisation: only the GSPR matrix was
 * scoped. A user looking at one assay could read another assay's Class C
 * determination, its limit of detection, or its clinical sensitivity, and
 * attribute all three to the device in front of them.
 *
 * `program_id` is optional so the portfolio-wide view still works.
 * Validations and clinical evidence reach a programme through their
 * classification, so they scope by joining rather than by a column of
 * their own.
 *
 * A malformed program_id is rejected rather than ignored — silently
 * falling back to the unscoped list for a typo'd UUID is exactly how a
 * scoped panel starts showing everything again without anyone noticing.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

/* The router factory takes an injected pool, so no module mock is needed —
   a stub pool is enough to observe the SQL each handler emits. */
const query = vi.fn();
const stubPool = { query: (...a: unknown[]) => query(...a) } as unknown as import('pg').Pool;

import createIVDRRoutes from '../ivdr-routes';

const PROGRAM = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

function app(org: number | null = 5, actor = true) {
  const a = express();
  a.use(express.json());
  a.use((req: Request, _res: Response, next: NextFunction) => {
    if (org !== null) {
      (req as any).tenantId = org;
      (req as any).user = { organizationId: org, role: 'admin' };
      if (actor) {
        (req as any).user.id = 42;
        (req as any).userId = 42;
      }
      (req as any).tenantContext = { organizationId: org };
    }
    next();
  });
  a.use('/api/ivdr', createIVDRRoutes(stubPool));
  return a;
}

/** The SQL issued against `table`, whitespace-normalised, with its args. */
function callFor(table: string) {
  const c = query.mock.calls.find((x) => String(x[0]).includes(table));
  if (!c) throw new Error(`no query issued against ${table}`);
  return { sql: String(c[0]).replace(/\s+/g, ' '), args: (c[1] ?? []) as unknown[] };
}

beforeEach(() => {
  query.mockReset();
  query.mockResolvedValue({ rows: [] });
});

describe('IVDR programme scoping', () => {
  describe('classifications', () => {
    it('stays organisation-wide when no programme is given', async () => {
      const res = await request(app()).get('/api/ivdr/classifications');
      expect(res.status).toBe(200);
      expect(res.body.meta.scope).toBe('organization');

      const { sql, args } = callFor('ivdr_classifications');
      expect(sql).not.toMatch(/program_id/);
      expect(args).toEqual([5]);
    });

    it('filters on program_id when given', async () => {
      const res = await request(app()).get(`/api/ivdr/classifications?program_id=${PROGRAM}`);
      expect(res.status).toBe(200);
      expect(res.body.meta.scope).toBe('program');

      const { sql, args } = callFor('ivdr_classifications');
      expect(sql).toMatch(/AND program_id = \$2/);
      expect(args).toEqual([5, PROGRAM]);
    });

    it('422s a malformed program_id rather than silently unscoping', async () => {
      const res = await request(app()).get('/api/ivdr/classifications?program_id=not-a-uuid');
      expect(res.status).toBe(422);
      expect(query).not.toHaveBeenCalled();
    });

    it('treats an empty program_id as absent', async () => {
      const res = await request(app()).get('/api/ivdr/classifications?program_id=');
      expect(res.status).toBe(200);
      expect(res.body.meta.scope).toBe('organization');
    });
  });

  describe('analytical validations', () => {
    it('scopes through the classification join', async () => {
      const res = await request(app()).get(`/api/ivdr/validations?program_id=${PROGRAM}`);
      expect(res.status).toBe(200);
      expect(res.body.meta.scope).toBe('program');

      const { sql, args } = callFor('ivdr_analytical_validations');
      /* Validations carry no programme column — they reach one via their
         classification, so the predicate must be on the joined alias. */
      expect(sql).toMatch(/AND c\.program_id = \$2/);
      expect(args).toEqual([5, PROGRAM]);
    });

    it('keeps tenancy on the validation row itself, not only the join', async () => {
      await request(app()).get(`/api/ivdr/validations?program_id=${PROGRAM}`);
      const { sql } = callFor('ivdr_analytical_validations');
      expect(sql).toMatch(/v\.organization_id = \$1/);
    });

    it('422s a malformed program_id', async () => {
      const res = await request(app()).get('/api/ivdr/validations?program_id=12345');
      expect(res.status).toBe(422);
      expect(query).not.toHaveBeenCalled();
    });
  });

  describe('clinical evidence', () => {
    it('scopes through the classification join', async () => {
      const res = await request(app()).get(`/api/ivdr/clinical-evidence?program_id=${PROGRAM}`);
      expect(res.status).toBe(200);
      expect(res.body.meta.scope).toBe('program');

      const { sql, args } = callFor('ivdr_clinical_evidence');
      expect(sql).toMatch(/AND c\.program_id = \$2/);
      expect(args).toEqual([5, PROGRAM]);
    });

    it('keeps tenancy on the evidence row itself', async () => {
      await request(app()).get(`/api/ivdr/clinical-evidence?program_id=${PROGRAM}`);
      const { sql } = callFor('ivdr_clinical_evidence');
      expect(sql).toMatch(/e\.organization_id = \$1/);
    });

    it('422s a malformed program_id', async () => {
      const res = await request(app()).get('/api/ivdr/clinical-evidence?program_id=%20');
      expect(res.status).toBe(422);
      expect(query).not.toHaveBeenCalled();
    });
  });
});

describe('IVDR diagnostic result calculations', () => {
  it.each([
    { truePositive: -1, falsePositive: 0, trueNegative: 1, falseNegative: 0 },
    { truePositive: 1.25, falsePositive: 0, trueNegative: 1, falseNegative: 0 },
    { truePositive: '5', falsePositive: 0, trueNegative: 1, falseNegative: 0 },
  ])('rejects invalid counts before persistence: %j', async (body) => {
    const res = await request(app()).put('/api/ivdr/clinical-evidence/7/results').send(body);
    expect(res.status).toBe(422);
    expect(query).not.toHaveBeenCalled();
  });

  it('persists explicit null metrics for an all-zero table', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 7 }] });
    const res = await request(app()).put('/api/ivdr/clinical-evidence/7/results').send({
      truePositive: 0, falsePositive: 0, trueNegative: 0, falseNegative: 0,
      reason: 'zero-denominator qualification',
    });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.metrics).toMatchObject({
      sensitivity: null, specificity: null, ppv: null, npv: null,
      accuracy: null, prevalence: null, total: 0, calculationVersion: 'ivdr-2x2-v1',
    });
    const update = query.mock.calls.find((call) => String(call[0]).includes('UPDATE ivdr_clinical_evidence'));
    expect(update?.[1]?.slice(1, 10)).toEqual([0, 0, 0, 0, null, null, null, null, null]);
    expect(String(update?.[0])).toContain('INSERT INTO ivdr_evidence_result_history');
    expect(update?.[1]?.[19]).toBe('42');
  });

  it('fails closed before persistence when actor attribution is absent', async () => {
    const res = await request(app(5, false)).put('/api/ivdr/clinical-evidence/7/results').send({
      truePositive: 1, falsePositive: 0, trueNegative: 1, falseNegative: 0,
    });
    expect(res.status).toBe(403);
    expect(query).not.toHaveBeenCalled();
  });

  it('does not report success or write history for a missing tenant-scoped row', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app()).put('/api/ivdr/clinical-evidence/999/results').send({
      truePositive: 1, falsePositive: 0, trueNegative: 1, falseNegative: 0,
    });
    expect(res.status).toBe(404);
    expect(query).toHaveBeenCalledTimes(1);
  });
});
