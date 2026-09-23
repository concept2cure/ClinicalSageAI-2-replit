/**
 * D2 on the self-serve path: a NEW organisation gets the launch catalog.
 *
 * Launch row D2 (docs/LAUNCH_DEFINITION_OF_DONE.md: "six apps on by default for
 * a new organisation"), workstream W1. The claim is about a new organisation,
 * not about one code path, so this file drives the creation paths production
 * actually serves and reads back what the database holds afterwards.
 *
 * ── The defect this pins (reproduced here 2026-09-22, before the fix) ───────
 * POST /api/auth/signup created the organisation, the user and the membership,
 * then called provisionLaunchModules() while the request was still under the
 * PRE-AUTH scope every /api/auth/* request runs in (tenant '0', no role —
 * register-platform-routes.ts). module_subscriptions is RLS-enabled and FORCED,
 * so its WITH CHECK refused every grant:
 *
 *     new row violates row-level security policy for table "module_subscriptions"
 *
 * 21 of 21 launch modules, each logged on its own line, the result discarded,
 * 201 returned. The organization_industry_profiles seed right after it failed
 * the same way (same policy, same scope) and was swallowed as a warn. Every
 * self-serve organisation started with ZERO launch apps granted.
 *
 * ── Posture: production's, not a copy of it ─────────────────────────────────
 *   - The app is built by the REAL registerPlatformRoutes, so /api/auth is
 *     mounted behind production's own pre-auth scope middleware and /api/setup
 *     behind its own system scope. Nothing about the scope is re-declared here.
 *   - server/db's pool connects as a NON-SUPERUSER, NOBYPASSRLS runtime role
 *     minted by the real scripts/db/provision-app-role.mjs, via APP_DATABASE_URL
 *     (the switch production uses), with app.rls_enforce=on in the startup
 *     packet. The first describe block asserts that rather than assuming it.
 *   - Stubbed: nothing in the signup handler. Stripe is skipped by the handler
 *     itself when no key is configured and SMTP is a logged no-op without a
 *     host; both are asserted unset below so the stub is known, not inherited.
 *     The global /api gate's authMiddleware is a refusing stub: signup and
 *     setup are on its open list and never reach it.
 *   - The logger is observed, not replaced (vi.spyOn passes through), because
 *     "the failure must never again be silent" is itself a claim under test.
 *
 * ── Isolation ───────────────────────────────────────────────────────────────
 * Lane "dbtsu": organization ids 91700–91749 for orgs this file inserts itself;
 * organisations the signup handler creates take a sequence id and are found by
 * their `dbtsu-` slug. Every email starts `dbtsu-`. The real catalog is read,
 * never edited. No audit rows are written (signup writes none); none deleted.
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
import { runWithPreAuthScope, runWithTenantScope } from '../../server/db/tenantStore';
import {
  LAUNCH_APPS,
  LAUNCH_MODULE_IDS,
  LAUNCH_SCOPE_SOURCE,
  isLaunchSurface,
} from '../../shared/constants/launch-scope';
import {
  drizzleWorkspaceStore,
  ensureOrganizationDefaultWorkspace,
  poolClientWorkspaceStore,
} from '../../server/services/c2c/organization-default-workspace';
import { seedOrganizations } from '../../server/db/bootstrap/seed-default-org';
import {
  pathwaysForUseCases,
  primaryIndustryForIndustryMode,
} from '../../server/services/industry-context/signup-profile';

type Runtime = typeof import('../../server/db/runtime');
type NavEntitlements = typeof import('../../server/services/entitlements/navigation-entitlements');
type LaunchScope = typeof import('../../server/services/entitlements/launch-scope');
type EstablishScope = typeof import('../../server/middleware/establishRequestTenantScope');

// ── Lane fixtures ───────────────────────────────────────────────────────────
const ORG_MIN = 91700;
const ORG_MAX = 91749;
/** Provisioned through the real /api/setup scope middleware. */
const ORG_SETUP_SCOPE = 91701;
/** Provisioned under the pre-auth scope: the loud-failure proof. */
const ORG_LOUD = 91702;
/** Given its workspace under the pre-auth scope: the writer's own tenant step. */
const ORG_PREAUTH_WS = 91703;

