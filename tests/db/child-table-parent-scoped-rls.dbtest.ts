/**
 * A child row must be visible only to the tenant that owns its PARENT.
 *
 * ── The exposure this pins closed ────────────────────────────────────────────
 * On a fully provisioned database, 21 tables held tenant data with no tenant
 * column, no RLS, and no policy — so any tenant could read every tenant's rows.
 * They were found mechanically, not by intuition: of 937 public base tables,
 * 195 have no tenant column, 170 of those have no RLS at all, 78 of those are
 * referenced by server SQL, and 21 of those carry a foreign key to a table that
 * IS tenant-keyed. The FK is the evidence of ownership, which is why the fix is
 * a parent-scoped policy rather than a new organization_id column: duplicating
 * the tenant onto the child creates a second copy of the truth that can drift.
 *
 * chat_messages is the sharpest case — the message BODIES of every tenant's
 * conversations, readable by all of them.
 *
 * ── Why this is a real-database test, run as a NON-SUPERUSER ────────────────
 * Every property here is enforced by PostgreSQL: a mocked pool has no policies,
 * no FORCE ROW LEVEL SECURITY, and no `app.current_tenant_id`. And a SUPERUSER
 * bypasses RLS unconditionally — FORCE subjects the table OWNER to policies, it
 * has no power over a superuser — so asserting isolation from a superuser
 * connection is a test that can only mislead. These read through the harness's
 * provisioned non-superuser role, the same posture production runs in.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { databaseUrl } from '../setup.db';
import { createScratchSchema, withSession, type ScratchSchema } from './harness';
import {
  CASES,
  ALL_CHILD_TABLES,
  NON_PUBLIC_CHILD_TABLES,
  STILL_DENY_ALL,
  ensureTables,
  ensureAddedTables,
} from './child-table-parent-scoped-rls.cases';

const MIGRATION = path.join(
  __dirname,
  '../../db/migrations/20260813_child_table_parent_scoped_rls.sql'
);

/** Row security, FORCE and the policy, for each schema-qualified table named. */
const NON_PUBLIC_PROTECTION_SQL = `
  SELECT n.nspname || '.' || c.relname AS table_name, c.relrowsecurity, c.relforcerowsecurity,
         EXISTS (SELECT 1 FROM pg_policies p
                  WHERE p.schemaname = n.nspname AND p.tablename = c.relname
                    AND p.policyname = 'tenant_isolation_policy') AS policied
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname || '.' || c.relname = ANY($1::text[])`;

function expectProtected(
  rows: Array<{ table_name: string; relrowsecurity: boolean; relforcerowsecurity: boolean; policied: boolean }>,
): void {
  for (const row of rows) {
    expect(row.policied, `${row.table_name} has no tenant_isolation_policy`).toBe(true);
    expect(row.relrowsecurity, `${row.table_name} has RLS disabled`).toBe(true);
    // Without FORCE the table OWNER skips the policy entirely.
    expect(row.relforcerowsecurity, `${row.table_name} is not FORCEd`).toBe(true);
  }
}



/**
 * The three chains the migration leaves deliberately deny-all — they need a
 * nested predicate through a second parent (csr_endpoint_results ->
 * csr_endpoints -> csr_studies, and the ctd_documents -> ctd_module_sections ->
 * ctd_submissions -> ctd_programs chain), which its single-level spec cannot
 * express. None is referenced by server code, so deny-all costs nothing today.
 * Asserted rather than left implicit: policying one of them is a decision
 * someone should make on purpose, and this is where they will be told.
 *
 * ── Why FORCE is asserted too (2026-10-13, D3) ──────────────────────────────
 * This checked `policied === false` alone, and passed — while all three sat
 * with row security ENABLED and NOT FORCED, which is what
 * migrations/0005_csr_knowledge_database.sql's loop leaves behind. That state
 * denies to the runtime role but exempts the table OWNER, which read every
 * tenant's rows; `policied === false` is equally true of it, of real deny-all,
 * and of row security off altogether, so the assertion could not tell the safe
 * state from either unsafe one. Hence all three columns.
 *
 * Module scope, like `expectProtected` above, because inlining it took the
 * suite's describe body past the 100-line lint ceiling.
 */
async function expectDenyAll(scratch: ScratchSchema): Promise<void> {
  const { rows } = await scratch.ownerPool.query(
    `SELECT c.relname AS table_name, c.relrowsecurity, c.relforcerowsecurity,
            EXISTS (SELECT 1 FROM pg_policies p
                     WHERE p.schemaname='public' AND p.tablename=c.relname) AS policied
       FROM pg_class c
       JOIN pg_namespace n ON n.oid=c.relnamespace AND n.nspname='public'
      WHERE c.relname = ANY($1::text[])`,
    [STILL_DENY_ALL],
  );
  for (const row of rows) {
    expect(
      row.policied,
      `${row.table_name} gained a policy — update STILL_DENY_ALL and say why`,
    ).toBe(false);
    expect(
      row.relrowsecurity,
      `${row.table_name} has no policy AND row security off — that denies ` +
        `nothing to anybody, it is not the deny-all this list claims`,
    ).toBe(true);
    expect(
      row.relforcerowsecurity,
      `${row.table_name} is deny-all but not FORCEd — the table owner is ` +
        `exempt from it and reads every tenant's rows`,
    ).toBe(true);
  }
}

const ORG_A = 91001;
const ORG_B = 91002;
/** Unique per run, so a previous run's rows can never satisfy this one. */
const RUN = `${process.pid}-${Date.now().toString(36)}`;

