/**
 * The document-approval workflow tables, against real PostgreSQL.
 *
 * ── What this pins ───────────────────────────────────────────────────────────
 * `GET /api/approval-workflows/pending` answered 500 on every request for the
 * life of the endpoint: `relation "document_workflows" does not exist`. Five
 * tables were declared as Drizzle models in `shared/schema/unified_workflow.ts`
 * and read by six services, and no provisioning path created any of them —
 * `drizzle-kit push` reads only the `shared/schema.ts` barrel, which does not
 * re-export that module, and no migration created them either.
 *
 * A unit test cannot witness this. The models type-check, the query builds, and
 * a mocked pool answers whatever it is told to. Only a real catalog can be
 * missing a relation, which is the entire defect.
 *
 * The migration is APPLIED here rather than assumed, so the suite is
 * self-provisioning and does not depend on which migrations the surrounding CI
 * job happened to run — the same convention as part11-audit-store.dbtest.ts.
 * It is also run TWICE, because a migration that cannot be re-applied is one
 * the deploy path will fail on the second time it runs.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { Pool } from 'pg';
import { databaseUrl } from '../setup.db';

const MIGRATION = path.join(__dirname, '../../migrations/20260815_workflow_approval_tables.sql');

/** Every table the migration is responsible for. */
const TABLES = [
  'workflow_templates',
  'workflow_steps',
  'document_workflows',
  'workflow_approvals',
  'workflow_history',
] as const;

let owner: Pool;

beforeAll(async () => {
  owner = new Pool({ connectionString: databaseUrl, max: 4 });
  const sql = fs.readFileSync(MIGRATION, 'utf8');
  await owner.query(sql);
  // Idempotency is a property the deploy path relies on: applyMigrationFiles
  // re-executes every file on every run and never consults the journal to skip.
  await owner.query(sql);
});

afterAll(async () => {
  await owner.end().catch(() => {});
});

describe('workflow approval tables exist after the migration', () => {
  it.each(TABLES)('%s is present', async (table) => {
    const { rows } = await owner.query('SELECT to_regclass($1) AS oid', [`public.${table}`]);
    expect(rows[0].oid).not.toBeNull();
  });

  it('document_workflows carries every column the pending-approvals read projects', async () => {
    // The exact column list from the query that produced the 500, taken from
    // the Drizzle model in shared/schema/unified_workflow.ts.
    const expected = [
      'id', 'document_id', 'template_id', 'status', 'current_step',
      'started_by', 'started_at', 'completed_by', 'completed_at',
      'rejected_by', 'rejected_at', 'organization_id', 'metadata',
    ];
    const { rows } = await owner.query(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'document_workflows'`,
    );
    const actual = rows.map((r: { column_name: string }) => r.column_name);
    for (const col of expected) expect(actual).toContain(col);
  });

  it('answers the pending-approvals predicate instead of raising', async () => {
    // The shape of the failing query: org-scoped, status-filtered. An empty
    // result is the correct answer for a tenant with no active workflows; the
    // defect was that it could not be asked at all.
    const { rows } = await owner.query(
      `SELECT id FROM document_workflows WHERE organization_id = $1 AND status = $2`,
      [-1, 'active'],
    );
    expect(Array.isArray(rows)).toBe(true);
  });

  it('enforces the foreign keys the workflow chain depends on', async () => {
    // A workflow pointing at a document that does not exist is not a record a
    // regulated tenant can defend, so the FK is part of the contract.
    await expect(
      owner.query(
        `INSERT INTO document_workflows
           (document_id, template_id, status, started_by, organization_id)
         VALUES (2147483000, 2147483000, 'active', 'dbtest', -1)`,
      ),
    ).rejects.toThrow();
  });
});
