/**
 * U16 — the Authoring presence roster is shared across API tasks.
 *
 * ── The defect (docs/evidence/W2/2026-09-24-multi-task/audit-findings.json) ──
 * server/routes/realtime-collab.ts kept the presence roster in a process-local
 * Map. Only POST /rooms created a room, and the client sends it once per mount.
 * Production runs two API tasks behind an ALB with no stickiness, so the
 * 20-second PUT /awareness heartbeat landed on a task that did not know the
 * room about half the time; that task answered `{success: true,
 * connectedUsers: []}` and the client adopted the empty list. A deploy replaced
 * every task, so every room was gone. Co-authors flickered in and out, and an
 * author was told they were alone in a section while a colleague was in it.
 *
 * ── How tasks are simulated ─────────────────────────────────────────────────
 * Each "task" is a fresh module graph (vi.resetModules) mounting its own copy
 * of the router — its own room Map, its own pg pool, its own tenant-scope
 * store. All tasks share ONE real PostgreSQL 16 database, as production's tasks
 * share RDS. A task booted after the others have written is the post-deploy
 * case. Each app runs requests in the caller's tenant scope as the real auth
 * boundary does, connected as the non-superuser runtime role under
 * RLS_ENFORCE=on.
 *
 * Document ownership is stubbed at the authorizer (as in
 * tests/routes/realtime-collab-tenancy.test.ts): the authorizer is proven on
 * real DDL elsewhere, and the subject here is the roster store.
 *
 * ── Isolation ───────────────────────────────────────────────────────────────
 * Lane "dbtcp": organisations 92210–92219. Every row written belongs to them
 * and is removed afterwards. The migration and the tenant sweep are applied
 * here (both idempotent, both re-run on every deploy — CLAUDE.md Rule 1).
 */

import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { Pool } from 'pg';
import { databaseUrl } from '../setup.db';
import {
  provisionAppServiceRole,
  resolveAppServiceRole,
} from '../../scripts/db/provision-app-role.mjs';

const ORG = 92210;
const OTHER_ORG = 92211;
const RUN = `${process.pid}_${Date.now().toString(36)}`;
const RUNTIME_PASSWORD = 'dbtcp-presence-runtime-password';
const runtimeRole = resolveAppServiceRole({ APP_SERVICE_DB_ROLE: `dbtcp_rt_${RUN}` });

const REPO = path.resolve(__dirname, '..', '..');
const MIGRATION = path.join(REPO, 'db/migrations/20261001_collab_presence.sql');
const SWEEP = path.join(REPO, 'db/migrations/20260801_tenant_isolation_sweep.sql');

/** documentId → owning tenant. Anything else is not authorized. */
const documentOwner = vi.hoisted(() => new Map<string, number>());
vi.mock('../../server/services/collab/collab-authorization', () => ({
  authorizeResource: async (resource: { documentId: string }, tenantId: number) =>
    documentOwner.get(resource.documentId) === tenantId ? 'authorized' : 'denied',
}));

interface Principal { userId: number; organizationId: number; email: string }
interface RosterEntry { userId: string; email: string; color: string }

interface Task {
  /** An app on this task, authenticated as `user`. */
  as(user: Principal): express.Express;
  /** Count presence rows for a document through this task's runtime pool — RLS decides. */
  visibleRows(org: number, documentId: string): Promise<number>;
  end(): Promise<void>;
}

const tasks: Task[] = [];
let owner: Pool;

const ALICE: Principal = { userId: 92210001, organizationId: ORG, email: 'alice@dbtcp.test' };
const BOB: Principal = { userId: 92210002, organizationId: ORG, email: 'bob@dbtcp.test' };
const MALLORY: Principal = { userId: 92211001, organizationId: OTHER_ORG, email: 'mallory@dbtcp.test' };

async function bootTask(): Promise<Task> {
  vi.resetModules();
  const tenantStore = await import('../../server/db/tenantStore');
  const runtime = await import('../../server/db/runtime');
  const router = (await import('../../server/routes/realtime-collab')).default;
  const scoped = <T>(org: number, fn: () => T): T =>
    tenantStore.runWithTenantScope({ tenantId: String(org), role: 'admin', source: 'test', caller: 'dbtcp' }, fn);
  const task: Task = {
    as(user) {
      const app = express();
      app.use(express.json());
      // Stands in for authenticateToken + the request tenant scope it establishes.
      app.use((req, _res, next) => {
        (req as express.Request).user = user as unknown as express.Request['user'];
        scoped(user.organizationId, () => next());
      });
      app.use('/api/realtime-collab', router);
      return app;
    },
    visibleRows: (org, documentId) =>
      scoped(org, async () => {
        const r = await runtime.getPool().query(
          // Deliberately no organization_id predicate: only the policy filters.
          `SELECT count(*)::int AS n FROM collab_presence WHERE document_id = $1`,
          [documentId],
        );
        return r.rows[0].n as number;
      }),
    end: () => runtime.getPool().end().catch(() => {}),
  };
  // The router resolves its pool lazily, on first use, through a dynamic
  // import. Resolve it now, inside this task's module registry: left until
  // after the next task's vi.resetModules(), it would load that registry's
  // tenant store and see no request scope. (A test-harness concern only — a
  // production task is one bundle with one module graph.)
  await request(task.as(ALICE)).get('/api/realtime-collab/health');
  tasks.push(task);
  return task;
}