describe('child tables are scoped to their parent row’s tenant', () => {
  let scratch: ScratchSchema;

  beforeAll(async () => {
    scratch = await createScratchSchema(databaseUrl);
    // Tables BEFORE the migration, not after: the migration skips a table it
    // cannot find, so provisioning afterwards would leave them unpolicied and
    // the isolation cases would fail for a reason that has nothing to do with
    // the policy.
    await ensureTables(scratch.ownerPool);
    await ensureAddedTables(scratch.ownerPool);
    // Applied here rather than assumed, so the suite is self-provisioning
    // regardless of which migrations the surrounding CI job happened to run.
    await scratch.ownerPool.query(fs.readFileSync(MIGRATION, 'utf8'));
    await scratch.connectAsRuntimeRole();

    // Several parents FK organization_id -> organizations(id), so the tenants
    // must exist before anything references them. Found by the positive
    // assertion below, not by reading the schema: the first draft never
    // inserted a child at all, so these constraints were never exercised.
    for (const org of [ORG_A, ORG_B]) {
      await scratch.ownerPool.query(
        `INSERT INTO public.organizations (id, name, slug)
         VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING`,
        [org, `dbtest org ${org}`, `dbtest-org-${org}`],
      );
    }
  }, 120_000);

  afterAll(async () => {
    if (scratch) await scratch.destroy();
  });

  it('every table named by the migration ends up policied, enabled and FORCEd', async () => {
    const { rows } = await scratch.ownerPool.query(
      `SELECT c.relname AS table_name, c.relrowsecurity, c.relforcerowsecurity,
              EXISTS (SELECT 1 FROM pg_policies p
                       WHERE p.schemaname='public' AND p.tablename=c.relname
                         AND p.policyname='tenant_isolation_policy') AS policied
         FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname='public'
        WHERE c.relname = ANY($1::text[])`,
      [ALL_CHILD_TABLES],
    );

    // Absent tables are legitimately skipped by the migration; what must never
    // happen is a table that EXISTS and is left unprotected.
    for (const row of rows) {
      expect(row.policied, `${row.table_name} has no tenant_isolation_policy`).toBe(true);
      expect(row.relrowsecurity, `${row.table_name} has RLS disabled`).toBe(true);
      // Without FORCE the table OWNER skips the policy entirely.
      expect(row.relforcerowsecurity, `${row.table_name} is not FORCEd`).toBe(true);
    }
    expect(rows.length).toBeGreaterThan(0);
  });

  it('every non-public child the chained list names that exists ends up policied, enabled and FORCEd', async () => {
    const { rows } = await scratch.ownerPool.query(NON_PUBLIC_PROTECTION_SQL, [NON_PUBLIC_CHILD_TABLES]);
    expectProtected(rows);
  });

  for (const c of CASES) {
    it(`${c.child}: each tenant sees its own row and not the other's`, async () => {
      const runtime = scratch.runtimePool!;
      const q = (sql: string, params?: unknown[]) => scratch.ownerPool.query(sql, params as any);

      // Seed as the owner, one parent + one child per tenant. The returned ids
      // are asserted non-empty: a silently-skipped insert is what made the
      // first draft of this suite vacuous.
      const tagA = `dbtest-a-${c.child}-${RUN}`;
      const tagB = `dbtest-b-${c.child}-${RUN}`;
      const fkA = await c.seed(q, ORG_A, tagA);
      const fkB = await c.seed(q, ORG_B, tagB);
      expect(fkA, `${c.child}: tenant A child was not inserted`).toBeTruthy();
      expect(fkB, `${c.child}: tenant B child was not inserted`).toBeTruthy();

      const countFor = (viewer: number, ownerTag: string) =>
        withSession(
          runtime,
          { 'app.rls_enforce': 'on', 'app.current_tenant_id': String(viewer) },
          async (client) => {
            const res = await client.query(c.countOwn, [ownerTag]);
            return res.rows[0].n as number;
          },
        );

      // POSITIVE half — without this the negative half below proves nothing:
      // "0 rows visible" is equally true of a policy that works and of a table
      // that was never populated.
      expect(await countFor(ORG_A, fkA), `${c.child}: tenant A cannot see its OWN row`).toBe(1);
      expect(await countFor(ORG_B, fkB), `${c.child}: tenant B cannot see its OWN row`).toBe(1);

      // NEGATIVE half — the isolation this migration exists for.
      expect(await countFor(ORG_B, fkA), `${c.child}: tenant B can read tenant A's row`).toBe(0);
      expect(await countFor(ORG_A, fkB), `${c.child}: tenant A can read tenant B's row`).toBe(0);
    });
  }

  it('leaves the three chained tables deny-all against every role, deliberately and visibly', async () => {
    await expectDenyAll(scratch);
  });

  it('the policy is inert when enforcement is off, exactly like its siblings', async () => {
    // The sweep's policy carries the same `app.rls_enforce IS DISTINCT FROM
    // 'on'` bypass. A stricter policy here would make these tables fail in
    // non-enforcing environments where every sibling still reads fine — which
    // is why the shape was copied rather than invented.
    const { rows } = await scratch.ownerPool.query(
      `SELECT pg_get_expr(polqual, polrelid) AS using_expr
         FROM pg_policy
        WHERE polname = 'tenant_isolation_policy'
          AND polrelid = 'public.chat_messages'::regclass`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].using_expr).toContain('app.rls_enforce');
    expect(rows[0].using_expr).toContain('app_super_admin');
    // And it genuinely consults the PARENT, not the child.
    expect(rows[0].using_expr).toContain('chat_threads');
  });
});
