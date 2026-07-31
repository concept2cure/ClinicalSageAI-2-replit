/**
 * Authoring DURABLE APPLIER — end-to-end against a real (in-process PGlite)
 * Postgres, driven through the exact function a production deploy runs.
 *
 * The sibling authoring-migration.pglite.integration.test.ts proves the migration
 * FILES apply and the router's SQL executes against them. It applies those files
 * by hand, in a fixed list local to the test — so it stays green even if the file
 * is on NO real apply path. That is precisely the C-23 / C-6 blind spot: a
 * migration good enough to pass every test, that a deploy never runs.
 *
 * This test closes that gap for 20260730_authoring_subsystem_schema.sql (ledger
 * C-30). It invokes scripts/db/authoring-subsystem.mjs's applyAuthoringSubsystem
 * — the SAME function deploy-migrate.mjs and apply-c2c-migrations.mjs call — and
 * asserts:
 *   1. the twelve genuinely-new workflow tables the router queries now EXIST
 *      after the applier runs (before C-30 the file was in no AUTHORING_SUBSYSTEM_
 *      FILES, so this function created none of them);
 *   2. every one is row-level-security enabled with a tenant_isolation_policy —
 *      the tenant-scoped eight via their local tenant_id, the four tenant-less
 *      workflow tables via the parent-document-scoped policy C-30 adds;
 *   3. that parent-scoped policy actually ISOLATES: under RLS_ENFORCE=on a second
 *      tenant cannot read the first tenant's checklist, while the shadow default
 *      the raw-pool router runs under passes everything so the router is
 *      unaffected.
 *
 * If applyAuthoringSubsystem ever stops applying the file (a dropped entry in
 * AUTHORING_SUBSYSTEM_FILES), assertion 1 fails here — not silently on a deploy.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  applyAuthoringSubsystem,
  AUTHORING_SUBSYSTEM_DOCSCOPED_TABLES,
} from '../../scripts/db/authoring-subsystem.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// The twelve tables 20260730_authoring_subsystem_schema.sql contributes after
// C-27 retired its duplicate copies of the canonical loop tables — every one a
// live target of server/routes/authoring.router.ts.
const WORKFLOW_TABLES = [
  'authoring_comment_activity', 'authoring_reviews', 'authoring_audit_events',
  'authoring_ai_suggestions', 'authoring_compliance_scores', 'authoring_suggestion_feedback',
  'authoring_exports', 'template_sections',
  'doc_change_requests', 'doc_checklist', 'doc_checklist_items', 'doc_exports',
];

let pg: PGlite;

/**
 * A pg-Pool-shaped shim over PGlite. applyAuthoringSubsystem issues only
 * param-less SQL (BEGIN/COMMIT, whole multi-statement migration files, the
 * multi-statement policy blocks); PGlite's single-statement `query` cannot run
 * those, so route param-less calls to `exec` (multi-statement capable) and
 * parameterized calls to `query`.
 */
function poolShim(db: PGlite) {
  return {
    query: async (text: string, params?: unknown[]) => {
      if (params && params.length) {
        const r = await db.query(text, params);
        return { rows: r.rows, rowCount: r.rows.length };
      }
      await db.exec(text);
      return { rows: [], rowCount: 0 };
    },
  };
}

const DOC_T1 = 'aaaaaaaa-0000-4000-8000-00000000000a';
const DOC_T2 = 'bbbbbbbb-0000-4000-8000-00000000000b';

