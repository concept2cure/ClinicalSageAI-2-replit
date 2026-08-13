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

const MIGRATION = path.join(
  __dirname,
  '../../db/migrations/20260813_child_table_parent_scoped_rls.sql'
);

/**
 * The child/parent pairs this suite exercises end to end. Deliberately a
 * SUBSET — one per distinct key shape (text FK, integer FK, uuid FK) — because
 * each case needs real parent AND child rows, and covering all 21 would test
 * the same predicate twenty-one times. The full list is asserted structurally
 * in "every table named by the migration ends up policied" below, which is what
 * catches a table silently dropping out of the migration.
 *
 * ── Why each case seeds BOTH tenants and asserts BOTH directions ────────────
 * The first draft of this suite asserted only "tenant B sees 0". It passed —
 * and it was worthless: it seeded parents but never children, so chat_messages
 * held zero rows and B saw nothing because there was nothing, policy or no
 * policy. A count of 0 is exactly what a test that inserted nothing reports.
 *
 * Every case now asserts that tenant A sees EXACTLY ITS OWN row as well. A
 * failed or skipped seed fails that assertion, so the isolation half can no
 * longer pass vacuously. `seed` returns the child ids it actually wrote, and
 * the test checks them.
 */
interface Case {
  child: string;
  parent: string;
  fk: string;
  parentTenant: string;
  /**
   * Insert one parent + one child for the given tenant. Returns the FK value
   * that identifies this run's child rows, so the count below can find them
   * without joining anything.
   */
  seed: (
    q: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }>,
    org: number,
    tag: string,
  ) => Promise<string>;
  /**
   * Count child rows by FK value, selecting from the CHILD ALONE.
   *
   * ── Why there is no JOIN here, though the obvious query has one ────────────
   * The first working version of this suite counted
   * `FROM chat_messages ch JOIN chat_threads p ON ...`. It passed — and it kept
   * passing after the child policies were DROPPED, which is how the flaw was
   * found. The parent tables are themselves tenant-keyed and already policied,
   * so the join was filtered by the PARENT's policy no matter what the child
   * did. The test proved a true thing for the wrong reason and would never have
   * failed on the defect it exists to catch.
   *
   * Selecting from the child alone leaves the child's own policy as the only
   * thing that can filter the result.
   */
  countOwn: string;
}

const CASES: Case[] = [
  {
    child: 'chat_messages',
    parent: 'chat_threads',
    fk: 'thread_id',
    parentTenant: 'organization_id',
    seed: async (q, org, tag) => {
      await q(
        `INSERT INTO public.chat_threads (id, organization_id, title)
         VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING`,
        [tag, org, `thread ${tag}`],
      );
      await q(
        `INSERT INTO public.chat_messages (thread_id, role, content)
         VALUES ($1, 'user', $2)`,
        [tag, `secret message for org ${org}`],
      );
      return tag; // thread_id

    },
    countOwn: `SELECT count(*)::int AS n FROM public.chat_messages WHERE thread_id = $1`,
  },
  {
    child: 'csr_details',
    parent: 'csr_reports',
    fk: 'report_id',
    parentTenant: 'organization_id',
    seed: async (q, org, tag) => {
      const p = await q(
        `INSERT INTO public.csr_reports (organization_id, report_id, report_title)
         VALUES ($1, $2, $3) RETURNING id`,
        [org, tag, `report ${tag}`],
      );
      await q(
        `INSERT INTO public.csr_details (report_id, study_design)
         VALUES ($1, $2)`,
        [p.rows[0].id, `design for org ${org}`],
      );
      return String(p.rows[0].id); // csr_details.report_id

    },
    countOwn: `SELECT count(*)::int AS n FROM public.csr_details WHERE report_id = $1::int`,
  },
  {
    child: 'rag_chunks',
    parent: 'rag_documents',
    fk: 'document_id',
    parentTenant: 'organization_id',
    seed: async (q, org, tag) => {
      const p = await q(
        `INSERT INTO public.rag_documents (organization_id, document_id, title, document_type)
         VALUES ($1, $2, $3, 'protocol') RETURNING id`,
        [org, tag, `doc ${tag}`],
      );
      await q(
        `INSERT INTO public.rag_chunks (document_id, chunk_id, chunk_index, content)
         VALUES ($1, $2, 0, $3)`,
        [p.rows[0].id, tag, `chunk text for org ${org}`],
      );
      return String(p.rows[0].id); // rag_chunks.document_id

    },
    countOwn: `SELECT count(*)::int AS n FROM public.rag_chunks WHERE document_id = $1::uuid`,
  },
];

/** Named by the migration; asserted as a set so a dropped entry is caught. */
const ALL_CHILD_TABLES = [
  'ai_generation_runs', 'ai_messages', 'ai_retrieval_chunks', 'approval_checkpoints',
  'audit_trail', 'c2c_correspondence_issues', 'c2c_document_sections', 'cer_exports',
  'chat_messages', 'cmc_document_versions', 'coauthor_document_versions', 'csr_details',
  'document_versions', 'embedding_audit_log', 'fda_510k_stage_progress',
  'lumen_atom_citations', 'lumen_atom_conflicts', 'lumen_atom_quality_scores',
  'lumen_atom_versions', 'program_milestones', 'rag_chunks',
];

const ORG_A = 91001;
const ORG_B = 91002;
/** Unique per run, so a previous run's rows can never satisfy this one. */
const RUN = `${process.pid}-${Date.now().toString(36)}`;

describe('child tables are scoped to their parent row’s tenant', () => {
  let scratch: ScratchSchema;

  beforeAll(async () => {
    scratch = await createScratchSchema(databaseUrl);
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
