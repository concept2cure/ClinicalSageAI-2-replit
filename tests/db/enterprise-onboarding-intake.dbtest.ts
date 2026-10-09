/**
 * D2: the enterprise onboarding request is recorded — in production's posture.
 *
 * Launch row D2 (docs/LAUNCH_DEFINITION_OF_DONE.md), workstream W1. The
 * Onboarding surface — a launch SHELL surface, always on — ends its review step
 * with "Request Enterprise onboarding". That button POSTs to the public,
 * unauthenticated `/api/auth/license-request`, the platform's only enterprise
 * sales intake (client/src/concept2cure/v2/surfaces/Onboarding.tsx §3a).
 *
 * ── The two defects this pins (reproduced here 2026-09-24, before the fix) ───
 * 1. The handler INSERTed into `license_requests`, which NO applier creates.
 *    On 42P01 it tried `CREATE TABLE IF NOT EXISTS` at runtime. That worked
 *    locally, where the server connects as a superuser — and fails in
 *    production, where it connects as the non-owner runtime role, which holds no
 *    CREATE on `public`. The retry threw, the route answered 500, and the
 *    prospect's name, email, organisation and message were lost: the error log
 *    carried only the error text. Every enterprise prospect who finished
 *    onboarding was told the request was not recorded, and to retry — which
 *    could never succeed.
 * 2. Even with the table present, ANY store failure lost the lead: the handler
 *    retried the runtime CREATE TABLE (refused again), answered 500, and logged
 *    only the error text — not who had asked. Reproduced here with the table
 *    created and the old handler in place (a store failure injected by trigger):
 *    status and row count were right, the lead was not in the log.
 *
 * NOT a reproduced defect, recorded so nobody re-derives it: the old handler
 * also had an `else` branch commented "Still return success to the user" that
 * answered 200 `success: true` without storing anything. It could not fire
 * through Drizzle. Every query error is wrapped as "Failed query: <sql>", the
 * SQL names `license_requests`, so the table-name test always matched and the
 * `else` was unreachable — the trigger-injected failure below took the CREATE
 * branch, not the `else`. It was still an error rendered as success waiting on
 * a change of error format, so it is removed; the "answers 500, not success"
 * case below is a guard for that removal, not a reproduction.
 *
 * ── Posture: production's, not a copy of it ─────────────────────────────────
 * Built on tests/db/signup-launch-catalog.dbtest.ts's wiring:
 *   - The app is mounted by the REAL registerPlatformRoutes, so /api/auth runs
 *     behind production's own pre-auth scope (tenant '0', no role).
 *   - server/db connects as a NON-SUPERUSER, NOBYPASSRLS runtime role minted by
 *     the real scripts/db/provision-app-role.mjs, via APP_DATABASE_URL, with
 *     RLS_ENFORCE=on. The posture block asserts that — including that the role
 *     cannot CREATE in `public`, the fact that made defect 1 production-only.
 *   - The logger is observed, not replaced: "the lead is recoverable from the
 *     log when it could not be stored" is itself a claim under test.
 *
 * ── Isolation ───────────────────────────────────────────────────────────────
 * Lane "dbtlr": every email starts `dbtlr-`. Only those rows are deleted. The
 * failure simulation is a BEFORE INSERT trigger that fires for one marker
 * address only, and is dropped in afterAll.
 */

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { MockInstance } from 'vitest';
import express from 'express';
import request from 'supertest';
import { Pool } from 'pg';
import { databaseUrl } from '../setup.db';
import {
  provisionAppServiceRole,
  resolveAppServiceRole,
} from '../../scripts/db/provision-app-role.mjs';
import {
  runWithPreAuthScope,
  runWithSystemTenantScope,
  runWithTenantScope,
} from '../../server/db/tenantStore';

type Runtime = typeof import('../../server/db/runtime');

const TAG = 'dbtlr';
const RUN = `${process.pid}_${Date.now().toString(36)}`;
const RUNTIME_PASSWORD = 'dbtlr-enterprise-intake-runtime-password';
const runtimeRole = resolveAppServiceRole({ APP_SERVICE_DB_ROLE: `dbtlr_rt_${RUN}` });

/** A request exactly as Onboarding.tsx's enterpriseRequestBody() shapes it. */
const REQUEST = {
  name: 'Lane Intake',
  email: `${TAG}-ok-${RUN}@example.invalid`,
  organization: `${TAG} Biologics ${RUN}`,
  message: 'Enterprise onboarding request — plan Enterprise (annual), 25 seats.',
};

/** The one address the failure trigger fires for. */
const FAIL_EMAIL = `${TAG}-fail-${RUN}@example.invalid`;
const FAIL_TRIGGER = `dbtlr_fail_${RUN}`;

let owner: Pool;
let runtime: Runtime;
let app: express.Express;
let errorSpy: MockInstance;

