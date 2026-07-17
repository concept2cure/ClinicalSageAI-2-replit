/**
 * GET /api/agency-meetings — agency-meetings read contract.
 *
 * The v2 AgencyMeetings surface adopts this list (and each row's nested
 * briefing book + minutes) only when the shape matches. Locks: 403 without org,
 * the { data } envelope with the display keys ({ id, type, agency, cat, program,
 * status, requested, granted, meets, clock, format, goal }, with briefing_book →
 * briefingBook), and 42P01 fail-closed to an empty list.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

const query = vi.fn();
vi.mock('../../db', () => ({ pool: { query: (...a: unknown[]) => query(...a) } }));

import agencyMeetingsRouter from '../agency-meetings.routes';

function appWith(org: number | null) {
  const app = express();
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (org !== null) (req as unknown as { user: unknown }).user = { organizationId: org };
    next();
  });
  app.use('/api/agency-meetings', agencyMeetingsRouter);
  return app;
}

beforeEach(() => query.mockReset());

describe('GET /api/agency-meetings', () => {
  it('403 without org context', async () => {
    const res = await request(appWith(null)).get('/api/agency-meetings');
    expect(res.status).toBe(403);
  });

  it('returns meetings shaped to the display contract (briefing_book → briefingBook)', async () => {
    query.mockResolvedValueOnce({
      rows: [
        {
          id: 'm1', type: 'Pre-IND', agency: 'FDA · CDER', cat: 'Type B', program: 'BX-204 · IND',
          status: 'granted', requested: '2026-05-02', granted: '2026-05-20', meets: '2026-07-08',
          clock: 'WRR due 2026-06-24', format: 'Written responses + teleconference',
          goal: 'Align on the nonclinical package and Phase 1 design before IND.',
          briefing_book: { title: 'Pre-IND briefing book · BX-204', ver: 'v0.8', sections: [], questions: [] },
          minutes: null,
        },
        {
          id: 'm2', type: 'End-of-Phase-2', agency: 'FDA · CDER', cat: 'Type B (EOP2)', program: 'BX-204 · NDA',
          status: 'requested', requested: '2026-06-10', granted: null, meets: null,
          clock: 'FDA grant/deny due 2026-06-31', format: 'Face-to-face',
          goal: 'Agree the Phase 3 pivotal design, endpoints, and the SAP.',
          briefing_book: null, minutes: null,
        },
      ],
    });
    const res = await request(appWith(7)).get('/api/agency-meetings');
    expect(res.status).toBe(200);
    expect(query.mock.calls[0][1]).toEqual([7]);
    const first = res.body.data[0];
    for (const k of ['id', 'type', 'agency', 'cat', 'program', 'status', 'requested', 'granted', 'meets', 'clock', 'format', 'goal']) {
      expect(first).toHaveProperty(k);
    }
    expect(first.briefingBook).toEqual({ title: 'Pre-IND briefing book · BX-204', ver: 'v0.8', sections: [], questions: [] });
    expect(res.body.data[1].granted).toBeNull();
    expect(res.body.data[1].briefingBook).toBeNull();
    expect(res.body.meta.count).toBe(2);
  });

  it('fails closed to an empty list when the store is not provisioned', async () => {
    query.mockRejectedValueOnce(Object.assign(new Error('relation missing'), { code: '42P01' }));
    const res = await request(appWith(7)).get('/api/agency-meetings');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.meta.pendingStore).toBe(true);
  });
});