const TAG = 'dbtsu';
const RUN = `${process.pid}_${Date.now().toString(36)}`;
const RUNTIME_PASSWORD = 'dbtsu-signup-launch-runtime-password';
const runtimeRole = resolveAppServiceRole({ APP_SERVICE_DB_ROLE: `dbtsu_rt_${RUN}` });

/** The signup body: a medtech sign-up carrying every optional industry signal. */
const SIGNUP = {
  email: `${TAG}-signup-${RUN}@example.invalid`,
  password: 'Dbtsu-Launch-Catalog-2026!',
  companyName: `${TAG} signup ${RUN}`,
  industryMode: 'medtech' as const,
  firstName: 'Lane',
  lastName: 'Signup',
  mdxSpecialization: 'samd' as const,
  primaryUseCases: ['510k', 'ind', 'cmc'],
  defaultMarkets: ['US', 'EU'],
};

/** Env the signup handler reads for its two external calls. Asserted unset. */
const EXTERNAL_KEYS = ['STRIPE_SECRET_KEY', 'STRIPE_API_KEY', 'SMTP_HOST', 'SMTP_USER', 'SMTP_PASS'];

let owner: Pool;
let runtime: Runtime;
let nav: NavEntitlements;
let launch: LaunchScope;
let establish: EstablishScope;
let app: express.Express;
let errorSpy: MockInstance;
let warnSpy: MockInstance;

// ── Helpers ─────────────────────────────────────────────────────────────────

type Logged = { message: string; context: unknown };

/** Log calls on `spy` since `mark` whose message contains `needle`. */
function loggedSince(spy: MockInstance, mark: number, needle: string): Logged[] {
  return spy.mock.calls
    .slice(mark)
    .filter(([message]) => String(message).includes(needle))
    .map(([message, context]) => ({ message: String(message), context }));
}

/** Owner read of every grant row an organisation holds. */
async function grantRows(orgId: number) {
  const { rows } = await owner.query(
    `SELECT module_id, enabled, expires_at, enabled_by
       FROM module_subscriptions WHERE organization_id = $1 ORDER BY module_id`,
    [orgId],
  );
  return rows as Array<{ module_id: string; enabled: boolean; expires_at: Date | null; enabled_by: string | null }>;
}

/**
 * Compare an organisation's grants with the launch catalog. Every field is a
 * list of module ids, so a failure names the modules rather than a count.
 */
function launchGrantGaps(rows: Awaited<ReturnType<typeof grantRows>>) {
  const held = new Map(rows.map((r) => [r.module_id, r]));
  return {
    missing: LAUNCH_MODULE_IDS.filter((id) => !held.has(id)),
    notEnabled: LAUNCH_MODULE_IDS.filter((id) => held.has(id) && held.get(id)!.enabled !== true),
    expiring: LAUNCH_MODULE_IDS.filter((id) => held.has(id) && held.get(id)!.expires_at !== null),
    outsideLaunchCatalog: rows.map((r) => r.module_id).filter((id) => !LAUNCH_MODULE_IDS.includes(id)),
  };
}

const NO_GAPS = { missing: [], notEnabled: [], expiring: [], outsideLaunchCatalog: [] };

