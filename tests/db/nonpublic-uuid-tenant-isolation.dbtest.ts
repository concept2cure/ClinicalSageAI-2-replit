/**
 * Non-public uuid-keyed schemas isolate tenants BY BEHAVIOUR, not by policy text.
 *
 * ── What this is defending ──────────────────────────────────────────────────
 * 48 policies across 46 tables in the uuid-keyed schemas (cortex, regulatory_intel,
 * manufacturing, core, global_dossier, …) were written as
 *
 *     <col> = COALESCE(<resolver>, <col>)
 *
 * The resolver is guarded against a cast error — substring() against a uuid
 * regex yields NULL rather than raising 22P02 — but COALESCE then substitutes
 * the row's OWN tenant id, so the predicate becomes `<col> = <col>`: true for
 * every row in the table. A scope that could not be resolved granted
 * EVERYTHING rather than nothing.
 *
 * Measured before the fix, as app_service with app.rls_enforce=on, on two rows
 * under different org_ids: an unset GUC returned both tenants' rows, and so did
 * a GUC of '42'. Both inputs are reachable — establishRequestTenantScope writes
 * the GUC as `orgUuid ?? ''`, and '42' is what an INTEGER org id looks like
 * arriving at a uuid-keyed schema. core.programs is among the affected tables,
 * and 26 further policies resolve tenancy THROUGH it.
 *
 * ── Why this exists alongside the deploy-smoke gate ─────────────────────────
 * deploy-smoke-assert.mjs greps every policy expression for the COALESCE
 * fallback. That catches the shape, which is the thing most likely to be
 * reintroduced — but it is still a check on TEXT. It would pass a policy that
 * had stopped filtering for some entirely different reason: a resolver renamed,
 * a GUC spelled differently, RLS switched off on the table, the runtime role
 * granted BYPASSRLS. This file asserts the property those texts are supposed to
 * produce, by actually reading and writing across two tenants as the
 * non-superuser role.
 *
 * Owner execution proves nothing here — the owner is superuser on most managed
 * providers and RLS never filters for it — so APP_DATABASE_URL is required, the
 * same contract two-tenant-application-rls.dbtest.ts uses.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { databaseUrl } from '../setup.db';

/** A uuid-keyed, non-public table carrying one of the repaired policies. */
const REL = 'cortex.knowledge_gaps';
const TAG = `c2c-nonpublic-${process.pid}-${Date.now().toString(36)}`;
const ORG_A = '11111111-1111-4111-8111-1111111111a1';
const ORG_B = '22222222-2222-4222-8222-2222222222b2';

let owner: Pool;
let app: Pool;

/** Count the probe rows visible under a given session state, as app_service. */
async function visibleUnder(settings: Array<[string, string]>): Promise<number> {
  const client = await app.connect();
  try {
    for (const [k, v] of settings) {
      // set_config with is_local=false: these are session settings on a
      // connection this test owns for the duration of the call.
      await client.query('SELECT set_config($1, $2, false)', [k, v]);
    }
    const { rows } = await client.query(
      `SELECT count(*)::int AS n FROM ${REL} WHERE gap_name LIKE $1`,
      [`${TAG}%`],
    );
    return rows[0].n;
  } finally {
    client.release();
  }
}

beforeAll(async () => {
  if (!process.env.APP_DATABASE_URL) {
    throw new Error(
      'APP_DATABASE_URL is required; the owner bypasses RLS, so owner execution is not an isolation proof',
    );
  }
  owner = new Pool({ connectionString: databaseUrl, max: 2 });
  app = new Pool({ connectionString: process.env.APP_DATABASE_URL, max: 2 });

  // The runtime role must genuinely be subject to RLS, or every assertion
  // below would pass for the wrong reason.
  const { rows } = await app.query(
    `SELECT current_user AS role, rolsuper, rolbypassrls
       FROM pg_roles WHERE rolname = current_user`,
  );
  expect(rows[0].rolsuper, 'runtime role must not be superuser').toBe(false);
  expect(rows[0].rolbypassrls, 'runtime role must not have BYPASSRLS').toBe(false);

  await owner.query(
    `INSERT INTO ${REL} (gap_type, gap_name, org_id) VALUES
       ('therapeutic_area', $1, $3),
       ('therapeutic_area', $2, $4)`,
    [`${TAG}-A`, `${TAG}-B`, ORG_A, ORG_B],
  );
}, 60_000);

