/**
 * AnA onboarding commit route (server/routes/onboarding-ingest.ts).
 *
 * Locks the P3 governed-commit contract: org-admin gated, tenant-scoped, ONLY
 * human-approved fields that map to a governed org-profile column are written,
 * everything else is reported honestly (never silently written), and the write
 * is audited "AnA on behalf of user" with the proposal provenance + confidence.
 * The db / audit / auth are mocked so the REAL router logic runs.
 */
import express from 'express';
import request from 'supertest';
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';

const logActionMock = vi.fn();

type Row = Record<string, unknown>;
let nextSelectRows: Row[] = [];
let nextUpdateRows: Row[] = [];
const lastUpdate: { values?: Row } = {};

function chainableSelect() {
  const ret: any = {};
  ret.from = () => ret;
  ret.where = () => ret;
  ret.limit = () => ret;
  ret.then = (resolve: (v: Row[]) => unknown) => Promise.resolve(resolve(nextSelectRows));
  return ret;
}
function chainableUpdate() {
  const ret: any = {};
  ret.set = (v: Row) => { lastUpdate.values = v; return ret; };
  ret.where = () => ret;
  ret.returning = () => Promise.resolve(nextUpdateRows);
  return ret;
}

vi.mock('../../db', () => ({ db: { select: () => chainableSelect(), update: () => chainableUpdate() } }));
vi.mock('@shared/schema', () => {
  const fakeTable = (name: string) => ({ _: { name } });
  return {
    organizations: Object.assign(fakeTable('organizations'), {
      id: 'id', name: 'name', clientType: 'client_type', industryMode: 'industry_mode', updatedAt: 'updated_at',
    }),
  };
});
vi.mock('../../services/auditService', () => ({ default: { logAction: (...a: unknown[]) => logActionMock(...a) } }));
vi.mock('../../auth', () => ({
  authMiddleware: (req: any, _res: any, next: any) => {
    const hdr = req.headers['x-test-user'];
    if (hdr) { const u = JSON.parse(hdr); req.user = u; req.userRole = u.role; req.userId = u.id; }
    next();
  },
}));

let app: express.Express;
beforeAll(async () => {
  const router = (await import('../onboarding-ingest')).default;
  app = express();
  app.use(express.json());
  app.use('/api/onboarding', router);
});
beforeEach(() => {
  logActionMock.mockReset();
  nextSelectRows = [{ name: 'Old Co', clientType: 'pharma', industryMode: 'rx' }];
  nextUpdateRows = [{ name: 'Meridian Therapeutics', clientType: 'biotech', industryMode: 'onc' }];
  lastUpdate.values = undefined;
});

const admin = JSON.stringify({ id: 7, organizationId: 2, role: 'admin' });
const member = JSON.stringify({ id: 8, organizationId: 2, role: 'viewer' });

const field = (over: Record<string, unknown> = {}) => ({
  id: 'f1', entity: 'org_profile', targetField: 'org_profile.name', label: 'Name',
  value: 'Meridian Therapeutics', extractedValue: 'Meridian Therapeutics',
  provenance: { file: 'profile.pdf', page: 1 }, confidence: 0.93, status: 'approved', ...over,
});

describe('POST /api/onboarding/commit — governed onboarding commit', () => {
  it('400s without an organization context', async () => {
    const res = await request(app).post('/api/onboarding/commit')
      .set('x-test-user', JSON.stringify({ id: 7, role: 'admin' }))
      .send({ approved: [field()], reason: 'apply reviewed onboarding' });
    expect(res.status).toBe(400);
  });

  it('403s a non-admin member (fail-closed authorization)', async () => {
    const res = await request(app).post('/api/onboarding/commit')
      .set('x-test-user', member)
      .send({ approved: [field()], reason: 'apply reviewed onboarding' });
    expect(res.status).toBe(403);
    expect(logActionMock).not.toHaveBeenCalled();
  });

  it('400s without a reason', async () => {
    const res = await request(app).post('/api/onboarding/commit')
      .set('x-test-user', admin)
      .send({ approved: [field()] });
    expect(res.status).toBe(400);
  });

  it('applies approved org-profile fields via a governed, AnA-attributed audit', async () => {
    const res = await request(app).post('/api/onboarding/commit')
      .set('x-test-user', admin)
      .send({
        approved: [
          field({ targetField: 'org_profile.name', value: 'Meridian Therapeutics' }),
          field({ id: 'f2', targetField: 'org_profile.clientType', value: 'biotech' }),
        ],
        reason: 'Applied AnA onboarding proposals after review',
      });
    expect(res.status).toBe(200);
    expect(res.body.data.writes).toContain('organizations.profile');
    expect(res.body.data.failures).toBe(0);
    // Only the mapped governed columns were set.
    expect(lastUpdate.values).toMatchObject({ name: 'Meridian Therapeutics', clientType: 'biotech' });
    // Audited "AnA on behalf of user" with before/after + provenance + reason.
    expect(logActionMock).toHaveBeenCalledTimes(1);
    const entry = logActionMock.mock.calls[0][0];
    expect(entry.userId).toBe(7);
    expect(entry.details.actorKind).toBe('ana_on_behalf_of_user');
    expect(entry.details.reason).toContain('review');
    expect(entry.details.proposals[0].provenance.file).toBe('profile.pdf');
  });

  it('never writes a non-governed target — reports it honestly instead', async () => {
    const res = await request(app).post('/api/onboarding/commit')
      .set('x-test-user', admin)
      .send({
        approved: [field({ entity: 'program', targetField: 'program.code', value: 'MER-204' })],
        reason: 'apply',
      });
    expect(res.status).toBe(200);
    expect(res.body.data.writes).toEqual([]); // no governed path -> no write
    expect(res.body.data.failures).toBe(1);
    expect(res.body.data.applied[0].ok).toBe(false);
    expect(logActionMock).not.toHaveBeenCalled();
  });

  it('skips a non-approved field and an invalid client type (honest partial result)', async () => {
    const res = await request(app).post('/api/onboarding/commit')
      .set('x-test-user', admin)
      .send({
        approved: [
          field({ targetField: 'org_profile.name', value: 'Meridian Therapeutics', status: 'approved' }),
          field({ id: 'f2', targetField: 'org_profile.name', value: 'X', status: 'proposed' }), // not approved
          field({ id: 'f3', targetField: 'org_profile.clientType', value: 'not-a-type' }), // invalid enum
        ],
        reason: 'apply reviewed',
      });
    expect(res.status).toBe(200);
    expect(res.body.data.failures).toBe(2);
    expect(lastUpdate.values).toMatchObject({ name: 'Meridian Therapeutics' });
    expect(lastUpdate.values.clientType).toBeUndefined();
  });
});
