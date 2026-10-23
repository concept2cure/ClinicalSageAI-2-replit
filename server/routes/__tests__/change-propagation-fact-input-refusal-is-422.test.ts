/**
 * POST /api/change-propagation/programs/:programId/facts answers the fact
 * store's input refusal as 422 naming the field — not as a 500.
 *
 * Since 2026-10-15 the canonical fact store refuses a fact input it will not
 * write (a confidence outside 0–1, e.g. a percent) by throwing FactInputRefusal
 * before any write. This route sent every thrown error to serverError, so a
 * caller who stated confidence 85 got "500 — saving facts failed": a server
 * fault, for an input the store had named and refused. It is now 422 with the
 * store's sentence and the field.
 *
 * Real router, real orchestrator and real fact store; the active-fact lookup
 * and program ownership are stubbed (the refusal happens before any write).
 */
import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../middleware/auth', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  authenticateToken: (req: object, _res: unknown, next: () => void) => {
    Object.assign(req, { user: { id: 3, organizationId: 7 }, dbClient: { query: async () => ({ rows: [] }) } });
    next();
  },
}));
vi.mock('../../services/c2c/program-access', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  programInOrganization: async () => true,
}));
vi.mock('../../services/living-record/canonical-fact-store', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  resolveActiveFact: async () => null,
}));

import router from '../change-propagation';

function post(body: Record<string, unknown>) {
  const app = express();
  app.use(express.json());
  app.use('/api/change-propagation', router);
  return request(app).post('/api/change-propagation/programs/p-1/facts').send(body);
}

describe('declare a governed fact: a refused input is 422, not 500', () => {
  it('a confidence stated as a percent is refused by name', async () => {
    const res = await post({ entity: 'drug_product', field: 'strength_mg', valueNum: 10, confidence: 85 });
    expect(res.status, 'the fact store refusal was answered as a server error').toBe(422);
    expect(res.body.field).toBe('confidence');
    expect(res.body.error).toMatch(/confidence 85 is outside 0–1/);
    expect(res.body.error).toMatch(/Nothing was written/);
  });
});
