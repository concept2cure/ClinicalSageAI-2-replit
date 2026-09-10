/**
 * WO-16B finding 27 — POST /api/part11/audit-trail answered `success: true`
 * with a hash-chained entry that was never persisted.
 *
 * Two layers, both real before the fix:
 *   - the INSERT was fire-and-forget on a module-level pool
 *     (`setAuditPool(pool)`, injected at boot by
 *     register-advanced-platform-routes.ts), and the handler answered
 *     `success: true` before it settled;
 *   - the route never passed an organisation id and
 *     `audit_events.organization_id` is `integer NOT NULL`, so every INSERT
 *     raised 23502 into a swallowing `.catch` — on every call, in production.
 *
 * Failure is injected at the dependency: the request-scoped client that
 * `establishRequestTenantScope` attaches (`req.dbClient`) rejects the way a
 * database would. RED on the pre-fix head: 200 `{ success: true, data: {hash…} }`.
 */
import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import part11Router from '../../../server/routes/part11-compliance';
import { assertNoVerdictClaims } from '../../../scripts/ci/lib/verdict-inspector.mjs';

function appWith(dbClient: { query: (...a: unknown[]) => Promise<unknown> } | null, org: number | null = 7) {
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => {
    if (dbClient) (req as any).dbClient = dbClient;
    (req as any).user = { id: 1, organizationId: org ?? undefined, role: 'admin' };
    next();
  });
  a.use('/api/part11', part11Router);
  return a;
}

const body = { entityType: 'document', entityId: '123', action: 'create', userName: 'Probe' };

describe('POST /api/part11/audit-trail: the audit row either lands or the answer says it did not', () => {
  it('refuses with 503 and no success when the INSERT fails (23502 — the pre-fix production failure)', async () => {
    const err = Object.assign(new Error('null value in column "organization_id" violates not-null constraint'), {
      code: '23502',
    });
    const res = await request(appWith({ query: () => Promise.reject(err) }))
      .post('/api/part11/audit-trail')
      .send(body);
    expect(res.status).toBe(503);
    expect(res.body.success).toBe(false);
    assertNoVerdictClaims(res.body, 'POST /api/part11/audit-trail (INSERT rejected)');
  });

  it('refuses with 503 when the store is unprovisioned (42P01)', async () => {
    const err = Object.assign(new Error('relation "audit_events" does not exist'), { code: '42P01' });
    const res = await request(appWith({ query: () => Promise.reject(err) }))
      .post('/api/part11/audit-trail')
      .send(body);
    expect(res.status).toBe(503);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe('AUDIT_TRAIL_STORE_UNPROVISIONED');
  });

  it('rejects an entity id the integer NOT NULL column cannot hold, before touching the store', async () => {
    let touched = false;
    const res = await request(appWith({ query: () => { touched = true; return Promise.resolve({ rows: [] }); } }))
      .post('/api/part11/audit-trail')
      .send({ ...body, entityId: 'doc-abc' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('ENTITY_ID_NOT_INTEGER');
    expect(touched).toBe(false);
  });

  it('refuses without an organisation — the column is NOT NULL and the row must be attributable', async () => {
    const res = await request(appWith({ query: () => Promise.resolve({ rows: [] }) }, null))
      .post('/api/part11/audit-trail')
      .send(body);
    expect(res.status).toBe(403);
  });

  it('answers 201 only from the persisted row, and reports the hash chain as the database has it', async () => {
    const calls: unknown[][] = [];
    const client = {
      query: (...a: unknown[]) => {
        calls.push(a);
        return Promise.resolve({
          rows: [{ id: 42, sequence_number: null, record_hash: null, previous_hash: null, timestamp: '2026-09-10T12:00:00.000Z' }],
          rowCount: 1,
        });
      },
    };
    const res = await request(appWith(client)).post('/api/part11/audit-trail').send(body);
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBe(42);
    // A canonically provisioned database has no hash-chain trigger on
    // audit_events; the row's hashes are null and the answer must say so
    // rather than manufacture a chain in memory.
    expect(res.body.data.hashChained).toBe(false);
    expect(res.body.data.recordHash).toBeNull();
    // The organisation came from the authenticated identity, on the INSERT.
    const insert = calls.find(c => /INSERT INTO audit_events/i.test(String(c[0])));
    expect(insert).toBeDefined();
    expect((insert![1] as unknown[])[0]).toBe(7);
  });
});
