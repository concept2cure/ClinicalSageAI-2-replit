/**
 * Authoring subsystem provisioning — the five db/migrations files that back the
 * flagship IND authoring loop (server/routes/authoring.router.ts), applied AS A
 * SINGLE ATOMIC UNIT.
 *
 * WHY A UNIT. The loop-tables file stands up document/section/freeze/PIN
 * storage; the audit-trail and signature/workflow files stand up the 21 CFR
 * Part 11 evidence those same operations MUST produce; the Y.js-state file
 * stands up the durable storage the collaborative editor writes through
 * (C2C-COLLAB-001 — without it every CRDT edit is lost on unload/restart).
 * Provisioning the loop tables ALONE yields a working freeze with no audit row
 * and an e-sign that fails outright — a half-provisioned Part 11 surface that is
 * WORSE than tables plainly absent (ledger C-11 / C-14 / C-15, and the cession
 * note this supersedes in apply-c2c-migrations.mjs). So the five files apply in
 * one transaction: all present, or none.
 *
 * WHY THEY NEED THEIR OWN PATH. They live in db/migrations/ but are NOT
 * *_gcc_*.sql, so the CI psql loop (`ls db/migrations/*_gcc_*.sql`) never
 * matched them, install-fresh only overlays the root migrations/ tree, and
 * apply-c2c deliberately carried only a guarded column ALTER. No durable path
 * created these tables — every authoring handler threw on a freshly deployed
 * database, and readiness reported green anyway. This module is that path.
 *
 * SAFE TO INCLUDE IN THE APP-SCHEMA INSTALL. Unlike the uuid-keyed *_gcc_* tree
 * install-fresh deliberately excludes (its uuid tenant columns are incompatible
 * with the integer-keyed app RLS policy), every table here carries
 * `tenant_id INTEGER`, which is exactly the app tenant model.
 *
 * TENANT ISOLATION IS PART OF THE UNIT. The .sql files create tables but no
 * RLS. On the install-fresh path that is fine — its 0021_enable_rls_everywhere
 * step runs AFTER this and dynamically policies every tenant table. But on the
 * apply-c2c path (used to add the subsystem to an ALREADY-provisioned database),
 * 0021 has already run and will never revisit these new tables, leaving them
 * RLS-less: under RLS_ENFORCE=on a table with no RLS is fully readable across
 * tenants — a cross-tenant LEAK. So this helper installs the SAME
 * `tenant_isolation_policy` 0021 would, making the subsystem tenant-isolated
 * wherever it is provisioned. It is idempotent with 0021 (both DROP-IF-EXISTS
 * then CREATE the identically-named, identically-shaped policy).
 *
 * Every statement is idempotent (CREATE TABLE/INDEX IF NOT EXISTS, ALTER ... ADD
 * COLUMN IF NOT EXISTS, ENABLE/FORCE RLS, DROP POLICY IF EXISTS + CREATE), so
 * this is safe to run repeatedly and on a database that already has it.
 */

import fs from 'node:fs';
import path from 'node:path';

/**
 * The five files, in dependency order. The loop-tables file creates
 * authoring_documents / authoring_sections that later files reference; the
 * freeze-binding file ALTERs the authoring_signatures table the signatures file
 * creates, so it MUST follow it. The Y.js-state file carries a composite
 * (doc_id, tenant_id) FK onto authoring_documents(id, tenant_id), so it must
 * follow the loop-tables file that creates that UNIQUE target.
 * Repo-relative (joined against repoRoot).
 */
export const AUTHORING_SUBSYSTEM_FILES = [
  'db/migrations/20260725_authoring_document_loop_tables.sql',
  'db/migrations/20260725_authoring_audit_trail.sql',
  'db/migrations/20260725_authoring_signatures_and_workflow.sql',
  'db/migrations/20260725_authoring_signature_freeze_binding.sql',
  'db/migrations/20260727_authoring_document_yjs_state.sql',
];

/**
 * Tables the five files create (the freeze-binding file only ALTERs
 * authoring_signatures, adding no table). This is the readiness contract:
 * server/db/ensureCoreTables.ts holds the SAME list as AUTHORING_SUBSYSTEM_TABLES
 * and fails /readyz closed when any of them is absent. Keep the two in sync.
 *
 * doc_permissions (C2C-AUTHOR-002) backs the section-level write gate in
 * server/routes/authoring.router.ts. It MUST be in this list: the loop is what
 * installs tenant_isolation_policy, and on the apply-c2c path (adding the
 * subsystem to an already-provisioned database) 0021_enable_rls_everywhere has
 * already run and will never revisit a new table — an RLS-less table under
 * RLS_ENFORCE is readable across tenants, i.e. every tenant's section grants.
 *
 * The twin literal in server/db/ensureCoreTables.ts carries the SAME twelve
 * entries, so /readyz gates on doc_permissions too. (That sync was completed
 * when the CRDT and section-authorization changes were integrated — each was
 * authored against a tree that had only its own addition.)
 */
