/**
 * The asker's watched stamp, written by a GET, on the request's own pinned
 * connection, with RLS enforcing, as the runtime role (AnA detach DT3,
 * docs/design/ANA_DETACH_2026-10-08.md §2.2, §3.7; evidence
 * docs/evidence/ANA-SUMMARY/2026-10-08/DT3-detach/).
 *
 * Since 278a443dc the run reads run on the request's RLS-scoped client
 * (requestPgClient(req)), so the `last_watched_at` UPDATE in
 * GET /runs/:runId/events?visible=1 is a write inside a read, on a
 * connection whose session variables carry the caller's tenant. That needs
 * the tenant sweep's policy on ana_runs to admit an UPDATE in the run's own
 * organisation, and to admit nothing from another. pglite (runs-read.pglite)
 * cannot show it: it has no runtime role and no policies.
 *
 * Built by deploy-migrate (the CI-shaped database). The request client is the
 * real one — a LazyRequestDbClient on the app_service pool with the tenant's
 * session scope, bound through db/requestDbLease.ts as the auth boundary
 * binds it — with `app.rls_enforce=on` in the startup packet.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { Pool, type PoolClient } from 'pg';
import { databaseUrl } from '../../../../tests/setup.db';
import { instrumentPool } from '../../../db/poolInstrumentation';
import { runWithTenantScope } from '../../../db/tenantStore';
import { applySessionScope } from '../../../db/sessionScope';
import { bindRequestDbClient } from '../../../db/requestDbLease';
import { LazyRequestDbClient } from '../../../middleware/lazyRequestDbClient';
import { requestPgClient } from '../../../db/requestDb';
import { beginRun, _resetLocalRunsForTest } from '../../../services/ana/run-control';
import { mountRunReadRoutes } from '../runs';

const A = 93_701;
const B = 93_702;
const USER_A = 93_711;
const USER_B = 93_712;
const TAG = `dt3_${process.pid}_${Date.now().toString(36)}`;

const appUrl = process.env.APP_DATABASE_URL;
let owner: Pool;
let app: Pool;

const asRequest = <T>(org: number, fn: () => Promise<T>) =>
  runWithTenantScope({ tenantId: String(org), role: null, source: 'request', caller: 'dbtest' }, fn);

/** An app signed in as `user` of `org`: the request's client bound and scoped as the auth boundary does. */
function routerApp(org: number, user: number) {
  const server = express();
  server.use((req, res, next) => {
    (req as any).user = { id: user, organizationId: org, role: 'member' };
    bindRequestDbClient(
      req,
      res,
      new LazyRequestDbClient(app, (client: PoolClient) => applySessionScope(client, { tenantId: String(org), role: 'member', orgUuid: '' })),
    );
    runWithTenantScope({ tenantId: String(org), role: 'member', source: 'request', caller: 'dbtest:runs' }, () => next());
  });
  const router = express.Router();
  mountRunReadRoutes(router, { pool: req => requestPgClient(req) as never });
  server.use('/api/ana-ri', router);
  return server;
}

const lastWatched = async (runId: string) =>
  (await owner.query(`SELECT last_watched_at FROM ana_runs WHERE id = $1`, [runId])).rows[0]?.last_watched_at ?? null;

async function cleanup() {
  await owner.query(`DELETE FROM ana_runs WHERE organization_id = ANY($1)`, [[A, B]]);
}

beforeAll(async () => {
  expect(appUrl, 'APP_DATABASE_URL names the runtime role (CI sets it)').toBeTruthy();
  owner = new Pool({ connectionString: databaseUrl, max: 2 });
  app = instrumentPool(
    new Pool({ connectionString: appUrl, max: 4, options: '-c app.rls_enforce=on' } as ConstructorParameters<typeof Pool>[0]),
  );
  for (const org of [A, B]) {
    await owner.query(`INSERT INTO organizations (id, name, slug) VALUES ($1, $2, $2) ON CONFLICT (id) DO NOTHING`, [org, `${TAG}-${org}`]);
  }
  for (const id of [USER_A, USER_B]) {
    await owner.query(
      `INSERT INTO users (id, email, name, password_hash) VALUES ($1, $2, $2, 'x') ON CONFLICT (id) DO NOTHING`,
      [id, `${TAG}-${id}@example.invalid`],
    );
  }
  await cleanup();
});

afterEach(async () => {
  _resetLocalRunsForTest();
  await cleanup();
});

afterAll(async () => {
  if (!owner) return;
  await cleanup();
  await app?.end();
  await owner.end();
});

describe("the asker's watched stamp under RLS, on the request's own connection (DT3)", () => {
  it("the asker's visible read stamps last_watched_at, in the run's own organisation", async () => {
    const { runId } = await asRequest(A, () => beginRun({ pool: app, organizationId: A, userId: USER_A, surface: 'dbtest' }));
    expect(await lastWatched(runId)).toBeNull();
    await request(routerApp(A, USER_A)).get(`/api/ana-ri/runs/${runId}/events?visible=1`).expect(200);
    expect(await lastWatched(runId), 'the UPDATE inside the GET was refused or saw no row under RLS').not.toBeNull();
  });

  it("another organisation's request finds no run and stamps nothing, though it names the id", async () => {
    const { runId } = await asRequest(A, () => beginRun({ pool: app, organizationId: A, userId: USER_A, surface: 'dbtest' }));
    await request(routerApp(B, USER_B)).get(`/api/ana-ri/runs/${runId}/events?visible=1`).expect(404);
    expect(await lastWatched(runId)).toBeNull();
  });

  it('a second read within 5 s does not stamp again', async () => {
    const { runId } = await asRequest(A, () => beginRun({ pool: app, organizationId: A, userId: USER_A, surface: 'dbtest' }));
    await owner.query(`UPDATE ana_runs SET last_watched_at = now() - interval '2 seconds' WHERE id = $1`, [runId]);
    const before = String(await lastWatched(runId));
    await request(routerApp(A, USER_A)).get(`/api/ana-ri/runs/${runId}/events?visible=1`).expect(200);
    expect(String(await lastWatched(runId))).toBe(before);
  });
});
