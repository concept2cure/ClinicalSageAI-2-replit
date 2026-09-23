/**
 * /api/stability — the create, update and status paths say what happened.
 *
 * Until 2026-09-22:
 *   · POST /studies wrote status 'DRAFT' when none was sent, which
 *     stab_studies_status_check (ONGOING | ON_HOLD | COMPLETED) rejects, and
 *     wrote 'PAUSED' verbatim — every create a client could send was a 500;
 *   · a storage condition other than LT/ACC/INT was written with an invented
 *     '5°C';
 *   · the create's audit record was written AFTER COMMIT on another
 *     connection, so an audit failure left a committed, unaudited study;
 *   · PUT /studies/:id and PATCH /studies/:id/status answered "updated
 *     successfully" and wrote nothing.
 *
 * The database behaviour is recorded against a real provisioned database in
 * docs/evidence/W2/2026-09-22/stability-router-honesty.txt. These cases pin
 * the branches that decide before any query runs.
 */
import { describe, it, expect, vi } from 'vitest';
import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';

const { connect } = vi.hoisted(() => ({ connect: vi.fn() }));
vi.mock('../../db', () => ({ getPool: () => ({ connect, query: vi.fn() }), pool: { connect, query: vi.fn() } }));

import router, { toStabStudyStatus, STAB_PLANNED_CONDITIONS } from '../stability.router';

function app(user: unknown = { id: 1, email: 'qa@example.test' }) {
  const a = express();
  a.use(express.json());
  a.use((req: Request, _res: Response, next: NextFunction) => {
    (req as any).user = user;
    (req as any).tenantId = 1;
    next();
  });
  a.use('/api/stability', router);
  return a;
}
const body = (extra: Record<string, unknown> = {}) => ({
  productName: 'P', batchNumber: 'B', storageConditions: ['LT'], duration: 12, startDate: '2026-01-01', ...extra,
});

describe('study status is the table\'s vocabulary', () => {
  it('maps client words onto the constraint and defaults to the column default', () => {
    expect(toStabStudyStatus(undefined)).toBe('ONGOING');
    expect(toStabStudyStatus('')).toBe('ONGOING');
    expect(toStabStudyStatus('ACTIVE')).toBe('ONGOING');
    expect(toStabStudyStatus('paused')).toBe('ON_HOLD');
    expect(toStabStudyStatus('COMPLETED')).toBe('COMPLETED');
  });

  it('refuses a state the table cannot hold rather than storing a different one', () => {
    expect(toStabStudyStatus('DRAFT')).toBeNull();
    expect(toStabStudyStatus('CANCELLED')).toBeNull();
  });

  it('plans only the ICH Q1A conditions it has settings for', () => {
    expect(Object.keys(STAB_PLANNED_CONDITIONS).sort()).toEqual(['ACC', 'INT', 'LT']);
    expect(STAB_PLANNED_CONDITIONS.LT).toEqual({ temp: '25°C', rh: '60%' });
  });
});

describe('a create that cannot be recorded honestly is refused before any write', () => {
  it('400 for DRAFT, without taking a connection', async () => {
    connect.mockClear();
    const res = await request(app()).post('/api/stability/studies').send(body({ status: 'DRAFT' }));
    expect(res.status).toBe(400);
    expect(connect).not.toHaveBeenCalled();
  });

  it('400 for a storage condition with no defined setting (no invented 5°C)', async () => {
    connect.mockClear();
    const res = await request(app()).post('/api/stability/studies').send(body({ storageConditions: ['REF'] }));
    expect(res.status).toBe(400);
    expect(connect).not.toHaveBeenCalled();
  });

  it('401 without a verified actor, because the study could not be audited', async () => {
    connect.mockClear();
    const res = await request(app(null)).post('/api/stability/studies').send(body());
    expect(res.status).toBe(401);
    expect(connect).not.toHaveBeenCalled();
  });
});

describe('updates that are not implemented say so', () => {
  it('PUT /studies/:id is 501 and states nothing changed', async () => {
    const res = await request(app()).put('/api/stability/studies/x').send({ name: 'n' });
    expect(res.status).toBe(501);
    expect(res.body.message).toMatch(/Nothing was changed/);
  });

  it('PATCH /studies/:id/status is 501, not "updated successfully"', async () => {
    const res = await request(app()).patch('/api/stability/studies/x/status').send({ status: 'COMPLETED' });
    expect(res.status).toBe(501);
    expect(JSON.stringify(res.body)).not.toMatch(/successfully/);
  });
});