async function cleanup(): Promise<void> {
  const slugged = (
    await owner.query(
      `SELECT id, uuid::text AS uuid FROM organizations
        WHERE (id BETWEEN $1 AND $2) OR slug LIKE $3`,
      [ORG_MIN, ORG_MAX, `${TAG}-%`],
    )
  ).rows as Array<{ id: number; uuid: string }>;
  const ids = slugged.map((r) => r.id);
  const uuids = slugged.map((r) => r.uuid);
  if (ids.length > 0) {
    await owner.query('DELETE FROM module_subscriptions WHERE organization_id = ANY($1::int[])', [ids]);
    await owner.query('DELETE FROM organization_industry_profiles WHERE organization_id = ANY($1::int[])', [ids]);
    await owner.query('DELETE FROM organization_users WHERE organization_id = ANY($1::int[])', [ids]);
    // Before users: client_workspaces.created_by_id references users(id) with
    // no ON DELETE, so the signup's workspace pins its user until it is gone.
    await owner.query('DELETE FROM client_workspaces WHERE organization_id = ANY($1::int[])', [ids]);
  }
  await owner.query(`DELETE FROM users WHERE email LIKE $1`, [`${TAG}-%@example.invalid`]);
  if (ids.length > 0) {
    await owner.query('DELETE FROM organizations WHERE id = ANY($1::int[])', [ids]);
  }
  if (uuids.length > 0) {
    // trg_sync_org_to_identity mirrors every organizations INSERT into
    // identity.organizations; remove only the mirrors of this lane's orgs.
    await owner
      .query(
        `DELETE FROM identity.organizations WHERE id = ANY($1::uuid[]) AND created_by = 'c48-stage1-sync'`,
        [uuids],
      )
      .catch(() => {/* mirror table absent or referenced — harmless leftover */});
  }
}

/** The per-user scope establishRequestTenantScope opens for a member of `orgId`. */
async function asMemberOf<T>(orgId: number, caller: string, fn: () => Promise<T>): Promise<T> {
  const { rows } = await owner.query('SELECT uuid::text AS uuid FROM organizations WHERE id = $1', [orgId]);
  return runWithTenantScope(
    { tenantId: String(orgId), orgUuid: rows[0]?.uuid ?? null, role: 'admin', source: 'request', caller },
    fn,
  );
}

beforeAll(async () => {
  owner = new Pool({ connectionString: databaseUrl, max: 4 });
  await cleanup();

  // 1. The non-superuser runtime role, minted by the REAL provisioning script.
  //    Retried ONLY on `tuple concurrently updated` (a parallel lane's GRANT ON
  //    ALL TABLES rewriting the same catalog ACL rows). Anything else is fatal.
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
  if (provisioned!.skipped) throw new Error('[dbtsu] provisionAppServiceRole skipped — no runtime role.');

  // 2. Route server/db through it BEFORE server/db/runtime.ts is first imported.
  const runtimeUrl = new URL(databaseUrl);
  runtimeUrl.username = runtimeRole;
  runtimeUrl.password = RUNTIME_PASSWORD;
  process.env.APP_DATABASE_URL = runtimeUrl.toString();
  process.env.RLS_ENFORCE = 'on';
  delete process.env.LAUNCH_SCOPE_ENFORCE;
  for (const key of EXTERNAL_KEYS) delete process.env[key];

  runtime = await import('../../server/db/runtime');
  nav = await import('../../server/services/entitlements/navigation-entitlements');
  launch = await import('../../server/services/entitlements/launch-scope');
  establish = await import('../../server/middleware/establishRequestTenantScope');

  // 3. Observe the logger the provisioning service and the signup route write
  //    through (both import '…/utils/logger.js'). spyOn passes calls through.
  const loggerModule = await import('../../server/utils/logger.js');
  errorSpy = vi.spyOn(loggerModule.logger, 'error');
  warnSpy = vi.spyOn(loggerModule.logger, 'warn');

  // 4. The app, mounted by production's own route registration.
  const { registerPlatformRoutes } = await import('../../server/bootstrap/register-platform-routes');
  app = express();
  app.use(express.json());
  await registerPlatformRoutes({
    app,
    pool: runtime.getPool(),
    authMiddleware: (_req, res) => {
      res.status(401).json({ error: 'dbtsu: the global gate was reached; signup and setup must not reach it' });
    },
  });

  // 5. Orgs this file inserts itself, as the owner (how a creating transaction would).
  for (const id of [ORG_SETUP_SCOPE, ORG_LOUD, ORG_PREAUTH_WS]) {
    await owner.query(
      `INSERT INTO organizations (id, name, slug, tier, industry_mode, status)
       VALUES ($1, $2, $2, 'free', 'biotech', 'active')`,
      [id, `${TAG}-${id}-${RUN}`],
    );
  }
}, 180_000);

