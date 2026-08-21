/**
 * Tenant isolation on the tables the INSTALLER actually provisions.
 *
 * ── The gap this closes ──────────────────────────────────────────────────────
 * Two things already exist and neither one covers this:
 *
 *   • scripts/db/deploy-smoke-assert.mjs asserts the CATALOG — every
 *     integer-tenant table carries tenant_isolation_policy and FORCE. It runs
 *     as the owner and never issues a tenant-scoped read, so it proves the
 *     policy is attached, not that it filters.
 *   • tests/db/rls-tenant-isolation.dbtest.ts proves the policy filters for a
 *     non-superuser role — on a table the harness creates in a scratch schema
 *     for the purpose. It proves the MECHANISM, on a table no route reads.
 *
 * "The policy shape is right" and "the mechanism works on a synthetic table"
 * do not add up to "tenant A cannot read tenant B's stability studies". The
 * missing step is the one this file takes: connect as the non-superuser role
 * scripts/db/provision-app-role.mjs mints, against a REAL table the installer
 * created and a real route reads, and try to cross the tenant boundary.
 *
 * ── Why stability_studies ────────────────────────────────────────────────────
 * It is on install-fresh's required-object contract, it carries the integer
 * organization_id the platform's tenant model uses, and it FK-references
 * organizations — so it exercises the same shape as the ~800 other tenant
 * tables rather than a special case. The isolation property is installed
 * uniformly by migrations/0021_enable_rls_everywhere.sql and the C-33 sweep, so
 * one real table under the real policy, read through the real role, is the
 * property under test.
 *
 * ── Fail, do not skip ────────────────────────────────────────────────────────
 * If the target database has no stability_studies, this FAILS and names the
 * remedy. Per tests/setup.db.ts, a database test that quietly does not run is
 * the defect this suite exists to prevent — and provisioning the table here
 * from a hand-written CREATE would be a second definition of a table that
 * already has exactly one.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool, type PoolClient } from 'pg';
import { databaseUrl } from '../setup.db';
import { provisionAppServiceRole, resolveAppServiceRole } from '../../scripts/db/provision-app-role.mjs';
import { assessRlsCatalogPosture } from '../../server/db/rlsEnforcement';

/** Tenant ids far outside any real range, so cleanup can never touch live rows. */
const ORG_A = 90101;
const ORG_B = 90102;
/** Marks every row this suite writes. */
const TAG = 'dbtest-provisioned-rls';

const RUNTIME_PASSWORD = 'provisioned-rls-runtime-password';
const runtimeRole = resolveAppServiceRole({
  APP_SERVICE_DB_ROLE: `dbtest_provisioned_${process.pid}_${Date.now().toString(36)}`,
});

let owner: Pool;
let runtime: Pool;

/**
 * Run `fn` on a runtime connection scoped to `orgId` with RLS enforcing, the
 * way server/middleware/authBoundary.ts scopes a request-scoped client.
 *
 * `app.rls_enforce` is set per connection here rather than in the startup
 * packet (which is what production does) so this suite is correct whether or
 * not RLS_ENFORCE is exported into the test process. RESET ALL on both sides is
 * load-bearing: set_config(..., false) is SESSION scoped, so a released client
 * would otherwise carry the previous test's tenant into the next checkout.
 */
async function asTenant<T>(orgId: number | null, fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const client = await runtime.connect();
  try {
    await client.query('RESET ALL');
    await client.query("SELECT set_config('app.rls_enforce', 'on', false)");
    if (orgId !== null) {
      // BOTH variables, exactly as server/middleware/establishRequestTenantScope.ts
      // sets them: the integer org id in app.current_tenant_id, the org UUID in
      // app.current_org_id.
      //
      // Setting the UUID is load-bearing, not incidental. Every other suite that
      // touches these GUCs sets app.current_org_id to '' — and '' is the one
      // value that hid a defect where the integer policy cast that UUID to INT,
      // so any real request scope killed every query on every tenant table with
      // `invalid input syntax for type integer`. A test that scopes a connection
      // differently from the middleware is not testing the middleware's scope.
      await client.query("SELECT set_config('app.current_tenant_id', $1, false)", [String(orgId)]);
      await client.query(
        "SELECT set_config('app.current_org_id', COALESCE((SELECT uuid::text FROM organizations WHERE id = $1), ''), false)",
        [String(orgId)],
      );
    }
    return await fn(client);
  } finally {
    await client.query('RESET ALL').catch(() => {});
    client.release();
  }
}

