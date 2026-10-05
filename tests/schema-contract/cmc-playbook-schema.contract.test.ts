/**
 * Contract: the five CMC playbook tables the applier creates stay inside the
 * tenant sweep, on every database it builds.
 *
 * ── HISTORY ──────────────────────────────────────────────────────────────────
 * migrations/20260919_cmc_playbook_schema.sql created these tables for
 * /api/cmc/blueprint/playbook/* (server/api/cmc/playbookRoutes.ts, mounted under
 * blueprintRoutes.ts), whose every endpoint had returned 500 because none of
 * them existed. Until 2026-10-05 this file also extracted each handler's SQL
 * from the route source and planned it against the migration, and asserted that
 * GET /workflows no longer invented two template objects for an empty table.
 *
 * Those routers were retired on 2026-10-05 with no caller (server/api/cmc/
 * __tests__/cmc-retired-routers.contract.test.ts keeps them gone), so there is
 * no handler SQL left to plan and those assertions went with the code they
 * read.
 *
 * ── WHAT STILL HOLDS, AND IS PINNED ─────────────────────────────────────────
 * The migration stays on C2C_MIGRATION_FILES and re-runs on every deploy —
 * removing schema is not a DROP (CLAUDE.md RULE 1), and dropping tables that
 * may hold a tenant's rows is a migration decision of its own. So the tables
 * keep being created, and what matters about them is unchanged: each carries an
 * integer organization_id and is created ABOVE the tenant-isolation sweep, so it
 * is policied rather than cross-tenant readable, and tenant offboarding
 * (server/services/tenant/tenant-offboarding.ts) can reach every row.
 *
 * @compliance Tenant isolation: a table the applier creates is policied by the
 *             sweep and reachable by tenant offboarding, whether or not code
 *             reads it today.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { C2C_MIGRATION_FILES } from '../../scripts/db/migration-set.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const MIGRATION = 'migrations/20260919_cmc_playbook_schema.sql';

const read = (f: string) => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');

let pg: PGlite;

beforeAll(async () => {
  pg = new PGlite();
  // The only prerequisite the migration has: four of its five tables FK to
  // organizations(id). Created with the columns the FK needs and nothing else.
  await pg.exec(`
    CREATE TABLE organizations (id serial PRIMARY KEY, name text);
    INSERT INTO organizations (name) VALUES ('Contract Test Org');
  `);
  await pg.exec(read(MIGRATION));
}, 120_000);

afterAll(async () => {
  await pg?.close();
});

describe('the migration is on the applier, in front of the sweep', () => {
  it('is listed in C2C_MIGRATION_FILES', () => {
    // A migration not on the applier reaches no database. That is exactly how
    // server/database/cmc-playbook-schema.sql — this file's predecessor — left
    // five tables missing while looking provisioned in the repo.
    expect(C2C_MIGRATION_FILES).toContain(MIGRATION);
  });

  it('runs BEFORE the tenant-isolation sweep', () => {
    // A table created after the sweep is never swept, ships with no RLS policy,
    // and the policy COUNT still goes up — which is what makes it invisible.
    const mine = C2C_MIGRATION_FILES.indexOf(MIGRATION);
    const sweep = C2C_MIGRATION_FILES.findIndex((f: string) =>
      f.includes('tenant_isolation_sweep'),
    );
    expect(sweep).toBeGreaterThanOrEqual(0);
    expect(mine).toBeLessThan(sweep);
  });
});

describe('every table the sweep must see carries an integer tenant column', () => {
  it('all five tables have organization_id', async () => {
    // The integer sweep keys off this column. A table without one is outside
    // the population every policy mechanism operates on — see
    // scripts/ci/check-unkeyed-request-tables.mjs.
    const r = await pg.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.columns
        WHERE table_schema = 'public' AND column_name = 'organization_id'
          AND table_name LIKE 'cmc_%'
        ORDER BY table_name`,
    );
    expect(r.rows.map((x) => x.table_name)).toEqual([
      'cmc_ai_tool_executions',
      'cmc_checklist_instances',
      'cmc_workflow_instances',
      'cmc_workflow_tasks',
      'cmc_workflows',
    ]);
  });
});

describe('a task row carries its tenant', () => {
  it('a task INSERT with organization_id executes and the row is tenant-attributable', async () => {
    const org = (await pg.query<{ id: number }>(`SELECT id FROM organizations LIMIT 1`)).rows[0].id;
    await pg.query(
      `INSERT INTO cmc_workflow_instances (id, template_id, organization_id, project_name,
         assigned_team, status, progress, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7, NOW(), NOW())`,
      ['wf_contract', 'ind-cmc-template', org, 'Contract Project', '[]', 'active', 0],
    );
    await pg.query(
      `INSERT INTO cmc_workflow_tasks (id, workflow_instance_id, organization_id, name,
         task_order, estimated_hours, status, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7, NOW(), NOW())`,
      ['task_contract', 'wf_contract', org, 'Drug Substance Characterization', 1, 40, 'pending'],
    );
    const r = await pg.query<{ organization_id: number }>(
      `SELECT organization_id FROM cmc_workflow_tasks WHERE id = 'task_contract'`,
    );
    expect(r.rows[0].organization_id).toBe(org);
  });
});

describe('the seeded global templates are real rows, not a literal in a handler', () => {
  it('twelve templates land at the shared organization_id = 0 tenant', async () => {
    const r = await pg.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM cmc_workflows WHERE organization_id = 0`,
    );
    expect(r.rows[0].n).toBe(12);
  });
});
