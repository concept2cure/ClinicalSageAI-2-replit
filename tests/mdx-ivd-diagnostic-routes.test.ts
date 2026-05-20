/**
 * Integration tests for IVD + diagnostic routes (migration 20260508).
 * Covers: analytical performance, clinical performance, IVDR
 * classifications + PER, CLIA, CDx pairings + concordance, LDT inventory
 * + milestones. SQL mocked at the pool layer; tests assert HTTP behavior.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

const PROGRAM_ID = '11111111-2222-3333-4444-000000000204';

const queryFn = vi.fn();
const connectFn = vi.fn();

vi.mock('../server/db', () => ({
  pool: {
    query:   (...args: unknown[]) => queryFn(...args),
    connect: (...args: unknown[]) => connectFn(...args),
  },
  getPool: () => ({
    query:   (...args: unknown[]) => queryFn(...args),
    connect: (...args: unknown[]) => connectFn(...args),
  }),
  db: {},
}));

import ivdPerformanceRouter from '../server/routes/mdx-ivd-performance';
import ivdrRouter from '../server/routes/mdx-ivdr';
import cliaRouter from '../server/routes/mdx-clia';
import cdxRouter from '../server/routes/mdx-cdx';
import ldtRouter from '../server/routes/mdx-ldt';

function makeApp(opts: { withAuth?: boolean } = { withAuth: true }) {
  const app = express();
  app.use(express.json());
  if (opts.withAuth) {
    app.use((req, _res, next) => {
      (req as any).user = { id: 777, organizationId: 99 };
      next();
    });
  }
  app.use('/api/mdx', ivdPerformanceRouter);
  app.use('/api/mdx', ivdrRouter);
  app.use('/api/mdx', cliaRouter);
  app.use('/api/mdx', cdxRouter);
  app.use('/api/mdx', ldtRouter);
  return app;
}

beforeEach(() => {
  queryFn.mockReset();
  queryFn.mockResolvedValue({ rows: [], rowCount: 0 });
});

/* ─── Auth gate ──────────────────────────────────────────────────── */

describe('IVD + diagnostic routes — auth gate', () => {
  it.each([
    ['/api/mdx/ivd/analytical'],
    ['/api/mdx/ivd/clinical'],
    ['/api/mdx/ivdr/classifications'],
    ['/api/mdx/ivdr/per'],
    ['/api/mdx/clia'],
    ['/api/mdx/cdx/pairings'],
    ['/api/mdx/ldt'],
    ['/api/mdx/ldt-phase-summary'],
  ])('GET %s returns 403 without org context', async (url) => {
    const res = await request(makeApp({ withAuth: false })).get(url);
    expect(res.status).toBe(403);
  });
});

/* ─── Analytical performance ─────────────────────────────────────── */

describe('IVD analytical performance routes', () => {
  it('POST rejects unknown study_type', async () => {
    const res = await request(makeApp())
      .post('/api/mdx/ivd/analytical')
      .send({ studyType: 'wat', title: 'Foo' });
    expect(res.status).toBe(422);
  });

  it('POST 201 on valid input', async () => {
    queryFn.mockResolvedValueOnce({
      rows: [{ id: 1, study_type: 'accuracy', title: 'Accuracy v1', pass_fail: 'pending' }],
    });
    const res = await request(makeApp())
      .post('/api/mdx/ivd/analytical')
      .send({ studyType: 'accuracy', title: 'Accuracy v1' });
    expect(res.status).toBe(201);
    expect(res.body.data.study_type).toBe('accuracy');
  });

  it('GET /performance-summary rejects non-UUID', async () => {
    const res = await request(makeApp()).get('/api/mdx/ivd/performance-summary/foo');
    expect(res.status).toBe(422);
  });

  it('GET /performance-summary returns analytical + clinical aggregates', async () => {
    queryFn
      .mockResolvedValueOnce({
        rows: [
          { study_type: 'accuracy', n: 1, pass: 1 },
          { study_type: 'precision', n: 1, pass: 0 },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          { n: 2, latest_sens: '92.50', latest_spec: '88.10', endpoints_met: 1 },
        ],
      });
    const res = await request(makeApp()).get(`/api/mdx/ivd/performance-summary/${PROGRAM_ID}`);
    expect(res.status).toBe(200);
    expect(res.body.data.analytical.matrix.length).toBeGreaterThan(0);
    expect(res.body.data.clinical.studyCount).toBe(2);
    expect(res.body.data.clinical.latestSensitivity).toBe(92.5);
  });
});

/* ─── Clinical performance ──────────────────────────────────────── */

describe('IVD clinical performance routes', () => {
  it('POST rejects sensitivity > 100', async () => {
    const res = await request(makeApp())
      .post('/api/mdx/ivd/clinical')
      .send({ title: 'Pivotal', sensitivityPct: 150 });
    expect(res.status).toBe(422);
  });

  it('POST rejects auc_roc > 1', async () => {
    const res = await request(makeApp())
      .post('/api/mdx/ivd/clinical')
      .send({ title: 'Pivotal', aucRoc: 1.5 });
    expect(res.status).toBe(422);
  });

  it('POST 201 with sensitivity + specificity', async () => {
    queryFn.mockResolvedValueOnce({
      rows: [{ id: 1, title: 'Pivotal', sensitivity_pct: '94.20', specificity_pct: '88.10' }],
    });
    const res = await request(makeApp())
      .post('/api/mdx/ivd/clinical')
      .send({ title: 'Pivotal', sensitivityPct: 94.2, specificityPct: 88.1 });
    expect(res.status).toBe(201);
  });
});

/* ─── IVDR classifications ───────────────────────────────────────── */