/** Insert one stability study for `orgId`, as the owner (how a seed would). */
async function seedStudy(orgId: number, title: string): Promise<void> {
  await owner.query(
    `INSERT INTO public.stability_studies
       (organization_id, study_title, product_name, batch_number, storage_conditions,
        test_parameters, start_date, notes)
     VALUES ($1, $2, $3, $4, ARRAY['25C/60RH'], ARRAY['assay'], now(), $5)`,
    [orgId, title, `${TAG}-product`, `${TAG}-batch`, TAG],
  );
}

beforeAll(async () => {
  owner = new Pool({ connectionString: databaseUrl, max: 4 });

  const exists = await owner.query(`SELECT to_regclass('public.stability_studies') AS t`);
  if (!exists.rows[0]?.t) {
    throw new Error(
      '[provisioned-rls] public.stability_studies is absent from this database. This suite ' +
        'asserts tenant isolation on a table the installer provisions; provision the database ' +
        'first (node scripts/db/install-fresh.mjs, then node scripts/db/deploy-migrate.mjs). ' +
        'It is deliberately not skipped — a database test that silently does not run is the ' +
        'defect this suite exists to prevent.',
    );
  }

  const result = await provisionAppServiceRole(owner, {
    env: { APP_SERVICE_DB_ROLE: runtimeRole, APP_SERVICE_DB_PASSWORD: RUNTIME_PASSWORD },
  });
  if (result.skipped) {
    throw new Error('[provisioned-rls] provisionAppServiceRole skipped — no runtime role to test with.');
  }

  const url = new URL(databaseUrl);
  url.username = runtimeRole;
  url.password = RUNTIME_PASSWORD;
  runtime = new Pool({ connectionString: url.toString(), max: 4 });

  // Two tenants that satisfy the organization_id FK, then one study each.
  for (const [id, name] of [[ORG_A, `${TAG}-a`], [ORG_B, `${TAG}-b`]] as const) {
    await owner.query(
      `INSERT INTO public.organizations (id, name, slug) VALUES ($1, $2, $3)
         ON CONFLICT (id) DO NOTHING`,
      [id, name, name],
    );
  }
  await seedStudy(ORG_A, `${TAG}-study-A`);
  await seedStudy(ORG_B, `${TAG}-study-B`);
});

afterAll(async () => {
  if (runtime) await runtime.end();
  if (owner) {
    // Cleanup runs on ONE checked-out client, not through the pool. `app.rls_enforce`
    // is a SESSION setting: setting it with pool.query and deleting with a second
    // pool.query can land on two different connections, so the DELETE would run
    // with enforcement still on. (Under FORCE ROW LEVEL SECURITY that leaves rows
    // behind even for the table owner.)
    const client = await owner.connect().catch(() => null);
    if (client) {
      try {
        await client.query("SELECT set_config('app.rls_enforce', 'off', false)");
        await client.query('DELETE FROM public.stability_studies WHERE notes = $1', [TAG]);
        await client.query('DELETE FROM public.organizations WHERE id = ANY($1::int[])', [
          [ORG_A, ORG_B],
        ]);
      } catch {
        /* leave the rows rather than fail the run in teardown; they are TAG-marked */
      } finally {
        await client.query('RESET ALL').catch(() => {});
        client.release();
      }
    }
    await owner
      .query(`REASSIGN OWNED BY ${runtimeRole} TO CURRENT_USER; DROP OWNED BY ${runtimeRole}`)
      .catch(() => {});
    await owner.query(`DROP ROLE IF EXISTS ${runtimeRole}`).catch(() => {});
    await owner.end();
  }
});

