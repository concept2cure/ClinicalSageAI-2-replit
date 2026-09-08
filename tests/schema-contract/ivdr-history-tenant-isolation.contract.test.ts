/**
 * Schema contract: the three IVDR append-only history tables are tenant-isolated
 * at the DATABASE, not only in the route that writes them.
 *
 * `ivdr_validation_parameter_history`, `ivdr_cdx_status_history` and
 * `ivdr_evidence_result_history` carry no tenant column of their own — their
 * tenant is their parent's, reached by foreign key. Both isolation sweeps are
 * therefore blind to them: db/migrations/20260801_tenant_isolation_sweep.sql
 * matches on organization_id / org_id / tenant_id, and the non-public sweep is an
 * explicit uuid-keyed list. They sat with relrowsecurity = false and zero
 * policies, which the sweep's own header calls out as "fully readable across
 * tenants" under RLS_ENFORCE=on.
 *
 * Measured on the dev database as the app role `c2c` (not a superuser) with
 * app.rls_enforce='on' and app.current_tenant_id='9002', before this migration:
 *
 *   parent  ivdr_analytical_validations        1 of 2 rows visible   (policied)
 *   child   ivdr_validation_parameter_history  2 of 2 rows visible   (NO RLS)
 *
 * The row that should not have been there read "org 9001 secret LoD". These are
 * the append-only audit trails whose entire value is that another party cannot
 * read or forge them.
 *
 * These tests run the REAL migration against a real Postgres and then exercise
 * the policy AS A NON-SUPERUSER — the only way to observe RLS at all, since a
 * superuser bypasses it. A pg_policies grep would confirm a policy that does not
 * actually isolate; asserting the SELECT and the INSERT is what pins behaviour.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const MIGRATION = path.join(REPO_ROOT, 'migrations/20260906_ivdr_history_tenant_isolation.sql');

/** The (child, fk, parent) triples the migration covers. */
const PAIRS = [
  ['ivdr_validation_parameter_history', 'validation_id', 'ivdr_analytical_validations'],
  ['ivdr_cdx_status_history', 'workflow_id', 'ivdr_cdx_workflows'],
  ['ivdr_evidence_result_history', 'evidence_id', 'ivdr_clinical_evidence'],
] as const;

let db: PGlite;

