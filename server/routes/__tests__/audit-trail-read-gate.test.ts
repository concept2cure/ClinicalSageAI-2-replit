/**
 * Who may read and export the audit trail, and what a client may write into it
 * (security audit 2026-09-24, DP-18; plan P1-20).
 *
 * ── What was wrong ──────────────────────────────────────────────────────────
 * Every route in server/routes/audit-trail-routes.ts admitted any member of
 * the organisation: GET /audit/logs, /audit/events, /audit and both exports
 * handed a viewer every user's name, role and IP address (GDPR 5(1)(f)), and
 * POST /audit/events and /audit/events/batch inserted whatever event_type and
 * metadata the body carried into the regulated store, attributed to the
 * caller (11.10(d)(e)).
 *
 * Pinned here: reads and exports need an organisation owner, admin or manager
 * (the roles that run QA and administration; the platform administrator too);
 * a client-recorded event must name a type from the server's own vocabulary,
 * carry an object for metadata, and stays refused with 400 otherwise (in a
 * batch, skipped with the reason). The router is the real one over a pool
 * double; the export service is a double so the gate, not the export, is what
 * these cases see.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';

// The export is built inside the router over a pool client; the double's
// connect() is what tells "reached the export" from "refused before it".
vi.mock('../../services/tenant/governed-tenant-context.js', () => ({ setTenantContextTx: vi.fn(async () => undefined) }));
vi.mock('../../services/audit/tenant-chain-verdict.js', () => ({ verifyTenantChainOnAdminScope: vi.fn(async () => ({ ok: true })) }));

import { createAuditTrailRoutes } from '../audit-trail-routes';

const inserted: Array<{ eventType: string; metadata: string }> = [];
const pool = {
  query: vi.fn(async (sql: string, params: unknown[] = []) => {
    if (/SELECT COUNT\(\*\)/i.test(sql)) return { rows: [{ total: 1 }], rowCount: 1 };
    if (/INSERT INTO audit_events/i.test(sql)) {
      inserted.push({ eventType: String(params[1]), metadata: String(params[9]) });
      return { rows: [{ id: inserted.length }], rowCount: 1 };
    }
    if (/FROM audit_events/i.test(sql)) {
      return { rows: [{ id: 1, organization_id: 7, event_type: 'orchestration.gate_decision', entity_type: 'gate', entity_id: '1', user_id: 2, user_name: 'b@acme.test', user_role: 'member', ip_address: '203.0.113.9', timestamp: new Date(), reason: null, metadata: {}, regulatory_significant: false, gxp_relevant: true }], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  }),
  connect: vi.fn(async () => ({ query: async () => ({ rows: [], rowCount: 0 }), release: () => {} })),
};

function app(role: string, extra: Record<string, unknown> = {}) {
  const a = express();
  a.use(express.json());
  a.use((req: Request, _res: Response, next: NextFunction) => {
    (req as any).user = { id: 2, email: 'b@acme.test', organizationId: 7, role, roles: [role], ...extra };
    (req as any).userId = 2;
    (req as any).tenantContext = { organizationId: 7 };
    next();
  });
  a.use('/api', createAuditTrailRoutes(pool as any));
  return a;
}

afterEach(() => {
  inserted.length = 0;
  pool.connect.mockClear();
});

describe('reading the audit trail', () => {
  it.each(['/api/audit/logs', '/api/audit-logs', '/api/audit/events', '/api/audit'])('%s: a member is refused (403)', async (path) => {
    const r = await request(app('member')).get(path);
    expect(r.status, `a member read the audit trail at ${path}`).toBe(403);
    expect(JSON.stringify(r.body)).not.toContain('203.0.113.9');
  });

  it.each(['owner', 'admin', 'manager'])('%s reads it', async (role) => {
    const r = await request(app(role)).get('/api/audit/logs');
    expect(r.status).toBe(200);
  });

  it('a viewer is refused', async () => {
    expect((await request(app('viewer')).get('/api/audit/events')).status).toBe(403);
  });
});

describe('exporting the audit trail', () => {
  it('a member is refused before the export starts', async () => {
    const r = await request(app('member')).get('/api/audit/export/signed?format=json');
    expect(r.status, 'a member reached the signed export').toBe(403);
    expect(pool.connect).not.toHaveBeenCalled();
    const r2 = await request(app('member')).get('/api/audit/export?format=json');
    expect(r2.status).toBe(403);
    expect(pool.connect).not.toHaveBeenCalled();
  });

  it('an admin gets past the gate to the export itself', async () => {
    const r = await request(app('admin')).get('/api/audit/export/signed?format=json');
    expect(r.status).not.toBe(403);
    expect(pool.connect).toHaveBeenCalled();
  });
});

describe('recording an event from a client', () => {
  it('an event type outside the vocabulary is refused (400) and nothing is written', async () => {
    const r = await request(app('admin')).post('/api/audit/events').send({ eventType: 'anything_goes', entityType: 'document', entityId: 1 });
    expect(r.status, 'a free-text event type was written into audit_events').toBe(400);
    expect(inserted).toHaveLength(0);
  });

  it('the free-form default is not a type either: a body with no event type is refused', async () => {
    const r = await request(app('admin')).post('/api/audit/events').send({ entityType: 'document', entityId: 1 });
    expect(r.status).toBe(400);
    expect(inserted).toHaveLength(0);
  });

  it('metadata must be an object, not a string of any length', async () => {
    const r = await request(app('admin')).post('/api/audit/events').send({ eventType: 'orchestration.gate_decision', entityType: 'gate', entityId: 1, metadata: 'x'.repeat(100), reason: 'gate decided' });
    expect(r.status).toBe(400);
    expect(inserted).toHaveLength(0);
  });

  it('a vocabulary type with a reason is recorded, attributed to the caller', async () => {
    const r = await request(app('admin')).post('/api/audit/events').send({ eventType: 'orchestration.gate_decision', entityType: 'gate', entityId: 1, reason: 'gate decided', metadata: { verdict: 'pass' } });
    expect(r.status).toBe(201);
    expect(inserted).toEqual([{ eventType: 'orchestration.gate_decision', metadata: JSON.stringify({ verdict: 'pass' }) }]);
  });

  it('in a batch, an unknown type is skipped with the reason and the known one is written', async () => {
    const r = await request(app('admin')).post('/api/audit/events/batch').send({
      events: [
        { eventType: 'anything_goes', entityType: 'document', entityId: 1, reason: 'why' },
        { eventType: 'orchestration.gate_decision', entityType: 'gate', entityId: 2, reason: 'gate decided' },
      ],
    });
    expect(r.status).toBeLessThan(300);
    expect(inserted.map((e) => e.eventType)).toEqual(['orchestration.gate_decision']);
    expect(JSON.stringify(r.body)).toMatch(/not a recognised event type|unknown event type|vocabulary/i);
  });

  it('a member may not record events at all', async () => {
    const r = await request(app('member')).post('/api/audit/events').send({ eventType: 'orchestration.gate_decision', entityType: 'gate', entityId: 1, reason: 'gate decided' });
    expect(r.status).toBe(403);
    expect(inserted).toHaveLength(0);
  });
});