beforeAll(async () => {
  pg = new PGlite();
  // The loop-tables migration references organizations/users via soft FKs only,
  // but authoring_documents.created_by etc. are plain columns, so no prerequisite
  // tables are needed — the applier stands the whole subsystem up on its own.
  await applyAuthoringSubsystem(poolShim(pg), REPO_ROOT, {});

  // Seed one document per tenant in shadow mode (WITH CHECK passes), then a
  // checklist hanging off the tenant-1 document — the row whose cross-tenant
  // visibility the parent-scoped policy governs.
  await pg.exec(`SET app.rls_enforce = 'off';`);
  await pg.query(
    `INSERT INTO authoring_documents (id, title, status, created_by, tenant_id, created_at, updated_at)
     VALUES ($1, 'T1 doc', 'draft', 'author-1', 1, NOW(), NOW()), ($2, 'T2 doc', 'draft', 'author-2', 2, NOW(), NOW())`,
    [DOC_T1, DOC_T2],
  );
  await pg.query(
    `INSERT INTO doc_checklist (checklist_id, doc_id, section_id, region, reviewer_email)
     VALUES ('cl-t1', $1, 'sec-1', 'ICH', 'r@x.io')`,
    [DOC_T1],
  );

  // RLS is enforced only for NON-superusers — PGlite's default session role is a
  // superuser, which bypasses every policy even under FORCE ROW LEVEL SECURITY
  // (FORCE binds the table OWNER, not a superuser). So the isolation assertions
  // below run as a plain NOSUPERUSER role, the way an app connection would. The
  // parent-scoped policy's subquery reads authoring_documents, so the role needs
  // SELECT on both tables.
  await pg.exec(
    `CREATE ROLE app_user NOSUPERUSER;
     GRANT SELECT ON authoring_documents, doc_checklist TO app_user;`,
  );
});

/**
 * Read doc_checklist as the non-superuser app role, under a given enforcement /
 * tenant context. Sets the GUCs while unprivileged-role-free, then drops into the
 * role for the read, then restores — so each case is independent.
 */
async function readChecklistAs(enforce: 'on' | 'off', tenantId: string): Promise<number> {
  await pg.exec('RESET ROLE;');
  await pg.exec(`SET app.rls_enforce = '${enforce}';`);
  await pg.exec(`SET app.current_tenant_id = '${tenantId}';`);
  await pg.exec('SET ROLE app_user;');
  try {
    const r = await pg.query(`SELECT checklist_id FROM doc_checklist WHERE doc_id = $1`, [DOC_T1]);
    return r.rows.length;
  } finally {
    await pg.exec('RESET ROLE;');
  }
}

afterAll(async () => {
  await pg.close();
});

describe('applyAuthoringSubsystem provisions the C-30 workflow tables', () => {
  it('creates every one of the twelve router-referenced workflow tables', async () => {
    const { rows } = await pg.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`,
    );
    const have = new Set(rows.map((r) => r.table_name));
    const missing = WORKFLOW_TABLES.filter((t) => !have.has(t));
    expect(missing, `applier did not create: ${missing.join(', ')}`).toEqual([]);
  });

  it('enables RLS + a tenant_isolation_policy on every workflow table', async () => {
    const { rows } = await pg.query<{ tablename: string }>(
      `SELECT tablename FROM pg_policies WHERE policyname = 'tenant_isolation_policy'`,
    );
    const policied = new Set(rows.map((r) => r.tablename));
    const unpolicied = WORKFLOW_TABLES.filter((t) => !policied.has(t));
    expect(unpolicied, `no tenant_isolation_policy on: ${unpolicied.join(', ')}`).toEqual([]);
  });

  it('registers all four tenant-less tables as parent-scoped', () => {
    // Guards the split: the tenant-less workflow tables must be isolated by the
    // doc-scoped policy, not silently dropped from both lists (which would leave
    // them RLS-less and cross-tenant readable under enforcement).
    expect(AUTHORING_SUBSYSTEM_DOCSCOPED_TABLES.map((t: { table: string }) => t.table).sort()).toEqual(
      ['doc_change_requests', 'doc_checklist', 'doc_checklist_items', 'doc_exports'],
    );
  });
});

describe('the parent-scoped policy isolates a tenant-less workflow table', () => {
  it('shadow mode (rls_enforce != on) passes every row — the router is unaffected', async () => {
    // The router runs raw-pool under this default; the tenant here is irrelevant
    // because the shadow clause short-circuits before the parent check.
    expect(await readChecklistAs('off', '2')).toBe(1);
  });

  it('under RLS_ENFORCE=on the owning tenant still sees its checklist', async () => {
    expect(await readChecklistAs('on', '1')).toBe(1);
  });

  it('under RLS_ENFORCE=on a DIFFERENT tenant cannot read it (the leak, closed)', async () => {
    expect(await readChecklistAs('on', '2')).toBe(0);
  });
});
