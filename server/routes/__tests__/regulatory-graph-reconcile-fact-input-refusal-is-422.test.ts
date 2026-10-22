/**
 * The regulatory-graph reconcile routes answer the fact store's input refusal
 * as 422 naming the field — not as a 500.
 *
 * evidence_claims.confidence is numeric(3,2), so a claim can carry 1.50 (a
 * score on some other scale). Reconciling it establishes a canonical fact with
 * that confidence, and since 2026-10-15 the fact store refuses a confidence
 * outside 0–1 by throwing FactInputRefusal before it writes. All three
 * reconcile routes sent that to serverError: "500 — reconciling claims
 * failed", a server fault for an input the store had named. They now answer
 * 422 with the store's sentence and the field; the program-wide route also
 * says the run stopped at that claim.
 *
 * Real router, real reconciliation engine and real fact store over a stubbed
 * Drizzle client (rows by table); program linking and ownership are stubbed.
 */
import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

const CLAIM = {
  id: 5, programId: 12, organizationId: 7, entity: 'drug_product', field: 'strength_mg', valueNum: '10',
  valueText: null, unit: 'mg', valueType: 'number', comparator: '=', confidence: '1.50',
  verification: 'unverified', sourceId: null, isCurrent: true,
};

vi.mock('../../middleware/auth', () => ({
  authenticateToken: (req: object, _res: unknown, next: () => void) => {
    Object.assign(req, { user: { id: 3, organizationId: 7 } });
    next();
  },
}));
vi.mock('../../db', async () => {
  const { getTableName } = await import('drizzle-orm');
  // Rows by table: a where() chain that is awaited directly or ends in limit().
  interface Chain extends PromiseLike<unknown[]> {
    where: () => Chain;
    limit: () => Promise<unknown[]>;
  }
  const select = () => ({
    from: (table: Parameters<typeof getTableName>[0]) => {
      const rows: unknown[] = getTableName(table) === 'evidence_claims' ? [CLAIM] : [];
      const chain: Chain = {
        where: () => chain,
        limit: async () => rows,
        then: (ok, fail) => Promise.resolve(rows).then(ok, fail),
      };
      return chain;
    },
  });
  const refuse = () => {
    throw new Error('no write is expected before the refusal');
  };
  return { db: { select, insert: refuse, update: refuse }, pool: {} };
});
vi.mock('../../services/c2c/program-access', () => ({ programInOrganization: async () => true }));
vi.mock('../../services/living-record/program-link', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  linkLegacyProgram: async () => undefined,
  resolveUuidProgram: async () => 'p-1',
}));

import router from '../regulatory-graph';

function app() {
  const a = express();
  a.use(express.json());
  a.use('/api/regulatory-graph', router);
  return a;
}

const REFUSAL = /confidence 1\.5 is outside 0–1/;

describe('reconcile: a claim the fact store refuses is 422, not 500', () => {
  it('POST /programs/:programId/claims/:claimId/reconcile', async () => {
    const res = await request(app()).post('/api/regulatory-graph/programs/p-1/claims/5/reconcile').send({});
    expect(res.status, 'the fact store refusal was answered as a server error').toBe(422);
    expect(res.body).toMatchObject({ field: 'confidence' });
    expect(res.body.error).toMatch(REFUSAL);
  });

  it('POST /claims/:claimId/reconcile (reconcile-on-write)', async () => {
    const res = await request(app()).post('/api/regulatory-graph/claims/5/reconcile').send({});
    expect(res.status).toBe(422);
    expect(res.body).toMatchObject({ field: 'confidence' });
    expect(res.body.error).toMatch(REFUSAL);
  });

  it('POST /programs/:programId/reconcile says the run stopped at the refused claim', async () => {
    const res = await request(app()).post('/api/regulatory-graph/programs/p-1/reconcile').send({ legacyProgramId: 12 });
    expect(res.status).toBe(422);
    expect(res.body).toMatchObject({ field: 'confidence' });
    expect(res.body.error).toMatch(REFUSAL);
    expect(res.body.partial).toMatch(/stopped at this claim/);
  });
});
