/**
 * Security contract: a compliance_tracking row belongs to the organization that
 * owns its project — and the write is what must say so.
 *
 * ── The defect ────────────────────────────────────────────────────────────────
 * Two faults that only make sense together, which is why neither had been fixed:
 *
 *   WRITE. server/api/cmc/projectRoutes.ts binds the drizzle model in
 *   shared/cmc-schema.ts, whose `complianceTracking` definition has NO
 *   organizationId field at all — the physical column exists (both migration
 *   lineages declare it; the applied one,
 *   db/migrations/20260402_cmc_runtime_ddl_to_migration.sql:23, declares it
 *   nullable), but the model does not map it. So POST
 *   /projects/:projectId/compliance wrote every row with organization_id NULL.
 *   shared/schema.ts defines the SAME table WITH organizationId; the routes bind
 *   the other one.
 *
 *   READ. server/api/cmc/routes.ts:1707 (POST /compliance/check-rules) then read
 *   `WHERE organization_id = $1 OR organization_id IS NULL`. That OR-NULL is not
 *   arbitrary: without it the endpoint returned nothing, because every row the
 *   product writes is NULL-org. It made the feature work by making every
 *   sponsor's compliance findings — guideline, requirement, violation status,
 *   risk level — readable by every other sponsor, and presented as their own.
 *
 * Fixing only the read would break the feature; fixing only the write would
 * leave the legacy rows exposed. Both land together, plus a backfill.
 *
 * ── Why a backfill is correct here, and not merely convenient ─────────────────
 * The pattern this repo has settled on for a legacy NULL tenant (see
 * migrations/20260907_quality_specifications_tenant_required.sql) is to leave
 * the rows in place and stop serving them, because nothing records who they
 * belong to. That reasoning does NOT apply here: compliance_tracking.project_id
 * is NOT NULL with an FK to cmc_projects, and cmc_projects.organization_id is
 * NOT NULL. Every legacy row's owner is therefore recorded — one join away. So
 * these rows are attributed rather than orphaned, and no tenant loses data.
 *
 * @compliance Tenant isolation of ICH/GxP compliance findings and their
 *             risk-level assessments.
 */
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');

const RUNTIME_DDL = 'db/migrations/20260402_cmc_runtime_ddl_to_migration.sql';
const BACKFILL = 'migrations/20260908_compliance_tracking_organization_backfill.sql';

const MINE = 1;
const THEIRS = 2;
const MY_PROJECT = '11111111-1111-4111-8111-111111111111';
const THEIR_PROJECT = '22222222-2222-4222-8222-222222222222';

const opened: PGlite[] = [];
let pg: PGlite;

/** The compliance_tracking DDL as the APPLIED lineage declares it. */
function complianceDdl(): string {
  const src = read(RUNTIME_DDL);
  const m = src.match(/CREATE TABLE IF NOT EXISTS compliance_tracking[\s\S]*?\n\);/);
  expect(m, `compliance_tracking DDL not found in ${RUNTIME_DDL}`).toBeTruthy();
  return m![0];
}

beforeEach(async () => {
  pg = new PGlite();
  opened.push(pg);
  await pg.exec(`
    CREATE TABLE cmc_projects (
      id uuid PRIMARY KEY,
      organization_id integer NOT NULL,
      project_name text
    );
  `);
  await pg.exec(complianceDdl());
  await pg.query(`INSERT INTO cmc_projects (id, organization_id, project_name) VALUES ($1,$2,$3)`, [
    MY_PROJECT, MINE, 'My project',
  ]);
  await pg.query(`INSERT INTO cmc_projects (id, organization_id, project_name) VALUES ($1,$2,$3)`, [
    THEIR_PROJECT, THEIRS, 'Their project',
  ]);
  // Rows exactly as the product wrote them before the fix: no organization_id.
  await pg.query(
    `INSERT INTO compliance_tracking (project_id, guideline, requirement, status, risk_level)
     VALUES ($1,'ICH Q1A','Stability data required','non-compliant','high')`,
    [THEIR_PROJECT],
  );
  await pg.query(
    `INSERT INTO compliance_tracking (project_id, guideline, requirement, status, risk_level)
     VALUES ($1,'ICH Q2','Method validation required','compliant','low')`,
    [MY_PROJECT],
  );
});

afterAll(async () => {
  for (const p of opened) {
    try { await p.close(); } catch { /* noop */ }
  }
});

describe('the applied schema and the product write are the cause', () => {
  it('the applied migration declares organization_id NULLABLE, so an un-stamped write succeeds', async () => {
    const { rows } = await pg.query<{ is_nullable: string }>(
      `SELECT is_nullable FROM information_schema.columns
        WHERE table_name = 'compliance_tracking' AND column_name = 'organization_id'`,
    );
    expect(rows[0]?.is_nullable, 'a NOT NULL column would have rejected the write instead').toBe('YES');
  });

  it('the drizzle model the routes bind maps no organizationId — which is why the rows are NULL', () => {
    const model = read('shared/cmc-schema.ts');
    const block = model.slice(
      model.indexOf("export const complianceTracking = pgTable('compliance_tracking'"),
    );
    const decl = block.slice(0, block.indexOf('});') + 3);
    expect(
      decl.includes("organization_id"),
      "shared/cmc-schema.ts complianceTracking must map organization_id, or projectRoutes cannot stamp it",
    ).toBe(true);
  });
});

