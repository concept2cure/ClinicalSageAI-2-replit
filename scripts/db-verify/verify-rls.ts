/**
 * RLS enforcement verification (run with DATABASE_URL set, via tsx).
 *
 * Closes and verifies a real tenant-isolation gap: 0021_enable_rls_everywhere.sql
 * is a one-time DO-block, so the research-administration tables (created in later
 * migrations) never received the `tenant_isolation_policy` — they had NO database
 * backstop. migrations/20260612_rls_research_admin.sql backfills the SAME policy.
 *
 * This proves, against the REAL policy (not a synthetic one): the new tables are
 * now covered + FORCED; shadow mode (enforcement off) passes all rows so nothing
 * breaks; with enforcement on, a tenant sees only its own rows (both directions);
 * the WITH CHECK blocks writing another tenant's row; no tenant context returns
 * zero rows (fail-closed); and the super-admin role bypasses. The enforcement test
 * runs in a rolled-back transaction, so the DB is left in shadow mode (the main
 * 82/82 harness keeps working).
 *
 * Apply the migration first: psql ... -f migrations/20260612_rls_research_admin.sql
 */
import { pool } from '../../server/db';

let pass = 0, fail = 0;
function ok(cond: boolean, msg: string) { if (cond) { pass++; console.log('  ✓', msg); } else { fail++; console.log('  ✗ FAIL:', msg); } }

const NEW_TABLES = ['grant_awards', 'effort_certifications', 'coi_disclosures', 'research_personnel', 'grant_closeout_records', 'grant_subawards', 'iacuc_protocols', 'irb_submissions'];
const set = (k: string, v: string) => `SELECT set_config('${k}', '${v}', true)`;
const INS = (org: number, num: string) =>
  `INSERT INTO grant_awards (organization_id, award_number, funding_agency, status, created_by) VALUES (${org}, '${num}', 'nih', 'active', 1)`;

async function main() {
  await pool.query(`INSERT INTO organizations(id,name) VALUES (1,'Org A'),(2,'Org B') ON CONFLICT DO NOTHING`);
  await pool.query(`INSERT INTO users(id,email) VALUES (1,'u@x') ON CONFLICT DO NOTHING`);

  console.log('\n[RLS] coverage — research-admin tables now carry tenant_isolation_policy');
  const covered = await pool.query(
    `SELECT count(DISTINCT tablename)::int n FROM pg_policies WHERE policyname='tenant_isolation_policy' AND tablename = ANY($1)`, [NEW_TABLES]);
  ok(covered.rows[0].n === NEW_TABLES.length, `all ${NEW_TABLES.length} sampled research-admin tables have the policy (have ${covered.rows[0].n}) — run the migration if this fails`);
  const forced = await pool.query(
    `SELECT bool_and(relrowsecurity) e, bool_and(relforcerowsecurity) f FROM pg_class WHERE relname = ANY($1)`, [NEW_TABLES]);
  ok(forced.rows[0].e === true && forced.rows[0].f === true, 'RLS is ENABLED + FORCED on them (owner is not exempt)');

  console.log('\n[RLS] shadow mode (enforcement off) — existing behavior is unbroken');
  const shadow = await pool.query(`SELECT count(*)::int n FROM grant_awards`);
  ok(shadow.rows[0].n >= 1, 'with app.rls_enforce unset, all rows pass (no breakage)');

  console.log('\n[RLS] enforcement on — tenant isolation, fail-closed, WITH CHECK, super-admin');
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    await c.query(set('app.rls_enforce', 'on'));

    // Org 1 context: insert its own row; cross-tenant write must be rejected.
    await c.query(set('app.current_tenant_id', '1'));
    await c.query(INS(1, 'RLS-A1'));
    let checkBlocked = false;
    await c.query('SAVEPOINT sp');
    try { await c.query(INS(2, 'RLS-B-bad')); }
    catch (e: any) { checkBlocked = /row-level security|policy/i.test(e.message); await c.query('ROLLBACK TO SAVEPOINT sp'); }
    ok(checkBlocked, 'WITH CHECK blocks writing an org-2 row under org-1 context');
    ok((await c.query(`SELECT count(*)::int n FROM grant_awards WHERE organization_id <> 1`)).rows[0].n === 0, 'org-1 context sees ZERO non-org-1 rows');

    // Org 2 context.
    await c.query(set('app.current_tenant_id', '2'));
    await c.query(INS(2, 'RLS-B2'));
    ok((await c.query(`SELECT count(*)::int n FROM grant_awards WHERE award_number='RLS-A1'`)).rows[0].n === 0, 'org-2 context cannot see the org-1 row (isolation)');
    ok((await c.query(`SELECT count(*)::int n FROM grant_awards WHERE organization_id <> 2`)).rows[0].n === 0, 'org-2 context sees ZERO non-org-2 rows');

    // Back to org 1: the org-2 row is invisible (isolation both directions).
    await c.query(set('app.current_tenant_id', '1'));
    ok((await c.query(`SELECT count(*)::int n FROM grant_awards WHERE award_number='RLS-B2'`)).rows[0].n === 0, 'org-1 context cannot see the org-2 row (both directions)');

    // No tenant context → fail-closed.
    await c.query(set('app.current_tenant_id', ''));
    ok((await c.query(`SELECT count(*)::int n FROM grant_awards`)).rows[0].n === 0, 'enforcement on + NO tenant context → zero rows (fail-closed)');

    // Super-admin role bypasses isolation (sees both tenants' seeded rows).
    await c.query(set('app.current_user_role', 'app_super_admin'));
    ok((await c.query(`SELECT count(*)::int n FROM grant_awards WHERE award_number IN ('RLS-A1','RLS-B2')`)).rows[0].n === 2, 'app_super_admin role bypasses isolation (sees both tenants)');

    await c.query('ROLLBACK'); // undo enforcement vars + seed rows; DB returns to shadow mode
  } catch (e) {
    await c.query('ROLLBACK').catch(() => undefined);
    console.error('HARNESS ERROR', e);
    fail++;
  } finally {
    c.release();
  }

  console.log(`\n==== RLS VERIFICATION: ${pass} passed, ${fail} failed ====`);
  await pool.end();
  process.exit(fail === 0 ? 0 : 1);
}
main().catch((e) => { console.error('HARNESS ERROR', e); process.exit(2); });
