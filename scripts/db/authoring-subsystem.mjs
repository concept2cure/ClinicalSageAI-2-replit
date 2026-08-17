/**
 * Authoring subsystem provisioning — the db/migrations files that back the
 * flagship IND authoring loop (server/routes/authoring.router.ts), applied AS A
 * SINGLE ATOMIC UNIT (AUTHORING_SUBSYSTEM_FILES below is the authoritative list).
 *
 * (Durable CRDT state is NOT part of this unit. It lives in its own table,
 * created by db/migrations/20260727_collab_document_state.sql and applied on the
 * apply-c2c path — see server/services/hocuspocus-server.ts.)
 *
 * WHY A UNIT. The loop-tables file stands up document/section/freeze/PIN
 * storage; the audit-trail and signature/workflow files stand up the 21 CFR
 * Part 11 evidence those same operations MUST produce.
 * Provisioning the loop tables ALONE yields a working freeze with no audit row
 * and an e-sign that fails outright — a half-provisioned Part 11 surface that is
 * WORSE than tables plainly absent (ledger C-11 / C-14 / C-15, and the cession
 * note this supersedes in apply-c2c-migrations.mjs). So the four files apply in
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
 * The files, in dependency order. The loop-tables file creates
 * authoring_documents / authoring_sections that later files reference; the
 * freeze-binding file ALTERs the authoring_signatures table the signatures file
 * creates, so it MUST follow it; the C-30 workflow-schema file applies last (its
 * tables soft-reference the loop tables but declare no cross-file FK).
 * Repo-relative (joined against repoRoot).
 */
export const AUTHORING_SUBSYSTEM_FILES = [
  'db/migrations/20260725_authoring_document_loop_tables.sql',
  'db/migrations/20260725_authoring_audit_trail.sql',
  'db/migrations/20260725_authoring_signatures_and_workflow.sql',
  'db/migrations/20260725_authoring_signature_freeze_binding.sql',
  // C2C-AUTHOR-002 object-level authorization: adds doc_permissions columns
  // (role/grant metadata) and the SECURITY DEFINER seed trigger that grants each
  // document creator OWNER + AUTHOR. Depends only on authoring_documents /
  // authoring_sections (from the loop-tables file above) and public.users, so it
  // slots in after the 20260725 loop-tables set and before the 20260730_* files.
  'db/migrations/20260727_authoring_object_permissions.sql',
  // The router's own tables (authoring_tokens/templates/template_guidance/
  // template_usage/section_guidance/export_history/tracked_change_decisions).
  // These were created by runtime `ensure*` DDL inside authoring.router.ts until
  // the canonical-spine refactor retired that DDL and moved it into this
  // migration — but left the migration on NO durable applier, so the router now
  // writes to tables nothing creates (a 500 on every real deploy, and the
  // authoring schema-contract / role-gate / ind-authoring proof-tier tests fail
  // for the same missing relations). Adding it here is what actually provisions
  // them. Additive, all CREATE TABLE/INDEX IF NOT EXISTS.
  'db/migrations/20260730_authoring_runtime_ddl.sql',
  // C-27 reconciliation: add the columns authoring.router.ts references on
  // authoring_comments (threaded comments / resolution / attribution) and
  // user_pins (last_changed) to the CANONICAL tables the loop-tables migration
  // above creates. Without these the router's comment endpoints 500 on every
  // real deploy (the columns live only in the deploy-dead
  // 20260730_authoring_subsystem_schema.sql). Additive ALTER … ADD COLUMN IF NOT
  // EXISTS; must run after the loop tables that create these tables.
  'db/migrations/20260730_authoring_comments_router_columns.sql',
  // Immutable revision ledger: hash-chain + origin + input-manifest columns on
  // doc_revisions, and the engine-enforced append-only trigger. Additive ALTER
  // + CREATE OR REPLACE FUNCTION/TRIGGER; must follow the loop-tables file
  // that creates doc_revisions. Verified end-to-end by
  // authoring-ledger.pglite.integration.test.ts.
  'db/migrations/20260817_doc_revisions_immutable_ledger.sql',
  // C-30: the genuinely-new authoring WORKFLOW tables (reviews, audit events, AI
  // suggestions, compliance scoring, suggestion feedback, comment activity,
  // exports, change requests, checklists(+items), template sections). After C-27
  // retired this file's 10 duplicate copies of the canonical loop tables, these
  // 12 residual tables are the ONLY thing it creates — and every one is queried
  // by server/routes/authoring.router.ts, yet the file was on NO durable applier
  // (deploy-dead, ledger C-23 class): its endpoints 500 on every real deploy with
  // missing-relation errors, exactly as the SCOPE NOTEs in the router's
  // change-request/checklist handlers describe. The schema was already PROVEN
  // (authoring-migration.pglite.integration.test.ts applies it and executes the
  // router's real SQL against it; authoring-schema-contract pins the columns) —
  // it just never shipped. Adding it here is what actually provisions it.
  // FK-free across subsystems except its two internal cascades
  // (doc_checklist_items.checklist_id → doc_checklist, and the router's soft
  // doc_id references), so it applies last with no dependency on the files above.
  'db/migrations/20260730_authoring_subsystem_schema.sql',
];