/** Minimal shapes — only the columns the policy reads. */
async function provision(pg: PGlite) {
  for (const [child, fk, parent] of PAIRS) {
    await pg.exec(`
      CREATE TABLE ${parent} (id SERIAL PRIMARY KEY, organization_id INTEGER NOT NULL);
      CREATE TABLE ${child} (id SERIAL PRIMARY KEY, ${fk} INTEGER NOT NULL REFERENCES ${parent}(id), reason TEXT);
    `);
  }
  // A non-superuser: RLS does not apply to a superuser, so every assertion below
  // would pass vacuously without this.
  await pg.exec(`CREATE ROLE app_role NOLOGIN;`);
  for (const [child, , parent] of PAIRS) {
    await pg.exec(`GRANT SELECT, INSERT ON ${child}, ${parent} TO app_role;`);
    await pg.exec(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_role;`);
  }
}

async function seed(pg: PGlite) {
  for (const [child, fk, parent] of PAIRS) {
    await pg.exec(`
      INSERT INTO ${parent} (id, organization_id) VALUES (1, 9001), (2, 9002);
      INSERT INTO ${child} (${fk}, reason) VALUES (1, 'org 9001 secret'), (2, 'org 9002 own');
    `);
  }
}

async function asTenant(pg: PGlite, tenant: string, enforce = 'on', role = 'app_user') {
  await pg.exec(`
    SET ROLE app_role;
    SELECT set_config('app.rls_enforce', '${enforce}', false),
           set_config('app.current_tenant_id', '${tenant}', false),
           set_config('app.current_user_role', '${role}', false);
  `);
}
const asOwner = (pg: PGlite) => pg.exec('RESET ROLE;');

beforeEach(async () => {
  db = new PGlite();
  await provision(db);
  await seed(db);
});
afterEach(async () => { await db.close(); });

describe('IVDR history tables — tenant isolation at the database', () => {
  it('is fully readable across tenants BEFORE the migration (the hole this closes)', async () => {
    await asTenant(db, '9002');
    const r = await db.query<{ reason: string }>(
      `SELECT reason FROM ivdr_validation_parameter_history ORDER BY reason`,
    );
    await asOwner(db);
    // Not an aspiration — this is the measured production posture being fixed.
    expect(r.rows.map((x) => x.reason)).toEqual(['org 9001 secret', 'org 9002 own']);
  });

  it('hides another tenant\'s history rows on every one of the three tables', async () => {
    await db.exec(fs.readFileSync(MIGRATION, 'utf8'));
    await asTenant(db, '9002');
    for (const [child] of PAIRS) {
      const r = await db.query<{ reason: string }>(`SELECT reason FROM ${child}`);
      expect(r.rows.map((x) => x.reason), `${child} leaked`).toEqual(['org 9002 own']);
    }
    await asOwner(db);
  });

  it('refuses a history row forged onto another tenant\'s parent, and allows its own', async () => {
    await db.exec(fs.readFileSync(MIGRATION, 'utf8'));
    await asTenant(db, '9002');
    await expect(
      db.exec(`INSERT INTO ivdr_validation_parameter_history (validation_id, reason) VALUES (1, 'FORGED')`),
    ).rejects.toThrow(/row-level security/i);
    await asTenant(db, '9002');
    await expect(
      db.exec(`INSERT INTO ivdr_validation_parameter_history (validation_id, reason) VALUES (2, 'legitimate')`),
    ).resolves.toBeDefined();
    await asOwner(db);
  });

  it('does not restrict in shadow mode — RLS_ENFORCE off must change nothing', async () => {
    await db.exec(fs.readFileSync(MIGRATION, 'utf8'));
    await asTenant(db, '9002', 'off');
    const r = await db.query(`SELECT reason FROM ivdr_validation_parameter_history`);
    await asOwner(db);
    expect(r.rows).toHaveLength(2);
  });

  it('keeps the super-admin escape hatch the sweep\'s policy shape carries', async () => {
    await db.exec(fs.readFileSync(MIGRATION, 'utf8'));
    await asTenant(db, '9002', 'on', 'app_super_admin');
    const r = await db.query(`SELECT reason FROM ivdr_validation_parameter_history`);
    await asOwner(db);
    expect(r.rows).toHaveLength(2);
  });

  it('enables and FORCEs RLS on all three, and is idempotent', async () => {
    const sql = fs.readFileSync(MIGRATION, 'utf8');
    await db.exec(sql);
    await db.exec(sql); // re-runs on every deploy (CLAUDE.md RULE 1)
    const r = await db.query<{ relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean; n: number }>(
      `SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity,
              (SELECT COUNT(*)::int FROM pg_policies p WHERE p.tablename = c.relname) AS n
         FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace
        WHERE ns.nspname = 'public' AND c.relname = ANY($1) ORDER BY c.relname`,
      [PAIRS.map(([child]) => child)],
    );
    expect(r.rows).toHaveLength(3);
    for (const row of r.rows) {
      expect(row.relrowsecurity, `${row.relname} RLS`).toBe(true);
      expect(row.relforcerowsecurity, `${row.relname} FORCE`).toBe(true);
      expect(row.n, `${row.relname} policy count after two runs`).toBe(1);
    }
  });

  it('skips quietly when the pair is not provisioned, rather than failing a deploy', async () => {
    const bare = new PGlite();
    await expect(bare.exec(fs.readFileSync(MIGRATION, 'utf8'))).resolves.toBeDefined();
    await bare.close();
  });
});
