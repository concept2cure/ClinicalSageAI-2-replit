/**
 * /api/concept2cure/projects/:id/schedule-of-events — ident contract.
 *
 * The schedule store is keyed by the NUMERIC projects.id. The route's id parser
 * used to be `parseInt(raw.replace('proj_', ''))`, which truncated arbitrary
 * idents to their leading digits — so a regulatory_programs UUID like
 * '7abb…' (the id-space the v2 surfaces hold in window.C2C_PROJECT) silently
 * resolved to project 7 and served ANOTHER project's schedule inside the same
 * org. These lock the fail-closed parse: '12' and 'proj_12' resolve; anything
 * else is a 400 before a single query is issued.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

const query = vi.fn();
vi.mock('../../db', () => ({ pool: { query: (...a: unknown[]) => query(...a) } }));

const getScheduleOfEvents = vi.fn();
vi.mock('../../services/projects/schedule-of-events', () => ({
  getScheduleOfEvents: (...a: unknown[]) => getScheduleOfEvents(...(a as [])),
  generateProjectSchedule: vi.fn(),
  amendMilestone: vi.fn(),
  resetProjectGoals: vi.fn(),
  reviewScheduleHealth: vi.fn(),
}));
vi.mock('../../services/unified-work/unified-work-view', () => ({
  loadUnifiedWork: vi.fn(),
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

  it('400s a regulatory_programs UUID instead of truncating it to a numeric id', async () => {
    // '7abb…' would previously parseInt to 7 and read project 7's schedule.
    const res = await request(app()).get(
      '/api/concept2cure/projects/7abb1111-2222-4333-8444-555566667777/schedule-of-events',
    );
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid project id');
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