/**
 * Tables the four files create (the freeze-binding file only ALTERs
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
 * The twin literal in server/db/ensureCoreTables.ts carries the SAME entries,
 * so /readyz gates on doc_permissions too.
 *
 * Every table in THIS list carries `tenant_id INTEGER` and is therefore eligible
 * for the standard tenant_isolation_policy applyAuthoringSubsystem installs and
 * deploy-migrate's verifyReadinessContract asserts. The workflow tables that do
 * NOT carry tenant_id (doc_change_requests / doc_checklist(+items) / doc_exports)
 * are provisioned by the same files but isolated by a DIFFERENT, parent-scoped
 * policy — see AUTHORING_SUBSYSTEM_DOCSCOPED_TABLES below; they must not appear
 * here or both the policy install and the readiness check would try to filter a
 * `tenant_id` column that does not exist.
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
  // Section-level permission grants (C2C-AUTHOR-002). Created by the loop-tables
  // migration with tenant_id + composite (doc_id, tenant_id) / (section_id,
  // tenant_id) FKs. Listed here so the helper applies tenant_isolation_policy to
  // it — 0021 has already run on the apply-c2c path and would never revisit a
  // newly-added table, which would leave the grant store cross-tenant readable.
  'doc_permissions',
  // C-30: the eight tenant-scoped WORKFLOW tables from
  // 20260730_authoring_subsystem_schema.sql. Each carries tenant_id INTEGER and
  // is filtered `WHERE tenant_id = $n` by the router, so each takes the standard
  // tenant_isolation_policy exactly like its siblings above. Being in this list
  // also means deploy-migrate's readiness contract, /readyz (ensureCoreTables),
  // and the pilot go/no-go gate all now surface their absence instead of letting
  // the first authoring request discover it as a 500.
  'authoring_comment_activity',
  'authoring_reviews',
  'authoring_audit_events',
  'authoring_ai_suggestions',
  'authoring_compliance_scores',
  'authoring_suggestion_feedback',
  'authoring_exports',
  'template_sections',
];

/**
 * C-30: the workflow tables from 20260730_authoring_subsystem_schema.sql that
 * carry NO tenant_id. The router keys them by an opaque doc_id / checklist_id and
 * never tenant-filters them (see the SCOPE NOTEs in authoring.router.ts's
 * change-request and checklist handlers), so they cannot take the standard
 * tenant_isolation_policy — there is no tenant_id column to compare.
 *
 * They are still tenant-sensitive: a change request or checklist belongs to the
 * document it hangs off, and that document IS tenant-isolated. So each gets a
 * PARENT-SCOPED policy that ties its visibility to the owning authoring_documents
 * row's tenant, expressed as an EXISTS subquery. The policy has the same
 * shadow/enforce shape as tenant_isolation_policy: when app.rls_enforce != 'on'
 * (the production default this raw-pool router runs under) it passes everything,
 * so the router keeps working unchanged; under RLS_ENFORCE=on it isolates by the
 * parent document's tenant, closing what would otherwise be a cross-tenant read
 * of another tenant's change requests / checklists for any caller that already
 * holds a foreign doc_id.
 *
 * `parentExists` is the row-visibility predicate: an EXISTS against
 * authoring_documents (directly for the doc_id-keyed tables, via doc_checklist
 * for the items table). doc_exports is legacy (no live SQL references it after the
 * canonical export path moved to authoring_export_history) but is still created
 * by the file and blessed by the integration test, so it is isolated the same
 * way rather than left policy-free.
 */
