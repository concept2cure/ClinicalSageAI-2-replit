/**
 * POST /api/agency-meetings — agency-meetings write contract.
 *
 * The v2 AgencyMeetings surface POSTs a new meeting request here once its read
 * has adopted the store. Locks: 403 without org, an org-scoped INSERT that
 * returns the created row in the surface's display shape (briefing_book →
 * briefingBook) with a 201 { data, meta:{created} } envelope, and 42P01 →
 * 503 PENDING_STORE so the client falls back to local-only behavior.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

const query = vi.fn();
vi.mock('../../db', () => ({ pool: { query: (...a: unknown[]) => query(...a) } }));

import agencyMeetingsRouter from '../agency-meetings.routes';

function appWith(org: number | null) {
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (org !== null) (req as unknown as { user: unknown }).user = { organizationId: org };
    next();
  });
  app.use('/api/agency-meetings', agencyMeetingsRouter);
  return app;
}

const validBody = {
  type: 'Pre-IND',
  agency: 'FDA · CDER',
  program: 'BX-204 · IND',
  format: 'Teleconference',
  requested: '2026-08-01',
  goal: 'Align on the nonclinical package before IND.',
};

beforeEach(() => query.mockReset());

describe('POST /api/agency-meetings', () => {
  it('403 without org context', async () => {
    const res = await request(appWith(null)).post('/api/agency-meetings').send(validBody);
    expect(res.status).toBe(403);
    expect(query).not.toHaveBeenCalled();
  });

  it('400 when a required field is missing', async () => {
    const res = await request(appWith(7)).post('/api/agency-meetings').send({ agency: 'FDA · CDER' });
    expect(res.status).toBe(400);
    expect(query).not.toHaveBeenCalled();
  });

  it('inserts org-scoped and returns the created row in display shape', async () => {
    query.mockResolvedValueOnce({
      rows: [
        {
          id: 'mtg-123', type: 'Pre-IND', agency: 'FDA · CDER', cat: 'Pre-IND',
          program: 'BX-204 · IND', status: 'requested', requested: '2026-08-01',
          granted: null, meets: null, clock: 'FDA grant/deny pending',
          format: 'Teleconference', goal: 'Align on the nonclinical package before IND.',
          briefing_book: null, minutes: null,
        },
      ],
    });

    const res = await request(appWith(7)).post('/api/agency-meetings').send(validBody);

    expect(res.status).toBe(201);
    expect(res.body.meta.created).toBe(true);

    // INSERT was called; params carry the org id and generated id + fields.
    expect(query).toHaveBeenCalledTimes(1);
    const sql = query.mock.calls[0][0] as string;
    expect(sql).toMatch(/INSERT INTO c2c_agency_meetings/);
    const params = query.mock.calls[0][1] as unknown[];
    expect(params[0]).toMatch(/^mtg-/); // id
    expect(params[1]).toBe(7); // organization_id
    expect(params).toContain('Pre-IND');
    expect(params).toContain('FDA · CDER');
    expect(params).toContain('BX-204 · IND');
    expect(params).toContain('requested'); // status default

    // Response is the created row mapped to the display shape.
    const data = res.body.data;
    for (const k of ['id', 'type', 'agency', 'cat', 'program', 'status', 'requested', 'granted', 'meets', 'clock', 'format', 'goal']) {
      expect(data).toHaveProperty(k);
    }
    expect(data.id).toBe('mtg-123');
    expect(data.status).toBe('requested');
    expect(data.briefingBook).toBeNull();
    expect(data.minutes).toBeNull();
  });

  it('defaults cat to type and format to Teleconference when omitted', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 'mtg-1', type: 'Type B', cat: 'Type B', status: 'requested', clock: 'FDA grant/deny pending', format: 'Teleconference' }] });
    await request(appWith(3)).post('/api/agency-meetings').send({
      type: 'Type B', agency: 'FDA · CDER', program: 'BX-204 · NDA', goal: 'Discuss pivotal design.',
    });
    const params = query.mock.calls[0][1] as unknown[];
    expect(params).toContain('Type B'); // cat fell back to type
    expect(params).toContain('Teleconference'); // format default
  });

  it('42P01 → 503 PENDING_STORE (store not provisioned)', async () => {
    query.mockRejectedValueOnce(Object.assign(new Error('relation missing'), { code: '42P01' }));
    const res = await request(appWith(7)).post('/api/agency-meetings').send(validBody);
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('PENDING_STORE');
  });
});
