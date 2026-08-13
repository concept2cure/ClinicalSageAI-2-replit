/**
 * GET /api/ivdr/{validations,clinical-evidence} — programme scoping, and the
 * D11d classification-list convergence.
 *
 * The IVD workbench names one diagnostic programme in its header, but its
 * panels read the whole organisation: a user looking at one assay could read
 * another assay's Class C determination, its limit of detection, or its
 * clinical sensitivity, and attribute all three to the device in front of
 * them.
 *
 * `program_id` is optional so the portfolio-wide view still works.
 * Validations and clinical evidence reach a programme through their
 * classification, so they scope by joining rather than by a column of
 * their own — and since the D11d IVDR consolidation the join reads the
 * CANONICAL column names (ivdr_class / companion_diagnostic), aliased to the
 * historical response keys.
 *
 * The classification LIST endpoint was deleted in that consolidation:
 * /api/mdx/ivdr/classifications is the one list API over this store, and
 * useIvdClassifications calls it. This file pins the removal so the duplicate
 * cannot silently return.
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
      /* The bootstrap wrapper (requireIVDRAccess) grants these before the
         router runs; the classify handler checks them. */
      (req as any).ivdrPermissions = new Set(['*']);
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
  describe('classifications (list converged to /api/mdx/ivdr, D11d)', () => {
    it('no longer serves a duplicate list — /api/mdx/ivdr/classifications is the one list API', async () => {
      const res = await request(app()).get('/api/ivdr/classifications');
      expect(res.status).toBe(404);
      expect(query).not.toHaveBeenCalled();
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

    it('reads the CANONICAL classification columns, aliased to the historical keys', async () => {
      await request(app()).get('/api/ivdr/validations');
      const { sql } = callFor('ivdr_analytical_validations');
      /* One vocabulary after the D11d consolidation: the deprecated shape-1
         names must never be read directly again. */
      expect(sql).toMatch(/c\.ivdr_class AS classification/);
      expect(sql).toMatch(/c\.companion_diagnostic AS is_cdx/);
      expect(sql).not.toMatch(/c\.classification\b/);
      expect(sql).not.toMatch(/c\.is_cdx\b/);
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

    it('reads the CANONICAL classification columns, aliased to the historical keys', async () => {
      await request(app()).get('/api/ivdr/clinical-evidence');
      const { sql } = callFor('ivdr_clinical_evidence');
      expect(sql).toMatch(/c\.ivdr_class AS classification/);
      expect(sql).toMatch(/c\.companion_diagnostic AS is_cdx/);
      expect(sql).not.toMatch(/c\.classification\b/);
      expect(sql).not.toMatch(/c\.is_cdx\b/);
    });

    it('422s a malformed program_id', async () => {
      const res = await request(app()).get('/api/ivdr/clinical-evidence?program_id=%20');
      expect(res.status).toBe(422);
      expect(query).not.toHaveBeenCalled();
    });
  });
});

describe('POST /api/ivdr/classify — canonical column vocabulary (D11d)', () => {
  it('persists through the canonical shape-2 names, never the deprecated shape-1 ones', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 1 }] });
    const res = await request(app()).post('/api/ivdr/classify').send({
      deviceName: 'Assay X',
      intendedPurpose: 'Qualitative detection of a biomarker',
      isCompanionDiagnostic: true,
      analytes: ['Biomarker'],
    });
    expect(res.status, JSON.stringify(res.body)).toBe(200);

    const insert = query.mock.calls.find((c) => String(c[0]).includes('INSERT INTO ivdr_classifications'));
    expect(insert).toBeDefined();
    const sql = String(insert![0]).replace(/\s+/g, ' ');
    expect(sql).toContain('ivdr_class');
    expect(sql).toContain('companion_diagnostic');
    expect(sql).toContain('self_test');
    expect(sql).toContain('near_patient_test');
    expect(sql).toContain('notified_body_required');
    /* Canonical module columns retained from the rule engine. */
    expect(sql).toContain('intended_purpose');
    expect(sql).toContain('rule_trace');
    expect(sql).toContain('analytes');
    /* The deprecated shape-1 spellings must be unwritten. */
    expect(sql).not.toMatch(/\bis_cdx\b/);
    expect(sql).not.toMatch(/\bis_self_test\b/);
    expect(sql).not.toMatch(/\bis_near_patient\b/);
    expect(sql).not.toMatch(/\(classification[,)]|,\s*classification[,)]/);
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
