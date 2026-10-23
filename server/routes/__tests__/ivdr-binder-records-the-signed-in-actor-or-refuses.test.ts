/**
 * The IVDR binder routes record the signed-in user as the actor of every write
 * and audit row, or refuse (401) before anything is written.
 *
 * What they used to do (until 2026-10-15): getUserId fell back to 'system',
 * the stored *_by_user_id columns took 'system', and emitAuditEvent wrote
 * user_id `Number(userId) || 0` — an audit row naming user 0.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

vi.mock('../../services/storage/index.js', () => ({ getStorageProvider: () => ({}) }));
import createIVDRBinderRoutes from '../ivdr-binder-routes';

const query = vi.fn(async (sql: string, _params?: unknown[]) => {
  if (/INSERT INTO ivdr_binder_claims/.test(sql)) return { rows: [{ id: 'claim-1', is_insert: true }] };
  if (/INSERT INTO ivdr_pack_build_jobs/.test(sql)) return { rows: [{ id: 'job-1' }] };
  return { rows: [] };
});
const pool = { query } as unknown as import('pg').Pool;

function app(user: Record<string, unknown> | null) {
  const a = express();
  a.use(express.json());
  a.use((req: Request, _res: Response, next: NextFunction) => {
    (req as any).tenantId = 7;
    if (user) Object.assign(req as any, user);
    (req as any).ivdrPermissions = new Set(['*']);
    next();
  });
  a.use('/api/ivdr', createIVDRBinderRoutes(pool));
  return a;
}
const claim = { projectId: 'prog-1', claimKey: 'k1', title: 'Claim' };
const audits = () => query.mock.calls.filter(([sql]) => /INSERT INTO audit_events/.test(sql));

beforeEach(() => query.mockClear());

describe('a binder write names the signed-in user', () => {
  it('audits user 42 and stores 42 as the author', async () => {
    const res = await request(app({ userId: 42 })).post('/api/ivdr/binder/claim').send(claim);
    expect(res.status).toBe(200);
    expect(audits()[0][1]![2]).toBe(42);
    const insert = query.mock.calls.find(([sql]) => /INSERT INTO ivdr_binder_claims/.test(sql))!;
    expect(insert[1]![9]).toBe('42');
  });

  it.each([
    ['no user', null],
    ['a non-numeric subject', { user: { id: 'abc' } }],
    ['user id 0', { userId: 0 }],
  ])('%s: 401, nothing written, no audit row naming user 0', async (_label, user) => {
    const res = await request(app(user)).post('/api/ivdr/binder/claim').send(claim);
    expect(res.status, 'a write with no identifiable user was accepted').toBe(401);
    expect(query).not.toHaveBeenCalled();
  });

  it('a pack build request with no user is refused before a job is queued', async () => {
    const res = await request(app(null)).post('/api/ivdr/packs/build').send({ projectId: 'prog-1' });
    expect(res.status).toBe(401);
    expect(query).not.toHaveBeenCalled();
  });
});