async function tableExists(): Promise<boolean> {
  const { rows } = await owner.query(`SELECT to_regclass('public.license_requests') IS NOT NULL AS present`);
  return rows[0].present === true;
}

/** Owner read, so RLS cannot hide a row that was in fact written. */
async function rowsFor(email: string) {
  if (!(await tableExists())) return [];
  const { rows } = await owner.query(
    `SELECT name, email, organization, message, status FROM license_requests WHERE email = $1`,
    [email],
  );
  return rows;
}

async function cleanup(): Promise<void> {
  if (!(await tableExists())) return;
  await owner.query(`DROP TRIGGER IF EXISTS ${FAIL_TRIGGER} ON license_requests`);
  await owner.query(`DROP FUNCTION IF EXISTS ${FAIL_TRIGGER}_fn()`);
  await owner.query(`DELETE FROM license_requests WHERE email LIKE $1`, [`${TAG}-%@example.invalid`]);
}

beforeAll(async () => {
  owner = new Pool({ connectionString: databaseUrl, max: 2 });
  await cleanup();

  // 1. The non-superuser runtime role, minted by the REAL provisioning script.
  //    Retried ONLY on `tuple concurrently updated` (a parallel lane's GRANT).
  let provisioned: { skipped: boolean } | undefined;
  for (let attempt = 1; ; attempt++) {
    try {
      provisioned = await provisionAppServiceRole(owner, {
        env: { APP_SERVICE_DB_ROLE: runtimeRole, APP_SERVICE_DB_PASSWORD: RUNTIME_PASSWORD },
      });
      break;
    } catch (err) {
      if (attempt >= 5 || !/tuple concurrently updated/.test((err as Error).message)) throw err;
      await new Promise((r) => setTimeout(r, 250 * attempt));
    }
  }
  if (provisioned!.skipped) throw new Error('[dbtlr] provisionAppServiceRole skipped — no runtime role.');

  // 2. Route server/db through it BEFORE server/db/runtime.ts is first imported.
  const runtimeUrl = new URL(databaseUrl);
  runtimeUrl.username = runtimeRole;
  runtimeUrl.password = RUNTIME_PASSWORD;
  process.env.APP_DATABASE_URL = runtimeUrl.toString();
  process.env.RLS_ENFORCE = 'on';

  runtime = await import('../../server/db/runtime');

  const loggerModule = await import('../../server/utils/logger.js');
  errorSpy = vi.spyOn(loggerModule.logger, 'error');

  // 3. The app, mounted by production's own route registration.
  const { registerPlatformRoutes } = await import('../../server/bootstrap/register-platform-routes');
  app = express();
  app.use(express.json());
  await registerPlatformRoutes({
    app,
    pool: runtime.getPool(),
    authMiddleware: (_req, res) => {
      res.status(401).json({ error: 'dbtlr: the global gate was reached; the intake is public and must not reach it' });
    },
  });
}, 180_000);

afterAll(async () => {
  if (runtime) await runtime.getPool().end().catch(() => {});
  if (owner) {
    await cleanup().catch((err) => console.warn('[dbtlr] cleanup left rows:', err?.message));
    for (let attempt = 1; ; attempt++) {
      try {
        await owner.query(`REASSIGN OWNED BY ${runtimeRole} TO CURRENT_USER; DROP OWNED BY ${runtimeRole}`);
        await owner.query(`DROP ROLE IF EXISTS ${runtimeRole}`);
        break;
      } catch (err) {
        const message = (err as Error).message;
        if (/does not exist/.test(message)) break;
        if (attempt >= 5 || !/tuple concurrently updated/.test(message)) {
          console.warn(`[dbtlr] runtime role ${runtimeRole} was NOT dropped:`, message);
          break;
        }
        await new Promise((r) => setTimeout(r, 250 * attempt));
      }
    }
    await owner.end();
  }
});