describe('IVDR classifications', () => {
  it('POST rejects ivdr_class not in A/B/C/D', async () => {
    const res = await request(makeApp())
      .post('/api/mdx/ivdr/classifications')
      .send({ deviceName: 'CGM v2', ivdrClass: 'X' });
    expect(res.status).toBe(422);
  });

  it('POST sets notified_body_required=true for Class B', async () => {
    queryFn.mockResolvedValueOnce({
      rows: [{ id: 1, device_name: 'CGM v2', ivdr_class: 'B', notified_body_required: true }],
    });
    const res = await request(makeApp())
      .post('/api/mdx/ivdr/classifications')
      .send({ deviceName: 'CGM v2', ivdrClass: 'B' });
    expect(res.status).toBe(201);
    expect(res.body.data.notified_body_required).toBe(true);
  });

  it('POST sets notified_body_required=false for Class A', async () => {
    queryFn.mockResolvedValueOnce({
      rows: [{ id: 2, device_name: 'Strip v1', ivdr_class: 'A', notified_body_required: false }],
    });
    const res = await request(makeApp())
      .post('/api/mdx/ivdr/classifications')
      .send({ deviceName: 'Strip v1', ivdrClass: 'A' });
    expect(res.status).toBe(201);
    expect(res.body.data.notified_body_required).toBe(false);
  });
});

/* ─── IVDR PER ──────────────────────────────────────────────────── */

describe('IVDR PER documents', () => {
  it('POST rejects missing device_name', async () => {
    const res = await request(makeApp())
      .post('/api/mdx/ivdr/per')
      .send({ perVersion: 'v1.0' });
    expect(res.status).toBe(422);
  });

  it('POST 201 on minimal valid input', async () => {
    queryFn.mockResolvedValueOnce({
      rows: [{ id: 1, device_name: 'CGM v2', per_version: 'v1.0', per_status: 'draft' }],
    });
    const res = await request(makeApp())
      .post('/api/mdx/ivdr/per')
      .send({ deviceName: 'CGM v2', perVersion: 'v1.0' });
    expect(res.status).toBe(201);
  });
});

/* ─── CLIA ──────────────────────────────────────────────────────── */

describe('CLIA categorization routes', () => {
  it('POST rejects invalid complexity', async () => {
    const res = await request(makeApp())
      .post('/api/mdx/clia')
      .send({ testName: 'Glucose POC', cliaComplexity: 'super-high' });
    expect(res.status).toBe(422);
  });

  it('POST 201 with waived', async () => {
    queryFn.mockResolvedValueOnce({
      rows: [{ id: 1, test_name: 'Glucose POC', clia_complexity: 'waived' }],
    });
    const res = await request(makeApp())
      .post('/api/mdx/clia')
      .send({ testName: 'Glucose POC', cliaComplexity: 'waived' });
    expect(res.status).toBe(201);
  });

  it('grant-waiver requires waiver_applied=true (returns 409 otherwise)', async () => {
    queryFn.mockResolvedValueOnce({ rows: [] });
    const res = await request(makeApp())
      .post('/api/mdx/clia/1/grant-waiver')
      .send({ granted: true });
    expect(res.status).toBe(409);
  });
});

/* ─── CDx pairings ──────────────────────────────────────────────── */

describe('CDx pairings + concordance', () => {
  it('POST pairing rejects missing drug_name', async () => {
    const res = await request(makeApp())
      .post('/api/mdx/cdx/pairings')
      .send({ biomarker: 'EGFR' });
    expect(res.status).toBe(422);
  });

  it('POST pairing 201 on minimal valid', async () => {
    queryFn.mockResolvedValueOnce({
      rows: [{ id: 1, drug_name: 'osimertinib', biomarker: 'EGFR', approval_status: 'planned' }],
    });
    const res = await request(makeApp())
      .post('/api/mdx/cdx/pairings')
      .send({ drugName: 'osimertinib', biomarker: 'EGFR' });
    expect(res.status).toBe(201);
  });

  it('POST concordance 404s when pairing is cross-tenant', async () => {
    queryFn.mockResolvedValueOnce({ rows: [] }); // own check empty
    const res = await request(makeApp())
      .post('/api/mdx/cdx/pairings/999/concordance')
      .send({ referenceAssay: 'Cobas', candidateAssay: 'OursV1' });
    expect(res.status).toBe(404);
  });
});

/* ─── LDT inventory + milestones ────────────────────────────────── */

describe('LDT routes', () => {
  it('POST rejects missing test_name', async () => {
    const res = await request(makeApp())
      .post('/api/mdx/ldt')
      .send({ labName: 'CoreLab' });
    expect(res.status).toBe(422);
  });

  it('POST 201 with lab + test', async () => {
    queryFn.mockResolvedValueOnce({
      rows: [{ id: 1, lab_name: 'CoreLab', test_name: 'BRCA panel', current_phase: 1 }],
    });
    const res = await request(makeApp())
      .post('/api/mdx/ldt')
      .send({ labName: 'CoreLab', testName: 'BRCA panel' });
    expect(res.status).toBe(201);
  });

  it('GET /ldt-phase-summary returns all 5 phases', async () => {
    queryFn.mockResolvedValueOnce({
      rows: [
        { current_phase: 1, n: 3 },
        { current_phase: 3, n: 2 },
      ],
    });
    const res = await request(makeApp()).get('/api/mdx/ldt-phase-summary');
    expect(res.status).toBe(200);
    expect(res.body.data.phases).toHaveLength(5);
    expect(res.body.data.total).toBe(5);
  });

  it('POST milestones 404s on cross-tenant LDT', async () => {
    queryFn.mockResolvedValueOnce({ rows: [] });
    const res = await request(makeApp())
      .post('/api/mdx/ldt/999/milestones')
      .send({ phase: 2, requirement: 'MDR compliance' });
    expect(res.status).toBe(404);
  });
});
