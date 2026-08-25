/**
 * Security contract: stability module tenant isolation (High-severity fix).
 *
 * Finding: docs/security/STABILITY_TENANT_ISOLATION_FINDING.md — the stability
 * router scoped GMP data by surrogate ids (study_id / capa_id) with no tenant
 * predicate and an inert set_config('app.tenant_id'), so a caller who knew another
 * tenant's id could read/update its rows.
 *
 * db/migrations/20260728_stability_tenant_isolation.sql brings every stab_* table
 * under the app's uniform tenant_isolation_policy (0021), keyed on
 * app.current_tenant_id, FORCE RLS, shadow-mode gated on app.rls_enforce.
 *
 * This suite applies the migration to real Postgres (PGlite) and reproduces the
 * finding's exact attack under enforcement — a NON-superuser role (RLS is bypassed
 * for superusers/owners, so the test must drop role exactly as the app's non-owner
 * Neon login role does) with app.rls_enforce='on'. It asserts:
 *   - a tenant's INSERTs auto-tag tenant_id from the connection (the router omits it),
 *   - a second tenant's cross-tenant SELECT/UPDATE by surrogate id affect ZERO rows,
 *   - each tenant still sees its own rows, and
 *   - with enforcement off (shadow mode) the policy correctly bypasses — proving the
 *     policy, not an accident of the data, is what isolates.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';

const MIGRATION = 'db/migrations/20260728_stability_tenant_isolation.sql';
let db: PGlite;

/**
 * Mirror the router's tenant-scoped connection facade: one transaction, session
 * vars set is_local (discarded at COMMIT — no stale-var leak), dropped to a
 * non-superuser role so RLS actually applies.
 */
async function asTenant<T>(
  tenantId: number | null,
  enforce: boolean,
  fn: () => Promise<T>,
): Promise<T> {
  await db.exec('BEGIN');
  try {
    await db.query(`SELECT set_config('app.rls_enforce', $1, true)`, [enforce ? 'on' : 'off']);
    await db.query(`SELECT set_config('app.current_tenant_id', $1, true)`, [
      tenantId == null ? '' : String(tenantId),
    ]);
    await db.exec('SET LOCAL ROLE stab_app');
    const r = await fn();
    await db.exec('COMMIT');
    return r;
  } catch (e) {
    await db.exec('ROLLBACK').catch(() => {});
    throw e;
  }
}

beforeAll(async () => {
  db = new PGlite();
  // Representative stability tables, shaped like the REAL database:
  //   * stab_studies already carries tenant_id — and carries it as TEXT, which is
  //     what 023_stability_step2.sql actually created. This is the case that broke
  //     the first version of this migration: ADD COLUMN IF NOT EXISTS silently
  //     skipped the existing TEXT column and the integer-comparing policy then
  //     failed with "operator does not exist: text = integer". The fixture models
  //     it so a regression cannot pass this suite again.
  //   * stab_results / stab_capa have NO tenant_id — the migration must add it.
  // Surrogate PKs are the ids the finding's attack uses.
  await db.exec(`
    CREATE TABLE stab_studies (study_id TEXT PRIMARY KEY, name TEXT, tenant_id TEXT);
    CREATE TABLE stab_results (result_id TEXT PRIMARY KEY, study_id TEXT, value TEXT);
    CREATE TABLE stab_capa   (capa_id TEXT PRIMARY KEY, study_id TEXT, title TEXT, status TEXT);
    CREATE ROLE stab_app NOLOGIN;
    GRANT ALL ON stab_studies, stab_results, stab_capa TO stab_app;
  `);
  // A pre-existing row whose tenant is stored as a numeric STRING — it must survive
  // the coercion with its tenant intact.
  await db.exec(`INSERT INTO stab_studies (study_id, name, tenant_id) VALUES ('LEGACY','Legacy study','1')`);

  // Apply the security migration — it scans the catalog and isolates every stab_* table.
  await db.exec(fs.readFileSync(path.resolve(MIGRATION), 'utf8'));
}, 60_000);

afterAll(async () => {
  await db?.close();
});

