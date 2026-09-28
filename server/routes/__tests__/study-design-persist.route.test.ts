/**
 * POST /api/study-design/persist — a design starts at a project (PF-14).
 *
 * The route used to accept a design with no project, and answered 500
 * PERSIST_FAILED for everything the writer refused. Now a design must name the
 * project it belongs to (400 PROJECT_REQUIRED, before a connection is taken),
 * the writer's refusals keep their meaning (404 another organization's project,
 * 409 a move between projects or a study id another organization holds), and
 * the governed-action record names the project.
 *
 * The writer's own rules are proven against real SQL in
 * services/study-design/__tests__/persist-program-anchor.pglite.test.ts; here
 * it is stubbed, and only the route's contract is under test.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

const h = vi.hoisted(() => ({
  query: vi.fn(async () => ({ rows: [] })),
  connect: vi.fn(),
  persist: vi.fn(),
  recordGovernedAction: vi.fn(async () => ({ actionId: 'act-1', auditTrail: { ok: true } })),
}));
vi.mock('../../db', () => ({ pool: { connect: h.connect } }));
vi.mock('../c2c/actions', () => ({ recordGovernedAction: h.recordGovernedAction }));
vi.mock('../../services/study-design', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/study-design')>()),
  persistStudyDesignTx: h.persist,
}));

import router from '../study-design';
import { StudyDesignPersistRefusal } from '../../services/study-design';

const PROGRAM = '11111111-1111-4111-8111-111111111111';
const DESIGN = {
  title: 'A study of Drug X',
  phase: '3',
  indication: 'type 2 diabetes',
  endpoints: [{ name: 'HbA1c', role: 'primary', type: 'continuous' }],
  framework: { inferentialFrame: 'superiority' },
  statisticalPlan: {},
};

function app() {
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => {
    Object.assign(req, { userId: 7, tenantId: 1 });
    next();
  });
  a.use('/api/study-design', router);
  return a;
}
const post = (design: Record<string, unknown>) =>
  request(app()).post('/api/study-design/persist').send({ design, reason: 'Initial design for the IND' });

beforeEach(() => {
  vi.clearAllMocks();
  h.connect.mockResolvedValue({ query: h.query, release: vi.fn() });
  h.persist.mockResolvedValue('sd_1');
});

describe('POST /api/study-design/persist', () => {
  it('refuses a design that names no project, before a connection is taken', async () => {
    const res = await post(DESIGN);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('PROJECT_REQUIRED');
    expect(h.connect).not.toHaveBeenCalled();
  });

  it.each([
    ['PROJECT_NOT_FOUND', 404],
    ['PROGRAM_MISMATCH', 409],
    ['STUDY_ID_TAKEN', 409],
  ] as const)('answers the writer’s %s refusal with %i, and rolls back', async (code, status) => {
    h.persist.mockRejectedValue(new StudyDesignPersistRefusal(code, 'refused'));
    const res = await post({ ...DESIGN, programId: PROGRAM });
    expect(res.status).toBe(status);
    expect(res.body.error).toBe(code);
    expect(h.query).toHaveBeenCalledWith('ROLLBACK');
    expect(h.recordGovernedAction).not.toHaveBeenCalled();
  });

  it('persists a design that names its project, and the governed record names it too', async () => {
    const res = await post({ ...DESIGN, programId: PROGRAM });
    expect(res.status).toBe(200);
    expect(h.recordGovernedAction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ payload: expect.objectContaining({ studyId: 'sd_1', programId: PROGRAM }) }),
    );
  });
});
