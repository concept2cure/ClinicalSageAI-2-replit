/**
 * DP-18's second doors (reporting review 2026-10-01, security lens).
 *
 * P1-20 closed the audit trail's main door (server/routes/audit-trail-routes.ts)
 * to organisation owners, admins and managers, and its writes to the server's
 * own event vocabulary (services/audit/audit-api-authority.ts). Three routes
 * beside it had neither:
 *
 *   - POST /api/part11/audit-trail wrote regulatory-significant audit_events
 *     rows of any type for any member, viewer included;
 *   - GET /api/mdx/audit read the organisation's whole audit_logs, with names,
 *     roles and reasons, for any member;
 *   - GET /api/mdx/search?type=audit searched it for any member.
 *
 * In production the mdx reads were stopped only by launch scope, a packaging
 * flag. Each now applies the main door's gate.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

const h = vi.hoisted(() => ({ sql: [] as string[] }));
vi.mock('../../db', () => ({
  db: {},
  pool: {
    query: async (sql: string) => {
      h.sql.push(sql.replace(/\s+/g, ' ').trim());
      return { rows: [], rowCount: 0 };
    },
  },
  getPool: () => ({}),
  getDb: () => ({}),
  query: vi.fn(),
  transaction: vi.fn(),
}));

import part11Router from '../part11-compliance';
import mdxAuditRouter from '../mdx-audit';
import mdxSearchRouter from '../mdx-search';

/** One app per role; the part11 route writes through the request's client, which records too. */
function appAs(role: string) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).user = { id: 41, email: 'someone@sponsor.example', role, organizationId: 7 };
    (req as any).dbClient = {
      query: async (sql: string) => {
        h.sql.push(sql.replace(/\s+/g, ' ').trim());
        return { rows: [{ id: 1, sequence_number: null, record_hash: null, previous_hash: null, timestamp: '2026-10-01T09:00:00.000Z' }], rowCount: 1 };
      },
    };
    next();
  });
  app.use('/api/part11', part11Router);
  app.use('/api/mdx', mdxAuditRouter);
  app.use('/api/mdx', mdxSearchRouter);
  return app;
}

const EVENT = {
  entityType: 'document',
  entityId: '123',
  action: 'artifact.updated',
  changeReason: 'Corrected the protocol number on the cover page',
};
const inserts = () => h.sql.filter((s) => /^INSERT INTO audit_events/i.test(s));
const auditReads = () => h.sql.filter((s) => /FROM audit_logs/i.test(s));

beforeEach(() => {
  h.sql.length = 0;
});

describe('POST /api/part11/audit-trail', () => {
  it.each(['viewer', 'member'])('refuses a %s with 403 and writes nothing', async (role) => {
    const res = await request(appAs(role)).post('/api/part11/audit-trail').send(EVENT);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('AUDIT_WRITE_RESTRICTED');
    expect(inserts()).toEqual([]);
  });

  it('refuses an event type outside the server vocabulary, even for an admin', async () => {
    const res = await request(appAs('admin'))
      .post('/api/part11/audit-trail')
      .send({ ...EVENT, action: 'scim.user.deprovisioned' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/not a recognised event type/);
    expect(inserts()).toEqual([]);
  });

  it('refuses a regulatory-significant entry with no reason', async () => {
    const res = await request(appAs('manager')).post('/api/part11/audit-trail').send({ ...EVENT, changeReason: undefined });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/changeReason is required/);
    expect(inserts()).toEqual([]);
  });

  it('records a vocabulary event with its reason for a manager', async () => {
    const res = await request(appAs('manager')).post('/api/part11/audit-trail').send(EVENT);
    expect(res.status).toBe(201);
    expect(inserts()).toHaveLength(1);
  });
});

describe('GET /api/mdx/audit', () => {
  it.each(['viewer', 'member'])('refuses a %s with 403 and reads nothing', async (role) => {
    const res = await request(appAs(role)).get('/api/mdx/audit');
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('AUDIT_READ_RESTRICTED');
    expect(auditReads()).toEqual([]);
  });

  it('answers an admin', async () => {
    const res = await request(appAs('admin')).get('/api/mdx/audit');
    expect(res.status).toBe(200);
    expect(auditReads().length).toBeGreaterThan(0);
  });
});

describe('GET /api/mdx/search', () => {
  it('searches no audit rows for a member, even when it asks for them', async () => {
    const res = await request(appAs('member')).get('/api/mdx/search?q=delete&type=audit,program');
    expect(res.status).toBe(200);
    expect(auditReads()).toEqual([]);
  });

  it('searches them for a manager', async () => {
    const res = await request(appAs('manager')).get('/api/mdx/search?q=delete&type=audit');
    expect(res.status).toBe(200);
    expect(auditReads()).toHaveLength(1);
  });
});