// The tenant match reused by every parent-scoped predicate below — the SAME two
// session vars tenant_isolation_policy consults, applied to the PARENT document's
// tenant_id. Kept as one constant so the doc-scoped and tenant policies converge.
const PARENT_TENANT_MATCH = `(d.tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::INT
        OR d.tenant_id = NULLIF(current_setting('app.current_org_id', TRUE), '')::INT)`;

export const AUTHORING_SUBSYSTEM_DOCSCOPED_TABLES = [
  {
    table: 'doc_change_requests',
    parentExists: `EXISTS (SELECT 1 FROM public.authoring_documents d
        WHERE d.id::text = doc_change_requests.doc_id AND ${PARENT_TENANT_MATCH})`,
  },
  {
    table: 'doc_checklist',
    parentExists: `EXISTS (SELECT 1 FROM public.authoring_documents d
        WHERE d.id::text = doc_checklist.doc_id AND ${PARENT_TENANT_MATCH})`,
  },
  {
    table: 'doc_checklist_items',
    parentExists: `EXISTS (SELECT 1 FROM public.doc_checklist c
        JOIN public.authoring_documents d ON d.id::text = c.doc_id
        WHERE c.checklist_id = doc_checklist_items.checklist_id AND ${PARENT_TENANT_MATCH})`,
  },
  {
    table: 'doc_exports',
    parentExists: `EXISTS (SELECT 1 FROM public.authoring_documents d
        WHERE d.id::text = doc_exports.doc_id AND ${PARENT_TENANT_MATCH})`,
  },
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
  // C2C-AUTHOR-002 object permissions: the composite tenant-parentage FKs on
  // doc_permissions guaranteed by 20260727_authoring_object_permissions.sql
  // (doc_id,tenant_id → authoring_documents; section_id,doc_id,tenant_id →
  // authoring_sections). Listed so /readyz + the pilot gate surface their absence.
  'doc_permissions_doc_tenant_fkey',
  'doc_permissions_section_doc_tenant_fkey',
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
 * C-30: the parent-scoped counterpart of tenantPolicySql for the workflow tables
 * that carry no tenant_id of their own (AUTHORING_SUBSYSTEM_DOCSCOPED_TABLES).
 * Same shadow/enforce/super-admin shape — the ONLY difference is the tenant match
 * runs against the OWNING document's tenant via `parentExists` instead of a local
 * `tenant_id` column. Under the shadow default (app.rls_enforce != 'on') it is a
 * full pass-through, so the raw-pool router is unaffected; under RLS_ENFORCE=on it
 * confines each row to the tenant that owns its parent document.
 */
function docScopedPolicySql(table, parentExists) {
  const predicate = `
        NULLIF(current_setting('app.rls_enforce', TRUE), '') IS DISTINCT FROM 'on'
        OR ${parentExists}
        OR current_setting('app.current_user_role', TRUE) = 'app_super_admin'`;
  return `
    ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.${table} FORCE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS ${TENANT_POLICY_NAME} ON public.${table};
    CREATE POLICY ${TENANT_POLICY_NAME} ON public.${table}
      FOR ALL
      USING (${predicate}
      )
      WITH CHECK (${predicate}
      );
  `;
}

/**
 * Apply the authoring subsystem as one atomic unit against `pool` (a connected
 * `pg` Pool): the four migration files, then tenant-isolation RLS on every table
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
    // C-30: the workflow tables without a local tenant_id are isolated by their
    // parent document's tenant instead — same shadow/enforce semantics, applied
    // in the same transaction so the subsystem is never half-policied.
    for (const { table, parentExists } of AUTHORING_SUBSYSTEM_DOCSCOPED_TABLES) {
      await pool.query(docScopedPolicySql(table, parentExists));
    }
    await pool.query('COMMIT');
    const policied = AUTHORING_SUBSYSTEM_TABLES.length + AUTHORING_SUBSYSTEM_DOCSCOPED_TABLES.length;
    log(`  ✓ authoring subsystem provisioned as a unit (${applied.length} files, ${policied} tables, tenant-isolated)`);
    return { applied };
  } catch (err) {
    await pool.query('ROLLBACK').catch(() => {});
    throw new Error(
      `authoring subsystem provisioning failed — rolled back, subsystem left absent (safe to re-run): ${err.message}`,
    );
  }
}