describe('provisioned tenant tables under the non-superuser runtime role', () => {
  it('the runtime role is the one production requires — LOGIN, not superuser, no BYPASSRLS', async () => {
    const { rows } = await owner.query(
      'SELECT rolsuper, rolbypassrls, rolcanlogin FROM pg_roles WHERE rolname = $1',
      [runtimeRole],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].rolsuper).toBe(false);
    expect(rows[0].rolbypassrls).toBe(false);
    expect(rows[0].rolcanlogin).toBe(true);
  });

  it('stability_studies is RLS-enabled AND forced (owner-bypass closed)', async () => {
    const { rows } = await owner.query(
      `SELECT c.relrowsecurity AS enabled, c.relforcerowsecurity AS forced,
              (SELECT count(*)::int FROM pg_policies p
                WHERE p.schemaname = 'public' AND p.tablename = 'stability_studies') AS policies
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = 'stability_studies'`,
    );
    expect(rows[0].enabled).toBe(true);
    expect(rows[0].forced).toBe(true);
    expect(rows[0].policies).toBeGreaterThan(0);
  });

  /**
   * Pinned separately from the behavioural cases below because it is the defect
   * that was actually shipped: stability_studies carries BOTH organization_id
   * and a nullable `tenant_id` adapter column, and 0021 used to attach the
   * policy to the alphabetically-last one. The behavioural cases DO catch it —
   * that is how it was found — but they fail as "read returned nothing", which
   * reads like a seeding bug. This says which column is wrong.
   */
  it('the policy keys on organization_id — the column writers stamp, not the nullable tenant_id adapter', async () => {
    const { rows } = await owner.query(
      `SELECT qual FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'stability_studies'
          AND policyname = 'tenant_isolation_policy'`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].qual).toContain('(organization_id = ');
    expect(rows[0].qual).not.toContain('(tenant_id = ');
  });

  it('a tenant-scoped read returns that tenant’s rows and no other tenant’s', async () => {
    const seen = await asTenant(ORG_A, async c => {
      const { rows } = await c.query(
        'SELECT study_title, organization_id FROM public.stability_studies WHERE notes = $1',
        [TAG],
      );
      return rows;
    });
    expect(seen.map(r => r.study_title)).toEqual([`${TAG}-study-A`]);
    expect(seen.every(r => r.organization_id === ORG_A)).toBe(true);
  });

  /**
   * The regression guard for the cast that made every tenant query throw.
   *
   * The policy carried `… OR <col> = NULLIF(current_setting('app.current_org_id',
   * TRUE), '')::INT`, and that GUC holds the org UUID. PostgreSQL does not
   * guarantee OR short-circuiting, so the cast was evaluated for any row the
   * earlier disjuncts did not satisfy and the query died with
   * `invalid input syntax for type integer`. Every read and every write, on any
   * connection carrying a real request scope, in every RLS mode.
   *
   * The read above already exercises it (asTenant now sets the UUID the way the
   * middleware does), but this pins the property directly, so a regression says
   * "the org-id disjunct throws" rather than "a read returned nothing".
   */
  it('a UUID in app.current_org_id does not blow up the integer tenant predicate', async () => {
    const qual = (
      await owner.query(
        `SELECT qual FROM pg_policies
          WHERE schemaname = 'public' AND tablename = 'stability_studies'
            AND policyname = 'tenant_isolation_policy'`,
      )
    ).rows[0]?.qual as string;
    // The fixed form EXTRACTS an integer; the broken form casts unconditionally.
    expect(qual).toContain('^[0-9]+$');

    // And executed, not just inspected: a scoped read must return the tenant's
    // row rather than raising 22P02.
    const count = await asTenant(ORG_A, async c => {
      const { rows } = await c.query(
        'SELECT count(*)::int AS n FROM public.stability_studies WHERE notes = $1',
        [TAG],
      );
      return rows[0].n as number;
    });
    expect(count).toBeGreaterThan(0);

    // The disjunct is fixed, not removed: an actual integer still resolves.
    const client = await runtime.connect();
    try {
      await client.query('RESET ALL');
      await client.query("SELECT set_config('app.rls_enforce', 'on', false)");
      await client.query("SELECT set_config('app.current_org_id', $1, false)", [String(ORG_A)]);
      const { rows } = await client.query(
        'SELECT count(*)::int AS n FROM public.stability_studies WHERE notes = $1',
        [TAG],
      );
      expect(rows[0].n).toBeGreaterThan(0);
    } finally {
      await client.query('RESET ALL').catch(() => {});
      client.release();
    }
  });

  it('a cross-tenant read of a known row returns nothing', async () => {
    const rowCount = await asTenant(ORG_B, async c => {
      const { rows } = await c.query(
        'SELECT id FROM public.stability_studies WHERE study_title = $1',
        [`${TAG}-study-A`],
      );
      return rows.length;
    });
    expect(rowCount).toBe(0);
  });

  it('a tenant-scoped write succeeds and stays inside the tenant', async () => {
    await asTenant(ORG_A, async c => {
      await c.query(
        `INSERT INTO public.stability_studies
           (organization_id, study_title, product_name, batch_number, storage_conditions,
            test_parameters, start_date, notes)
         VALUES ($1, $2, $3, $4, ARRAY['25C/60RH'], ARRAY['assay'], now(), $5)`,
        [ORG_A, `${TAG}-written-by-A`, `${TAG}-product`, `${TAG}-batch`, TAG],
      );
    });

    const visibleToB = await asTenant(ORG_B, async c => {
      const { rows } = await c.query(
        'SELECT id FROM public.stability_studies WHERE study_title = $1',
        [`${TAG}-written-by-A`],
      );
      return rows.length;
    });
    expect(visibleToB).toBe(0);
  });

  it('a cross-tenant INSERT is refused by WITH CHECK, not silently accepted', async () => {
    await expect(
      asTenant(ORG_A, async c => {
        await c.query(
          `INSERT INTO public.stability_studies
             (organization_id, study_title, product_name, batch_number, storage_conditions,
              test_parameters, start_date, notes)
           VALUES ($1, $2, $3, $4, ARRAY['25C/60RH'], ARRAY['assay'], now(), $5)`,
          [ORG_B, `${TAG}-forged-into-B`, `${TAG}-product`, `${TAG}-batch`, TAG],
        );
      }),
    ).rejects.toThrow(/row-level security/i);
  });

  it('a cross-tenant UPDATE and DELETE affect zero rows', async () => {
    const { updated, deleted } = await asTenant(ORG_B, async c => {
      const u = await c.query(
        'UPDATE public.stability_studies SET status = $1 WHERE study_title = $2',
        ['TAMPERED', `${TAG}-study-A`],
      );
      const d = await c.query('DELETE FROM public.stability_studies WHERE study_title = $1', [
        `${TAG}-study-A`,
      ]);
      return { updated: u.rowCount, deleted: d.rowCount };
    });
    expect(updated).toBe(0);
    expect(deleted).toBe(0);

    // And the row is genuinely untouched, read back through its own tenant.
    const status = await asTenant(ORG_A, async c => {
      const { rows } = await c.query(
        'SELECT status FROM public.stability_studies WHERE study_title = $1',
        [`${TAG}-study-A`],
      );
      return rows[0]?.status;
    });
    expect(status).not.toBe('TAMPERED');
  });

  it('an unscoped connection sees no tenant rows at all', async () => {
    const rowCount = await asTenant(null, async c => {
      const { rows } = await c.query(
        'SELECT id FROM public.stability_studies WHERE notes = $1',
        [TAG],
      );
      return rows.length;
    });
    expect(rowCount).toBe(0);
  });
});