describe('stability tenant isolation (security fix) enforces under RLS', () => {
  it('COERCES a pre-existing TEXT tenant_id to integer, preserving the tenant', async () => {
    // Regression guard for "operator does not exist: text = integer". The platform
    // requires an integer tenant key (0021 refuses to attach a policy to anything
    // else), so the migration must convert rather than skip.
    const col = await db.query<{ data_type: string }>(
      `SELECT data_type FROM information_schema.columns
        WHERE table_name = 'stab_studies' AND column_name = 'tenant_id'`,
    );
    expect(col.rows[0]?.data_type).toBe('integer');

    // The legacy row kept its tenant, as the integer 1 rather than the string '1'.
    const legacy = await db.query<{ tenant_id: number }>(
      `SELECT tenant_id FROM stab_studies WHERE study_id = 'LEGACY'`,
    );
    expect(legacy.rows[0].tenant_id).toBe(1);

    // And it is visible to its own tenant under enforcement, not orphaned by the
    // conversion.
    const seen = await asTenant(1, true, () =>
      db.query(`SELECT study_id FROM stab_studies WHERE study_id = 'LEGACY'`),
    );
    expect(seen.rows.length).toBe(1);
    // …and invisible to another tenant.
    const unseen = await asTenant(2, true, () =>
      db.query(`SELECT study_id FROM stab_studies WHERE study_id = 'LEGACY'`),
    );
    expect(unseen.rows.length).toBe(0);
  });

  it('the migration added an integer tenant_id + default + policy to tables that lacked it', async () => {
    const col = await db.query<{ data_type: string; column_default: string | null }>(
      `SELECT data_type, column_default FROM information_schema.columns
        WHERE table_name = 'stab_capa' AND column_name = 'tenant_id'`,
    );
    expect(col.rows[0]?.data_type).toBe('integer');
    expect(col.rows[0]?.column_default ?? '').toContain('app.current_tenant_id');
    const pol = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM pg_policies
        WHERE tablename = 'stab_capa' AND policyname = 'tenant_isolation_policy'`,
    );
    expect(pol.rows[0].n).toBe(1);
  });

  it('INSERTs auto-tag tenant_id from the connection, and cross-tenant access by surrogate id is blocked', async () => {
    // Tenant 1 creates a study, a result, and a CAPA — none passing tenant_id.
    await asTenant(1, true, async () => {
      await db.query(`INSERT INTO stab_studies (study_id, name) VALUES ('S1','Tenant1 study')`);
      await db.query(`INSERT INTO stab_results (result_id, study_id, value) VALUES ('R1','S1','9.9')`);
      await db.query(`INSERT INTO stab_capa (capa_id, study_id, title, status) VALUES ('C1','S1','OOS follow-up','OPEN')`);
    });

    // Auto-tag worked: the CAPA row is tenant 1's.
    const tag = await asTenant(1, true, () =>
      db.query<{ tenant_id: number }>(`SELECT tenant_id FROM stab_capa WHERE capa_id='C1'`),
    );
    expect(tag.rows[0].tenant_id).toBe(1);

    // Tenant 2 exists but must not see or mutate tenant 1's rows via the surrogate ids.
    await asTenant(2, true, async () => {
      await db.query(`INSERT INTO stab_studies (study_id, name) VALUES ('S2','Tenant2 study')`);

      // finding attack #1: read another tenant's CAPA by capa_id
      const capa = await db.query(`SELECT * FROM stab_capa WHERE capa_id='C1'`);
      expect(capa.rows.length).toBe(0);

      // finding attack #2: update another tenant's CAPA by capa_id
      const upd = await db.query(`UPDATE stab_capa SET status='HACKED' WHERE capa_id='C1'`);
      expect(upd.affectedRows ?? 0).toBe(0);

      // finding attack #3: read another tenant's results by study_id
      const res = await db.query(`SELECT * FROM stab_results WHERE study_id='S1'`);
      expect(res.rows.length).toBe(0);
    });

    // Tenant 1 still sees its own CAPA, and the cross-tenant UPDATE never landed.
    const own = await asTenant(1, true, () =>
      db.query<{ status: string }>(`SELECT status FROM stab_capa WHERE capa_id='C1'`),
    );
    expect(own.rows.length).toBe(1);
    expect(own.rows[0].status).toBe('OPEN'); // not 'HACKED'
  });

  it('shadow mode (rls_enforce != on) bypasses — proving the policy is what isolates', async () => {
    // Same cross-tenant read as attack #1, but with enforcement OFF: it now returns
    // the row. This is the 0021 shadow-mode contract, and it proves the zero-row
    // results above are the policy acting, not empty data.
    const capa = await asTenant(2, false, () =>
      db.query(`SELECT * FROM stab_capa WHERE capa_id='C1'`),
    );
    expect(capa.rows.length).toBe(1);
  });

  it('missing tenant context under enforcement is fail-closed (zero rows), never a leak', async () => {
    const capa = await asTenant(null, true, () =>
      db.query(`SELECT * FROM stab_capa WHERE capa_id='C1'`),
    );
    expect(capa.rows.length).toBe(0);
  });
});
