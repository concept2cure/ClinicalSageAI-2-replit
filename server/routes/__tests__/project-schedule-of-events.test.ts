/**
 * /api/concept2cure/projects/:id/schedule-of-events — ident contract.
 *
 * The schedule store is keyed by the NUMERIC projects.id. The route's id parser
 * used to be `parseInt(raw.replace('proj_', ''))`, which truncated arbitrary
 * idents to their leading digits — so a regulatory_programs UUID like
 * '7abb…' (the id-space the v2 surfaces hold in window.C2C_PROJECT) silently
 * resolved to project 7 and served ANOTHER project's schedule inside the same
 * org. These lock the fail-closed parse: '12' and 'proj_12' resolve; a program
 * UUID resolves through its unique canonical anchor on the server (or is a
 * named PROGRAM_UNANCHORED refusal); junk is a 400 before any query is issued.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

const query = vi.fn();
const globalQuery = vi.hoisted(() => vi.fn());
const q = { query };
const executionContext = { actorUserId: 41, executor: q };
vi.mock('../../db', () => ({ pool: { query: globalQuery }, db: { legacyGlobal: true } }));

/* Legacy lowest-anchor lookup must no longer authorize these routes. Canonical
   current actor/program admission is mocked below for this transport suite;
   the real membership, unique-anchor and sharing policy has native tests. */
const resolveProgramProjectAnchor = vi.fn();
vi.mock('../../services/c2c/program-project-anchor', () => ({
  resolveProgramProjectAnchor: (...a: unknown[]) => resolveProgramProjectAnchor(...a),
}));
const readCurrentProgramActor = vi.fn();
const requireCurrentProgramAccess = vi.fn();
vi.mock('../../services/c2c/current-program-access', async original => ({
  ...(await original<typeof import('../../services/c2c/current-program-access')>()),
  readCurrentProgramActor: (...a: unknown[]) => readCurrentProgramActor(...a),
  requireCurrentProgramAccess: (...a: unknown[]) => requireCurrentProgramAccess(...a),
}));
const canAccessReportProject = vi.fn();
vi.mock('../../services/report-os/project-access', async original => ({
  ...(await original<typeof import('../../services/report-os/project-access')>()),
  canAccessReportProject: (...a: unknown[]) => canAccessReportProject(...a),
}));

const getScheduleOfEvents = vi.fn();
const generateProjectSchedule = vi.fn();
vi.mock('../../services/projects/schedule-of-events', () => ({
  getScheduleOfEvents: (...a: unknown[]) => getScheduleOfEvents(...(a as [])),
  generateProjectSchedule: (...a: unknown[]) => generateProjectSchedule(...a),
  amendMilestone: vi.fn(),
  resetProjectGoals: vi.fn(),
  reviewScheduleHealth: vi.fn(),
}));
const loadUnifiedWork = vi.fn();
vi.mock('../../services/unified-work/unified-work-view', () => ({
  loadUnifiedWork: (...a: unknown[]) => loadUnifiedWork(...a),
}));

import router from '../project-schedule-of-events';
import { SchedulePreservationConflict } from '../../services/projects/schedule-of-events/preservation';
import { ProgramReadAccessError } from '../../services/c2c/current-program-access';
import { requestDb } from '../../db/requestDb';

const EMPTY_VIEW = { plan: null, milestones: [], goals: [], revisions: [], health: {} };
const received: Request[] = [];
const unresolved = () => new ProgramReadAccessError(409, 'PROJECT_ANCHOR_UNRESOLVED', 'The program relationship could not be verified.');

function app(orgId: number | null = 7) {
  const a = express();
  a.use(express.json());
  a.use((req: Request, _res: Response, next: NextFunction) => {
    if (orgId !== null) (req as unknown as { tenantId: number }).tenantId = orgId;
    Object.assign(req, { userId: 41, user: { id: 41, role: 'admin' }, dbClient: q });
    received.push(req);
    next();
  });
  a.use('/api/concept2cure', router);
  return a;
}

beforeEach(() => {
  query.mockReset();
  query.mockResolvedValue({ rows: [{ type: 'IND', metadata: {} }] });
  globalQuery.mockReset(); received.length = 0;
  readCurrentProgramActor.mockReset().mockResolvedValue({ userId: 41, role: 'member' });
  requireCurrentProgramAccess.mockReset().mockImplementation(async (_executor, input) => ({
    actor: { userId: 41, role: 'member' }, programId: input.programId.toLowerCase(), projectId: 11, clientWorkspaceId: null,
  }));
  canAccessReportProject.mockReset().mockResolvedValue(true);
  getScheduleOfEvents.mockReset();
  getScheduleOfEvents.mockResolvedValue(EMPTY_VIEW);
  generateProjectSchedule.mockReset();
  generateProjectSchedule.mockResolvedValue(EMPTY_VIEW);
  resolveProgramProjectAnchor.mockReset();
  loadUnifiedWork.mockReset();
  loadUnifiedWork.mockResolvedValue({ items: [], summary: { total: 0 }, sources: {} });
});

