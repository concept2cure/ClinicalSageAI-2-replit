/**
 * POST /api/regulatory-graph/programs/:programId/reviewer-simulation passes
 * ctdProgramId to the simulator, so the preclinical personas read the program's
 * nonclinical studies; a ctdProgramId that is not a positive integer is refused.
 *
 * What the route used to do: it never passed ctdProgramId, so over HTTP the
 * nonclinical facts could not be loaded at all, and the preclinical reviewer's
 * own fix ("run the simulation with ctdProgramId") could not be followed. A
 * malformed ctdProgramId was silently ignored. Real router and simulator; the
 * database, the nonclinical loader, ownership and the audit write are stubbed.
 */
import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const holder = vi.hoisted(() => ({ loadPreclinicalIntel: vi.fn() }));

vi.mock('../../middleware/auth', () => ({
  authenticateToken: (req: any, _res: any, next: any) => {
    req.user = { id: 3, organizationId: 7 };
    next();
  },
}));
vi.mock('../../db', () => ({
  db: {
    select: () => ({ from: () => ({ where: () => ({ limit: async () => [] }) }) }),
    insert: () => ({ values: () => ({ returning: async () => [{ id: 'sim-run-1' }] }) }),
  },
  pool: {},
}));
vi.mock('../../services/c2c/program-access', () => ({ programInOrganization: async () => true }));
vi.mock('../../services/audit/audit-write-outcome', () => ({
  recordAuditRow: async () => ({ persisted: true, chained: true }),
}));
vi.mock('../../services/preclinical/preclinical-intel-loader', () => ({
  loadPreclinicalIntel: (...a: unknown[]) => holder.loadPreclinicalIntel(...a),
}));

import router from '../regulatory-graph';

const PROGRAM = '00000000-0000-0000-0000-0000000000c3';
const ind = { programType: 'IND', productType: 'drug', deviceClass: null, primaryAgency: 'FDA', developmentStage: 'ind_enabling' };

function app() {
  const a = express();
  a.use(express.json());
  a.use('/api/regulatory-graph', router);
  return a;
}
const post = (body: unknown) =>
  request(app()).post(`/api/regulatory-graph/programs/${PROGRAM}/reviewer-simulation`).send(body as object);

beforeEach(() => {
  holder.loadPreclinicalIntel.mockReset();
  holder.loadPreclinicalIntel.mockResolvedValue({
    studies: [{ studyType: 'repeat_dose_tox', species: 'rat', durationWeeks: 4, glpCompliant: true, noael: '10 mg/kg/day', pivotal: true }],
    genotoxBattery: { ames: true, inVitroMammalian: true, inVivo: true },
  });
});

describe('reviewer-simulation route: nonclinical facts by ctdProgramId', () => {
  it("reads the program's nonclinical studies when ctdProgramId is given", async () => {
    const res = await post({ program: ind, ctdProgramId: 42, dryRun: true });
    expect(res.status).toBe(200);
    expect(holder.loadPreclinicalIntel, 'ctdProgramId was not passed to the simulator').toHaveBeenCalledWith(42, 7, expect.anything());
    expect(res.body.inputsSource.nonclinical).toBe('ctd_nonclinical_studies');
  });

  it('refuses 422, by name, a ctdProgramId that is not a positive integer', async () => {
    for (const bad of ['OR-801', -1, 0, 1.5]) {
      const res = await post({ program: ind, ctdProgramId: bad, dryRun: true });
      expect(res.status, `ctdProgramId ${String(bad)} was ignored`).toBe(422);
      expect(res.body.error).toMatch(/ctdProgramId/);
    }
    expect(holder.loadPreclinicalIntel).not.toHaveBeenCalled();
  });
});