export const AUTHORING_SUBSYSTEM_TABLES = [
  'authoring_documents',
  'authoring_sections',
  'doc_revisions',
  'authoring_comments',
  'authoring_citations',
  'frozen_documents',
  'user_pins',
  'authoring_audit_trail',
  'authoring_signatures',
  'authoring_workflow_steps',
  // Durable Y.js/CRDT state for the collaborative editor (C2C-COLLAB-001).
  // Absent, every collaborative edit is silently lost on unload/restart, so it
  // belongs to the unit rather than being optional.
  'authoring_document_yjs_state',
  // Section-level permission grants (C2C-AUTHOR-002). Created by the loop-tables
  // migration with tenant_id + composite (doc_id, tenant_id) / (section_id,
  // tenant_id) FKs. Listed here so the helper applies tenant_isolation_policy to
  // it — 0021 has already run on the apply-c2c path and would never revisit a
  // newly-added table, which would leave the grant store cross-tenant readable.
  'doc_permissions',
];

/**
 * Tenant-consistent parentage (P0 #4): the four composite (parent_id, tenant_id)
 * → (id, tenant_id) foreign keys the loop-tables migration installs on the
 * working-content child links. A subsystem whose tables exist WITHOUT these
 * constraints is not correctly provisioned — RLS filters each row by its own
 * tenant, but only these FKs stop a child from structurally pointing at another
 * tenant's parent. server/db/ensureCoreTables.ts holds a synced copy and fails
 * /readyz closed on their absence; the pilot go/no-go gate checks them too.
 * Keep in sync with the DO-block in
 * db/migrations/20260725_authoring_document_loop_tables.sql.
 */
export const AUTHORING_SUBSYSTEM_FK_CONSTRAINTS = [
  'authoring_sections_doc_tenant_fkey',
  'doc_revisions_section_tenant_fkey',
  'authoring_comments_section_tenant_fkey',
  'authoring_citations_section_tenant_fkey',
];

/**
 * The tenant-isolation policy 0021_enable_rls_everywhere.sql installs, specialized
 * to the authoring tables' `tenant_id` key. Shape is copied verbatim from that
 * migration so the two converge byte-for-byte: shadow-mode bypass when
 * app.rls_enforce != 'on', tenant match against either session var, super-admin
 * escape hatch. Keep in sync with migrations/0021_enable_rls_everywhere.sql.
 */
const TENANT_POLICY_NAME = 'tenant_isolation_policy';
function tenantPolicySql(table) {
  return `
    ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.${table} FORCE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS ${TENANT_POLICY_NAME} ON public.${table};
    CREATE POLICY ${TENANT_POLICY_NAME} ON public.${table}
      FOR ALL
      USING (
        NULLIF(current_setting('app.rls_enforce', TRUE), '') IS DISTINCT FROM 'on'
        OR tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::INT
        OR tenant_id = NULLIF(current_setting('app.current_org_id',    TRUE), '')::INT
        OR current_setting('app.current_user_role', TRUE) = 'app_super_admin'
      )
      WITH CHECK (
        NULLIF(current_setting('app.rls_enforce', TRUE), '') IS DISTINCT FROM 'on'
        OR tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::INT
        OR tenant_id = NULLIF(current_setting('app.current_org_id',    TRUE), '')::INT
        OR current_setting('app.current_user_role', TRUE) = 'app_super_admin'
      );
  `;
}

/**
 * Apply the authoring subsystem as one atomic unit against `pool` (a connected
 * `pg` Pool): the five migration files, then tenant-isolation RLS on every table
 * they create. On any failure the whole transaction is rolled back, leaving the
 * subsystem ABSENT rather than half-provisioned — the state readiness reports
 * honestly, and the state recoverable by simply re-running this.
 *
 * @returns {Promise<{ applied: string[] }>} the files applied, on success.
 * @throws if any file is missing from the repo or any statement fails.
 */
export async function applyAuthoringSubsystem(pool, repoRoot, { log = () => {} } = {}) {
  const applied = [];
  try {
    await pool.query('BEGIN');
    for (const rel of AUTHORING_SUBSYSTEM_FILES) {
      const full = path.join(repoRoot, rel);
      if (!fs.existsSync(full)) {
        throw new Error(`authoring subsystem file missing from repo: ${rel}`);
      }
      const sql = fs.readFileSync(full, 'utf8');
      await pool.query(sql);
      applied.push(rel);
    }
    // Tenant isolation — every authoring table keys on tenant_id, so the subsystem
    // comes up isolated wherever it is provisioned, not only on the install-fresh
    // path whose 0021 step would otherwise be the sole source of these policies.
    for (const table of AUTHORING_SUBSYSTEM_TABLES) {
      await pool.query(tenantPolicySql(table));
    }
    await pool.query('COMMIT');
    log(`  ✓ authoring subsystem provisioned as a unit (${applied.length} files, ${AUTHORING_SUBSYSTEM_TABLES.length} tables, tenant-isolated)`);
    return { applied };
  } catch (err) {
    await pool.query('ROLLBACK').catch(() => {});
    throw new Error(
      `authoring subsystem provisioning failed — rolled back, subsystem left absent (safe to re-run): ${err.message}`,
    );
  }
}