/** A document (and section) owned by `org`, unique to the calling test. */
function newDoc(org = ORG) {
  const documentId = randomUUID();
  documentOwner.set(documentId, org);
  return { documentId, sectionId: randomUUID() };
}

const join = (t: Task, u: Principal, d: { documentId: string; sectionId: string }) =>
  request(t.as(u)).post('/api/realtime-collab/rooms').send({ ...d, projectId: 1 });
const beat = (t: Task, u: Principal, d: { documentId: string; sectionId: string }) =>
  request(t.as(u))
    .put(`/api/realtime-collab/rooms/${d.documentId}/awareness`)
    .send({ sectionId: d.sectionId, focusedField: d.sectionId, isTyping: false });
const leave = (t: Task, u: Principal, d: { documentId: string; sectionId: string }) =>
  request(t.as(u)).delete(`/api/realtime-collab/rooms/${d.documentId}/users/me?sectionId=${d.sectionId}`);

const emails = (users: RosterEntry[] | undefined) => (users ?? []).map((u) => u.email).sort();

beforeAll(async () => {
  owner = new Pool({ connectionString: databaseUrl, max: 4 });
  await owner.query(fs.readFileSync(MIGRATION, 'utf8'));
  await owner.query(fs.readFileSync(SWEEP, 'utf8'));
  await owner.query(`DELETE FROM collab_presence WHERE organization_id = ANY($1::int[])`, [[ORG, OTHER_ORG]]);

  for (let attempt = 1; ; attempt++) {
    try {
      const r = await provisionAppServiceRole(owner, {
        env: { APP_SERVICE_DB_ROLE: runtimeRole, APP_SERVICE_DB_PASSWORD: RUNTIME_PASSWORD },
      });
      if (r.skipped) throw new Error('[dbtcp] provisionAppServiceRole skipped — no runtime role.');
      break;
    } catch (err) {
      if (attempt >= 5 || !/tuple concurrently updated/.test((err as Error).message)) throw err;
      await new Promise((r) => setTimeout(r, 250 * attempt));
    }
  }
  await owner.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON collab_presence TO ${runtimeRole}`);

  const url = new URL(databaseUrl);
  url.username = runtimeRole;
  url.password = RUNTIME_PASSWORD;
  process.env.APP_DATABASE_URL = url.toString();
  process.env.RLS_ENFORCE = 'on';
}, 120_000);

afterAll(async () => {
  for (const t of tasks) await t.end();
  if (!owner) return;
  await owner
    .query(`DELETE FROM collab_presence WHERE organization_id = ANY($1::int[])`, [[ORG, OTHER_ORG]])
    .catch(() => {});
  await owner
    .query(`REASSIGN OWNED BY ${runtimeRole} TO CURRENT_USER; DROP OWNED BY ${runtimeRole}`)
    .catch(() => {});
  await owner.query(`DROP ROLE IF EXISTS ${runtimeRole}`).catch(() => {});
  await owner.end();
});

describe('a heartbeat answered by another task', () => {
  it('task B returns the author who joined on task A (pre-fix: an empty roster, with success)', async () => {
    const [a, b] = [await bootTask(), await bootTask()];
    const d = newDoc();
    expect((await join(a, ALICE, d)).status).toBe(200);

    const res = await beat(b, ALICE, d);
    expect(res.status).toBe(200);
    expect(emails(res.body.connectedUsers)).toEqual([ALICE.email]);
  });

  it('two authors who joined through different tasks each see both', async () => {
    const [a, b] = [await bootTask(), await bootTask()];
    const d = newDoc();
    await join(a, ALICE, d);
    const bobJoin = await join(b, BOB, d);
    expect(emails(bobJoin.body.data.room.connectedUsers)).toEqual([ALICE.email, BOB.email]);

    const aliceBeat = await beat(a, ALICE, d);
    expect(emails(aliceBeat.body.connectedUsers)).toEqual([ALICE.email, BOB.email]);
  });

  it('gives an author the same cursor colour whichever task answers', async () => {
    const [a, b] = [await bootTask(), await bootTask()];
    const d = newDoc();
    await join(a, BOB, d);
    await join(b, ALICE, d);
    const fromA = (await beat(a, ALICE, d)).body.connectedUsers as RosterEntry[];
    const fromB = (await beat(b, ALICE, d)).body.connectedUsers as RosterEntry[];
    const colour = (rows: RosterEntry[]) => rows.find((u) => u.email === ALICE.email)?.color;
    expect(colour(fromA)).toBeDefined();
    expect(colour(fromA)).toBe(colour(fromB));
  });
});

describe('after a deploy', () => {
  it('a task that has served nothing returns the room after one heartbeat', async () => {
    const a = await bootTask();
    const d = newDoc();
    await join(a, ALICE, d);
    await join(a, BOB, d);

    const c = await bootTask(); // the deploy
    const res = await beat(c, BOB, d);
    expect(emails(res.body.connectedUsers)).toEqual([ALICE.email, BOB.email]);
  });
});

describe('who is in the roster', () => {
  it('drops an author not heard from in 90 seconds, on every task', async () => {
    const [a, b] = [await bootTask(), await bootTask()];
    const d = newDoc();
    await join(a, ALICE, d);
    await join(b, BOB, d);
    await owner.query(
      `UPDATE collab_presence SET last_seen_at = NOW() - INTERVAL '91 seconds'
        WHERE organization_id = $1 AND document_id = $2 AND user_id = $3`,
      [ORG, d.documentId, String(ALICE.userId)],
    );
    const c = await bootTask();
    const res = await beat(c, BOB, d);
    expect(emails(res.body.connectedUsers)).toEqual([BOB.email]);
  });

  it('a leave sent to one task removes the author everywhere', async () => {
    const [a, b] = [await bootTask(), await bootTask()];
    const d = newDoc();
    await join(a, ALICE, d);
    await join(a, BOB, d);
    expect((await leave(b, ALICE, d)).body.removed).toBe(true);

    const res = await beat(a, BOB, d);
    expect(emails(res.body.connectedUsers)).toEqual([BOB.email]);
  });

  it('a late leave for the previous section does not remove the author from the new one', async () => {
    const [a, b] = [await bootTask(), await bootTask()];
    const s1 = newDoc();
    const s2 = { documentId: s1.documentId, sectionId: randomUUID() };
    await join(a, ALICE, s1);
    await join(a, ALICE, s2); // section change: the new join can beat the old leave
    await leave(b, ALICE, s1);

    const res = await beat(b, BOB, s2);
    expect(emails(res.body.connectedUsers)).toEqual([ALICE.email, BOB.email]);
  });

  it('keeps sections apart: the roster is the section the caller is in', async () => {
    const a = await bootTask();
    const s1 = newDoc();
    const s2 = { documentId: s1.documentId, sectionId: randomUUID() };
    await join(a, ALICE, s1);
    const res = await join(a, BOB, s2);
    expect(emails(res.body.data.room.connectedUsers)).toEqual([BOB.email]);
  });
});

describe('tenant isolation', () => {
  it('the sweep gives collab_presence the tenant policy, with RLS forced', async () => {
    const r = await owner.query(
      `SELECT c.relrowsecurity AS rls, c.relforcerowsecurity AS forced,
              EXISTS (SELECT 1 FROM pg_policies p
                       WHERE p.schemaname = 'public' AND p.tablename = c.relname
                         AND p.policyname = 'tenant_isolation_policy') AS policied
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = 'collab_presence'`,
    );
    expect(r.rows[0]).toEqual({ rls: true, forced: true, policied: true });
  });

  it("another organisation cannot read a document's roster, and cannot heartbeat into it", async () => {
    const a = await bootTask();
    const d = newDoc();
    await join(a, ALICE, d);
    // As the runtime role, with no organization predicate in the SQL: RLS alone.
    expect(await a.visibleRows(ORG, d.documentId)).toBe(1);
    expect(await a.visibleRows(OTHER_ORG, d.documentId)).toBe(0);

    const res = await beat(a, MALLORY, d);
    expect(res.status).toBe(403);
    expect(await a.visibleRows(ORG, d.documentId)).toBe(1);
  });
});

describe('the store in use', () => {
  it('every task served these tests from collab_presence, not the per-process fallback', async () => {
    // A demotion to the fallback Map would make several cases above pass or
    // fail for the wrong reason; pin that none happened.
    for (const t of tasks) {
      const res = await request(t.as(ALICE)).get('/api/realtime-collab/health');
      expect(res.body.presenceStorage).toBe('durable (collab_presence)');
    }
  });
});
