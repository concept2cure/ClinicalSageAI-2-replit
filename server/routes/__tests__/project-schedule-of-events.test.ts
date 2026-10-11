/**
 * /api/concept2cure/projects/:id/schedule-of-events — ident contract.
 *
 * The schedule store is keyed by the NUMERIC projects.id. The route's id parser
 * used to be `parseInt(raw.replace('proj_', ''))`, which truncated arbitrary
 * idents to their leading digits — so a regulatory_programs UUID like
 * '7abb…' (the id-space the v2 surfaces hold in window.C2C_PROJECT) silently
 * resolved to project 7 and served ANOTHER project's schedule inside the same
 * org. These lock the fail-closed parse: '12' and 'proj_12' resolve; a program
 * UUID resolves through its anchor on the server (or is a named 404 when it has
 * none); anything else is a 400 before a single query is issued.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

const query = vi.fn();
const anchorDb = vi.hoisted(() => ({ __anchorDb: true }));
vi.mock('../../db', () => ({ pool: { query: (...a: unknown[]) => query(...a) }, db: anchorDb }));

/* The program ↔ project anchor (services/c2c/program-project-anchor.ts) is the
   one reader of projects.regulatory_program_id. Stubbed here so these tests pin
   what the ROUTE does with its answer; the reader's own SQL is tested beside it. */
const resolveProgramProjectAnchor = vi.fn();
vi.mock('../../services/c2c/program-project-anchor', () => ({
  resolveProgramProjectAnchor: (...a: unknown[]) => resolveProgramProjectAnchor(...a),
}));

const getScheduleOfEvents = vi.fn();
vi.mock('../../services/projects/schedule-of-events', () => ({
  getScheduleOfEvents: (...a: unknown[]) => getScheduleOfEvents(...(a as [])),
  generateProjectSchedule: vi.fn(),
  amendMilestone: vi.fn(),
  resetProjectGoals: vi.fn(),
  reviewScheduleHealth: vi.fn(),
}));
const loadUnifiedWork = vi.fn();
vi.mock('../../services/unified-work/unified-work-view', () => ({
  loadUnifiedWork: (...a: unknown[]) => loadUnifiedWork(...a),
}));

import router from '../project-schedule-of-events';

const EMPTY_VIEW = { plan: null, milestones: [], goals: [], revisions: [], health: {} };

function app(orgId: number | null = 7) {
  const a = express();
  a.use(express.json());
  a.use((req: Request, _res: Response, next: NextFunction) => {
    if (orgId !== null) (req as unknown as { tenantId: number }).tenantId = orgId;
    next();
  });
  a.use('/api/concept2cure', router);
  return a;
}

beforeEach(() => {
  query.mockReset();
  getScheduleOfEvents.mockReset();
  getScheduleOfEvents.mockResolvedValue(EMPTY_VIEW);
  resolveProgramProjectAnchor.mockReset();
  loadUnifiedWork.mockReset();
  loadUnifiedWork.mockResolvedValue({ items: [], summary: { total: 0 }, sources: {} });
});

describe('GET /projects/:id/schedule-of-events — ident parsing', () => {
  it.each(['12', 'proj_12'])('resolves the numeric ident %s org-scoped', async (ident) => {
    query.mockResolvedValueOnce({ rows: [{ type: 'IND', metadata: {} }] }); // ownership gate
    const res = await request(app()).get(`/api/concept2cure/projects/${ident}/schedule-of-events`);
    expect(res.status).toBe(200);
    expect(getScheduleOfEvents).toHaveBeenCalledWith(7, 12);
    // The ownership gate ran with the caller's org.
    expect(query.mock.calls[0][1]).toEqual([12, 7]);
  });

  it('never truncates a regulatory_programs UUID to its leading digits', async () => {
    // '7abb…' would once parseInt to 7 and read project 7's schedule. A program
    // UUID is resolved through its anchor; with none, nothing is read at all.
    resolveProgramProjectAnchor.mockResolvedValueOnce(null);
    const res = await request(app()).get(
      '/api/concept2cure/projects/7abb1111-2222-4333-8444-555566667777/schedule-of-events',
    );
    expect(res.status).toBe(404);
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
    resolveProgramProjectAnchor.mockResolvedValueOnce(11);
    query.mockResolvedValueOnce({ rows: [{ type: 'regulatory', metadata: {} }] }); // ownership gate
    const res = await request(app()).get(`/api/concept2cure/projects/${PROGRAM}/schedule-of-events`);
    expect(res.status).toBe(200);
    expect(resolveProgramProjectAnchor).toHaveBeenCalledWith(anchorDb, {
      programId: PROGRAM.toLowerCase(),
      orgId: 7,
      context: 'schedule-of-events',
      strict: true,
    });
    // The ownership gate still runs on the resolved row, in the caller's org.
    expect(query.mock.calls[0][1]).toEqual([11, 7]);
    expect(getScheduleOfEvents).toHaveBeenCalledWith(7, 11);
  });

  it('reads the unified work of the anchored project', async () => {
    resolveProgramProjectAnchor.mockResolvedValueOnce(11);
    query.mockResolvedValueOnce({ rows: [{ type: 'regulatory', metadata: {} }] });
    const res = await request(app()).get(`/api/concept2cure/projects/${PROGRAM}/unified-work`);
    expect(res.status).toBe(200);
    expect(loadUnifiedWork).toHaveBeenCalledWith({ organizationId: 7, projectId: 11 });
  });

  it('answers an unanchored program with a named 404 and reads nothing', async () => {
    resolveProgramProjectAnchor.mockResolvedValueOnce(null);
    const res = await request(app()).get(`/api/concept2cure/projects/${PROGRAM}/unified-work`);
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('PROGRAM_UNANCHORED');
    expect(query).not.toHaveBeenCalled();
    expect(loadUnifiedWork).not.toHaveBeenCalled();
  });

  it('never generates a schedule for an unanchored program', async () => {
    resolveProgramProjectAnchor.mockResolvedValueOnce(null);
    const res = await request(app())
      .post(`/api/concept2cure/projects/${PROGRAM}/schedule-of-events/generate`)
      .send({});
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('PROGRAM_UNANCHORED');
    expect(query).not.toHaveBeenCalled();
  });

  it('a lookup that could not complete is a 500, never "no project record"', async () => {
    resolveProgramProjectAnchor.mockRejectedValueOnce(new Error('connection terminated'));
    const res = await request(app()).get(`/api/concept2cure/projects/${PROGRAM}/schedule-of-events`);
    expect(res.status).toBe(500);
    expect(res.body.code).not.toBe('PROGRAM_UNANCHORED');
    expect(getScheduleOfEvents).not.toHaveBeenCalled();
  });
});
