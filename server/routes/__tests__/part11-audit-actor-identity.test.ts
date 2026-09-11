/**
 * WO-16C finding #67 — POST /api/part11/audit-trail wrote the actor's PRINTED
 * NAME from `req.body.userName` onto a persisted, hash-chained audit_events row
 * flagged `regulatory_significant`.
 *
 * Every other identity field on that INSERT is derived from the authenticated
 * principal: `organization_id` from the tenant context, `user_id` from
 * `req.user.id`, `user_role` from `req.user.role`. Only `user_name` — the field
 * a reviewer actually reads when asking who did this — came from the request
 * body, so any authenticated member of a tenant could file a §11.10(e) audit
 * entry under a colleague's name.
 *
 * The sibling route on the SAME TABLE already does it correctly:
 * audit-trail-routes.ts:52 derives `userName` as
 * `user.email || req.userEmail || user.name || 'system'`. This file pins the
 * Part 11 route to the same rule, because two provenance rules for one column
 * means the weaker one decides what the trail can be trusted to say.
 *
 * The file's own header makes the point three hundred lines above the defect:
 * the deleted signature endpoint was condemned partly for recording
 * `mfa_verified` from `!!req.body.mfaToken` — "a client-asserted boolean, never
 * verified".
 *
 * RED on the pre-fix head: `user_name` is 'Someone Else, QA Director'.
 */
import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import part11Router from '../part11-compliance';

type Captured = { sql: string; params: unknown[] };

/**
 * Mount the router with a request-scoped client that records every statement,
 * the way `establishRequestTenantScope` attaches one in production.
 */
function appRecording(calls: Captured[], user: Record<string, unknown>) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    // Double cast: Express's Request already declares `dbClient` as a real
    // PoolClient, so an intersection would not widen it.
    (req as unknown as { dbClient: unknown }).dbClient = {
      query: (sql: unknown, params: unknown[]) => {
        calls.push({ sql: String(sql), params: params || [] });
        return Promise.resolve({
          rows: [
            {
              id: 42,
              sequence_number: null,
              record_hash: null,
              previous_hash: null,
              timestamp: '2026-09-11T08:00:00.000Z',
            },
          ],
          rowCount: 1,
        });
      },
    };
    (req as unknown as { user: unknown }).user = user;
    next();
  });
  app.use('/api/part11', part11Router);
  return app;
}

const insertOf = (calls: Captured[]) => calls.find(c => /INSERT INTO audit_events/i.test(c.sql));
/** Positional order of the INSERT: org, event_type, entity_type, entity_id, user_id, user_name, ... */
const USER_NAME_PARAM = 5;

const body = {
  entityType: 'document',
  entityId: '123',
  action: 'create',
  userName: 'Someone Else, QA Director',
};

describe('POST /api/part11/audit-trail: the actor is the authenticated principal, never the request body', () => {
  it('writes the printed name from the authenticated identity, not from userName in the body', async () => {
    const calls: Captured[] = [];
    const app = appRecording(calls, {
      id: 41,
      email: 'real.person@sponsor.example',
      role: 'admin',
      organizationId: 7,
    });

    const res = await request(app).post('/api/part11/audit-trail').send(body);

    expect(res.status).toBe(201);
    const insert = insertOf(calls);
    expect(insert).toBeDefined();
    expect(insert!.params[USER_NAME_PARAM]).toBe('real.person@sponsor.example');
    expect(insert!.params[USER_NAME_PARAM]).not.toBe('Someone Else, QA Director');
  });

  it('answers with the name it actually persisted, so the caller cannot read back its own claim', async () => {
    const calls: Captured[] = [];
    const app = appRecording(calls, {
      id: 41,
      email: 'real.person@sponsor.example',
      role: 'admin',
      organizationId: 7,
    });

    const res = await request(app).post('/api/part11/audit-trail').send(body);

    expect(res.body.data.userName).toBe('real.person@sponsor.example');
  });

  it('falls back through the same chain as audit-trail-routes when there is no email', async () => {
    const calls: Captured[] = [];
    const app = appRecording(calls, { id: 41, name: 'Named User', role: 'admin', organizationId: 7 });

    await request(app).post('/api/part11/audit-trail').send(body);

    expect(insertOf(calls)!.params[USER_NAME_PARAM]).toBe('Named User');
  });

  it('records "system" rather than a caller-supplied name when the principal carries neither', async () => {
    const calls: Captured[] = [];
    const app = appRecording(calls, { id: 41, role: 'admin', organizationId: 7 });

    await request(app).post('/api/part11/audit-trail').send(body);

    // Not `String(userId)` and emphatically not the body: a row nobody can
    // attribute says so, in the same word the sibling route uses.
    expect(insertOf(calls)!.params[USER_NAME_PARAM]).toBe('system');
  });
});