describe('GET /projects/:id/schedule-of-events — ident parsing', () => {
  it.each(['12', 'proj_12'])('resolves the numeric ident %s org-scoped', async (ident) => {
    query.mockResolvedValueOnce({ rows: [{ type: 'IND', metadata: {} }] }); // ownership gate
    const res = await request(app()).get(`/api/concept2cure/projects/${ident}/schedule-of-events`);
    expect(res.status).toBe(200);
    expect(getScheduleOfEvents).toHaveBeenCalledWith(7, 12, executionContext);
    // The ownership gate ran with the caller's org.
    expect(query.mock.calls[0][1]).toEqual([12, 7]);
  });

  it('never truncates a regulatory_programs UUID to its leading digits', async () => {
    // '7abb…' would once parseInt to 7 and read project 7's schedule. A program
    // UUID is resolved through its anchor; with none, nothing is read at all.
    requireCurrentProgramAccess.mockRejectedValueOnce(unresolved());
    const res = await request(app()).get(
      '/api/concept2cure/projects/7abb1111-2222-4333-8444-555566667777/schedule-of-events',
    );
    expect(res.status).toBe(409);
    expect(query).not.toHaveBeenCalled();
    expect(getScheduleOfEvents).not.toHaveBeenCalled();
  });

  it('400s any digit-prefixed junk ident before a single query is issued', async () => {
    const res = await request(app()).get('/api/concept2cure/projects/12abc/schedule-of-events');
    expect(res.status).toBe(400);
    expect(query).not.toHaveBeenCalled();
  });

  it('404s a project outside the caller org without revealing it exists', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app()).get('/api/concept2cure/projects/12/schedule-of-events');
    expect(res.status).toBe(404);
    expect(getScheduleOfEvents).not.toHaveBeenCalled();
  });
});

/* QA 2026-10-08 (j1): the project home holds the program's regulatory_programs
   UUID, and the Plan and Review panels never loaded — not even for a program the
   wizard had anchored to a projects row (HLV-333 → projects.id 11). The route now
   takes the program's UUID and resolves it on the server through the one anchor
   reader, org-scoped and strict; the client never parses a UUID. */
describe('program UUID → anchored project (schedule and unified work)', () => {
  const PROGRAM = 'D979E567-4622-46F1-8CB7-8BF434227F25';

  it('reads the schedule of the project the program is anchored to', async () => {
    query.mockResolvedValueOnce({ rows: [{ type: 'regulatory', metadata: {} }] }); // ownership gate
    const res = await request(app()).get(`/api/concept2cure/projects/${PROGRAM}/schedule-of-events`);
    expect(res.status).toBe(200);
    expect(requireCurrentProgramAccess).toHaveBeenCalledWith(q, {
      programId: PROGRAM.toLowerCase(),
      organizationId: 7,
      userId: 41,
    });
    expect(resolveProgramProjectAnchor).not.toHaveBeenCalled();
    // The ownership gate still runs on the resolved row, in the caller's org.
    expect(query.mock.calls[0][1]).toEqual([11, 7]);
    expect(getScheduleOfEvents).toHaveBeenCalledWith(7, 11, executionContext);
  });

  it('reads the unified work of the anchored project', async () => {
    query.mockResolvedValueOnce({ rows: [{ type: 'regulatory', metadata: {} }] });
    const res = await request(app()).get(`/api/concept2cure/projects/${PROGRAM}/unified-work`);
    expect(res.status).toBe(200);
    expect(loadUnifiedWork).toHaveBeenCalledWith({ organizationId: 7, projectId: 11 }, requestDb(received[0]));
  });

  it('answers an unresolved program with a named 409 and reads nothing', async () => {
    requireCurrentProgramAccess.mockRejectedValueOnce(unresolved());
    const res = await request(app()).get(`/api/concept2cure/projects/${PROGRAM}/unified-work`);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('PROGRAM_UNANCHORED');
    expect(query).not.toHaveBeenCalled();
    expect(loadUnifiedWork).not.toHaveBeenCalled();
  });

  it('never generates a schedule for an unanchored program', async () => {
    requireCurrentProgramAccess.mockRejectedValueOnce(unresolved());
    const res = await request(app())
      .post(`/api/concept2cure/projects/${PROGRAM}/schedule-of-events/generate`)
      .send({});
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('PROGRAM_UNANCHORED');
    expect(query).not.toHaveBeenCalled();
    expect(generateProjectSchedule).not.toHaveBeenCalled();
  });

  it('unavailable canonical admission is a 503, never "no project record"', async () => {
    requireCurrentProgramAccess.mockRejectedValueOnce(new ProgramReadAccessError(503, 'PROJECT_ACCESS_UNAVAILABLE', 'Current project access could not be verified.'));
    const res = await request(app()).get(`/api/concept2cure/projects/${PROGRAM}/schedule-of-events`);
    expect(res.status).toBe(503);
    expect(res.body.code).not.toBe('PROGRAM_UNANCHORED');
    expect(getScheduleOfEvents).not.toHaveBeenCalled();
  });
});

