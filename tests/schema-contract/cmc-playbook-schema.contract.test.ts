/**
 * Contract: the CMC playbook surface can actually run against the schema the
 * applier produces — and answers honestly when that schema is empty.
 *
 * ── WHAT THIS PINS ───────────────────────────────────────────────────────────
 * /api/cmc/blueprint/playbook/* is live and unconditionally mounted
 * (server/bootstrap/register-core-routes.ts:68 → blueprintRoutes.ts:748). Every
 * table it queries was missing from every provisioned database until
 * migrations/20260919_cmc_playbook_schema.sql, so each endpoint returned 500.
 *
 * Two failure modes are pinned here, and they pull in opposite directions:
 *
 *   1. SCHEMA — every statement the handlers issue must plan against the tables
 *      the migration creates. The statements are extracted from the SOURCE, so
 *      this cannot drift from the code it guards. The tasks INSERT is the
 *      sharp one: cmc_workflow_tasks.organization_id is NOT NULL, added so the
 *      table is not invisible to every RLS sweep (all of which key on a tenant
 *      column). If the handler ever stops supplying it, every workflow start
 *      500s — and that is a test failure here, not a production incident.
 *
 *   2. HONESTY — GET /workflows must answer an empty table with an empty list.
 *      It used to substitute two hardcoded template objects under
 *      `success: true` when the query returned no rows. That branch was
 *      unreachable only because the table did not exist and the query threw;
 *      creating the table would have made it live and turned an honest 500 into
 *      invented data presented as records. The migration and the removal of
 *      that branch had to land together, so both are asserted together.
 *
 * @compliance ICH Q8/Q9/Q10 — a workflow template list a reviewer may act on
 *             must come from the record, not from a literal in a handler.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { C2C_MIGRATION_FILES } from '../../scripts/db/migration-set.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const MIGRATION = 'migrations/20260919_cmc_playbook_schema.sql';
const ROUTES = 'server/api/cmc/playbookRoutes.ts';
const BLUEPRINT = 'server/api/cmc/blueprintRoutes.ts';

const read = (f: string) => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');

/** Pull a statement out of the handler source by the table it names. */
function statement(src: string, re: RegExp): string {
  const m = re.exec(src);
  if (!m) throw new Error(`statement not found in source: ${re}`);
  return m[1].trim();
}

let pg: PGlite;
let routesSrc = '';

beforeAll(async () => {
  routesSrc = read(ROUTES);
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

describe('the statements the handlers issue plan against the applied schema', () => {
  it('the workflow-instance INSERT (playbookRoutes) plans', async () => {
    const sql = statement(routesSrc, /`\s*(INSERT INTO cmc_workflow_instances[\s\S]*?RETURNING \*)\s*`/);
    await expect(pg.exec(`PREPARE wfi AS ${sql}`)).resolves.toBeDefined();
  });

  it('the workflow-tasks INSERT plans — and still supplies organization_id', async () => {
    const sql = statement(routesSrc, /`\s*(INSERT INTO cmc_workflow_tasks[\s\S]*?NOW\(\), NOW\(\)\))\s*`/);
    // The regression this guards: dropping the column from the INSERT while the
    // table keeps NOT NULL. Plans fine, fails on execute — so assert both.
    expect(sql).toMatch(/\borganization_id\b/);
    await expect(pg.exec(`PREPARE wft AS ${sql}`)).resolves.toBeDefined();
  });

  it('the checklist-instance INSERT plans', async () => {
    const sql = statement(routesSrc, /`\s*(INSERT INTO cmc_checklist_instances[\s\S]*?RETURNING \*)\s*`/);
    await expect(pg.exec(`PREPARE cli AS ${sql}`)).resolves.toBeDefined();
  });

  it('the ai-tool-execution INSERT and its completing UPDATE plan', async () => {
    const ins = statement(routesSrc, /`\s*(INSERT INTO cmc_ai_tool_executions[\s\S]*?RETURNING \*)\s*`/);
    const upd = statement(routesSrc, /'(UPDATE cmc_ai_tool_executions[^']*)'/);
    await expect(pg.exec(`PREPARE aie AS ${ins}`)).resolves.toBeDefined();
    await expect(pg.exec(`PREPARE aiu AS ${upd}`)).resolves.toBeDefined();
  });

  it("the blueprint route's cmc_workflows INSERT plans too", async () => {
    // cmc_workflows is written from a DIFFERENT file than the one that reads it;
    // its column list is the tighter contract of the two.
    const sql = statement(read(BLUEPRINT), /`\s*(INSERT INTO cmc_workflows[\s\S]*?RETURNING \*)\s*`/);
    await expect(pg.exec(`PREPARE bpw AS ${sql}`)).resolves.toBeDefined();
  });
});

describe('a workflow start writes tasks that carry their tenant', () => {
  it('the tasks INSERT executes and the row is tenant-attributable', async () => {
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

  it('the read query returns them to a tenant that owns none of its own', async () => {
    const org = (await pg.query<{ id: number }>(`SELECT id FROM organizations LIMIT 1`)).rows[0].id;
    const sql = statement(routesSrc, /`\s*(SELECT \* FROM cmc_workflows[\s\S]*?ORDER BY created_at DESC)\s*`/);
    const r = await pg.query(sql, [org]);
    expect(r.rows.length).toBe(12);
  });

  it('GET /workflows no longer substitutes hardcoded templates for an empty read', async () => {
    // THE REGRESSION THIS FILE EXISTS FOR. Creating the table made the old
    // `if (result.rows.length === 0)` branch reachable; it answered an empty
    // table with two invented template objects under `success: true`.
    expect(routesSrc).not.toMatch(/defaultWorkflows/);
    expect(routesSrc).not.toMatch(/result\.rows\.length === 0/);
  });

  it('an empty table yields an empty result, not a fabricated one', async () => {
    // Proven against the real statement, with the seed removed.
    const org = (await pg.query<{ id: number }>(`SELECT id FROM organizations LIMIT 1`)).rows[0].id;
    const sql = statement(routesSrc, /`\s*(SELECT \* FROM cmc_workflows[\s\S]*?ORDER BY created_at DESC)\s*`/);
    await pg.exec(`DELETE FROM cmc_workflows WHERE organization_id = 0`);
    const r = await pg.query(sql, [org]);
    expect(r.rows).toEqual([]);
  });
});
