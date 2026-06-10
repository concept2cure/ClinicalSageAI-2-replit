/**
 * Contract test for the SIEM audit feed (server/routes/admin/audit-siem.ts).
 *
 * Verifies admin gating, that every query is org-scoped from the JWT (never
 * from request input), cursor/limit handling, NDJSON + JSON shapes, and that
 * hash-chain integrity fields are carried through. Data layer is mocked.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.hoisted(() => {
  process.env.NODE_ENV = process.env.NODE_ENV || 'test';
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-padded-to-at-least-32-chars-long';
});

import express from 'express';
import request from 'supertest';

const { queryMock, state } = vi.hoisted(() => ({
  queryMock: vi.fn(),
  state: { role: 'super_admin' as string, orgId: 7 as number },
}));

vi.mock('../../db', () => ({ query: queryMock }));
vi.mock('../../auth', () => ({
  authMiddleware: (req: { user?: unknown }, _res: unknown, next: () => void) => {
    (req as { user?: unknown }).user = {
      id: 1,
      role: state.role,
      roles: [state.role],
      organizationId: state.orgId,
    };
    next();
  },
}));

const SAMPLE_ROW = {
  id: 101,
  sequence_number: 55,
  event_type: 'scim.user.deactivated',
  entity_type: 'user',
  entity_id: 42,
  user_id: 9,
  user_name: 'okta-provisioner',
  user_role: 'system',
  ip_address: '10.0.0.1',
  timestamp: '2026-06-10T00:00:00.000Z',
  timestamp_utc: '2026-06-10T00:00:00.000Z',
  reason: 'IdP deprovision',
  regulatory_significant: true,
  gxp_relevant: true,
  record_hash: 'a'.repeat(64),
  previous_hash: 'b'.repeat(64),
  metadata: { source: 'scim' },
};

let app: express.Express;

beforeEach(async () => {
  vi.clearAllMocks();
  state.role = 'super_admin';
  state.orgId = 7;
  const router = (await import('../../routes/admin/audit-siem')).default;
  app = express();
  app.use(express.json());
  app.use('/api/admin/audit', router);
});

function firstSelect() {
  return queryMock.mock.calls.find(c => /FROM audit_events/i.test(String(c[0])));
}

describe('SIEM audit feed', () => {
  it('forbids non-admins (403)', async () => {
    state.role = 'member';
    const res = await request(app).get('/api/admin/audit/siem');
    expect(res.status).toBe(403);
  });

  it('returns NDJSON scoped to the JWT org, with the next-cursor header', async () => {
    queryMock.mockResolvedValue({ rows: [SAMPLE_ROW] });
    const res = await request(app).get('/api/admin/audit/siem');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/x-ndjson/);
    expect(res.headers['x-audit-next-cursor']).toBe('101');
    expect(res.headers['x-audit-count']).toBe('1');

    // org id is bound from the JWT ($1), never from request input
    const select = firstSelect();
    expect(select).toBeTruthy();
    expect((select![1] as unknown[])[0]).toBe(7);

    const lines = String(res.text).trim().split('\n').filter(Boolean);
    expect(lines).toHaveLength(1);
    const event = JSON.parse(lines[0]);
    // hash-chain integrity fields are carried through
    expect(event.recordHash).toMatch(/^a{64}$/);
    expect(event.previousHash).toMatch(/^b{64}$/);
    expect(event.sequenceNumber).toBe(55);
    expect(event.eventType).toBe('scim.user.deactivated');
  });

  it('honours the ?after cursor (passed as the $2 bind, not an org id)', async () => {
    queryMock.mockResolvedValue({ rows: [] });
    await request(app).get('/api/admin/audit/siem?after=500');
    const select = firstSelect();
    expect((select![1] as unknown[])[0]).toBe(7); // org still from JWT
    expect((select![1] as unknown[])[1]).toBe(500); // cursor from query
  });

  it('clamps limit to the 1..1000 range', async () => {
    queryMock.mockResolvedValue({ rows: [] });
    await request(app).get('/api/admin/audit/siem?limit=99999');
    const params = firstSelect()![1] as unknown[];
    // limit is the last bind param
    expect(params[params.length - 1]).toBe(1000);
  });

  it('format=json returns an envelope with events + cursor', async () => {
    queryMock.mockResolvedValue({ rows: [SAMPLE_ROW] });
    const res = await request(app).get('/api/admin/audit/siem?format=json');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body.count).toBe(1);
    expect(res.body.nextCursor).toBe(101);
    expect(res.body.events[0].entityId).toBe(42);
  });

  it('filters by eventType when provided', async () => {
    queryMock.mockResolvedValue({ rows: [] });
    await request(app).get('/api/admin/audit/siem?eventType=user.login');
    const params = firstSelect()![1] as unknown[];
    expect(params).toContain('user.login');
    expect(String(firstSelect()![0])).toMatch(/event_type = \$/);
  });

  it('/siem/head reports the org tip (org-scoped)', async () => {
    queryMock.mockResolvedValue({ rows: [{ latest_id: 101, latest_sequence: 55, total: 12 }] });
    const res = await request(app).get('/api/admin/audit/siem/head');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ latestId: 101, latestSequence: 55, total: 12 });
    const headCall = queryMock.mock.calls.find(c => /MAX\(id\)/i.test(String(c[0])));
    expect((headCall![1] as unknown[])[0]).toBe(7);
  });
});