describe('POST /projects/:id/schedule-of-events/generate — preservation contract', () => {
  const endpoint = '/api/concept2cure/projects/12/schedule-of-events/generate';

  it('forwards the trimmed caller reason after the existing organization gate', async () => {
    query.mockResolvedValueOnce({ rows: [{ type: 'IND', metadata: {} }] });
    const res = await request(app()).post(endpoint).send({
      reason: '  Revised target agreed at the sponsor meeting.  ',
      organizationId: 99,
      projectId: 99,
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual(EMPTY_VIEW);
    expect(query.mock.calls[0][1]).toEqual([12, 7]);
    expect(generateProjectSchedule).toHaveBeenCalledExactlyOnceWith({
      orgId: 7,
      projectId: 12,
      projectType: 'IND',
      baselineDate: null,
      targetDate: null,
      goals: [],
      reason: 'Revised target agreed at the sponsor meeting.',
      triggeredBy: 'user',
      createdByAna: false,
    }, executionContext);
  });

  it.each([undefined, '', '   ', 42])('does not invent a reason from %j', async reason => {
    query.mockResolvedValueOnce({ rows: [{ type: 'IND', metadata: {} }] });
    const res = await request(app()).post(endpoint).send({ reason });
    expect(res.status).toBe(200);
    expect(generateProjectSchedule).toHaveBeenCalledOnce();
    expect(generateProjectSchedule.mock.calls[0][0].reason).toBeUndefined();
  });

  it('returns the actionable preservation conflict as 409', async () => {
    query.mockResolvedValueOnce({ rows: [{ type: 'IND', metadata: {} }] });
    const conflict = new SchedulePreservationConflict('A changed milestone requires explicit review. Nothing was changed.');
    generateProjectSchedule.mockRejectedValueOnce(conflict);
    const res = await request(app()).post(endpoint).send({ reason: 'Requested date update' });
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: conflict.message, code: 'SCHEDULE_REVIEW_REQUIRED' });
    expect(query.mock.calls[0][1]).toEqual([12, 7]);
    expect(generateProjectSchedule).toHaveBeenCalledOnce();
  });

  it.each([false, true])('keeps unexpected generation failures internal (conflict-shaped code: %s)', async shaped => {
    query.mockResolvedValueOnce({ rows: [{ type: 'IND', metadata: {} }] });
    const failure = new Error('Unexpected storage failure');
    if (shaped) Object.assign(failure, { code: 'SCHEDULE_REVIEW_REQUIRED' });
    generateProjectSchedule.mockRejectedValueOnce(failure);
    const res = await request(app()).post(endpoint).send({});
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('INTERNAL_ERROR');
    expect(res.body).not.toHaveProperty('code', 'SCHEDULE_REVIEW_REQUIRED');
    expect(JSON.stringify(res.body)).not.toContain(failure.message);
  });

  it('keeps an unexpected project-type storage failure internal instead of inventing an absent project', async () => {
    query.mockRejectedValueOnce(new Error('project type lookup lost its connection'));
    const res = await request(app()).post(endpoint).send({ reason: 'Requested date update' });
    expect(res.status).toBe(500); expect(res.body.error).toBe('INTERNAL_ERROR');
    expect(JSON.stringify(res.body)).not.toContain('lost its connection');
    expect(generateProjectSchedule).not.toHaveBeenCalled(); expect(globalQuery).not.toHaveBeenCalled();
  });

  it('refuses missing organization context before invoking generation', async () => {
    const res = await request(app(null)).post(endpoint).send({ reason: 'A reason grants no access' });
    // The existing tenant helper throws when its upstream context is absent.
    // Preserve that fail-closed internal error instead of bypassing admission.
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('INTERNAL_ERROR');
    expect(query).not.toHaveBeenCalled();
    expect(generateProjectSchedule).not.toHaveBeenCalled();
  });

  it('refuses a project outside the organization before invoking generation', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app()).post(endpoint).send({ reason: 'A reason grants no access' });
    expect(res.status).toBe(404);
    expect(query.mock.calls[0][1]).toEqual([12, 7]);
    expect(generateProjectSchedule).not.toHaveBeenCalled();
  });
});