afterAll(async () => {
  if (owner) {
    await owner.query(`DELETE FROM ${REL} WHERE gap_name LIKE $1`, [`${TAG}%`]).catch(() => {});
    await owner.end();
  }
  if (app) await app.end();
});

describe(`${REL} — an unresolved tenant scope returns NOTHING, not everything`, () => {
  it('shows a tenant only its own row when correctly scoped', async () => {
    expect(await visibleUnder([['app.rls_enforce', 'on'], ['app.current_org_id', ORG_A]])).toBe(1);
    expect(await visibleUnder([['app.rls_enforce', 'on'], ['app.current_org_id', ORG_B]])).toBe(1);
  });

  it('shows NOTHING when no org scope is set', async () => {
    // The pre-fix answer here was 2 — every tenant's rows.
    expect(await visibleUnder([['app.rls_enforce', 'on'], ['app.current_org_id', '']])).toBe(0);
  });

  it('shows NOTHING when the org scope is not a uuid', async () => {
    // '42' is precisely what an integer org id looks like reaching a uuid
    // schema. Pre-fix this also returned 2.
    expect(await visibleUnder([['app.rls_enforce', 'on'], ['app.current_org_id', '42']])).toBe(0);
  });

  it('still does not filter when enforcement is off, so unscoped legacy readers keep working', async () => {
    // This is the property the COALESCE fallback was there to provide. It is
    // now carried by the app.rls_enforce shadow clause instead — the same
    // switch the public-schema policies use — so turning enforcement off is a
    // deliberate posture rather than an accident of an unset variable.
    expect(await visibleUnder([['app.rls_enforce', 'off'], ['app.current_org_id', '']])).toBe(2);
  });
});

describe(`${REL} — WITH CHECK refuses a write aimed at another tenant`, () => {
  /**
   * The fail-open WITH CHECK was the worse half: a fail-open read shows one
   * tenant another's rows, a fail-open write lets an unscoped caller INSERT
   * under ANY tenant's org_id.
   */
  async function insertAs(scope: string, targetOrg: string): Promise<string | null> {
    const client = await app.connect();
    try {
      await client.query("SELECT set_config('app.rls_enforce', 'on', false)");
      await client.query('SELECT set_config($1, $2, false)', ['app.current_org_id', scope]);
      await client.query(
        `INSERT INTO ${REL} (gap_type, gap_name, org_id) VALUES ('therapeutic_area', $1, $2)`,
        [`${TAG}-write`, targetOrg],
      );
      return null;
    } catch (err) {
      return err instanceof Error ? err.message : String(err);
    } finally {
      client.release();
    }
  }

  it('accepts a write into the caller’s own tenant', async () => {
    expect(await insertAs(ORG_A, ORG_A)).toBeNull();
  });

  /**
   * Asserted in two steps rather than one toMatch: when the policy IS
   * fail-open the insert succeeds and insertAs returns null, and
   * `expect(null).toMatch(...)` reports "expects to receive a string, but got
   * object" — which says nothing about tenant isolation. The null check first
   * makes the failure name the actual defect.
   */
  function expectRefused(err: string | null, what: string) {
    expect(err, `${what} must be refused by RLS, but the insert SUCCEEDED`).not.toBeNull();
    expect(err).toMatch(/row-level security/i);
  }

  it('refuses a write aimed at another tenant', async () => {
    expectRefused(await insertAs(ORG_A, ORG_B), 'a write aimed at another tenant');
  });

  it('refuses a write when no scope is set at all', async () => {
    expectRefused(await insertAs('', ORG_B), 'an unscoped write into a tenant');
  });
});