describe('the read predicate this replaced leaked across tenants (control)', () => {
  it('OR organization_id IS NULL hands one org another org’s compliance findings', async () => {
    // Verbatim the predicate at server/api/cmc/routes.ts:1707. Not a test of
    // current behaviour — a control proving the assertions below are
    // load-bearing rather than vacuously true.
    const { rows } = await pg.query<{ guideline: string }>(
      `SELECT guideline FROM compliance_tracking WHERE organization_id = $1 OR organization_id IS NULL`,
      [MINE],
    );
    expect(rows.map((r) => r.guideline)).toContain('ICH Q1A');
  });
});

describe('the backfill attributes every legacy row through its project', () => {
  it('ships a migration', () => {
    expect(
      fs.existsSync(path.join(REPO_ROOT, BACKFILL)),
      `${BACKFILL} is missing: the legacy NULL-org rows stay unattributed`,
    ).toBe(true);
  });

  it('leaves no NULL-org row behind, and attributes each to its project’s owner', async () => {
    await pg.exec(read(BACKFILL));

    const nulls = await pg.query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM compliance_tracking WHERE organization_id IS NULL`,
    );
    expect(nulls.rows[0].n, 'a legacy row was left unattributed').toBe(0);

    const mine = await pg.query<{ guideline: string }>(
      `SELECT guideline FROM compliance_tracking WHERE organization_id = $1`, [MINE],
    );
    expect(mine.rows.map((r) => r.guideline)).toEqual(['ICH Q2']);

    const theirs = await pg.query<{ guideline: string }>(
      `SELECT guideline FROM compliance_tracking WHERE organization_id = $1`, [THEIRS],
    );
    expect(theirs.rows.map((r) => r.guideline)).toEqual(['ICH Q1A']);
  });

  it('is idempotent — deploy-migrate replays the whole set on every deploy', async () => {
    await pg.exec(read(BACKFILL));
    const first = await pg.query(`SELECT project_id, organization_id, guideline FROM compliance_tracking ORDER BY guideline`);
    await pg.exec(read(BACKFILL));
    const second = await pg.query(`SELECT project_id, organization_id, guideline FROM compliance_tracking ORDER BY guideline`);
    expect(second.rows).toEqual(first.rows);
  });

  it('is registered in the applied migration set', async () => {
    const { C2C_MIGRATION_FILES } = await import('../../scripts/db/migration-set.mjs');
    expect(C2C_MIGRATION_FILES).toContain(BACKFILL);
  });
});

describe('the strict read serves each org its own rows and only its own', () => {
  it('returns nothing of another organization’s, and everything of the caller’s', async () => {
    await pg.exec(read(BACKFILL));
    // The predicate the route carries after the fix.
    const strict = async (org: number) =>
      (await pg.query<{ guideline: string }>(
        `SELECT guideline FROM compliance_tracking WHERE organization_id = $1 ORDER BY created_at DESC`,
        [org],
      )).rows.map((r) => r.guideline);

    expect(await strict(MINE)).toEqual(['ICH Q2']);
    expect(await strict(THEIRS)).toEqual(['ICH Q1A']);
  });

  it('the route no longer carries OR organization_id IS NULL', () => {
    const src = read('server/api/cmc/routes.ts');
    expect(
      /compliance_tracking[\s\S]{0,200}organization_id\s+IS\s+NULL/i.test(src),
      'the check-rules read still widens to every unattributed row',
    ).toBe(false);
  });
});

/**
 * The OTHER `compliance_tracking`.
 *
 * The name is declared incompatibly in two lineages, and which one an estate
 * has is decided by migration order rather than by code:
 *
 *   migrations/0000_sweet_joseph.sql:1729   serial id, organization_id NOT NULL,
 *                                           product_id, agency_id,
 *                                           compliance_status — and NO project_id.
 *   db/migrations/20260402_…:20             uuid id, project_id, nullable
 *                                           organization_id, guideline, status.
 *
 * deploy-migrate replays the whole set on every deploy against every estate, so
 * a backfill that names project_id unguarded is a permanent deploy halt for
 * every tenant on the first shape — not a one-time error. This proves the guard
 * on the shape it has to survive, rather than only on the shape it was written
 * for.
 *
 * (The collision itself is the ledger's C-6 class and is NOT resolved here:
 * reconciling two incompatible definitions that both hold live data is its own
 * migration. server/api/cmc/routes.ts reads `guideline`/`status`, so on the
 * first shape that endpoint fails with 42703 into its own catch — reported, not
 * fixed here.)
 */
describe('the backfill survives the other compliance_tracking shape', () => {
  it('is a no-op on the 0000 shape, which has no project_id, instead of halting the deploy', async () => {
    const other = new PGlite();
    opened.push(other);
    await other.exec(`
      CREATE TABLE cmc_projects (id uuid PRIMARY KEY, organization_id integer NOT NULL);
      -- migrations/0000_sweet_joseph.sql:1729, reduced to the shape-defining columns.
      CREATE TABLE compliance_tracking (
        id serial PRIMARY KEY,
        organization_id integer NOT NULL,
        product_id varchar(100) NOT NULL,
        agency_id integer NOT NULL,
        compliance_status varchar(50) DEFAULT 'pending',
        risk_level varchar(20) DEFAULT 'medium',
        created_at timestamp DEFAULT now() NOT NULL
      );
      INSERT INTO compliance_tracking (organization_id, product_id, agency_id)
        VALUES (1, 'PROD-1', 1);
    `);

    // Must not throw. An unguarded reference to project_id fails here with
    // 42703 and takes the whole deploy with it.
    await expect(other.exec(read(BACKFILL))).resolves.toBeDefined();

    // And it changed nothing: this shape's organization_id is already NOT NULL.
    const { rows } = await other.query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM compliance_tracking WHERE organization_id = 1`,
    );
    expect(rows[0].n).toBe(1);
  }, 60_000);
});