describe('governed mutation paths stay auditable under the runtime role', () => {
  /**
   * The Part 11 audit trail is only tamper-EVIDENT if the process that writes it
   * cannot also rewrite it. scripts/db/provision-app-role.mjs grants the audit
   * schema SELECT + INSERT and deliberately withholds UPDATE and DELETE; this
   * asserts the grant actually landed that way on a provisioned database, which
   * is the property, not the code comment claiming it.
   */
  it('audit tables are append-only for the runtime role (INSERT yes, UPDATE/DELETE no)', async () => {
    const auditTable = await owner.query(
      `SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'audit' AND c.relkind = 'r'
        ORDER BY c.relname LIMIT 1`,
    );
    if (!auditTable.rows.length) {
      throw new Error(
        '[provisioned-rls] the `audit` schema holds no tables. The governed-content tree ' +
          '(db/migrations/*_gcc_*.sql) did not apply — Part 11 tamper-proof audit is absent from ' +
          'this database. Re-run scripts/db/install-fresh.mjs with psql available.',
      );
    }
    const rel = `audit.${auditTable.rows[0].relname}`;

    const { rows } = await owner.query(
      `SELECT has_table_privilege($1, $2, 'SELECT') AS can_select,
              has_table_privilege($1, $2, 'INSERT') AS can_insert,
              has_table_privilege($1, $2, 'UPDATE') AS can_update,
              has_table_privilege($1, $2, 'DELETE') AS can_delete`,
      [runtimeRole, rel],
    );
    expect(rows[0].can_select).toBe(true);
    expect(rows[0].can_insert).toBe(true);
    expect(rows[0].can_update).toBe(false);
    expect(rows[0].can_delete).toBe(false);
  });

  /**
   * public.audit_logs is append-only at the DATABASE level
   * (db/migrations/20260617_audit_logs_immutability.sql), which is the guarantee
   * that survives a compromised app process — grants alone do not, because the
   * owner connection migrations run as holds every privilege.
   *
   * Executed, not read: the guard was written as
   * `RAISE EXCEPTION '…' USING …, MESSAGE = '…'`, which PostgreSQL rejects for
   * specifying the message twice, so it aborted with
   * "RAISE option already specified: MESSAGE" (42601) instead of the
   * IMMUTABILITY_VIOLATION / P0A0x it declares. The write was still blocked, so
   * nothing leaked — but every caller matching on /IMMUTABILITY_VIOLATION/ would
   * have missed it, and no test had ever run the failure path. This runs it.
   */
  it('audit_logs refuses UPDATE and DELETE with the IMMUTABILITY_VIOLATION it declares', async () => {
    const probe = `${TAG}-audit-probe`;
    await owner.query(
      `INSERT INTO public.audit_logs (action, tenant_id, table_name, record_id)
       VALUES ($1, $2, 'stability_studies', $3)`,
      [probe, ORG_A, probe],
    );

    await expect(
      owner.query('UPDATE public.audit_logs SET action = $1 WHERE action = $2', ['tampered', probe]),
    ).rejects.toMatchObject({ code: 'P0A01', message: expect.stringContaining('IMMUTABILITY_VIOLATION') });

    await expect(
      owner.query('DELETE FROM public.audit_logs WHERE action = $1', [probe]),
    ).rejects.toMatchObject({ code: 'P0A02', message: expect.stringContaining('IMMUTABILITY_VIOLATION') });

    // The one authorized escape: the retention/archival path opts in per
    // transaction. Asserted so the guard is shown to be a gate, not a wall —
    // a wall would take the archival service down with it.
    const client = await owner.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SET LOCAL app.audit_archive_bypass = 'on'`);
      const removed = await client.query('DELETE FROM public.audit_logs WHERE action = $1', [probe]);
      await client.query('COMMIT');
      expect(removed.rowCount).toBe(1);
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  });
});

describe('production boot posture, evaluated against this database', () => {
  /**
   * assertRlsCatalogPosture is what refuses a production boot on a connection
   * that RLS cannot filter. Both directions are asserted here, on a real
   * catalog: the owner connection (a superuser on this cluster and on every
   * managed provider) must be rejected, and the provisioned runtime role must
   * not be rejected FOR ITS ROLE. Only the first direction is a hard boot
   * refusal; the second is checked as "no role-related failure", because a
   * partially-provisioned database can legitimately report table-level findings
   * that have nothing to do with which role is connected.
   */
  it('a superuser/owner connection is refused', async () => {
    const report = await assessRlsCatalogPosture(owner);
    if (!report.roleIsSuperuser && !report.roleBypassesRls) {
      throw new Error(
        `[provisioned-rls] the admin role for this database (${report.role}) is neither a ` +
          'superuser nor BYPASSRLS, so this case cannot exercise the posture check it exists ' +
          'for. Point DATABASE_URL at the owner/admin credentials the installers use (that role ' +
          'is a superuser on every managed provider this deploys to).',
      );
    }
    expect(report.failures.some(f => /superuser|BYPASSRLS/i.test(f))).toBe(true);
  });

  it('the non-superuser runtime role raises no role-related failure', async () => {
    const report = await assessRlsCatalogPosture(runtime);
    expect(report.roleIsSuperuser).toBe(false);
    expect(report.roleBypassesRls).toBe(false);
    expect(report.failures.filter(f => /superuser|BYPASSRLS|could not be resolved/i.test(f))).toEqual([]);
  });
});
