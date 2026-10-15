/**
 * The Inconsistency board fails, rather than showing an empty registry, when
 * the assumption or decision read fails.
 *
 * GET /api/governed-intelligence-inconsistency/projects/:projectId/inconsistency
 * read the assumption registry and the decision ledger with Promise.allSettled
 * and turned a rejected read into [] ("supporting context only. Degrade to []
 * on failure"). The surface renders [] as "No assumption records yet" / "No
 * decision records yet" — a claim about the project made over a read that
 * never completed. The findings read beside them already failed closed (503).
 */
import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const H = vi.hoisted(() => ({
  assumptions: vi.fn(),
  decisions: vi.fn(),
}));

vi.mock('../../db.js', () => ({
  query: async () => ({
    rows: [{ id: 3, code: 'BX-204', name: 'Bexarone in advanced NSCLC', status: 'active', therapeutic_area: 'NSCLC' }],
  }),
}));
vi.mock('../../services/contradiction-engine-service', () => ({
  contradictionEngineService: {
    searchFindings: async () => [],
    projectGate: async () => ({ total: 0, open: 0, blocked: false }),
  },
}));
vi.mock('../../services/assumption-registry-service', () => ({
  assumptionRegistryService: { search: H.assumptions },
}));
vi.mock('../../services/decision-record-service', () => ({
  decisionRecordService: { search: H.decisions },
}));

import createGovernedIntelligenceInconsistencyRoutes from '../governed-intelligence-inconsistency-routes';

function app() {
  const a = express();
  a.use((req: Request, _res: Response, next: NextFunction) => {
    req.user = { id: 7, organizationId: 9, role: 'member' };
    next();
  });
  a.use('/api/governed-intelligence-inconsistency', createGovernedIntelligenceInconsistencyRoutes());
  return a;
}
const readBoard = () => request(app()).get('/api/governed-intelligence-inconsistency/projects/3/inconsistency');

const ASSUMPTION = {
  id: 'a-1', category: 'dropout', domainTrack: 'biostatistics', assumedValue: '0.1', status: 'active',
  title: 'Dropout rate', sourceReference: null, sourceType: 'sap',
};
const DECISION = {
  id: 'd-1', title: 'SAP generation', actionState: 'proposed', executedArtifactId: null, executedArtifactVersion: null,
  decidedBy: '41', recommendationRationale: null, recommendationSummary: 'Generate SAP with N=450',
};

beforeEach(() => {
  H.assumptions.mockReset().mockResolvedValue([ASSUMPTION]);
  H.decisions.mockReset().mockResolvedValue([DECISION]);
});

describe('the Inconsistency board', () => {
  it('fails when the assumption registry cannot be read, rather than showing none', async () => {
    H.assumptions.mockRejectedValue(new Error('Connection terminated unexpectedly'));
    const res = await readBoard();
    expect(res.status, 'a failed assumption read was served as an empty registry').toBe(503);
    expect(res.body.success).toBe(false);
    expect(res.body.data).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toContain('Connection terminated');
  });

  it('fails when the decision ledger cannot be read, rather than showing none', async () => {
    H.decisions.mockRejectedValue(new Error('Connection terminated unexpectedly'));
    const res = await readBoard();
    expect(res.status, 'a failed decision read was served as an empty ledger').toBe(503);
    expect(res.body.success).toBe(false);
    expect(res.body.data).toBeUndefined();
  });

  it('serves both when both were read', async () => {
    const res = await readBoard();
    expect(res.status).toBe(200);
    expect(res.body.data.assumptions).toEqual([expect.objectContaining({ id: 'a-1', source: 'sap' })]);
    expect(res.body.data.decisions).toEqual([expect.objectContaining({ id: 'd-1', decidedBy: '41' })]);
  });
});