afterAll(async () => {
  delete process.env.LAUNCH_SCOPE_ENFORCE;
  if (runtime) await runtime.getPool().end().catch(() => {});
  if (owner) {
    await cleanup().catch((err) => console.warn('[dbtsu] cleanup left rows:', err?.message));
    for (let attempt = 1; ; attempt++) {
      try {
        await owner.query(`REASSIGN OWNED BY ${runtimeRole} TO CURRENT_USER; DROP OWNED BY ${runtimeRole}`);
        await owner.query(`DROP ROLE IF EXISTS ${runtimeRole}`);
        break;
      } catch (err) {
        const message = (err as Error).message;
        if (/does not exist/.test(message)) break;
        if (attempt >= 5 || !/tuple concurrently updated/.test(message)) {
          console.warn(`[dbtsu] runtime role ${runtimeRole} was NOT dropped:`, message);
          break;
        }
        await new Promise((r) => setTimeout(r, 250 * attempt));
      }
    }
    await owner.end();
  }
});

// ═══════════════════════════════════════════════════════════════════════════
describe('posture — the connection and the policies are production\'s', () => {
  it('server/db talks to Postgres as the non-superuser runtime role with RLS enforcing', async () => {
    const { rows } = await asMemberOf(ORG_LOUD, 'dbtsu:posture', () =>
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

  it('client_workspaces, module_subscriptions and organization_industry_profiles are RLS-enabled and FORCED', async () => {
    const { rows } = await owner.query(
      `SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class
        WHERE oid IN ('public.module_subscriptions'::regclass, 'public.organization_industry_profiles'::regclass,
                      'public.client_workspaces'::regclass)
        ORDER BY relname`,
    );
    expect(rows).toEqual([
      { relname: 'client_workspaces', relrowsecurity: true, relforcerowsecurity: true },
      { relname: 'module_subscriptions', relrowsecurity: true, relforcerowsecurity: true },
      { relname: 'organization_industry_profiles', relrowsecurity: true, relforcerowsecurity: true },
    ]);
  });

  it('the signup handler\'s external calls are known-off: no Stripe key, no SMTP host', () => {
    expect(EXTERNAL_KEYS.filter((k) => (process.env[k] ?? '') !== '')).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('D2 via POST /api/auth/signup — the self-serve path, end to end', () => {
  let res: request.Response;
  let orgId: number;
  let userId: number;
  let launchErrors: Logged[];
  let profileWarnings: Logged[];

  beforeAll(async () => {
    const errMark = errorSpy.mock.calls.length;
    const warnMark = warnSpy.mock.calls.length;
    res = await request(app).post('/api/auth/signup').send(SIGNUP);
    launchErrors = loggedSince(errorSpy, errMark, '[launch-scope]');
    profileWarnings = loggedSince(warnSpy, warnMark, 'industry profile');
    orgId = res.body?.organization?.id;
    userId = res.body?.user?.id;
  }, 240_000);

  it('answers 201 and creates a free-tier organisation whose signing-up user is its admin', async () => {
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(Number.isInteger(orgId)).toBe(true);
    const { rows } = await owner.query(
      `SELECT o.slug, o.tier, o.industry_mode, ou.role, u.email
         FROM organizations o
         JOIN organization_users ou ON ou.organization_id = o.id
         JOIN users u ON u.id = ou.user_id
        WHERE o.id = $1`,
      [orgId],
    );
    expect(rows).toEqual([
      { slug: `${TAG}-signup-${RUN.replace(/_/g, '-')}`, tier: 'free', industry_mode: 'medtech', role: 'admin', email: SIGNUP.email },
    ]);
  });

  it('grants every launch module to the new organisation — enabled, perpetual, and nothing else', async () => {
    // The provisioning errors ride along in the compared object so that, if this
    // ever regresses, the failure prints the database's own refusal next to the
    // modules it cost — not just a count.
    expect({
      ...launchGrantGaps(await grantRows(orgId)),
      provisioningErrors: launchErrors.map((e) => e.context),
    }).toEqual({ ...NO_GAPS, provisioningErrors: [] });
  });

  it('writes the grants as the platform, not a person (enabled_by NULL; the reason lives in the audit trail)', async () => {
    const rows = await grantRows(orgId);
    expect(rows.length).toBe(LAUNCH_MODULE_IDS.length);
    expect(rows.filter((r) => r.enabled_by !== null).map((r) => r.module_id)).toEqual([]);
  });

  it('seeds the organization_industry_profiles row from the signup signals', async () => {
    const { rows } = await owner.query(
      `SELECT primary_industry, mdx_specialization, default_markets, default_pathways,
              default_approval_rigor, updated_by
         FROM organization_industry_profiles WHERE organization_id = $1`,
      [orgId],
    );
    expect({ rows, profileWarnings: profileWarnings.map((w) => w.context) }).toEqual({
      rows: [
        {
          primary_industry: primaryIndustryForIndustryMode(SIGNUP.industryMode),
          mdx_specialization: SIGNUP.mdxSpecialization,
          default_markets: SIGNUP.defaultMarkets,
          default_pathways: pathwaysForUseCases(SIGNUP.primaryUseCases),
          default_approval_rigor: null,
          updated_by: userId,
        },
      ],
      profileWarnings: [],
    });
    // Guard the fixture: the mapping must actually have something to carry.
    expect(pathwaysForUseCases(SIGNUP.primaryUseCases)).toEqual(['510k', 'ind']);
  });

  it('gives the new organisation exactly one client workspace — its own, created by the signing-up user', async () => {
    const { rows } = await owner.query(
      `SELECT organization_id, name, slug, status, created_by_id,
              metadata->>'defaultForOrganization' AS marker
         FROM client_workspaces WHERE organization_id = $1`,
      [orgId],
    );
    expect(rows).toEqual([
      {
        organization_id: orgId,
        name: SIGNUP.companyName,
        slug: `${TAG}-signup-${RUN.replace(/_/g, '-')}`,
        status: 'active',
        created_by_id: userId,
        marker: 'true',
      },
    ]);
  });

  it('logs no launch-provisioning error for the new organisation', () => {
    expect(launchErrors).toEqual([]);
  });

  it('the rail, launch scope enforced: every launch surface is available, every live launch module by its grant', async () => {
    const { rows: catalogRows } = await owner.query(
      `SELECT module_id, COALESCE((metadata->>'deprecated')::boolean, false) AS deprecated
         FROM available_modules WHERE module_id = ANY($1::text[])`,
      [LAUNCH_MODULE_IDS],
    );
    const liveLaunch = catalogRows.filter((r: { deprecated: boolean }) => !r.deprecated).map((r: { module_id: string }) => r.module_id);
    expect(liveLaunch.length).toBeGreaterThan(0);

    process.env.LAUNCH_SCOPE_ENFORCE = 'on';
    let rail: Awaited<ReturnType<NavEntitlements['resolveNavEntitlements']>>;
    try {
      // The scope the rail endpoint runs in for this org's admin: its own tenant.
      rail = await asMemberOf(orgId, '/api/module-subscriptions/navigation', () =>
        nav.resolveNavEntitlements(orgId, { masterAdmin: false }),
      );
    } finally {
      delete process.env.LAUNCH_SCOPE_ENFORCE;
    }
    expect(rail.resolved).toBe(true);
    expect(rail.launchScope).toEqual({ enforced: true });
    expect(rail.tier).toBe('free');
    const v = new Map(rail.surfaces.map((s) => [s.id, s]));

    // Every live launch module is entitled BY ITS GRANT. The org is on the free
    // plan, so a verdict of `tier` here would mean the grant is not what opened it.
    expect(
      liveLaunch.filter((id) => !(v.get(id)?.entitled === true && v.get(id)?.source === 'subscribed')),
    ).toEqual([]);

    // Every launch SURFACE is available: an entitled verdict, or no verdict at
    // all (the client reads an unknown id as not licensable, so open). None is
    // locked, and none by the launch boundary.
    const launchSurfaces = [...new Set(LAUNCH_APPS.flatMap((a) => a.surfaces))];
    const locked = launchSurfaces
      .filter((id) => v.has(id) && v.get(id)!.entitled !== true)
      .map((id) => `${id}:${v.get(id)!.source}`);
    expect(locked).toEqual([]);
    for (const s of rail.surfaces) {
      if (isLaunchSurface(s.id)) expect(s.source, s.id).not.toBe(LAUNCH_SCOPE_SOURCE);
    }
    // And each of the six apps has at least one module the org can open.
    expect(LAUNCH_APPS.filter((a) => !a.modules.some((m) => v.get(m)?.entitled === true)).map((a) => a.id)).toEqual(
      [],
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('D2 via /api/setup — the first-run path, under the scope its mount applies', () => {
  /*
   * POST /api/setup/initialize is self-closing: it refuses (409) once ANY user
   * exists, so it cannot be driven on a shared database. What can be proven is
   * the part the defect lives in — the scope its post-transaction provisioning
   * runs under. register-platform-routes.ts mounts it behind the REAL
   * establishRequestSystemScope; this mounts provisionLaunchModules, called the
   * way setup.ts calls it, behind that same middleware.
   */
  it('the system scope setup runs in grants every launch module, with no failure logged', async () => {
    const probe = express();
    probe.post('/api/setup/__dbtsu_probe', establish.establishRequestSystemScope, async (_req, res) => {
      const result = await launch.provisionLaunchModules(ORG_SETUP_SCOPE, { actorEmail: null });
      res.json(result);
    });
    const errMark = errorSpy.mock.calls.length;
    const out = await request(probe).post('/api/setup/__dbtsu_probe');
    expect(out.status).toBe(200);
    expect(out.body.failed).toEqual([]);
    expect(loggedSince(errorSpy, errMark, '[launch-scope]')).toEqual([]);
    expect(launchGrantGaps(await grantRows(ORG_SETUP_SCOPE))).toEqual(NO_GAPS);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('the organisation\'s own workspace, under each creator\'s scope', () => {
  /*
   * setup.ts and the boot seed cannot be driven end to end on a shared
   * database (setup answers 409 once any user exists; the seed owns the
   * platform's two organisations). What differs between the creators is the
   * scope their transaction arrives in, so the writer is driven in each.
   */
  const workspacesOf = async (orgId: number) =>
    (await owner.query(`SELECT metadata->>'defaultForOrganization' AS marker, created_by_id FROM client_workspaces WHERE organization_id = $1`, [orgId])).rows;

  it('first-run setup: the system scope its mount applies', async () => {
    const probe = express();
    probe.post('/api/setup/__dbtsu_ws_probe', establish.establishRequestSystemScope, async (_req, res, next) => {
      try {
        const result = await runtime.getDb().transaction((tx) =>
          ensureOrganizationDefaultWorkspace(drizzleWorkspaceStore(tx), {
            orgId: ORG_SETUP_SCOPE,
            orgName: `${TAG}-${ORG_SETUP_SCOPE}-${RUN}`,
            userId: null,
          }),
        );
        res.json(result);
      } catch (err) {
        next(err);
      }
    });
    const out = await request(probe).post('/api/setup/__dbtsu_ws_probe');
    expect(out.status, out.text).toBe(200);
    expect(out.body.created).toBe(true);
    expect(await workspacesOf(ORG_SETUP_SCOPE)).toEqual([{ marker: 'true', created_by_id: null }]);
  });

  it('the pre-auth scope (tenant 0, no role): the writer stands on the organisation\'s own tenant, and it does not outlive the transaction', async () => {
    const outcome = await runWithPreAuthScope('dbtsu:workspace-writer', async () => {
      const client = await runtime.getPool().connect();
      try {
        await client.query('BEGIN');
        const before = (await client.query(`SELECT current_setting('app.current_tenant_id', true) AS t`)).rows[0].t;
        const result = await ensureOrganizationDefaultWorkspace(poolClientWorkspaceStore(client), {
          orgId: ORG_PREAUTH_WS,
          orgName: `${TAG}-${ORG_PREAUTH_WS}-${RUN}`,
          userId: null,
        });
        const inside = (await client.query(`SELECT current_setting('app.current_tenant_id', true) AS t`)).rows[0].t;
        await client.query('COMMIT');
        // Same physical connection, no transaction: the LOCAL setting is gone.
        const after = (await client.query(`SELECT current_setting('app.current_tenant_id', true) AS t`)).rows[0].t;
        return { before, created: result.created, inside, after: after ?? '' };
      } finally {
        client.release();
      }
    });
    expect(outcome).toEqual({ before: '0', created: true, inside: String(ORG_PREAUTH_WS), after: '' });
    expect(await workspacesOf(ORG_PREAUTH_WS)).toEqual([{ marker: 'true', created_by_id: null }]);
  });

  it('the boot seed: its PoolClient under enforcement, run twice, writes one workspace per seeded organisation', async () => {
    const url = new URL(process.env.APP_DATABASE_URL!);
    const rt = new Pool({ connectionString: url.toString(), max: 1, options: '-c app.rls_enforce=on' });
    const client = await rt.connect();
    try {
      await client.query('BEGIN');
      const posture = (await client.query(`SELECT current_user AS role, current_setting('app.rls_enforce', true) AS enforcement`)).rows[0];
      expect(posture).toEqual({ role: runtimeRole, enforcement: 'on' });
      await seedOrganizations(client);
      await seedOrganizations(client);
      // Read back as the owner would see it, from inside the same transaction:
      // enforcement off for the read only, so RLS cannot hide a second row.
      await client.query(`SELECT set_config('app.rls_enforce', 'off', true)`);
      const { rows } = await client.query(
        `SELECT o.slug, count(w.id)::int AS workspaces,
                count(*) FILTER (WHERE w.metadata->>'defaultForOrganization' = 'true')::int AS marked
           FROM organizations o LEFT JOIN client_workspaces w ON w.organization_id = o.id
          WHERE o.slug IN ('default', 'concept2cure') GROUP BY o.slug ORDER BY o.slug`,
      );
      expect(rows).toEqual([
        { slug: 'concept2cure', workspaces: 1, marked: 1 },
        { slug: 'default', workspaces: 1, marked: 1 },
      ]);
    } finally {
      await client.query('ROLLBACK').catch(() => {});
      client.release();
      await rt.end();
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('a refused workspace write takes the whole organisation with it', () => {
  /*
   * The workspace is written INSIDE the signup transaction because
   * projects.client_workspace_id is NOT NULL: an organisation committed without
   * it is the NO_CLIENT_WORKSPACE state the writer exists to end. So a refusal
   * of that one statement must cost the organisation, the user and the
   * membership too, and answer 500 — never 201.
   *
   * The refusal is injected on THIS lane's own runtime role only (no other lane
   * connects as it), at exactly the statement under test: INSERT privilege on
   * client_workspaces, restored in `finally`.
   */
  const REFUSED = {
    ...SIGNUP,
    email: `${TAG}-refused-${RUN}@example.invalid`,
    companyName: `${TAG} refused ${RUN}`,
  };
  const refusedSlug = `${TAG}-refused-${RUN.replace(/_/g, '-')}`;

  async function acl(sqlText: string) {
    for (let attempt = 1; ; attempt++) {
      const err = await owner.query(sqlText).then(() => null, (e: Error) => e);
      if (!err) return;
      if (attempt >= 5 || !/tuple concurrently updated/.test(err.message)) throw err;
      await new Promise((r) => setTimeout(r, 250 * attempt));
    }
  }

  it('answers 500 AUTH_010 and leaves no organisation, user, membership or workspace behind', async () => {
    const errMark = errorSpy.mock.calls.length;
    await acl(`REVOKE INSERT ON client_workspaces FROM ${runtimeRole}`);
    let res: request.Response;
    try {
      res = await request(app).post('/api/auth/signup').send(REFUSED);
    } finally {
      await acl(`GRANT INSERT ON client_workspaces TO ${runtimeRole}`);
    }
    expect(res.status, JSON.stringify(res.body)).toBe(500);
    expect(res.body.error?.code).toBe('AUTH_010');
    // It was the workspace statement that was refused, not something before it.
    const logged = loggedSince(errorSpy, errMark, 'Signup error').map((e) => JSON.stringify(e.context));
    expect(logged.length).toBe(1);
    expect(logged[0]).toContain('client_workspaces');

    const { rows } = await owner.query(
      `SELECT
         (SELECT count(*)::int FROM organizations WHERE slug LIKE $1) AS organizations,
         (SELECT count(*)::int FROM users WHERE email = $2) AS users,
         (SELECT count(*)::int FROM organization_users ou JOIN organizations o ON o.id = ou.organization_id
           WHERE o.slug LIKE $1) AS memberships,
         (SELECT count(*)::int FROM client_workspaces WHERE slug LIKE $1) AS workspaces`,
      [`${refusedSlug}%`, REFUSED.email],
    );
    expect(rows).toEqual([{ organizations: 0, users: 0, memberships: 0, workspaces: 0 }]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('a failed provisioning is never silent', () => {
  /*
   * The signup keeps its design decision — an organisation that fails to
   * provision must still exist so an administrator can provision it by hand —
   * so the log is the only place the failure can surface. It must surface as
   * ONE error-level line that names the organisation, says how many modules
   * failed and why, and gives the command that fixes it.
   *
   * Driven under the pre-auth scope: the placement the signup defect had, and a
   * scope RLS is right to refuse.
   */
  it('a scope RLS refuses yields every failure, and exactly one error-level summary with the remediation', async () => {
    const errMark = errorSpy.mock.calls.length;
    const result = await runWithPreAuthScope('dbtsu:POST /signup', () =>
      launch.provisionLaunchModules(ORG_LOUD, { actorEmail: null }),
    );
    expect(result.granted).toEqual([]);
    expect(result.failed.map((f) => f.moduleId).sort()).toEqual([...LAUNCH_MODULE_IDS].sort());

    const errors = loggedSince(errorSpy, errMark, '[launch-scope]');
    expect(errors.length, JSON.stringify(errors.map((e) => e.message))).toBe(1);
    const [summary] = errors;
    expect(summary.context).toMatchObject({
      organizationId: ORG_LOUD,
      failed: LAUNCH_MODULE_IDS.length,
      attempted: LAUNCH_MODULE_IDS.length,
      remediation: `npm run ops:provision-launch-modules -- --org ${ORG_LOUD}`,
    });
    // The database's own words, and the scope that produced them, so the line
    // diagnoses itself.
    expect(JSON.stringify(summary.context)).toContain(
      'new row violates row-level security policy for table \\"module_subscriptions\\"',
    );
    expect(summary.context).toMatchObject({ scope: { tenantId: '0', role: null } });
    expect(await grantRows(ORG_LOUD)).toEqual([]);
    // 3 min: in this vitest lane '../../db' resolves to server/db.js, whose
    // query() retries each refused statement with backoff (~2.5 s per module).
  }, 180_000);
});
