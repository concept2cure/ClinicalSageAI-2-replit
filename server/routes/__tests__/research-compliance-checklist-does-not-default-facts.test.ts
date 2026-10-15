/**
 * POST /api/research-compliance/checklist and /gate do not default a fact nobody stated.
 *
 * What the code used to do: the route's profile schema gave every fact a
 * default (`involves*: false`, `fundingSource: 'other'`, `region: 'us'`), so an
 * empty body resolved to no committee approval and no training, and /gate then
 * cleared the named personnel against that empty requirement list.
 *
 * Now: an absent fact is not stated; the checklist lists what it could require
 * as not determined, and the gate's verdict is null (not determined), not true.
 * A value outside the schema is still refused (400), naming the key.
 *
 * The roster is a double; the route, the checklist engine and the gate are real.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';

const { loadRosterForGate } = vi.hoisted(() => ({ loadRosterForGate: vi.fn() }));
vi.mock('../../services/research-compliance/roster-service', () => ({
  loadRosterForGate,
  createPersonnelTx: vi.fn(),
  addTrainingTx: vi.fn(),
  listPersonnel: vi.fn(),
}));
vi.mock('../../db', () => ({ pool: { connect: vi.fn(), query: vi.fn() } }));
vi.mock('../c2c/actions', () => ({ recordGovernedAction: vi.fn(), verifyReauth: vi.fn() }));
vi.mock('../../services/tenant/governed-tenant-context', () => ({ setTenantContextTx: vi.fn() }));

import router from '../research-compliance';

function app() {
  const a = express();
  a.use(express.json());
  a.use((req: Request, _res: Response, next: NextFunction) => {
    (req as unknown as { user: unknown }).user = { id: 5, organizationId: 7 };
    next();
  });
  a.use('/api/research-compliance', router);
  return a;
}

beforeEach(() => {
  loadRosterForGate.mockReset();
  loadRosterForGate.mockResolvedValue({ personnel: [{ id: 1, name: 'Dr PI', role: 'principal_investigator' }], records: [] });
});

describe('POST /api/research-compliance/checklist', () => {
  it('lists what an unstated fact could require as not determined, instead of no approvals', async () => {
    const r = await request(app()).post('/api/research-compliance/checklist').send({});
    expect(r.status).toBe(200);
    expect(r.body.determined, 'an empty body was resolved as a study needing nothing').toBe(false);
    expect(r.body.requiredApprovals).toEqual([]);
    expect(r.body.undeterminedApprovals.map((u: { committee: string }) => u.committee)).toEqual(['IRB', 'IACUC', 'IBC']);
    expect(r.body.unstatedFacts).toContain('fundingSource');
    expect(r.body.unstatedFacts).toContain('region');
  });

  it('keeps a stated false as false', async () => {
    const r = await request(app()).post('/api/research-compliance/checklist').send({
      involvesHumanSubjects: false, involvesAnimals: false, involvesRecombinantDNA: false,
      involvesHumanGeneTransfer: false, fundingSource: 'internal', region: 'us',
    });
    expect(r.status).toBe(200);
    expect(r.body.determined).toBe(true);
    expect(r.body.requiredApprovals).toEqual([]);
    expect(r.body.undeterminedApprovals).toEqual([]);
  });

  it('refuses a value outside the schema, naming the key', async () => {
    const r = await request(app()).post('/api/research-compliance/checklist').send({ fundingSource: 'NIH' });
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe('VALIDATION');
    expect(r.body.error.message).toMatch(/fundingSource must be one of/);
  });
});

describe('POST /api/research-compliance/gate', () => {
  it('does not clear personnel against an undetermined requirement list', async () => {
    const r = await request(app()).post('/api/research-compliance/gate').send({ personnelIds: [1] });
    expect(r.status).toBe(200);
    expect(r.body.gate.cleared, 'the gate cleared against a requirement list nobody had determined').toBeNull();
    expect(r.body.gate.undeterminedTraining).toHaveLength(6);
    expect(loadRosterForGate).toHaveBeenCalledWith(7, [1]);
  });
});
