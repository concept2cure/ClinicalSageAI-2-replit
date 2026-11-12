/**
 * A commitment that names a submission, or a meeting on one, is recorded, moved
 * and listed only for someone who may change (or, for a read, open) that
 * submission's project.
 *
 * Meetings got this on 2026-10-30 (P-39 step 4), and AnA's commitment tools on
 * 2026-11-12 (1ac146d37). The Communication screen's own routes had not: the
 * organisation's editor role alone recorded a commitment on any submission,
 * added a milestone to or fulfilled any commitment, and the list returned every
 * organisation-level commitment to any member.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';

const { createCommitmentTx, addMilestoneTx, listCommitments, admit, query, fulfil, options, programScope } = vi.hoisted(() => ({
  createCommitmentTx: vi.fn(async () => ({ id: 9, provenanceLinkIds: [] })),
  addMilestoneTx: vi.fn(async () => ({ id: 4 })),
  listCommitments: vi.fn(async () => []),
  admit: vi.fn(),
  query: vi.fn(),
  fulfil: vi.fn(async (_req: unknown, res: { status: (n: number) => { json: (b: unknown) => void } }) => res.status(200).json({ reached: 'fulfil' })),
  options: vi.fn(async (_req: unknown, res: { status: (n: number) => { json: (b: unknown) => void } }) => res.status(200).json({ reached: 'options' })),
  programScope: vi.fn(async () => ({ programIds: ['prog-a'] })),
}));
vi.mock('../../services/ha-interactions/ha-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/ha-interactions/ha-service')>()),
  createCommitmentTx, addMilestoneTx, listCommitments,
}));
const client = { query: vi.fn(async () => ({ rows: [] })), release: vi.fn() };
vi.mock('../../db', () => ({ pool: { connect: vi.fn(async () => client), query: vi.fn() } }));
vi.mock('../../db/requestDb', () => ({ requestPgClient: () => ({ query }) }));
vi.mock('../c2c/actions', () => ({ recordGovernedAction: vi.fn(async () => ({ actionId: 'a1' })), verifyReauth: vi.fn() }));
vi.mock('../../services/tenant/governed-tenant-context', () => ({ setTenantContextTx: vi.fn() }));
vi.mock('../../middleware/orgMembership', () => ({ requireEditorAccessForWrites: (_q: Request, _s: Response, n: NextFunction) => n() }));
vi.mock('../c2c/project-access', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../c2c/project-access')>()),
  requireProjectAdmission: (...a: unknown[]) => admit(...a),
}));
vi.mock('../../services/c2c/current-program-access', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/c2c/current-program-access')>()),
  getCurrentAccessibleProgramScope: programScope,
}));
vi.mock('../commitment-fulfil-route', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../commitment-fulfil-route')>()),
  fulfilCommitmentRoute: fulfil,
  fulfilmentOptionsRoute: options,
  commitmentsForRequest: vi.fn(async (_req: unknown, _org: unknown, rows: unknown) => rows),
}));

import router from '../ha-interactions';
import { ProjectAdmissionRefusal } from '../c2c/project-access';

function app() {
  const a = express();
  a.use(express.json());
  a.use((req: Request, _res: Response, next: NextFunction) => {
    (req as unknown as { user: unknown }).user = { id: 5, organizationId: 7 };
    next();
  });
  a.use('/api/ha-interactions', router);
  return a;
}
const denied = () => new ProjectAdmissionRefusal(403, 'PROJECT_PERMISSION_DENIED', 'You do not have edit permission on this project.');
const commitment = { commitmentType: 'meeting_commitment', description: 'Send the updated stability protocol', reason: 'Agreed at the Type B meeting' };

/** What the request's connection answers: the commitment's subjects, a meeting's submission, a submission's project. */
function world(w: { commitment?: { submission_id: number | null; source_interaction_id: number | null } | null; meetingSubmission?: number | null; project?: number | null }) {
  query.mockImplementation(async (sql: string) => {
    if (/FROM regulatory_commitments/.test(sql)) return { rows: w.commitment ? [w.commitment] : [] };
    if (/FROM ha_interactions/.test(sql)) return { rows: w.meetingSubmission === undefined ? [] : [{ submission_id: w.meetingSubmission }] };
    return { rows: w.project == null ? [] : [{ id: w.project }] };
  });
}

beforeEach(() => {
  createCommitmentTx.mockClear(); addMilestoneTx.mockClear(); listCommitments.mockClear();
  fulfil.mockClear(); options.mockClear(); programScope.mockClear();
  admit.mockReset(); query.mockReset(); client.query.mockClear();
  world({ project: 12 });
});

