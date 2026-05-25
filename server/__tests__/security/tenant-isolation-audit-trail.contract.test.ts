/**
 * Tenant-isolation contract test — Audit Trail family.
 *
 * Regression guard for a cross-tenant IDOR on 21 CFR Part 11 audit data:
 * server/routes/audit-trail-routes.ts previously scoped reads by a
 * user-supplied req.query.org_id (omit it → every org's audit trail; pass a
 * foreign id → that org's trail) and wrote events/signatures with an org id
 * taken from the request body. Every audit read and write must instead source
 * the organization from the authenticated JWT (requireAuthedOrgId) and ignore
 * any client-supplied org.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.hoisted(() => {
  process.env.NODE_ENV = process.env.NODE_ENV || 'test';
  process.env.JWT_SECRET =
    process.env.JWT_SECRET || 'stage3-test-secret-padded-to-32-chars-or-more-okay';
});

import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import request from 'supertest';

const { ORG_A, ATTACKER_TARGET_ORG, calls, authState } = vi.hoisted(() => ({
  ORG_A: 7,
  ATTACKER_TARGET_ORG: 999,
  calls: [] as Array<{ sql: string; params: any[] }>,
  authState: { orgId: 7 as number | null },
}));

const mockPool = {
  query: vi.fn(async (sql: string, params: any[] = []) => {
    calls.push({ sql, params });
    if (/COUNT/i.test(sql)) return { rows: [{ total: 0 }] };
    if (/INSERT/i.test(sql)) return { rows: [{ id: 1 }] };
    // signature verify select
    if (/signature\.create/.test(sql)) return { rows: [] };
    return { rows: [] };
  }),
} as any;

let app: express.Express;

beforeEach(async () => {
  vi.clearAllMocks();
  calls.length = 0;
  authState.orgId = ORG_A;

  const { createAuditTrailRoutes } = await import('../../routes/audit-trail-routes');
  app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (authState.orgId != null) (req as any).user = { id: 1, organizationId: authState.orgId };
    next();
  });
  app.use('/api', createAuditTrailRoutes(mockPool));
});

const auditSelects = () =>
  calls.filter(c => /FROM audit_events/i.test(c.sql) && !/COUNT/i.test(c.sql));
const auditInserts = () => calls.filter(c => /INSERT INTO audit_events/i.test(c.sql));
const allParams = () => calls.flatMap(c => c.params);

describe('Tenant isolation — Audit reads', () => {
  it('GET /audit/logs scopes to the JWT org and ignores a spoofed query org_id', async () => {
    const res = await request(app).get(`/api/audit/logs?org_id=${ATTACKER_TARGET_ORG}`);
    expect(res.status).toBe(200);
    // Every audit query carries organization_id = $1 = the authed org…
    for (const c of [...auditSelects(), ...calls.filter(c => /COUNT/i.test(c.sql))]) {
      expect(c.sql).toMatch(/organization_id = \$1/);
      expect(c.params[0]).toBe(ORG_A);
    }
    // …and the attacker's target org id never reaches the query.
    expect(allParams()).not.toContain(ATTACKER_TARGET_ORG);
    expect(allParams()).not.toContain(String(ATTACKER_TARGET_ORG));
  });

  it('GET /audit/events and /audit are JWT-scoped too', async () => {
    await request(app).get(`/api/audit/events?org_id=${ATTACKER_TARGET_ORG}`).expect(200);
    await request(app).get(`/api/audit?tenantId=${ATTACKER_TARGET_ORG}`).expect(200);
    expect(allParams()).not.toContain(ATTACKER_TARGET_ORG);
    for (const c of auditSelects()) expect(c.params[0]).toBe(ORG_A);
  });

  it('signature verify is scoped by organization_id', async () => {
    await request(app).get('/api/audit/signatures/SIG_5/verify').expect(404);
    const sel = calls.find(c => /signature\.create/.test(c.sql));
    expect(sel).toBeTruthy();
    expect(sel!.sql).toMatch(/organization_id = \$2/);
    expect(sel!.params).toEqual([5, ORG_A]);
  });

  it('returns 403 when there is no authenticated org context', async () => {
    authState.orgId = null;
    for (const path of ['/api/audit/logs', '/api/audit-logs', '/api/audit/events', '/api/audit']) {
      await request(app).get(path).expect(403);
    }
    await request(app).get('/api/audit/signatures/SIG_5/verify').expect(403);
    expect(auditSelects()).toHaveLength(0);
  });
});

describe('Tenant isolation — Audit writes', () => {
  it('POST /audit/events writes the JWT org, not body.organizationId', async () => {
    const res = await request(app)
      .post('/api/audit/events')
      .send({ organizationId: ATTACKER_TARGET_ORG, eventType: 'x' });
    expect(res.status).toBe(201);
    const ins = auditInserts();
    expect(ins).toHaveLength(1);
    expect(ins[0].params[0]).toBe(ORG_A);
    expect(ins[0].params).not.toContain(ATTACKER_TARGET_ORG);
  });

  it('POST /audit/signatures writes the JWT org, not body.organizationId', async () => {
    const res = await request(app)
      .post('/api/audit/signatures')
      .send({ organizationId: ATTACKER_TARGET_ORG, entityType: 'document', entityId: 1 });
    expect(res.status).toBe(201);
    expect(auditInserts()[0].params[0]).toBe(ORG_A);
  });

  it('write endpoints 403 without an authenticated org', async () => {
    authState.orgId = null;
    await request(app).post('/api/audit/events').send({ eventType: 'x' }).expect(403);
    await request(app)
      .post('/api/audit/events/batch')
      .send({ events: [{ eventType: 'x' }] })
      .expect(403);
    await request(app).post('/api/audit/signatures').send({ entityType: 'doc' }).expect(403);
    expect(auditInserts()).toHaveLength(0);
  });
});