// ═══════════════════════════════════════════════════════════════════════════
describe("posture — the connection is production's", () => {
  it('server/db talks to Postgres as the non-superuser runtime role, RLS enforcing', async () => {
    const { rows } = await runWithPreAuthScope('dbtlr:posture', () =>
      runtime.query(
        `SELECT current_user AS role,
                current_setting('is_superuser')::boolean AS superuser,
                r.rolbypassrls,
                current_setting('app.rls_enforce', true) AS enforcement
           FROM pg_roles r WHERE r.rolname = current_user`,
      ),
    );
    expect(rows).toEqual([{ role: runtimeRole, superuser: false, rolbypassrls: false, enforcement: 'on' }]);
  });

  it('the runtime role cannot CREATE in public — so no handler can provision a table at runtime', async () => {
    // The fact that made defect 1 production-only: a superuser's CREATE TABLE
    // succeeds, the runtime role's is refused. Asserted, not assumed.
    const { rows } = await owner.query(`SELECT has_schema_privilege($1, 'public', 'CREATE') AS can_create`, [
      runtimeRole,
    ]);
    expect(rows[0].can_create).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('the schema — created by an applier, not by a request', () => {
  it('license_requests exists on the provisioned database', async () => {
    expect(await tableExists()).toBe(true);
  });

  it('it is under RLS with exactly the intake and platform policies', async () => {
    const cls = await owner.query(
      `SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE oid = 'public.license_requests'::regclass`,
    );
    expect(cls.rows).toEqual([{ relrowsecurity: true, relforcerowsecurity: true }]);
    const pol = await owner.query(
      `SELECT polname, polcmd FROM pg_policy WHERE polrelid = 'public.license_requests'::regclass ORDER BY polname`,
    );
    // polcmd: 'a' = INSERT, '*' = ALL.
    expect(pol.rows).toEqual([
      { polname: 'license_requests_intake_insert', polcmd: 'a' },
      { polname: 'license_requests_platform_access', polcmd: '*' },
    ]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('POST /api/auth/license-request — the enterprise onboarding intake', () => {
  let res: request.Response;

  beforeAll(async () => {
    res = await request(app).post('/api/auth/license-request').send(REQUEST);
  });

  it('answers 200 and says the request was submitted', () => {
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true });
  });

  it('records exactly one row carrying what the prospect typed', async () => {
    // Defect 1: before the fix this was 500 and zero rows.
    expect(await rowsFor(REQUEST.email)).toEqual([
      {
        name: REQUEST.name,
        email: REQUEST.email,
        organization: REQUEST.organization,
        message: REQUEST.message,
        status: 'pending',
      },
    ]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('who can read a prospect\'s request', () => {
  const read = () =>
    runtime.query(`SELECT email FROM license_requests WHERE email = $1`, [REQUEST.email]);

  it('the pre-auth scope that wrote it cannot read it back', async () => {
    const { rows } = await runWithPreAuthScope('dbtlr:read-preauth', read);
    expect(rows).toEqual([]);
  });

  it('a signed-in tenant member cannot read it — another company\'s contact details', async () => {
    const { rows } = await runWithTenantScope(
      { tenantId: '424242', orgUuid: null, role: 'admin', source: 'request', caller: 'dbtlr:read-tenant' },
      read,
    );
    expect(rows).toEqual([]);
  });

  it('the platform scope can — that is who works the request', async () => {
    const { rows } = await runWithSystemTenantScope('dbtlr:read-platform', read);
    expect(rows).toEqual([{ email: REQUEST.email }]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('a request that could not be stored is never reported as recorded', () => {
  let res: request.Response;
  let errMark: number;

  beforeAll(async () => {
    // A store failure whose message names neither the table nor 42P01 — the
    // exact shape the old `else` branch answered with `success: true`.
    await owner.query(`
      CREATE OR REPLACE FUNCTION ${FAIL_TRIGGER}_fn() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.email = '${FAIL_EMAIL}' THEN
          RAISE EXCEPTION 'dbtlr simulated store outage';
        END IF;
        RETURN NEW;
      END $$`);
    await owner.query(
      `CREATE TRIGGER ${FAIL_TRIGGER} BEFORE INSERT ON license_requests
         FOR EACH ROW EXECUTE FUNCTION ${FAIL_TRIGGER}_fn()`,
    );
    errMark = errorSpy.mock.calls.length;
    res = await request(app)
      .post('/api/auth/license-request')
      .send({ ...REQUEST, email: FAIL_EMAIL });
  });

  it('answers 500, not success', () => {
    // Guard for the removed `else` branch that answered success without storing
    // (unreachable through Drizzle — see the header). A reintroduced swallow of
    // the store error must fail here.
    expect(res.status).toBe(500);
    expect(res.body?.success).not.toBe(true);
  });

  it('stores nothing', async () => {
    expect(await rowsFor(FAIL_EMAIL)).toEqual([]);
  });

  it('does not put the database error text in the response', () => {
    expect(JSON.stringify(res.body)).not.toContain('dbtlr simulated store outage');
  });

  it('logs the prospect\'s contact so the lead can be recovered, with the real cause', () => {
    // Defect 2: before the fix the log carried only the error text.
    const logged = errorSpy.mock.calls.slice(errMark).map(([message, context]) => ({
      message: String(message),
      context: context as Record<string, unknown>,
    }));
    const hit = logged.find((l) => l.message.includes('enterprise onboarding request'));
    expect(hit, `no error logged for the unrecorded request; saw: ${logged.map((l) => l.message).join(' | ')}`)
      .toBeDefined();
    expect(hit!.context).toMatchObject({
      email: FAIL_EMAIL,
      organization: REQUEST.organization,
      err: 'dbtlr simulated store outage',
    });
  });
});
