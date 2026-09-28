/**
 * POST /api/chat/upload against real PostgreSQL, as the runtime role with RLS
 * enforced — the posture production requires.
 *
 * The route is `multer(...).single('file')` then the handler. Busboy's stream
 * listeners run in the socket's context, not the request's, so the
 * AsyncLocalStorage tenant scope the auth boundary opened does not reach the
 * handler — the vault ingest route and the authoring images route each record
 * the same trap and re-enter the scope for it. Under RLS_ENFORCE=on the pool
 * refuses a query issued with no scope, so this pins that a chat upload — the
 * way a client's document first reaches AnA — lands for its tenant.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import request from 'supertest';
import { Pool } from 'pg';
import { databaseUrl } from '../setup.db';

const PREFIX = 'dbtest-chatupload ';
let owner: Pool;
let orgId: number;
let orgUuid: string;
let userId: number;
let app: express.Express;

beforeAll(async () => {
  owner = new Pool({ connectionString: databaseUrl, max: 2 });
  const org = await owner.query(
    `INSERT INTO organizations (name, slug) VALUES ($1, $2)
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name RETURNING id, uuid`,
    [`${PREFIX}tenant`, 'dbtest-chatupload-tenant'],
  );
  orgId = Number(org.rows[0].id);
  orgUuid = String(org.rows[0].uuid);
  const user = await owner.query(
    `INSERT INTO users (email, name, password_hash) VALUES ($1, $2, 'not-a-real-hash')
       ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
    ['dbtest-chatupload@example.test', `${PREFIX}actor`],
  );
  userId = Number(user.rows[0].id);

  const { default: chatRouter } = await import('../../server/routes/chat');
  const { establishRequestTenantScope } = await import('../../server/middleware/establishRequestTenantScope');
  app = express();
  app.use((req, _res, next) => {
    const r = req as unknown as Record<string, unknown>;
    r.userId = userId;
    r.tenantId = orgId;
    r.userRole = 'member';
    r.user = { id: userId, organizationId: orgId, organizationUuid: orgUuid, role: 'member' };
    next();
  });
  // The REAL scope middleware, as authMiddleware runs it for every /api route.
  app.use(establishRequestTenantScope);
  app.use('/api/chat', chatRouter);
});

afterAll(async () => {
  await owner.query(`DELETE FROM file_uploads WHERE organization_id = $1`, [orgId]).catch(() => {});
  await owner.end().catch(() => {});
});

describe('POST /api/chat/upload — a client document reaches its tenant', () => {
  it('accepts the upload and records it for the organization', async () => {
    const res = await request(app)
      .post('/api/chat/upload')
      .attach('file', Buffer.from('Stability summary: impurity B 0.31% at T12.\n', 'utf8'), 'stability-note.txt');

    expect(res.status, JSON.stringify(res.body)).toBeLessThan(300);
    const { rows } = await owner.query(
      `SELECT original_name, organization_id FROM file_uploads WHERE organization_id = $1`,
      [orgId],
    );
    expect(rows.map((r) => r.original_name)).toContain('stability-note.txt');
  });
});