describe('POST /api/ha-interactions/commitments', () => {
  it("is refused, with nothing recorded, when it names a submission whose project the person may not change", async () => {
    admit.mockRejectedValue(denied());
    const r = await request(app()).post('/api/ha-interactions/commitments').send({ ...commitment, submissionId: 41 });
    expect(r.status).toBe(403);
    expect(r.body.error.code).toBe('PROJECT_PERMISSION_DENIED');
    expect(admit).toHaveBeenCalledWith(expect.anything(), '12', true);
    expect(createCommitmentTx).not.toHaveBeenCalled();
  });

  it('is refused the same way when it names a meeting on such a submission', async () => {
    world({ meetingSubmission: 41, project: 12 });
    admit.mockRejectedValue(denied());
    const r = await request(app()).post('/api/ha-interactions/commitments').send({ ...commitment, sourceInteractionId: 3 });
    expect(r.status).toBe(403);
    expect(admit).toHaveBeenCalledWith(expect.anything(), '12', true);
    expect(createCommitmentTx).not.toHaveBeenCalled();
  });

  it('refuses a submission that is in no project here: no edit right could admit it', async () => {
    world({ project: null });
    const r = await request(app()).post('/api/ha-interactions/commitments').send({ ...commitment, submissionId: 41 });
    expect(r.status).toBe(404);
    expect(createCommitmentTx).not.toHaveBeenCalled();
  });

  it('records it when the project admits the write', async () => {
    admit.mockResolvedValue({});
    const r = await request(app()).post('/api/ha-interactions/commitments').send({ ...commitment, submissionId: 41 });
    expect(r.status).toBe(201);
    expect(createCommitmentTx).toHaveBeenCalledTimes(1);
  });

  it("a commitment that names neither is the organisation's own: recorded with no project asked", async () => {
    const r = await request(app()).post('/api/ha-interactions/commitments').send(commitment);
    expect(r.status).toBe(201);
    expect(admit).not.toHaveBeenCalled();
    expect(createCommitmentTx).toHaveBeenCalledTimes(1);
  });
});

describe('GET /api/ha-interactions/commitments', () => {
  it("lists for the reader: the list is bound to the projects this person can open", async () => {
    const r = await request(app()).get('/api/ha-interactions/commitments');
    expect(r.status).toBe(200);
    expect(programScope).toHaveBeenCalledWith(expect.anything(), { organizationId: 7, userId: 5 });
    expect(listCommitments).toHaveBeenCalledWith(7, undefined, expect.anything(), expect.anything(), ['prog-a']);
  });

  it('a scope that cannot be read is an error, never an unscoped list', async () => {
    programScope.mockRejectedValueOnce(new Error('sharing policy unavailable'));
    const r = await request(app()).get('/api/ha-interactions/commitments');
    expect(r.status).toBeGreaterThanOrEqual(500);
    expect(listCommitments).not.toHaveBeenCalled();
  });
});

describe('acting on one commitment', () => {
  beforeEach(() => {
    // Commitment 8 names submission 41, whose project is 12.
    world({ commitment: { submission_id: 41, source_interaction_id: null }, project: 12 });
    admit.mockRejectedValue(denied());
  });

  it("refuses a milestone on a commitment whose project the person may not change, with nothing recorded", async () => {
    const r = await request(app()).post('/api/ha-interactions/commitments/8/milestones').send({ title: 'Protocol drafted', reason: 'Plan agreed with CMC' });
    expect(r.status).toBe(403);
    expect(admit).toHaveBeenCalledWith(expect.anything(), '12', true);
    expect(addMilestoneTx).not.toHaveBeenCalled();
    expect(client.query).not.toHaveBeenCalledWith('BEGIN');
  });

  it('refuses its fulfilment before the fulfilment route is reached', async () => {
    const r = await request(app()).post('/api/ha-interactions/commitments/8/fulfill').send({ reason: 'Protocol sent in sequence 0004' });
    expect(r.status).toBe(403);
    expect(fulfil).not.toHaveBeenCalled();
  });

  it('answers a refused read of what could fulfil it as not found, never confirming the commitment', async () => {
    const r = await request(app()).get('/api/ha-interactions/commitments/8/fulfilment-options');
    expect(r.status).toBe(404);
    expect(r.body.error.message).toBe('Commitment not found here.');
    expect(admit).toHaveBeenCalledWith(expect.anything(), '12', false);
    expect(options).not.toHaveBeenCalled();
  });

  it('a commitment made at a meeting is admitted by that meeting\'s submission', async () => {
    world({ commitment: { submission_id: null, source_interaction_id: 3 }, meetingSubmission: 41, project: 12 });
    const r = await request(app()).post('/api/ha-interactions/commitments/8/fulfill').send({ reason: 'Protocol sent in sequence 0004' });
    expect(r.status).toBe(403);
    expect(fulfil).not.toHaveBeenCalled();
  });

  it('when the project admits it, the milestone is recorded and the fulfilment route is reached', async () => {
    admit.mockResolvedValue({});
    const m = await request(app()).post('/api/ha-interactions/commitments/8/milestones').send({ title: 'Protocol drafted', reason: 'Plan agreed with CMC' });
    expect(m.status).toBe(201);
    expect(addMilestoneTx).toHaveBeenCalledTimes(1);
    const f = await request(app()).post('/api/ha-interactions/commitments/8/fulfill').send({ reason: 'Protocol sent in sequence 0004' });
    expect(f.body).toEqual({ reached: 'fulfil' });
  });

  it("the organisation's own commitment, naming neither, asks no project", async () => {
    world({ commitment: { submission_id: null, source_interaction_id: null } });
    const f = await request(app()).post('/api/ha-interactions/commitments/8/fulfill').send({ reason: 'Done' });
    expect(f.body).toEqual({ reached: 'fulfil' });
    expect(admit).not.toHaveBeenCalled();
  });

  it('a commitment that is not here is left to the route, which says so in its own words', async () => {
    world({ commitment: null });
    const f = await request(app()).get('/api/ha-interactions/commitments/8/fulfilment-options');
    expect(f.body).toEqual({ reached: 'options' });
    expect(admit).not.toHaveBeenCalled();
  });
});
