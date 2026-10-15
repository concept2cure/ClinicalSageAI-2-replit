/**
 * POST /api/change-propagation/programs/:programId/reconcile-device-documents
 * passes the reconciler's verdict through unchanged (row 74, track NC;
 * ADR-0015 §7).
 *
 * The route is the reconciler's one HTTP consumer. Before track NC, a device
 * programme whose documents state no labelled figure came back 200 with
 * verdict 'clean' and figuresReconciled 0: a pass over nothing compared. It now
 * comes back 200 with verdict 'not_assessed' and the reason, and the route
 * neither drops the reason nor turns the verdict into a pass or a 404.
 */
import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ rows: [] as unknown[] }));

vi.mock('../../middleware/auth', async importOriginal => {
  const real = await importOriginal<Record<string, unknown>>();
  return {
    ...real,
    authenticateToken: (req: any, _res: unknown, next: () => void) => {
      req.user = { id: 3, organizationId: 7 };
      // The request-scoped client the ownership check is handed (requestDb.ts);
      // the check itself is stubbed below.
      req.dbClient = { query: async () => ({ rows: [] }) };
      next();
    },
  };
});

vi.mock('../../db/requestDb', async importOriginal => {
  const real = await importOriginal<Record<string, unknown>>();
  const programChain = {
    from: () => programChain,
    where: () => programChain,
    limit: async () => [{ id: 'p-1' }],
  };
  return { ...real, requestDb: () => ({ select: () => programChain }) };
});

// Program ownership is one shared check since 38a9417c6 (program-access.ts);
// the program belongs to the caller's organization here unless a case says not.
const ownership = vi.hoisted(() => ({ ours: true }));
vi.mock('../../services/c2c/program-access', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  programInOrganization: async () => ownership.ours,
}));

vi.mock('../../db', async importOriginal => {
  const real = await importOriginal<Record<string, unknown>>();
  const chain = { from: () => chain, where: async () => state.rows };
  return { ...real, db: { ...(real.db as object), select: () => chain } };
});

import router from '../change-propagation';

const doc = (id: string, summary: string, status = 'draft', previousDocumentId: string | null = null) => ({
  id,
  documentType: 'psur',
  summary,
  risksIdentified: null,
  benefitRiskConclusion: null,
  status,
  previousDocumentId,
});

function post() {
  const app = express();
  app.use(express.json());
  app.use('/api/change-propagation', router);
  return request(app).post('/api/change-propagation/programs/p-1/reconcile-device-documents').send({});
}

describe('reconcile-device-documents: not_assessed reaches the caller as not_assessed', () => {
  beforeEach(() => {
    state.rows = [];
  });

  it('documents with no labelled figure: 200, verdict not_assessed with the reason, never clean', async () => {
    state.rows = [doc('pms', 'Post-market surveillance found no new signals during the reporting period.')];
    const res = await post();
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.report.verdict).not.toBe('clean');
    expect(res.body.report.verdict).toBe('not_assessed');
    expect(res.body.report.notAssessedReason).toBe('no_figures');
    expect(res.body.report.quantitiesCompared).toBe(0);
  });

  it('two documents that agree: 200, still clean', async () => {
    state.rows = [
      doc('pms', 'Clinical sensitivity of 95% was confirmed in the surveillance cohort.'),
      doc('psur', 'Clinical sensitivity of 95% is restated in the periodic safety update report.'),
    ];
    const res = await post();
    expect(res.status).toBe(200);
    expect(res.body.report.verdict).toBe('clean');
    expect(res.body.report.quantitiesCompared).toBe(1);
  });

  // Review [1]: a programme whose only PSUR has been superseded once holds the
  // old version and its verbatim copy. That is one document, not two.
  it('a superseded version and its verbatim successor: 200, not_assessed, never clean', async () => {
    const psur = 'Clinical sensitivity of 95% was confirmed in the surveillance cohort.';
    state.rows = [doc('psur-v1', psur, 'superseded'), doc('psur-v2', psur, 'draft', 'psur-v1')];
    const res = await post();
    expect(res.status).toBe(200);
    expect(res.body.report.verdict).not.toBe('clean');
    expect(res.body.report.verdict).toBe('not_assessed');
    expect(res.body.report.notAssessedReason).toBe('no_shared_quantities');
    expect(res.body.documentsScanned).toBe(1);
    expect(res.body.versionsSetAside).toBe(1);
  });

  it('no documents: still 404 not_found', async () => {
    const res = await post();
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('not_found');
  });
});
